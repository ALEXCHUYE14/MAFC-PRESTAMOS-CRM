-- =============================================================================
--  SISTEMA CORE & CRM DE PRÉSTAMOS — Esquema Supabase / PostgreSQL
--  Ejecutar completo en el SQL Editor de Supabase (idempotente en lo posible).
--  Montos en numeric(14,2). Toda escritura financiera pasa por RPCs
--  SECURITY DEFINER que corren en una única transacción ACID.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 0. TIPOS
-- -----------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'cajero', 'cobrador');
exception when duplicate_object then null; end $$;
do $$ begin
  create type interest_type as enum ('simple', 'frances');
exception when duplicate_object then null; end $$;
do $$ begin
  create type flat_rate_mode as enum ('total', 'por_periodo');
exception when duplicate_object then null; end $$;
do $$ begin
  create type loan_frequency as enum ('diario', 'semanal', 'quincenal', 'mensual');
exception when duplicate_object then null; end $$;
do $$ begin
  create type late_fee_type as enum ('fijo_diario', 'porcentaje_diario', 'fijo_por_cuota');
exception when duplicate_object then null; end $$;
do $$ begin
  create type loan_status as enum ('activo', 'pagado', 'refinanciado', 'anulado', 'castigado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type installment_status as enum ('pendiente', 'parcial', 'pagado', 'condonado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type payment_method as enum ('efectivo', 'transferencia', 'yape', 'plin', 'tarjeta', 'refinanciamiento', 'otro');
exception when duplicate_object then null; end $$;
do $$ begin
  create type client_status as enum ('activo', 'inactivo', 'bloqueado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type cash_session_status as enum ('abierta', 'cerrada');
exception when duplicate_object then null; end $$;
do $$ begin
  create type cash_movement_type as enum ('ingreso', 'egreso');
exception when duplicate_object then null; end $$;
do $$ begin
  create type cash_movement_category as enum (
    'cobro_cuota', 'desembolso', 'inyeccion_capital', 'gasto_operativo',
    'retiro_utilidad', 'anulacion_pago', 'ajuste', 'otro');
exception when duplicate_object then null; end $$;
do $$ begin
  create type contact_result as enum (
    'contactado', 'no_contesta', 'promesa_pago', 'visita_realizada',
    'cliente_ausente', 'numero_erroneo', 'se_niega_pagar', 'otro');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- 1. AJUSTES DEL SISTEMA (singleton id = 1)
-- -----------------------------------------------------------------------------
create table if not exists public.system_settings (
  id                     smallint primary key default 1 check (id = 1),
  -- Negocio y ticket
  business_name          text not null default 'Mi Financiera',
  legal_name             text,
  tax_id                 text,
  address                text,
  phone                  text,
  logo_url               text,
  receipt_footer         text default 'Gracias por su puntualidad.',
  receipt_width          smallint not null default 80 check (receipt_width in (58, 80)),
  -- Moneda
  currency_code          text not null default 'PEN',
  currency_symbol        text not null default 'S/',
  currency_position      text not null default 'before' check (currency_position in ('before', 'after')),
  currency_decimals      smallint not null default 2 check (currency_decimals between 0 and 2),
  phone_country_code     text not null default '51',
  timezone               text not null default 'America/Lima',
  -- Valores por defecto de préstamos
  default_interest_rate  numeric(8,4) not null default 20,
  default_interest_type  interest_type not null default 'simple',
  default_flat_rate_mode flat_rate_mode not null default 'total',
  default_frequency      loan_frequency not null default 'diario',
  default_term_count     integer not null default 24,
  default_grace_days     integer not null default 0 check (default_grace_days >= 0),
  default_late_fee_type  late_fee_type not null default 'fijo_diario',
  default_late_fee_value numeric(12,4) not null default 1,
  default_late_fee_cap   numeric(14,2),
  -- Interruptores
  exclude_sundays_daily  boolean not null default true,
  allow_partial_payments boolean not null default true,
  require_guarantor_from numeric(14,2),          -- null = nunca exigir
  allow_late_fee_waiver  boolean not null default true,
  require_open_cash      boolean not null default true,
  -- Imputación de pagos (cascada)
  payment_order          text[] not null default array['late_fee', 'interest', 'principal'],
  -- Plantillas WhatsApp
  templates              jsonb not null default jsonb_build_object(
    'bienvenida',  'Hola {cliente}, {negocio} le confirma el desembolso de su préstamo. Cuota: {monto_cuota}. Primer vencimiento: {fecha_vencimiento}.',
    'recordatorio','Hola {cliente}, le recordamos que su cuota de {monto_cuota} vence el {fecha_vencimiento}. {negocio}',
    'mora',        'Hola {cliente}, su préstamo registra {dias_mora} días de atraso. Saldo pendiente: {saldo_total}. Comuníquese con {negocio}.',
    'recibo',      'Hola {cliente}, recibimos su pago. Saldo pendiente: {saldo_total}. Recibo: {link_recibo}. {negocio}'
  ),
  updated_at             timestamptz not null default now(),
  constraint payment_order_valid check (
    payment_order <@ array['late_fee', 'interest', 'principal']
    and cardinality(payment_order) = 3)
);
insert into public.system_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.holidays (
  holiday_date date primary key,
  description  text not null
);

-- -----------------------------------------------------------------------------
-- 2. PERFILES
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  phone       text,
  role        user_role not null default 'cobrador',
  zone        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Crea el perfil automáticamente al registrarse un usuario.
-- El primer usuario del sistema se convierte en admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role user_role;
begin
  if not exists (select 1 from public.profiles) then
    v_role := 'admin';
  else
    v_role := coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'cobrador');
  end if;
  insert into public.profiles (id, full_name, phone, role)
  values (new.id,
          coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
          new.raw_user_meta_data ->> 'phone',
          v_role)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers de rol (SECURITY DEFINER para no recursar en RLS)
create or replace function public.current_user_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.has_role(variadic roles user_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() = any (roles), false)
$$;

create or replace function public.business_today()
returns date language sql stable set search_path = public as $$
  select (now() at time zone (select timezone from public.system_settings where id = 1))::date
$$;

-- -----------------------------------------------------------------------------
-- 3. CLIENTES
-- -----------------------------------------------------------------------------
create table if not exists public.clients (
  id                     uuid primary key default gen_random_uuid(),
  code                   text unique,
  document_type          text not null default 'DNI' check (document_type in ('DNI', 'RUC', 'CE', 'CEDULA', 'PASAPORTE', 'OTRO')),
  document_number        text not null,
  first_name             text not null,
  last_name              text not null,
  phone                  text not null,
  phone_secondary        text,
  email                  text,
  address                text not null,
  address_reference      text,
  zone                   text,
  latitude               numeric(10,7),
  longitude              numeric(10,7),
  occupation             text,
  business_name          text,
  monthly_income         numeric(14,2),
  -- Aval / garante
  guarantor_name         text,
  guarantor_document     text,
  guarantor_phone        text,
  guarantor_address      text,
  guarantor_relationship text,
  -- Referencias
  references_json        jsonb not null default '[]'::jsonb,
  -- Riesgo
  credit_score           smallint not null default 70 check (credit_score between 0 and 100),
  status                 client_status not null default 'activo',
  notes                  text,
  assigned_collector_id  uuid references public.profiles (id) on delete set null,
  created_by             uuid references public.profiles (id) default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (document_type, document_number)
);
create index if not exists clients_collector_idx on public.clients (assigned_collector_id);
create index if not exists clients_search_idx on public.clients
  using gin (to_tsvector('simple', first_name || ' ' || last_name || ' ' || document_number));

create sequence if not exists public.client_code_seq;
create table if not exists public.client_documents (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  kind         text not null check (kind in ('foto_cliente', 'documento_anverso', 'documento_reverso', 'negocio', 'garantia', 'otro')),
  storage_path text not null,
  uploaded_by  uuid references public.profiles (id) default auth.uid(),
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4. PRÉSTAMOS Y CRONOGRAMA
-- -----------------------------------------------------------------------------
create sequence if not exists public.loan_code_seq;
create table if not exists public.loans (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique default ('PREST-' || lpad(nextval('public.loan_code_seq')::text, 4, '0')),
  client_id         uuid not null references public.clients (id) on delete restrict,
  previous_loan_id  uuid references public.loans (id),
  principal_amount  numeric(14,2) not null check (principal_amount > 0),
  interest_rate     numeric(8,4) not null check (interest_rate >= 0),
  interest_type     interest_type not null,
  flat_rate_mode    flat_rate_mode not null default 'total',
  frequency         loan_frequency not null,
  term_count        integer not null check (term_count between 1 and 720),
  installment_amount numeric(14,2) not null,
  total_interest    numeric(14,2) not null,
  total_amount      numeric(14,2) not null,
  paid_amount       numeric(14,2) not null default 0,  -- capital + interés pagado
  late_fee_paid     numeric(14,2) not null default 0,
  balance_due       numeric(14,2) not null,            -- capital + interés pendiente
  grace_days        integer not null default 0,
  late_fee_type     late_fee_type not null,
  late_fee_rate     numeric(12,4) not null default 0,
  late_fee_cap      numeric(14,2),
  exclude_sundays   boolean not null default false,
  first_due_date    date not null,
  maturity_date     date not null,
  status            loan_status not null default 'activo',
  net_disbursed     numeric(14,2) not null,
  refinanced_balance numeric(14,2) not null default 0,
  disbursed_at      timestamptz not null default now(),
  closed_at         timestamptz,
  collector_id      uuid references public.profiles (id),
  notes             text,
  created_by        uuid references public.profiles (id) default auth.uid(),
  created_at        timestamptz not null default now()
);
create index if not exists loans_client_idx on public.loans (client_id);
create index if not exists loans_status_idx on public.loans (status);

create table if not exists public.installments (
  id                 uuid primary key default gen_random_uuid(),
  loan_id            uuid not null references public.loans (id) on delete cascade,
  installment_number integer not null,
  due_date           date not null,
  principal_due      numeric(14,2) not null,
  interest_due       numeric(14,2) not null,
  late_fee_due       numeric(14,2) not null default 0,  -- mora devengada a la fecha
  principal_paid     numeric(14,2) not null default 0,
  interest_paid      numeric(14,2) not null default 0,
  late_fee_paid      numeric(14,2) not null default 0,
  late_fee_waived    numeric(14,2) not null default 0,
  interest_waived    numeric(14,2) not null default 0,
  paid_amount        numeric(14,2) not null default 0,
  status             installment_status not null default 'pendiente',
  paid_at            date,
  unique (loan_id, installment_number)
);
create index if not exists installments_due_idx on public.installments (due_date) where status in ('pendiente', 'parcial');

-- -----------------------------------------------------------------------------
-- 5. PAGOS
-- -----------------------------------------------------------------------------
create sequence if not exists public.payment_code_seq;
create table if not exists public.payments (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique default ('REC-' || lpad(nextval('public.payment_code_seq')::text, 4, '0')),
  loan_id              uuid not null references public.loans (id),
  client_id            uuid not null references public.clients (id),
  amount               numeric(14,2) not null check (amount > 0),
  applied_to_late_fee  numeric(14,2) not null default 0,
  applied_to_interest  numeric(14,2) not null default 0,
  applied_to_principal numeric(14,2) not null default 0,
  late_fee_waived      numeric(14,2) not null default 0,
  interest_waived      numeric(14,2) not null default 0,
  payment_method       payment_method not null default 'efectivo',
  is_payoff            boolean not null default false,
  notes                text,
  collected_by         uuid references public.profiles (id) default auth.uid(),
  cash_session_id      uuid,
  paid_at              timestamptz not null default now(),
  voided               boolean not null default false,
  voided_at            timestamptz,
  voided_by            uuid references public.profiles (id),
  void_reason          text
);
create index if not exists payments_loan_idx on public.payments (loan_id);
create index if not exists payments_paid_at_idx on public.payments (paid_at);

create table if not exists public.payment_allocations (
  id             uuid primary key default gen_random_uuid(),
  payment_id     uuid not null references public.payments (id) on delete cascade,
  installment_id uuid not null references public.installments (id),
  late_fee       numeric(14,2) not null default 0,
  interest       numeric(14,2) not null default 0,
  principal      numeric(14,2) not null default 0
);

-- -----------------------------------------------------------------------------
-- 6. BITÁCORA DE COBRANZA
-- -----------------------------------------------------------------------------
create table if not exists public.collection_notes (
  id             uuid primary key default gen_random_uuid(),
  loan_id        uuid references public.loans (id) on delete cascade,
  client_id      uuid not null references public.clients (id) on delete cascade,
  contact_result contact_result not null,
  promise_date   date,
  promise_amount numeric(14,2),
  notes          text,
  created_by     uuid references public.profiles (id) default auth.uid(),
  created_at     timestamptz not null default now()
);
create index if not exists collection_notes_client_idx on public.collection_notes (client_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 7. CAJA
-- -----------------------------------------------------------------------------
create table if not exists public.cash_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id),
  branch           text not null default 'Principal',
  opening_amount   numeric(14,2) not null default 0,
  expected_amount  numeric(14,2),
  counted_amount   numeric(14,2),
  difference       numeric(14,2),
  status           cash_session_status not null default 'abierta',
  opened_at        timestamptz not null default now(),
  closed_at        timestamptz,
  closing_notes    text
);
create unique index if not exists one_open_session_per_user
  on public.cash_sessions (user_id) where status = 'abierta';

create table if not exists public.cash_movements (
  id              uuid primary key default gen_random_uuid(),
  cash_session_id uuid references public.cash_sessions (id),
  movement_type   cash_movement_type not null,
  category        cash_movement_category not null,
  amount          numeric(14,2) not null check (amount > 0),
  description     text,
  loan_id         uuid references public.loans (id),
  payment_id      uuid references public.payments (id),
  created_by      uuid references public.profiles (id) default auth.uid(),
  created_at      timestamptz not null default now()
);
create index if not exists cash_movements_session_idx on public.cash_movements (cash_session_id);
create index if not exists cash_movements_created_idx on public.cash_movements (created_at);

alter table public.payments drop constraint if exists payments_cash_session_fk;
alter table public.payments add constraint payments_cash_session_fk
  foreign key (cash_session_id) references public.cash_sessions (id);

-- -----------------------------------------------------------------------------
-- 8. AUDITORÍA (inmutable)
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text,
  action      text not null,
  old_values  jsonb,
  new_values  jsonb,
  actor_id    uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (table_name, record_id, action, old_values, new_values)
  values (
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', '1'),
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['clients', 'loans', 'payments', 'system_settings', 'profiles', 'cash_sessions', 'holidays'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_trigger()', t);
  end loop;
end $$;

create or replace function public.prevent_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs es inmutable';
end $$;
drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_mutation();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists clients_touch on public.clients;
create trigger clients_touch before update on public.clients for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch on public.system_settings;
create trigger settings_touch before update on public.system_settings for each row execute function public.touch_updated_at();

create or replace function public.set_client_code()
returns trigger language plpgsql as $$
begin
  if new.code is null then
    new.code := 'CLI-' || lpad(nextval('public.client_code_seq')::text, 4, '0');
  end if;
  return new;
end $$;
drop trigger if exists clients_code on public.clients;
create trigger clients_code before insert on public.clients for each row execute function public.set_client_code();

-- =============================================================================
-- 9. MOTOR FINANCIERO EN SQL (espejo exacto de src/services/finance)
-- =============================================================================

-- Tasa por periodo a partir de la tasa MENSUAL (%) para sistema francés.
create or replace function public.period_rate(p_monthly_rate numeric, p_frequency loan_frequency)
returns numeric language sql immutable as $$
  select (p_monthly_rate / 100) * case p_frequency
    when 'mensual'   then 1::numeric
    when 'quincenal' then 0.5::numeric
    when 'semanal'   then 7::numeric / 30
    when 'diario'    then 1::numeric / 30 end
$$;

create or replace function public.is_non_working_day(p_date date, p_exclude_sundays boolean)
returns boolean language sql stable set search_path = public as $$
  select (p_exclude_sundays and extract(isodow from p_date) = 7)
      or exists (select 1 from public.holidays h where h.holiday_date = p_date)
$$;

-- Fechas de vencimiento. p_start_date = fecha de desembolso.
create or replace function public.generate_due_dates(
  p_start_date date, p_frequency loan_frequency, p_count integer, p_exclude_sundays boolean)
returns table (n integer, due_date date) language plpgsql stable set search_path = public as $$
declare
  v_cursor date := p_start_date;
  v_date   date;
  i        integer;
begin
  for i in 1 .. p_count loop
    if p_frequency = 'diario' then
      v_cursor := v_cursor + 1;
      while public.is_non_working_day(v_cursor, p_exclude_sundays) loop
        v_cursor := v_cursor + 1;
      end loop;
      v_date := v_cursor;
    else
      v_date := case p_frequency
        when 'semanal'   then p_start_date + (7 * i)
        when 'quincenal' then p_start_date + (15 * i)
        when 'mensual'   then (p_start_date + make_interval(months => i))::date end;
      while public.is_non_working_day(v_date, p_exclude_sundays) loop
        v_date := v_date + 1;
      end loop;
    end if;
    n := i; due_date := v_date;
    return next;
  end loop;
end $$;

-- Cronograma completo (simple/flat o francés)
create or replace function public.build_schedule(
  p_principal numeric, p_rate numeric, p_interest_type interest_type, p_flat_mode flat_rate_mode,
  p_frequency loan_frequency, p_count integer, p_start_date date, p_exclude_sundays boolean)
returns table (n integer, due_date date, principal_due numeric, interest_due numeric)
language plpgsql stable set search_path = public as $$
declare
  v_principal_c bigint := round(p_principal * 100);
  v_interest_c  bigint;
  v_cuota_c     bigint;
  v_base_p      bigint;
  v_base_i      bigint;
  v_i           numeric;
  v_cuota       numeric;
  v_balance     numeric := round(p_principal, 2);
  v_int         numeric;
  v_cap         numeric;
  r             record;
begin
  if p_interest_type = 'simple' then
    v_interest_c := round(v_principal_c * (p_rate / 100) *
                          case when p_flat_mode = 'por_periodo' then p_count else 1 end);
    -- Cuota redondeada al céntimo; la última absorbe la diferencia
    v_cuota_c := round((v_principal_c + v_interest_c)::numeric / p_count);
    v_base_i  := round(v_interest_c::numeric / p_count);
    v_base_p  := v_cuota_c - v_base_i;
    for r in select * from public.generate_due_dates(p_start_date, p_frequency, p_count, p_exclude_sundays) loop
      n := r.n; due_date := r.due_date;
      if r.n < p_count then
        principal_due := v_base_p / 100.0; interest_due := v_base_i / 100.0;
      else
        principal_due := (v_principal_c - v_base_p * (p_count - 1)) / 100.0;
        interest_due  := (v_interest_c - v_base_i * (p_count - 1)) / 100.0;
      end if;
      principal_due := round(principal_due, 2); interest_due := round(interest_due, 2);
      return next;
    end loop;
  else
    v_i := public.period_rate(p_rate, p_frequency);
    if v_i = 0 then
      v_cuota := round(p_principal / p_count, 2);
    else
      v_cuota := round(p_principal * v_i / (1 - power(1 + v_i, -p_count)), 2);
    end if;
    for r in select * from public.generate_due_dates(p_start_date, p_frequency, p_count, p_exclude_sundays) loop
      v_int := round(v_balance * v_i, 2);
      if r.n < p_count then
        v_cap := v_cuota - v_int;
      else
        v_cap := v_balance;
      end if;
      v_balance := v_balance - v_cap;
      n := r.n; due_date := r.due_date; principal_due := v_cap; interest_due := v_int;
      return next;
    end loop;
  end if;
end $$;

-- Mora de una cuota a una fecha (no incluye lo ya pagado/condonado)
create or replace function public.compute_late_fee(
  p_due_date date, p_today date, p_grace integer, p_type late_fee_type, p_value numeric,
  p_cap numeric, p_outstanding numeric)
returns numeric language plpgsql immutable as $$
declare
  v_days integer := greatest(0, (p_today - p_due_date) - p_grace);
  v_fee  numeric := 0;
begin
  if v_days <= 0 or p_value <= 0 then return 0; end if;
  v_fee := case p_type
    when 'fijo_diario'       then p_value * v_days
    when 'porcentaje_diario' then p_outstanding * (p_value / 100) * v_days
    when 'fijo_por_cuota'    then p_value end;
  if p_cap is not null then v_fee := least(v_fee, p_cap); end if;
  return round(v_fee, 2);
end $$;

-- Recalcula mora devengada de un préstamo a la fecha de hoy.
create or replace function public.refresh_late_fees(p_loan_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_loan  public.loans;
  v_today date := public.business_today();
begin
  select * into v_loan from public.loans where id = p_loan_id;
  if v_loan.status <> 'activo' then return; end if;
  update public.installments i
     set late_fee_due = greatest(i.late_fee_paid + i.late_fee_waived,
           public.compute_late_fee(i.due_date, v_today, v_loan.grace_days, v_loan.late_fee_type,
             v_loan.late_fee_rate, v_loan.late_fee_cap,
             (i.principal_due + i.interest_due) - (i.principal_paid + i.interest_paid) - i.interest_waived))
   where i.loan_id = p_loan_id
     and i.status in ('pendiente', 'parcial');
end $$;

-- Recalcula la mora de TODAS las cuotas vencidas en una sola sentencia (set-based).
create or replace function public.refresh_all_late_fees()
returns integer language plpgsql security definer set search_path = public as $$
declare v_today date := public.business_today(); c integer;
begin
  update public.installments i
     set late_fee_due = greatest(i.late_fee_paid + i.late_fee_waived,
           public.compute_late_fee(i.due_date, v_today, l.grace_days, l.late_fee_type, l.late_fee_rate, l.late_fee_cap,
             (i.principal_due + i.interest_due) - (i.principal_paid + i.interest_paid) - i.interest_waived))
    from public.loans l
   where l.id = i.loan_id and l.status = 'activo'
     and i.status in ('pendiente', 'parcial') and i.due_date < v_today;
  get diagnostics c = row_count;
  return c;
end $$;

-- Score interno 0..100
create or replace function public.recompute_client_score(p_client_id uuid)
returns smallint language plpgsql security definer set search_path = public as $$
declare
  v_today     date := public.business_today();
  v_eval      integer;
  v_on_time   integer;
  v_avg_late  numeric;
  v_max_open  integer;
  v_score     numeric;
begin
  select count(*),
         count(*) filter (where i.paid_at is not null and i.paid_at <= i.due_date + l.grace_days),
         coalesce(avg(greatest(0, coalesce(i.paid_at, v_today) - i.due_date)), 0),
         coalesce(max(case when i.paid_at is null then v_today - i.due_date end), 0)
    into v_eval, v_on_time, v_avg_late, v_max_open
    from public.installments i
    join public.loans l on l.id = i.loan_id
   where l.client_id = p_client_id
     and l.status <> 'anulado'
     and i.status <> 'condonado'
     and i.due_date <= v_today;

  if v_eval = 0 then
    v_score := 70;
  else
    v_score := round((v_on_time::numeric / v_eval) * 70 + greatest(0, 30 - v_avg_late * 2))
               - least(20, greatest(0, v_max_open));
  end if;
  v_score := least(100, greatest(0, v_score));
  update public.clients set credit_score = v_score::smallint where id = p_client_id;
  return v_score::smallint;
end $$;

-- Recalcula totales del préstamo desde sus cuotas
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
  update public.loans
     set paid_amount = v_paid,
         late_fee_paid = v_fee,
         balance_due = v_bal,
         status = case when status = 'activo' and v_bal <= 0 then 'pagado'::loan_status
                       when status = 'pagado' and v_bal > 0 then 'activo'::loan_status
                       else status end,
         closed_at = case when v_bal <= 0 then coalesce(closed_at, now()) else null end
   where id = p_loan_id;
end $$;

create or replace function public.update_installment_status(p_loan_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.installments
     set paid_amount = principal_paid + interest_paid + late_fee_paid,
         status = case
           when principal_paid + interest_paid + interest_waived >= principal_due + interest_due
            and late_fee_paid + late_fee_waived >= late_fee_due then
             case when principal_paid + interest_paid = 0 and interest_waived > 0 then 'condonado'::installment_status
                  else 'pagado'::installment_status end
           when principal_paid + interest_paid + late_fee_paid > 0 then 'parcial'::installment_status
           else 'pendiente'::installment_status end,
         paid_at = case
           when principal_paid + interest_paid + interest_waived >= principal_due + interest_due
            and late_fee_paid + late_fee_waived >= late_fee_due
           then coalesce(paid_at, public.business_today()) else null end
   where loan_id = p_loan_id;
end $$;

-- Sesión de caja abierta del usuario actual
create or replace function public.current_cash_session()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.cash_sessions where user_id = auth.uid() and status = 'abierta' limit 1
$$;

-- =============================================================================
-- 10. RPCs TRANSACCIONALES
-- =============================================================================

-- Distribuye un monto en cascada sobre las cuotas de un préstamo.
-- Fase 1: cuotas vencidas, componente por componente según payment_order.
-- Fase 2: cuotas siguientes en orden de vencimiento.
create or replace function public.apply_cascade(p_loan_id uuid, p_payment_id uuid, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order   text[];
  v_today   date := public.business_today();
  v_left    numeric := p_amount;
  v_comp    text;
  v_take    numeric;
  v_fee     numeric := 0; v_int numeric := 0; v_cap numeric := 0;
  r         record;
begin
  select payment_order into v_order from public.system_settings where id = 1;

  create temp table if not exists _alloc (installment_id uuid primary key, late_fee numeric, interest numeric, principal numeric) on commit drop;
  truncate _alloc;

  -- Fase 1: vencidas
  foreach v_comp in array v_order loop
    for r in
      select * from public.installments
       where loan_id = p_loan_id and status in ('pendiente', 'parcial') and due_date < v_today
       order by due_date, installment_number for update
    loop
      exit when v_left <= 0;
      v_take := least(v_left, case v_comp
        when 'late_fee'  then r.late_fee_due - r.late_fee_paid - r.late_fee_waived
        when 'interest'  then r.interest_due - r.interest_paid - r.interest_waived
        when 'principal' then r.principal_due - r.principal_paid end);
      if v_take > 0 then
        insert into _alloc values (r.id, 0, 0, 0) on conflict do nothing;
        execute format('update _alloc set %I = %I + $1 where installment_id = $2', v_comp, v_comp)
          using v_take, r.id;
        execute format('update public.installments set %I = %I + $1 where id = $2',
                       v_comp || '_paid', v_comp || '_paid')
          using v_take, r.id;
        v_left := v_left - v_take;
      end if;
    end loop;
  end loop;

  -- Fase 2: siguientes cuotas (en orden), dentro de cada cuota según payment_order
  for r in
    select * from public.installments
     where loan_id = p_loan_id and status in ('pendiente', 'parcial') and due_date >= v_today
     order by due_date, installment_number for update
  loop
    exit when v_left <= 0;
    foreach v_comp in array v_order loop
      exit when v_left <= 0;
      select * into r from public.installments where id = r.id;
      v_take := least(v_left, case v_comp
        when 'late_fee'  then r.late_fee_due - r.late_fee_paid - r.late_fee_waived
        when 'interest'  then r.interest_due - r.interest_paid - r.interest_waived
        when 'principal' then r.principal_due - r.principal_paid end);
      if v_take > 0 then
        insert into _alloc values (r.id, 0, 0, 0) on conflict do nothing;
        execute format('update _alloc set %I = %I + $1 where installment_id = $2', v_comp, v_comp)
          using v_take, r.id;
        execute format('update public.installments set %I = %I + $1 where id = $2',
                       v_comp || '_paid', v_comp || '_paid')
          using v_take, r.id;
        v_left := v_left - v_take;
      end if;
    end loop;
  end loop;

  if v_left > 0 then
    raise exception 'El monto excede la deuda total en %', v_left using errcode = 'P0001';
  end if;

  insert into public.payment_allocations (payment_id, installment_id, late_fee, interest, principal)
  select p_payment_id, installment_id, late_fee, interest, principal from _alloc;

  select coalesce(sum(late_fee), 0), coalesce(sum(interest), 0), coalesce(sum(principal), 0)
    into v_fee, v_int, v_cap from _alloc;

  return jsonb_build_object('late_fee', v_fee, 'interest', v_int, 'principal', v_cap);
end $$;

-- Crear préstamo + cronograma + egreso de caja (+ refinanciación opcional)
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
    insert into public.payments (loan_id, client_id, amount, payment_method, is_payoff, notes, cash_session_id)
    values (p_previous_loan_id, p_client_id, v_payoff, 'refinanciamiento', true,
            'Refinanciado con ' || v_code, v_session)
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
    select coalesce(sum(late_fee_due - late_fee_paid - late_fee_waived), 0) into v_waived
      from public.installments where loan_id = p_loan_id and status in ('pendiente', 'parcial');
    update public.installments set late_fee_waived = late_fee_due - late_fee_paid
     where loan_id = p_loan_id and status in ('pendiente', 'parcial');
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

-- Saldo para liquidación anticipada
create or replace function public.get_payoff_quote(p_loan_id uuid, p_waive_future_interest boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.business_today();
  v_cap numeric; v_int numeric; v_fut numeric; v_fee numeric;
begin
  perform public.refresh_late_fees(p_loan_id);
  select coalesce(sum(principal_due - principal_paid), 0),
         coalesce(sum(interest_due - interest_paid - interest_waived), 0),
         coalesce(sum(interest_due - interest_paid - interest_waived) filter (where due_date > v_today), 0),
         coalesce(sum(late_fee_due - late_fee_paid - late_fee_waived), 0)
    into v_cap, v_int, v_fut, v_fee
    from public.installments where loan_id = p_loan_id and status in ('pendiente', 'parcial');
  return jsonb_build_object(
    'principal', v_cap, 'interest', v_int, 'future_interest', v_fut, 'late_fee', v_fee,
    'total', v_cap + v_int + v_fee,
    'total_without_future_interest', v_cap + v_int - v_fut + v_fee);
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
begin
  if (p_waive_late_fee or p_waive_future_interest) and not public.has_role('admin', 'cajero') then
    raise exception 'No autorizado para condonar' using errcode = '42501';
  end if;
  perform 1 from public.loans where id = p_loan_id and status = 'activo' for update;
  if not found then raise exception 'Préstamo no activo'; end if;
  perform public.refresh_late_fees(p_loan_id);

  if p_waive_future_interest then
    select coalesce(sum(interest_due - interest_paid - interest_waived), 0) into v_waived_int
      from public.installments
     where loan_id = p_loan_id and status in ('pendiente', 'parcial') and due_date > v_today;
    update public.installments set interest_waived = interest_due - interest_paid
     where loan_id = p_loan_id and status in ('pendiente', 'parcial') and due_date > v_today;
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
  update public.payments set is_payoff = true, interest_waived = v_waived_int
   where id = (v_res ->> 'payment_id')::uuid;
  return v_res || jsonb_build_object('interest_waived', v_waived_int, 'total', v_total);
end $$;

-- Anular pago (solo admin): revierte asignaciones y caja
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
  if p.late_fee_waived > 0 then
    update public.installments set late_fee_waived = 0
     where loan_id = p.loan_id and status in ('pendiente', 'parcial', 'pagado');
  end if;
  if p.interest_waived > 0 then
    update public.installments set interest_waived = 0 where loan_id = p.loan_id;
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

-- Caja: apertura, movimiento manual y cierre con arqueo
create or replace function public.open_cash_session(p_opening_amount numeric, p_branch text default 'Principal')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_role('admin', 'cajero', 'cobrador') then raise exception 'No autorizado'; end if;
  if public.current_cash_session() is not null then raise exception 'Ya tiene una caja abierta'; end if;
  insert into public.cash_sessions (user_id, branch, opening_amount)
  values (auth.uid(), coalesce(p_branch, 'Principal'), coalesce(p_opening_amount, 0))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.add_cash_movement(
  p_type cash_movement_type, p_category cash_movement_category, p_amount numeric, p_description text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_session uuid := public.current_cash_session();
begin
  if not public.has_role('admin', 'cajero') then raise exception 'No autorizado' using errcode = '42501'; end if;
  if v_session is null then raise exception 'Debe abrir caja'; end if;
  if p_category in ('cobro_cuota', 'desembolso', 'anulacion_pago') then
    raise exception 'Categoría reservada para movimientos automáticos';
  end if;
  if p_category in ('inyeccion_capital', 'retiro_utilidad') and not public.has_role('admin') then
    raise exception 'Solo admin puede registrar inyecciones o retiros de capital';
  end if;
  insert into public.cash_movements (cash_session_id, movement_type, category, amount, description)
  values (v_session, p_type, p_category, round(p_amount, 2), p_description)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.cash_session_expected(p_session_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select s.opening_amount
       + coalesce(sum(m.amount) filter (where m.movement_type = 'ingreso'), 0)
       - coalesce(sum(m.amount) filter (where m.movement_type = 'egreso'), 0)
    from public.cash_sessions s
    left join public.cash_movements m on m.cash_session_id = s.id
   where s.id = p_session_id
   group by s.opening_amount
$$;

create or replace function public.close_cash_session(p_counted_amount numeric, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session uuid := public.current_cash_session(); v_exp numeric;
begin
  if v_session is null then raise exception 'No tiene caja abierta'; end if;
  v_exp := public.cash_session_expected(v_session);
  update public.cash_sessions
     set status = 'cerrada', closed_at = now(), expected_amount = v_exp,
         counted_amount = p_counted_amount, difference = p_counted_amount - v_exp, closing_notes = p_notes
   where id = v_session;
  return jsonb_build_object('session_id', v_session, 'expected', v_exp,
                            'counted', p_counted_amount, 'difference', p_counted_amount - v_exp);
end $$;

-- Cierre forzado por admin (cierre global)
create or replace function public.admin_close_cash_session(p_session_id uuid, p_counted_amount numeric, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_exp numeric;
begin
  if not public.has_role('admin') then raise exception 'Solo admin' using errcode = '42501'; end if;
  v_exp := public.cash_session_expected(p_session_id);
  update public.cash_sessions
     set status = 'cerrada', closed_at = now(), expected_amount = v_exp,
         counted_amount = p_counted_amount, difference = p_counted_amount - v_exp,
         closing_notes = coalesce(p_notes, 'Cierre por administrador')
   where id = p_session_id and status = 'abierta';
end $$;

-- =============================================================================
-- 11. VISTAS (security_invoker: respetan RLS del usuario)
-- =============================================================================
create or replace view public.v_installment_status with (security_invoker = true) as
select
  i.*,
  l.code as loan_code, l.client_id, l.collector_id, l.status as loan_status, l.frequency,
  (i.principal_due + i.interest_due + i.late_fee_due
    - i.principal_paid - i.interest_paid - i.late_fee_paid - i.late_fee_waived - i.interest_waived) as outstanding,
  greatest(0, public.business_today() - i.due_date) as days_overdue
from public.installments i
join public.loans l on l.id = i.loan_id;

create or replace view public.v_loan_portfolio with (security_invoker = true) as
select
  l.id, l.code, l.client_id, l.status, l.principal_amount, l.interest_rate, l.interest_type,
  l.frequency, l.term_count, l.installment_amount, l.total_amount, l.paid_amount, l.balance_due,
  l.disbursed_at, l.maturity_date, l.collector_id, l.previous_loan_id,
  c.first_name || ' ' || c.last_name as client_name, c.document_number, c.phone, c.address,
  c.address_reference, c.zone, c.credit_score,
  coalesce(l.collector_id, c.assigned_collector_id) as effective_collector_id,
  pr.full_name as collector_name,
  nx.next_due_date, nx.next_due_amount,
  coalesce(od.overdue_amount, 0) as overdue_amount,
  coalesce(od.overdue_count, 0) as overdue_count,
  coalesce(od.max_days_overdue, 0) as days_overdue,
  coalesce(od.late_fee_pending, 0) as late_fee_pending,
  (select count(*) from public.installments x where x.loan_id = l.id and x.status in ('pagado', 'condonado')) as paid_count
from public.loans l
join public.clients c on c.id = l.client_id
left join public.profiles pr on pr.id = coalesce(l.collector_id, c.assigned_collector_id)
left join lateral (
  select i.due_date as next_due_date,
         (i.principal_due + i.interest_due + i.late_fee_due - i.principal_paid - i.interest_paid
           - i.late_fee_paid - i.late_fee_waived - i.interest_waived) as next_due_amount
    from public.installments i
   where i.loan_id = l.id and i.status in ('pendiente', 'parcial')
   order by i.due_date, i.installment_number limit 1) nx on true
left join lateral (
  select sum(i.principal_due + i.interest_due + i.late_fee_due - i.principal_paid - i.interest_paid
             - i.late_fee_paid - i.late_fee_waived - i.interest_waived) as overdue_amount,
         count(*) as overdue_count,
         max(public.business_today() - i.due_date) as max_days_overdue,
         sum(i.late_fee_due - i.late_fee_paid - i.late_fee_waived) as late_fee_pending
    from public.installments i
   where i.loan_id = l.id and i.status in ('pendiente', 'parcial') and i.due_date < public.business_today()) od on true;

create or replace view public.v_payments_detail with (security_invoker = true) as
select p.*, l.code as loan_code, c.first_name || ' ' || c.last_name as client_name,
       c.document_number, c.phone, pr.full_name as collector_name
from public.payments p
join public.loans l on l.id = p.loan_id
join public.clients c on c.id = p.client_id
left join public.profiles pr on pr.id = p.collected_by;

-- =============================================================================
-- 12. DASHBOARD Y REPORTES (RPC de lectura)
-- =============================================================================
create or replace function public.get_dashboard_kpis(p_days integer default 14)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v_today date := public.business_today();
  v_tz text := (select timezone from public.system_settings where id = 1);
  r jsonb;
begin
  select jsonb_build_object(
    'capital_activo', coalesce((select sum(i.principal_due - i.principal_paid)
                                  from public.installments i join public.loans l on l.id = i.loan_id
                                 where l.status = 'activo'), 0),
    'saldo_cartera', coalesce((select sum(balance_due) from public.loans where status = 'activo'), 0),
    'meta_hoy', coalesce((select sum(outstanding) from public.v_installment_status
                           where loan_status = 'activo' and status in ('pendiente', 'parcial') and due_date <= v_today), 0)
                + coalesce((select sum(amount) from public.payments
                             where not voided and payment_method <> 'refinanciamiento'
                               and (paid_at at time zone v_tz)::date = v_today), 0),
    'cobrado_hoy', coalesce((select sum(amount) from public.payments
                              where not voided and payment_method <> 'refinanciamiento'
                                and (paid_at at time zone v_tz)::date = v_today), 0),
    'cartera_vencida', coalesce((select sum(outstanding) from public.v_installment_status
                                  where loan_status = 'activo' and status in ('pendiente', 'parcial') and due_date < v_today), 0),
    'prestamos_activos', (select count(*) from public.loans where status = 'activo'),
    'prestamos_en_mora', (select count(distinct loan_id) from public.v_installment_status
                           where loan_status = 'activo' and status in ('pendiente', 'parcial') and due_date < v_today),
    'interes_mes', coalesce((select sum(applied_to_interest + applied_to_late_fee) from public.payments
                              where not voided and date_trunc('month', paid_at at time zone v_tz) = date_trunc('month', v_today::timestamp)), 0),
    'saldo_caja', coalesce((select sum(public.cash_session_expected(id)) from public.cash_sessions where status = 'abierta'), 0),
    'serie', (select coalesce(jsonb_agg(jsonb_build_object('fecha', d::date, 'cobrado', coalesce(cb.total, 0), 'desembolsado', coalesce(ds.total, 0)) order by d), '[]'::jsonb)
                from generate_series(v_today - (p_days - 1), v_today, interval '1 day') d
                left join lateral (select sum(amount) total from public.payments
                                    where not voided and payment_method <> 'refinanciamiento'
                                      and (paid_at at time zone v_tz)::date = d::date) cb on true
                left join lateral (select sum(net_disbursed) total from public.loans
                                    where status <> 'anulado' and (disbursed_at at time zone v_tz)::date = d::date) ds on true),
    'distribucion', (select jsonb_build_object(
        'al_dia',      count(*) filter (where days_overdue = 0 and (next_due_date is null or next_due_date > v_today + 3)),
        'por_vencer',  count(*) filter (where days_overdue = 0 and next_due_date between v_today and v_today + 3),
        'mora_1_7',    count(*) filter (where days_overdue between 1 and 7),
        'mora_8_mas',  count(*) filter (where days_overdue >= 8))
       from public.v_loan_portfolio where status = 'activo')
  ) into r;
  return r;
end $$;

create or replace function public.report_aging()
returns table (bucket text, loans bigint, amount numeric) language sql stable security invoker set search_path = public as $$
  with b as (
    select case when days_overdue between 1 and 7 then '1-7'
                when days_overdue between 8 and 15 then '8-15'
                when days_overdue between 16 and 30 then '16-30'
                else '+30' end as bucket, overdue_amount
      from public.v_loan_portfolio where status = 'activo' and days_overdue > 0)
  select x.bucket, count(b.bucket), coalesce(sum(b.overdue_amount), 0)
    from (values ('1-7', 1), ('8-15', 2), ('16-30', 3), ('+30', 4)) x(bucket, ord)
    left join b on b.bucket = x.bucket
   group by x.bucket, x.ord order by x.ord
$$;

create or replace function public.report_collections(p_from date, p_to date)
returns table (fecha date, collector_id uuid, collector_name text, pagos bigint, total numeric,
               capital numeric, interes numeric, mora numeric)
language sql stable security invoker set search_path = public as $$
  select (p.paid_at at time zone (select timezone from public.system_settings where id = 1))::date,
         p.collected_by, coalesce(pr.full_name, '—'), count(*), sum(p.amount),
         sum(p.applied_to_principal), sum(p.applied_to_interest), sum(p.applied_to_late_fee)
    from public.payments p left join public.profiles pr on pr.id = p.collected_by
   where not p.voided and p.payment_method <> 'refinanciamiento'
     and (p.paid_at at time zone (select timezone from public.system_settings where id = 1))::date between p_from and p_to
   group by 1, 2, 3 order by 1 desc, 5 desc
$$;

create or replace function public.report_cash_flow(p_from date, p_to date)
returns table (category cash_movement_category, movement_type cash_movement_type, total numeric, movimientos bigint)
language sql stable security invoker set search_path = public as $$
  select category, movement_type, sum(amount), count(*)
    from public.cash_movements
   where (created_at at time zone (select timezone from public.system_settings where id = 1))::date between p_from and p_to
   group by 1, 2 order by 2, 3 desc
$$;

-- =============================================================================
-- 13. ROW LEVEL SECURITY
-- =============================================================================
alter table public.system_settings     enable row level security;
alter table public.holidays            enable row level security;
alter table public.profiles            enable row level security;
alter table public.clients             enable row level security;
alter table public.client_documents    enable row level security;
alter table public.loans               enable row level security;
alter table public.installments        enable row level security;
alter table public.payments            enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.collection_notes    enable row level security;
alter table public.cash_sessions       enable row level security;
alter table public.cash_movements      enable row level security;
alter table public.audit_logs          enable row level security;

-- ¿El cliente pertenece a la cartera del cobrador actual?
create or replace function public.can_access_client(p_client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('admin', 'cajero')
      or (public.has_role('cobrador') and exists (
            select 1 from public.clients c where c.id = p_client_id and c.assigned_collector_id = auth.uid()))
      or (public.has_role('cobrador') and exists (
            select 1 from public.loans l where l.client_id = p_client_id and l.collector_id = auth.uid()))
$$;

create or replace function public.can_access_loan(p_loan_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('admin', 'cajero')
      or exists (select 1 from public.loans l
                   join public.clients c on c.id = l.client_id
                  where l.id = p_loan_id
                    and public.has_role('cobrador')
                    and (l.collector_id = auth.uid() or c.assigned_collector_id = auth.uid()))
$$;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Ajustes: todos los autenticados leen; solo admin modifica
create policy settings_read on public.system_settings for select to authenticated using (true);
create policy settings_write on public.system_settings for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy holidays_read on public.holidays for select to authenticated using (true);
create policy holidays_write on public.holidays for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- Perfiles
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role('admin', 'cajero'));
create policy profiles_admin on public.profiles for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- Clientes
create policy clients_read on public.clients for select to authenticated
  using (public.can_access_client(id));
create policy clients_insert on public.clients for insert to authenticated
  with check (public.has_role('admin', 'cajero'));
create policy clients_update on public.clients for update to authenticated
  using (public.has_role('admin', 'cajero')) with check (public.has_role('admin', 'cajero'));
create policy clients_delete on public.clients for delete to authenticated
  using (public.has_role('admin'));

create policy client_docs_read on public.client_documents for select to authenticated
  using (public.can_access_client(client_id));
create policy client_docs_insert on public.client_documents for insert to authenticated
  with check (public.can_access_client(client_id));
create policy client_docs_delete on public.client_documents for delete to authenticated
  using (public.has_role('admin'));

-- Préstamos / cuotas / pagos: lectura según cartera. Escritura solo vía RPC.
create policy loans_read on public.loans for select to authenticated using (public.can_access_loan(id));
create policy loans_admin_update on public.loans for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy installments_read on public.installments for select to authenticated using (public.can_access_loan(loan_id));
create policy payments_read on public.payments for select to authenticated using (public.can_access_loan(loan_id));
create policy allocations_read on public.payment_allocations for select to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_id and public.can_access_loan(p.loan_id)));

-- Bitácora de cobranza
create policy notes_read on public.collection_notes for select to authenticated
  using (public.can_access_client(client_id));
create policy notes_insert on public.collection_notes for insert to authenticated
  with check (public.can_access_client(client_id) and created_by = auth.uid());

-- Caja: cada uno ve la suya; admin ve todas
create policy cash_sessions_read on public.cash_sessions for select to authenticated
  using (user_id = auth.uid() or public.has_role('admin'));
create policy cash_movements_read on public.cash_movements for select to authenticated
  using (public.has_role('admin') or exists (
    select 1 from public.cash_sessions s where s.id = cash_session_id and s.user_id = auth.uid()));

-- Auditoría: solo admin lee; nadie escribe directo
create policy audit_read on public.audit_logs for select to authenticated using (public.has_role('admin'));

-- Permisos a nivel de tabla. Los proyectos nuevos de Supabase NO conceden privilegios
-- automáticamente a las tablas creadas por SQL; sin esto toda lectura falla con 42501.
-- Qué filas ve/modifica cada usuario lo siguen decidiendo las políticas RLS de arriba.
-- anon no recibe nada: el sistema exige iniciar sesión.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
-- La auditoría solo se escribe por trigger: nadie la modifica directamente.
revoke insert, update, delete on public.audit_logs from authenticated;

-- Permisos de ejecución de RPCs: nada para anon; internas solo para el propio motor
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.apply_cascade(uuid, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.sync_loan_totals(uuid) from public, anon, authenticated;
revoke execute on function public.update_installment_status(uuid) from public, anon, authenticated;

-- =============================================================================
-- 14. STORAGE (bóveda documental y logo)
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('client-docs', 'client-docs', false), ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists "client_docs_rw" on storage.objects;
create policy "client_docs_rw" on storage.objects for all to authenticated
  using (bucket_id = 'client-docs'
         and public.can_access_client(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'client-docs'
         and public.can_access_client(((storage.foldername(name))[1])::uuid));

drop policy if exists "branding_read" on storage.objects;
create policy "branding_read" on storage.objects for select using (bucket_id = 'branding');
drop policy if exists "branding_admin" on storage.objects;
create policy "branding_admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.has_role('admin'));
drop policy if exists "branding_admin_upd" on storage.objects;
create policy "branding_admin_upd" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.has_role('admin'));

-- =============================================================================
-- 15. REALTIME (dashboard en vivo)
-- =============================================================================
do $$ begin
  alter publication supabase_realtime add table public.payments, public.cash_movements;
exception when others then null; end $$;

-- =============================================================================
-- 16. TAREA PROGRAMADA OPCIONAL (pg_cron): refrescar mora cada madrugada
--   select cron.schedule('refresh-late-fees', '0 6 * * *', $$select public.refresh_all_late_fees()$$);
-- =============================================================================
