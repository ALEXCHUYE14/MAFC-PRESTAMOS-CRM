-- =============================================================================
--  MIGRACIÓN 002 — Seguridad de registro, permisos, anulación/castigo de
--  préstamos, condonaciones reversibles y mora automática (pg_cron).
--
--  Para bases YA instaladas con schema.sql. Ejecutar completo, una vez, en el
--  SQL Editor de Supabase. Es idempotente: se puede volver a ejecutar sin daño.
--  (schema.sql ya incluye todo esto para instalaciones nuevas.)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Nuevos campos y tablas
-- -----------------------------------------------------------------------------
alter type cash_movement_category add value if not exists 'anulacion_prestamo';

alter table public.loans
  add column if not exists voided_at          timestamptz,
  add column if not exists voided_by          uuid references public.profiles (id),
  add column if not exists void_reason        text,
  add column if not exists written_off_at     timestamptz,
  add column if not exists written_off_by     uuid references public.profiles (id),
  add column if not exists written_off_amount numeric(14,2),
  add column if not exists write_off_reason   text;

-- Vincula el pago de refinanciación con el préstamo que lo originó
alter table public.payments
  add column if not exists refinanced_by_loan_id uuid references public.loans (id);

-- Detalle por cuota de lo condonado en cada pago, para poder revertirlo exactamente
create table if not exists public.payment_waivers (
  id             uuid primary key default gen_random_uuid(),
  payment_id     uuid not null references public.payments (id) on delete cascade,
  installment_id uuid not null references public.installments (id),
  late_fee       numeric(14,2) not null default 0,
  interest       numeric(14,2) not null default 0
);
create index if not exists payment_waivers_payment_idx on public.payment_waivers (payment_id);
alter table public.payment_waivers enable row level security;
drop policy if exists waivers_read on public.payment_waivers;
create policy waivers_read on public.payment_waivers for select to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_id and public.can_access_loan(p.loan_id)));

-- -----------------------------------------------------------------------------
-- 2. Registro seguro de usuarios (el rol NUNCA sale de los metadatos del usuario)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_first boolean;
begin
  v_first := not exists (select 1 from public.profiles);
  insert into public.profiles (id, full_name, phone, role, active)
  values (new.id,
          left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)), 120),
          left(new.raw_user_meta_data ->> 'phone', 30),
          case when v_first then 'admin'::user_role else 'cobrador'::user_role end,
          v_first)
  on conflict (id) do nothing;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Motor financiero: funciones nuevas y corregidas
-- -----------------------------------------------------------------------------
-- @@FUNCTIONS_START@@
create or replace function public.create_loan_with_schedule(
  p_client_id        uuid,
  p_principal        numeric,
  p_interest_rate    numeric,
  p_interest_type    interest_type,
  p_frequency        loan_frequency,
  p_term_count       integer,
  p_start_date       date default null,
  p_flat_rate_mode   flat_rate_mode default 'total',
  p_grace_days       integer default null,
  p_late_fee_type    late_fee_type default null,
  p_late_fee_value   numeric default null,
  p_late_fee_cap     numeric default null,
  p_exclude_sundays  boolean default null,
  p_previous_loan_id uuid default null,
  p_collector_id     uuid default null,
  p_notes            text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s          public.system_settings;
  c          public.clients;
  v_start    date := coalesce(p_start_date, public.business_today());
  v_loan_id  uuid;
  v_code     text;
  v_int      numeric;
  v_tot      numeric;
  v_first    date;
  v_last     date;
  v_cuota    numeric;
  v_prev     public.loans;
  v_payoff   numeric := 0;
  v_net      numeric;
  v_session  uuid := public.current_cash_session();
  v_pay_id   uuid;
begin
  if not public.has_role('admin', 'cajero') then
    raise exception 'No autorizado para desembolsar' using errcode = '42501';
  end if;
  select * into s from public.system_settings where id = 1;
  select * into c from public.clients where id = p_client_id for update;
  if c.id is null then raise exception 'Cliente no existe'; end if;
  if c.status = 'bloqueado' then raise exception 'Cliente bloqueado / lista negra'; end if;
  if s.require_guarantor_from is not null and p_principal >= s.require_guarantor_from
     and coalesce(c.guarantor_name, '') = '' then
    raise exception 'Se requiere aval para montos desde %', s.require_guarantor_from;
  end if;
  if s.require_open_cash and v_session is null then
    raise exception 'Debe abrir caja antes de desembolsar';
  end if;

  -- Refinanciación: liquidar el préstamo anterior
  if p_previous_loan_id is not null then
    select * into v_prev from public.loans where id = p_previous_loan_id for update;
    if v_prev.id is null or v_prev.status <> 'activo' then
      raise exception 'El préstamo a refinanciar no está activo';
    end if;
    if v_prev.client_id <> p_client_id then
      raise exception 'El préstamo a refinanciar pertenece a otro cliente';
    end if;
    perform public.refresh_late_fees(v_prev.id);
    select coalesce(sum(principal_due + interest_due + late_fee_due
                        - principal_paid - interest_paid - late_fee_paid
                        - late_fee_waived - interest_waived), 0)
      into v_payoff from public.installments
     where loan_id = v_prev.id and status in ('pendiente', 'parcial');
    if v_payoff >= p_principal then
      raise exception 'El nuevo capital (%) debe superar el saldo a refinanciar (%)', p_principal, v_payoff;
    end if;
  end if;
  v_net := p_principal - v_payoff;

  -- Préstamo
  insert into public.loans (
    client_id, previous_loan_id, principal_amount, interest_rate, interest_type, flat_rate_mode,
    frequency, term_count, installment_amount, total_interest, total_amount, balance_due,
    grace_days, late_fee_type, late_fee_rate, late_fee_cap, exclude_sundays,
    first_due_date, maturity_date, net_disbursed, refinanced_balance, collector_id, notes)
  values (
    p_client_id, p_previous_loan_id, round(p_principal, 2), p_interest_rate, p_interest_type, p_flat_rate_mode,
    p_frequency, p_term_count, 0, 0, 0, 0,
    coalesce(p_grace_days, s.default_grace_days),
    coalesce(p_late_fee_type, s.default_late_fee_type),
    coalesce(p_late_fee_value, s.default_late_fee_value),
    coalesce(p_late_fee_cap, s.default_late_fee_cap),
    coalesce(p_exclude_sundays, p_frequency = 'diario' and s.exclude_sundays_daily),
    v_start, v_start, v_net, v_payoff,
    coalesce(p_collector_id, c.assigned_collector_id), p_notes)
  returning id, code into v_loan_id, v_code;

  insert into public.installments (loan_id, installment_number, due_date, principal_due, interest_due)
  select v_loan_id, b.n, b.due_date, b.principal_due, b.interest_due
    from public.build_schedule(p_principal, p_interest_rate, p_interest_type, p_flat_rate_mode,
                               p_frequency, p_term_count, v_start,
                               coalesce(p_exclude_sundays, p_frequency = 'diario' and s.exclude_sundays_daily)) b;

  select sum(interest_due), sum(principal_due + interest_due), min(due_date), max(due_date)
    into v_int, v_tot, v_first, v_last
    from public.installments where loan_id = v_loan_id;
  select principal_due + interest_due into v_cuota
    from public.installments where loan_id = v_loan_id and installment_number = 1;

  update public.loans
     set total_interest = v_int, total_amount = v_tot, balance_due = v_tot,
         installment_amount = v_cuota, first_due_date = v_first, maturity_date = v_last
   where id = v_loan_id;

  -- Cierre del préstamo anterior con un pago de tipo refinanciamiento (sin caja)
  if p_previous_loan_id is not null and v_payoff > 0 then
    insert into public.payments (loan_id, client_id, amount, payment_method, is_payoff, notes, cash_session_id,
                                 refinanced_by_loan_id)
    values (p_previous_loan_id, p_client_id, v_payoff, 'refinanciamiento', true,
            'Refinanciado con ' || v_code, v_session, v_loan_id)
    returning id into v_pay_id;
    declare v_applied jsonb;
    begin
      v_applied := public.apply_cascade(p_previous_loan_id, v_pay_id, v_payoff);
      update public.payments
         set applied_to_late_fee = (v_applied ->> 'late_fee')::numeric,
             applied_to_interest = (v_applied ->> 'interest')::numeric,
             applied_to_principal = (v_applied ->> 'principal')::numeric
       where id = v_pay_id;
    end;
    perform public.update_installment_status(p_previous_loan_id);
    perform public.sync_loan_totals(p_previous_loan_id);
    update public.loans set status = 'refinanciado', closed_at = now() where id = p_previous_loan_id;
  end if;

  -- Egreso de caja por el neto entregado
  insert into public.cash_movements (cash_session_id, movement_type, category, amount, description, loan_id)
  values (v_session, 'egreso', 'desembolso', v_net, 'Desembolso ' || v_code, v_loan_id);

  return jsonb_build_object('loan_id', v_loan_id, 'code', v_code, 'net_disbursed', v_net,
                            'refinanced_balance', v_payoff, 'installment_amount', v_cuota,
                            'total_amount', v_tot);
end $$;

-- Registrar pago (abono parcial, cuota completa o adelanto)
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
begin
  if not public.has_role('admin', 'cajero', 'cobrador') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Monto inválido'; end if;
  select * into s from public.system_settings where id = 1;
  select * into l from public.loans where id = p_loan_id for update;
  if l.id is null or l.status <> 'activo' then raise exception 'Préstamo no activo'; end if;
  if public.current_user_role() = 'cobrador'
     and not exists (select 1 from public.clients where id = l.client_id and assigned_collector_id = auth.uid())
     and coalesce(l.collector_id, '00000000-0000-0000-0000-000000000000') <> auth.uid() then
    raise exception 'El préstamo no pertenece a su cartera' using errcode = '42501';
  end if;
  if s.require_open_cash and v_session is null then
    raise exception 'Debe abrir caja antes de cobrar';
  end if;

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

  if not s.allow_partial_payments then
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
                               late_fee_waived, is_payoff)
  values (p_loan_id, l.client_id, round(p_amount, 2), p_method, p_notes, v_session, v_waived, p_amount = v_owed)
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
    values (v_session, 'ingreso', 'cobro_cuota', round(p_amount, 2), 'Cobro ' || v_code || ' · ' || l.code, p_loan_id, v_pay_id);
  end if;

  perform public.recompute_client_score(l.client_id);

  return jsonb_build_object('payment_id', v_pay_id, 'code', v_code, 'applied', v_applied,
                            'late_fee_waived', v_waived,
                            'balance_due', (select balance_due from public.loans where id = p_loan_id),
                            'loan_status', (select status from public.loans where id = p_loan_id));
end $$;

-- Liquidación anticipada (pre-cancelación) con condonaciones opcionales
create or replace function public.liquidate_loan(
  p_loan_id uuid, p_method payment_method default 'efectivo',
  p_waive_late_fee boolean default false, p_waive_future_interest boolean default false,
  p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.business_today();
  v_waived_int numeric := 0;
  v_total numeric;
  v_res jsonb;
  v_pay_id uuid;
begin
  if (p_waive_late_fee or p_waive_future_interest) and not public.has_role('admin', 'cajero') then
    raise exception 'No autorizado para condonar' using errcode = '42501';
  end if;
  perform 1 from public.loans where id = p_loan_id and status = 'activo' for update;
  if not found then raise exception 'Préstamo no activo'; end if;
  perform public.refresh_late_fees(p_loan_id);

  if p_waive_future_interest then
    create temp table if not exists _iwaive (installment_id uuid primary key, interest numeric not null) on commit drop;
    truncate _iwaive;
    insert into _iwaive (installment_id, interest)
    select id, interest_due - interest_paid - interest_waived
      from public.installments
     where loan_id = p_loan_id and status in ('pendiente', 'parcial') and due_date > v_today
       and interest_due - interest_paid - interest_waived > 0;
    select coalesce(sum(interest), 0) into v_waived_int from _iwaive;
    update public.installments i set interest_waived = i.interest_waived + w.interest
      from _iwaive w where w.installment_id = i.id;
  end if;

  select coalesce(sum(principal_due + interest_due + late_fee_due - principal_paid - interest_paid
                      - late_fee_paid - interest_waived
                      - case when p_waive_late_fee then late_fee_due - late_fee_paid else late_fee_waived end), 0)
    into v_total from public.installments where loan_id = p_loan_id and status in ('pendiente', 'parcial');

  if v_total <= 0 then
    perform public.update_installment_status(p_loan_id);
    perform public.sync_loan_totals(p_loan_id);
    return jsonb_build_object('payment_id', null, 'total', 0);
  end if;

  v_res := public.register_loan_payment(p_loan_id, v_total, p_method,
             coalesce(p_notes, 'Liquidación anticipada'), p_waive_late_fee);
  v_pay_id := (v_res ->> 'payment_id')::uuid;
  update public.payments set is_payoff = true, interest_waived = v_waived_int where id = v_pay_id;
  if v_waived_int > 0 then
    insert into public.payment_waivers (payment_id, installment_id, interest)
    select v_pay_id, installment_id, interest from _iwaive;
  end if;
  return v_res || jsonb_build_object('interest_waived', v_waived_int, 'total', v_total);
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
  if exists (select 1 from public.loans where id = p.loan_id and status not in ('activo', 'pagado')) then
    raise exception 'El préstamo está refinanciado, anulado o castigado; no se puede anular el pago';
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

  update public.loans set status = 'activo', closed_at = null
   where id = p.loan_id and status = 'pagado';
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

-- Anular préstamo (solo admin). Para desembolsos por error: exige que no tenga pagos
-- vigentes, devuelve el neto a caja y, si era una refinanciación, reactiva el anterior.
create or replace function public.void_loan(p_loan_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s         public.system_settings;
  l         public.loans;
  v_prev    public.loans;
  v_refi    public.payments;
  v_session uuid := public.current_cash_session();
  v_reason  text := trim(coalesce(p_reason, ''));
  a         record;
begin
  if not public.has_role('admin') then
    raise exception 'Solo el administrador puede anular préstamos' using errcode = '42501';
  end if;
  if length(v_reason) < 5 then raise exception 'Indique el motivo de anulación (mínimo 5 caracteres)'; end if;
  select * into s from public.system_settings where id = 1;
  select * into l from public.loans where id = p_loan_id for update;
  if l.id is null then raise exception 'Préstamo inexistente'; end if;
  if l.status <> 'activo' then
    raise exception 'Solo se pueden anular préstamos activos (estado actual: %)', l.status;
  end if;
  if exists (select 1 from public.payments where loan_id = p_loan_id and not voided) then
    raise exception 'El préstamo tiene pagos vigentes. Anule primero esos pagos';
  end if;
  if l.net_disbursed > 0 and s.require_open_cash and v_session is null then
    raise exception 'Debe abrir caja para registrar la devolución del desembolso';
  end if;

  -- Si era una refinanciación, se revierte el pago que cerró el préstamo anterior
  if l.previous_loan_id is not null and l.refinanced_balance > 0 then
    select * into v_prev from public.loans where id = l.previous_loan_id for update;
    if v_prev.status <> 'refinanciado' then
      raise exception 'El préstamo anterior (%) ya no está en estado refinanciado; no se puede revertir', v_prev.code;
    end if;
    select * into v_refi from public.payments
     where loan_id = l.previous_loan_id and payment_method = 'refinanciamiento' and not voided
       and (refinanced_by_loan_id = l.id
            or (refinanced_by_loan_id is null and notes = 'Refinanciado con ' || l.code))
     order by paid_at desc limit 1
     for update;
    if v_refi.id is null then
      raise exception 'No se encontró el pago de refinanciación del préstamo anterior (%)', v_prev.code;
    end if;
    for a in select * from public.payment_allocations where payment_id = v_refi.id loop
      update public.installments
         set late_fee_paid = late_fee_paid - a.late_fee,
             interest_paid = interest_paid - a.interest,
             principal_paid = principal_paid - a.principal,
             paid_at = null
       where id = a.installment_id;
    end loop;
    update public.payments
       set voided = true, voided_at = now(), voided_by = auth.uid(),
           void_reason = 'Anulación de ' || l.code || ': ' || v_reason
     where id = v_refi.id;
    update public.loans set status = 'activo', closed_at = null where id = v_prev.id;
    perform public.update_installment_status(v_prev.id);
    perform public.sync_loan_totals(v_prev.id);
    perform public.refresh_late_fees(v_prev.id);
  end if;

  update public.loans
     set status = 'anulado', closed_at = now(), voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
   where id = p_loan_id;

  if l.net_disbursed > 0 then
    insert into public.cash_movements (cash_session_id, movement_type, category, amount, description, loan_id)
    values (v_session, 'ingreso', 'anulacion_prestamo', l.net_disbursed,
            'Anulación ' || l.code || ': ' || v_reason, l.id);
  end if;

  perform public.recompute_client_score(l.client_id);
  return jsonb_build_object('loan_id', l.id, 'returned_to_cash', l.net_disbursed,
                            'restored_loan_id', v_prev.id);
end $$;

-- Castigar préstamo incobrable (solo admin): lo saca de la cartera activa sin mover caja
create or replace function public.write_off_loan(p_loan_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l        public.loans;
  v_amount numeric;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if not public.has_role('admin') then
    raise exception 'Solo el administrador puede castigar préstamos' using errcode = '42501';
  end if;
  if length(v_reason) < 5 then raise exception 'Indique el motivo del castigo (mínimo 5 caracteres)'; end if;
  select * into l from public.loans where id = p_loan_id for update;
  if l.id is null then raise exception 'Préstamo inexistente'; end if;
  if l.status <> 'activo' then
    raise exception 'Solo se pueden castigar préstamos activos (estado actual: %)', l.status;
  end if;
  perform public.refresh_late_fees(p_loan_id);
  select coalesce(sum(principal_due + interest_due - principal_paid - interest_paid - interest_waived), 0)
    into v_amount
    from public.installments where loan_id = p_loan_id and status in ('pendiente', 'parcial');

  update public.loans
     set status = 'castigado', closed_at = now(), written_off_at = now(), written_off_by = auth.uid(),
         written_off_amount = v_amount, write_off_reason = v_reason
   where id = p_loan_id;

  perform public.recompute_client_score(l.client_id);
  return jsonb_build_object('loan_id', l.id, 'written_off_amount', v_amount);
end $$;
-- @@FUNCTIONS_END@@

-- -----------------------------------------------------------------------------
-- 4. Permisos
-- -----------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke insert, update, delete on public.audit_logs from authenticated;
-- service_role (solo servidor: creación de usuarios y enlaces públicos firmados)
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.apply_cascade(uuid, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.sync_loan_totals(uuid) from public, anon, authenticated;
revoke execute on function public.update_installment_status(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Mora automática: recálculo cada hora con pg_cron
--    (cada hora para que el cambio de día sea correcto en cualquier zona horaria)
-- -----------------------------------------------------------------------------
do $cron$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron no disponible (%). Actívelo en Database → Extensions y vuelva a ejecutar.', sqlerrm;
end $cron$;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'refresh-late-fees';
    perform cron.schedule('refresh-late-fees', '7 * * * *', 'select public.refresh_all_late_fees()');
  end if;
end $cron$;

-- Verificación: debe mostrar el job 'refresh-late-fees' si pg_cron está activo
-- select jobname, schedule, command from cron.job;
