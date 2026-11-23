-- =============================================================================
--  MIGRACIÓN 004 — Rendimiento y menor consumo de Supabase
--  (tamaño de base de datos, egress y logs). Requiere las migraciones 002 y 003.
--
--  Ejecutar completo, una vez, en el SQL Editor de Supabase. Es idempotente.
--  (schema.sql ya incluye todo esto para instalaciones nuevas.)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Estado de tareas internas (no auditado: solo guarda la hora de la última ejecución)
-- -----------------------------------------------------------------------------
create table if not exists public.job_state (
  key    text primary key,
  ran_at timestamptz not null default now()
);
alter table public.job_state enable row level security;   -- sin políticas: solo funciones del motor
revoke all on public.job_state from anon, authenticated;
grant all on public.job_state to service_role;

-- -----------------------------------------------------------------------------
-- 2. Zonas de clientes sin descargar toda la tabla (respeta RLS del usuario)
-- -----------------------------------------------------------------------------
create or replace view public.v_client_zones with (security_invoker = true) as
select distinct zone from public.clients where zone is not null and btrim(zone) <> '';
grant select on public.v_client_zones to authenticated, service_role;
revoke all on public.v_client_zones from anon;

-- -----------------------------------------------------------------------------
-- 3. Funciones
-- -----------------------------------------------------------------------------
-- @@FUNCTIONS_START@@
-- Auditoría: en las modificaciones guarda SOLO los campos que cambiaron (más las claves que
-- identifican el registro). Si no cambió nada relevante, no escribe. Altas y bajas: registro completo.
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  o     jsonb := '{}'::jsonb;
  n     jsonb := '{}'::jsonb;
  k     text;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    for k in select jsonb_object_keys(v_new) loop
      if k <> 'updated_at' and (v_old -> k) is distinct from (v_new -> k) then
        o := o || jsonb_build_object(k, v_old -> k);
        n := n || jsonb_build_object(k, v_new -> k);
      end if;
    end loop;
    if n = '{}'::jsonb then return new; end if;
    foreach k in array array['id', 'code', 'loan_id', 'client_id'] loop
      if v_new ? k then
        o := o || jsonb_build_object(k, v_old -> k);
        n := n || jsonb_build_object(k, v_new -> k);
      end if;
    end loop;
    insert into public.audit_logs (table_name, record_id, action, old_values, new_values)
    values (tg_table_name, coalesce(v_new ->> 'id', '1'), 'update', o, n);
    return new;
  end if;

  insert into public.audit_logs (table_name, record_id, action, old_values, new_values)
  values (
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', '1'),
    lower(tg_op),
    case when tg_op = 'DELETE' then to_jsonb(old) end,
    case when tg_op = 'INSERT' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- Recalcula mora devengada de un préstamo a la fecha de hoy (solo escribe filas que cambian).
create or replace function public.refresh_late_fees(p_loan_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_loan  public.loans;
  v_today date := public.business_today();
begin
  select * into v_loan from public.loans where id = p_loan_id;
  if v_loan.status <> 'activo' then return; end if;
  update public.installments i
     set late_fee_due = x.fee
    from (select i2.id,
                 greatest(i2.late_fee_paid + i2.late_fee_waived,
                   public.compute_late_fee(i2.due_date, v_today, v_loan.grace_days, v_loan.late_fee_type,
                     v_loan.late_fee_rate, v_loan.late_fee_cap,
                     (i2.principal_due + i2.interest_due) - (i2.principal_paid + i2.interest_paid) - i2.interest_waived)) as fee
            from public.installments i2
           where i2.loan_id = p_loan_id and i2.status in ('pendiente', 'parcial')) x
   where i.id = x.id and i.late_fee_due is distinct from x.fee;
end $$;

-- Recalcula la mora de TODAS las cuotas vencidas (set-based, solo escribe filas que cambian).
create or replace function public.refresh_all_late_fees()
returns integer language plpgsql security definer set search_path = public as $$
declare v_today date := public.business_today(); c integer;
begin
  update public.installments i
     set late_fee_due = x.fee
    from (select i2.id,
                 greatest(i2.late_fee_paid + i2.late_fee_waived,
                   public.compute_late_fee(i2.due_date, v_today, l.grace_days, l.late_fee_type, l.late_fee_rate, l.late_fee_cap,
                     (i2.principal_due + i2.interest_due) - (i2.principal_paid + i2.interest_paid) - i2.interest_waived)) as fee
            from public.installments i2
            join public.loans l on l.id = i2.loan_id
           where l.status = 'activo' and i2.status in ('pendiente', 'parcial') and i2.due_date < v_today) x
   where i.id = x.id and i.late_fee_due is distinct from x.fee;
  get diagnostics c = row_count;
  insert into public.job_state (key, ran_at) values ('late_fees', now())
  on conflict (key) do update set ran_at = excluded.ran_at;
  return c;
end $$;

-- Recalcula la mora global solo si la última pasada es de otro día o tiene más de N minutos.
-- Devuelve -1 si no hizo falta. Evita recalcular toda la cartera en cada visita a Cobranzas.
create or replace function public.refresh_late_fees_if_stale(p_max_age_minutes integer default 15)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_tz  text := (select timezone from public.system_settings where id = 1);
  v_ran timestamptz;
begin
  select ran_at into v_ran from public.job_state where key = 'late_fees';
  if v_ran is not null
     and v_ran > now() - make_interval(mins => greatest(1, least(coalesce(p_max_age_minutes, 15), 1440)))
     and (v_ran at time zone v_tz)::date = public.business_today() then
    return -1;
  end if;
  return public.refresh_all_late_fees();
end $$;

-- Estado de cada cuota según lo pagado (solo escribe filas cuyo estado realmente cambia).
create or replace function public.update_installment_status(p_loan_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.installments i
     set paid_amount = x.pa, status = x.st, paid_at = x.pat
    from (select i2.id,
                 i2.principal_paid + i2.interest_paid + i2.late_fee_paid as pa,
                 case
                   when i2.principal_paid + i2.interest_paid + i2.interest_waived >= i2.principal_due + i2.interest_due
                    and i2.late_fee_paid + i2.late_fee_waived >= i2.late_fee_due then
                     case when i2.principal_paid + i2.interest_paid = 0 and i2.interest_waived > 0 then 'condonado'::installment_status
                          else 'pagado'::installment_status end
                   when i2.principal_paid + i2.interest_paid + i2.late_fee_paid > 0 then 'parcial'::installment_status
                   else 'pendiente'::installment_status end as st,
                 case
                   when i2.principal_paid + i2.interest_paid + i2.interest_waived >= i2.principal_due + i2.interest_due
                    and i2.late_fee_paid + i2.late_fee_waived >= i2.late_fee_due
                   then coalesce(i2.paid_at, public.business_today()) else null end as pat
            from public.installments i2
           where i2.loan_id = p_loan_id) x
   where i.id = x.id
     and (i.paid_amount, i.status, i.paid_at) is distinct from (x.pa, x.st, x.pat);
end $$;

-- Total desembolsado en un rango (fechas en la zona horaria del negocio). Suma en la base:
-- antes se descargaban todos los préstamos del periodo para sumarlos en el navegador.
create or replace function public.report_disbursements(p_from date, p_to date)
returns table (total numeric, capital numeric, prestamos bigint)
language sql stable security invoker set search_path = public as $$
  select coalesce(sum(net_disbursed), 0), coalesce(sum(principal_amount), 0), count(*)
    from public.loans
   where status <> 'anulado'
     and (disbursed_at at time zone (select timezone from public.system_settings where id = 1))::date between p_from and p_to
$$;
-- @@FUNCTIONS_END@@

revoke execute on function public.refresh_late_fees_if_stale(integer) from public, anon;
revoke execute on function public.report_disbursements(date, date) from public, anon;
grant execute on function public.refresh_late_fees_if_stale(integer) to authenticated, service_role;
grant execute on function public.report_disbursements(date, date) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. pg_cron: el historial de ejecuciones crece sin límite; se conservan 7 días
-- -----------------------------------------------------------------------------
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'cleanup-cron-history';
    perform cron.schedule('cleanup-cron-history', '23 4 * * *',
      'delete from cron.job_run_details where end_time < now() - interval ''7 days''');
  end if;
end $cron$;
