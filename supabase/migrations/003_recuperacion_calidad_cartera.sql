-- =============================================================================
--  MIGRACIÓN 003 — Cobros de recuperación sobre préstamos castigados e
--  indicadores de calidad de cartera (PAR). Requiere la migración 002.
--
--  Ejecutar completo, una vez, en el SQL Editor de Supabase. Es idempotente.
--  (schema.sql ya incluye todo esto para instalaciones nuevas.)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Nuevos campos
-- -----------------------------------------------------------------------------
alter type cash_movement_category add value if not exists 'recuperacion_castigo';

-- Marca los pagos cobrados sobre un préstamo castigado (recuperación de cartera)
alter table public.payments
  add column if not exists is_recovery boolean not null default false;

-- v_payments_detail usa p.*: al agregar columnas a payments hay que recrearla
-- (CREATE OR REPLACE no permite insertar columnas en medio de una vista).
drop view if exists public.v_payments_detail;
create view public.v_payments_detail with (security_invoker = true) as
select p.*, l.code as loan_code, c.first_name || ' ' || c.last_name as client_name,
       c.document_number, c.phone, pr.full_name as collector_name
from public.payments p
join public.loans l on l.id = p.loan_id
join public.clients c on c.id = p.client_id
left join public.profiles pr on pr.id = p.collected_by;
grant select on public.v_payments_detail to authenticated, service_role;
revoke all on public.v_payments_detail from anon;

-- -----------------------------------------------------------------------------
-- 2. Motor financiero
-- -----------------------------------------------------------------------------
-- @@FUNCTIONS_START@@
create or replace function public.sync_loan_totals(p_loan_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_paid numeric; v_fee numeric; v_bal numeric;
begin
  select coalesce(sum(principal_paid + interest_paid), 0),
         coalesce(sum(late_fee_paid), 0),
         coalesce(sum(principal_due + interest_due - principal_paid - interest_paid - interest_waived), 0)
    into v_paid, v_fee, v_bal
    from public.installments where loan_id = p_loan_id;
  -- Un préstamo castigado que se recupera por completo pasa a 'pagado'; si luego se anula
  -- un pago y vuelve a tener saldo, regresa a 'castigado' (no a 'activo').
  update public.loans
     set paid_amount = v_paid,
         late_fee_paid = v_fee,
         balance_due = v_bal,
         status = case
           when status in ('activo', 'castigado') and v_bal <= 0 then 'pagado'::loan_status
           when status = 'pagado' and v_bal > 0 then
             case when written_off_at is not null then 'castigado'::loan_status else 'activo'::loan_status end
           else status end,
         closed_at = case
           when v_bal <= 0 then coalesce(closed_at, now())
           when written_off_at is not null then written_off_at
           else null end
   where id = p_loan_id;
end $$;

-- Registrar pago (abono parcial, cuota completa, adelanto o recuperación de castigado)
create or replace function public.register_loan_payment(
  p_loan_id        uuid,
  p_amount         numeric,
  p_method         payment_method default 'efectivo',
  p_notes          text default null,
  p_waive_late_fee boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s          public.system_settings;
  l          public.loans;
  v_session  uuid := public.current_cash_session();
  v_pay_id   uuid;
  v_code     text;
  v_applied  jsonb;
  v_waived   numeric := 0;
  v_owed     numeric;
  v_next     numeric;
  v_recovery boolean;
begin
  if not public.has_role('admin', 'cajero', 'cobrador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Monto inválido'; end if;
  select * into s from public.system_settings where id = 1;
  select * into l from public.loans where id = p_loan_id for update;
  if l.id is null or l.status not in ('activo', 'castigado') then raise exception 'Préstamo no activo'; end if;
  v_recovery := l.status = 'castigado';
  if public.current_user_role() = 'cobrador'
     and not exists (select 1 from public.clients where id = l.client_id and assigned_collector_id = auth.uid())
     and coalesce(l.collector_id, '00000000-0000-0000-0000-000000000000') <> auth.uid() then
    raise exception 'El préstamo no pertenece a su cartera' using errcode = '42501';
  end if;
  if s.require_open_cash and v_session is null then
    raise exception 'Debe abrir caja antes de cobrar';
  end if;

  -- En un castigado la mora quedó congelada al castigar (refresh_late_fees no la recalcula)
  perform public.refresh_late_fees(p_loan_id);

  if p_waive_late_fee then
    if not (s.allow_late_fee_waiver and public.has_role('admin', 'cajero')) then
      raise exception 'No autorizado para condonar mora' using errcode = '42501';
    end if;
    -- Se guarda lo condonado por cuota para poder revertirlo exactamente si se anula el pago
    create temp table if not exists _waive (
      installment_id uuid primary key, late_fee numeric not null default 0, interest numeric not null default 0
    ) on commit drop;
    truncate _waive;
    insert into _waive (installment_id, late_fee)
    select id, late_fee_due - late_fee_paid - late_fee_waived
      from public.installments
     where loan_id = p_loan_id and status in ('pendiente', 'parcial')
       and late_fee_due - late_fee_paid - late_fee_waived > 0;
    select coalesce(sum(late_fee), 0) into v_waived from _waive;
    update public.installments i set late_fee_waived = i.late_fee_waived + w.late_fee
      from _waive w where w.installment_id = i.id;
  end if;

  -- La regla de "sin abonos parciales" aplica a la cartera vigente, no a recuperaciones
  if not s.allow_partial_payments and not v_recovery then
    select coalesce(sum(principal_due + interest_due + late_fee_due - principal_paid - interest_paid
                        - late_fee_paid - late_fee_waived - interest_waived), 0)
      into v_next from public.installments
     where loan_id = p_loan_id and status in ('pendiente', 'parcial')
       and due_date <= greatest(public.business_today(),
            (select min(due_date) from public.installments where loan_id = p_loan_id and status in ('pendiente', 'parcial')));
    if p_amount < v_next then
      raise exception 'No se permiten abonos parciales. Monto mínimo: %', v_next;
    end if;
  end if;

  select coalesce(sum(principal_due + interest_due + late_fee_due - principal_paid - interest_paid
                      - late_fee_paid - late_fee_waived - interest_waived), 0)
    into v_owed from public.installments where loan_id = p_loan_id and status in ('pendiente', 'parcial');
  if p_amount > v_owed then
    raise exception 'El monto (%) excede la deuda total (%)', p_amount, v_owed;
  end if;

  insert into public.payments (loan_id, client_id, amount, payment_method, notes, cash_session_id,
                               late_fee_waived, is_payoff, is_recovery)
  values (p_loan_id, l.client_id, round(p_amount, 2), p_method, p_notes, v_session, v_waived,
          p_amount = v_owed, v_recovery)
  returning id, code into v_pay_id, v_code;

  if v_waived > 0 then
    insert into public.payment_waivers (payment_id, installment_id, late_fee)
    select v_pay_id, installment_id, late_fee from _waive;
  end if;

  v_applied := public.apply_cascade(p_loan_id, v_pay_id, round(p_amount, 2));
  update public.payments
     set applied_to_late_fee  = (v_applied ->> 'late_fee')::numeric,
         applied_to_interest  = (v_applied ->> 'interest')::numeric,
         applied_to_principal = (v_applied ->> 'principal')::numeric
   where id = v_pay_id;

  perform public.update_installment_status(p_loan_id);
  perform public.sync_loan_totals(p_loan_id);

  if p_method <> 'refinanciamiento' then
    insert into public.cash_movements (cash_session_id, movement_type, category, amount, description, loan_id, payment_id)
    values (v_session, 'ingreso',
            case when v_recovery then 'recuperacion_castigo'::cash_movement_category else 'cobro_cuota'::cash_movement_category end,
            round(p_amount, 2),
            case when v_recovery then 'Recuperación ' else 'Cobro ' end || v_code || ' · ' || l.code,
            p_loan_id, v_pay_id);
  end if;

  perform public.recompute_client_score(l.client_id);

  return jsonb_build_object('payment_id', v_pay_id, 'code', v_code, 'applied', v_applied,
                            'late_fee_waived', v_waived, 'is_recovery', v_recovery,
                            'balance_due', (select balance_due from public.loans where id = p_loan_id),
                            'loan_status', (select status from public.loans where id = p_loan_id));
end $$;

-- Anular pago (solo admin): revierte asignaciones, condonaciones propias y caja
create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.payments;
  a record;
begin
  if not public.has_role('admin') then
    raise exception 'Solo el administrador puede anular pagos' using errcode = '42501';
  end if;
  select * into p from public.payments where id = p_payment_id for update;
  if p.id is null or p.voided then raise exception 'Pago inexistente o ya anulado'; end if;
  if p.payment_method = 'refinanciamiento' then
    raise exception 'Los pagos por refinanciamiento no se anulan; anule el préstamo nuevo';
  end if;
  if exists (select 1 from public.loans where id = p.loan_id and status not in ('activo', 'pagado', 'castigado')) then
    raise exception 'El préstamo está refinanciado o anulado; no se puede anular el pago';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indique el motivo de anulación'; end if;
  perform 1 from public.loans where id = p.loan_id for update;

  for a in select * from public.payment_allocations where payment_id = p_payment_id loop
    update public.installments
       set late_fee_paid = late_fee_paid - a.late_fee,
           interest_paid = interest_paid - a.interest,
           principal_paid = principal_paid - a.principal,
           paid_at = null
     where id = a.installment_id;
  end loop;

  if exists (select 1 from public.payment_waivers where payment_id = p_payment_id) then
    -- Revierte SOLO lo que condonó este pago (no toca condonaciones de otros pagos)
    update public.installments i
       set late_fee_waived = greatest(0, i.late_fee_waived - w.late_fee),
           interest_waived = greatest(0, i.interest_waived - w.interest)
      from (select installment_id, sum(late_fee) as late_fee, sum(interest) as interest
              from public.payment_waivers where payment_id = p_payment_id
             group by installment_id) w
     where i.id = w.installment_id;
  else
    -- Pagos registrados antes de existir payment_waivers: comportamiento anterior
    if p.late_fee_waived > 0 then
      update public.installments set late_fee_waived = 0
       where loan_id = p.loan_id and status in ('pendiente', 'parcial', 'pagado');
    end if;
    if p.interest_waived > 0 then
      update public.installments set interest_waived = 0 where loan_id = p.loan_id;
    end if;
  end if;

  update public.payments
     set voided = true, voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
   where id = p_payment_id;

  -- sync_loan_totals decide el estado: activo, castigado (si fue castigado) o pagado
  perform public.update_installment_status(p.loan_id);
  perform public.sync_loan_totals(p.loan_id);
  perform public.refresh_late_fees(p.loan_id);

  if p.payment_method <> 'refinanciamiento' then
    insert into public.cash_movements (cash_session_id, movement_type, category, amount, description, loan_id, payment_id)
    values (public.current_cash_session(), 'egreso', 'anulacion_pago', p.amount,
            'Anulación ' || p.code || ': ' || p_reason, p.loan_id, p.id);
  end if;
  perform public.recompute_client_score(p.client_id);
end $$;

-- Calidad de cartera (security invoker: el cobrador ve solo su cartera por RLS).
-- PAR n = capital pendiente de préstamos con alguna cuota con más de n días de atraso.
create or replace function public.get_portfolio_quality()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v_today date := public.business_today();
  v_tz    text := (select timezone from public.system_settings where id = 1);
  v_month timestamp := date_trunc('month', public.business_today()::timestamp);
  r       jsonb;
begin
  with lp as (
    select l.id,
           coalesce(sum(i.principal_due - i.principal_paid) filter (where i.status in ('pendiente', 'parcial')), 0) as capital,
           coalesce(max(v_today - i.due_date) filter (where i.status in ('pendiente', 'parcial') and i.due_date < v_today), 0) as dias
      from public.loans l
      join public.installments i on i.loan_id = l.id
     where l.status = 'activo'
     group by l.id)
  select jsonb_build_object(
           'capital_cartera',  coalesce(sum(capital), 0),
           'par_1',            coalesce(sum(capital) filter (where dias >= 1), 0),
           'par_30',           coalesce(sum(capital) filter (where dias > 30), 0),
           'par_90',           coalesce(sum(capital) filter (where dias > 90), 0),
           'prestamos_par_1',  count(*) filter (where dias >= 1),
           'prestamos_par_30', count(*) filter (where dias > 30),
           'prestamos_par_90', count(*) filter (where dias > 90))
    into r from lp;

  return r || jsonb_build_object(
    'castigado_total', coalesce((select sum(written_off_amount) from public.loans where written_off_at is not null), 0),
    'castigado_mes',   coalesce((select sum(written_off_amount) from public.loans
                                  where written_off_at is not null
                                    and date_trunc('month', written_off_at at time zone v_tz) = v_month), 0),
    'recuperado_total', coalesce((select sum(amount) from public.payments where is_recovery and not voided), 0),
    'recuperado_mes',   coalesce((select sum(amount) from public.payments
                                   where is_recovery and not voided
                                     and date_trunc('month', paid_at at time zone v_tz) = v_month), 0));
end $$;
-- @@FUNCTIONS_END@@

-- -----------------------------------------------------------------------------
-- 3. Permisos de la función nueva
-- -----------------------------------------------------------------------------
revoke execute on function public.get_portfolio_quality() from public, anon;
grant execute on function public.get_portfolio_quality() to authenticated, service_role;
