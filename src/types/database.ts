// Tipos estrictos del esquema `supabase/schema.sql`.
// Puede regenerarlos con: npx supabase gen types typescript --project-id <id> > src/types/database.ts
// (manteniendo los alias exportados al final del archivo).

export type UserRole = "admin" | "cajero" | "cobrador";
export type InterestType = "simple" | "frances";
export type FlatRateMode = "total" | "por_periodo";
export type LoanFrequency = "diario" | "semanal" | "quincenal" | "mensual";
export type LateFeeType = "fijo_diario" | "porcentaje_diario" | "fijo_por_cuota";
export type LoanStatus = "activo" | "pagado" | "refinanciado" | "anulado" | "castigado";
export type InstallmentStatus = "pendiente" | "parcial" | "pagado" | "condonado";
export type PaymentMethod = "efectivo" | "transferencia" | "yape" | "plin" | "tarjeta" | "refinanciamiento" | "otro";
export type ClientStatus = "activo" | "inactivo" | "bloqueado";
export type CashSessionStatus = "abierta" | "cerrada";
export type CashMovementType = "ingreso" | "egreso";
export type CashMovementCategory =
  | "cobro_cuota" | "desembolso" | "inyeccion_capital" | "gasto_operativo"
  | "retiro_utilidad" | "anulacion_pago" | "ajuste" | "otro" | "anulacion_prestamo" | "recuperacion_castigo";
export type ContactResult =
  | "contactado" | "no_contesta" | "promesa_pago" | "visita_realizada"
  | "cliente_ausente" | "numero_erroneo" | "se_niega_pagar" | "otro";
export type PaymentComponentKey = "late_fee" | "interest" | "principal";

export interface WhatsappTemplates {
  bienvenida: string;
  recordatorio: string;
  mora: string;
  recibo: string;
}

export interface SystemSettings {
  id: number;
  business_name: string;
  legal_name: string | null;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
  receipt_footer: string | null;
  receipt_width: 58 | 80;
  currency_code: string;
  currency_symbol: string;
  currency_position: "before" | "after";
  currency_decimals: number;
  phone_country_code: string;
  timezone: string;
  default_interest_rate: number;
  default_interest_type: InterestType;
  default_flat_rate_mode: FlatRateMode;
  default_frequency: LoanFrequency;
  default_term_count: number;
  default_grace_days: number;
  default_late_fee_type: LateFeeType;
  default_late_fee_value: number;
  default_late_fee_cap: number | null;
  exclude_sundays_daily: boolean;
  allow_partial_payments: boolean;
  require_guarantor_from: number | null;
  allow_late_fee_waiver: boolean;
  require_open_cash: boolean;
  payment_order: PaymentComponentKey[];
  templates: WhatsappTemplates;
  updated_at: string;
}

export interface Holiday { holiday_date: string; description: string }

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  zone: string | null;
  active: boolean;
  created_at: string;
}

export interface ClientReference { name: string; phone: string; relationship?: string }

export interface Client {
  id: string;
  code: string | null;
  document_type: "DNI" | "RUC" | "CE" | "CEDULA" | "PASAPORTE" | "OTRO";
  document_number: string;
  first_name: string;
  last_name: string;
  phone: string;
  phone_secondary: string | null;
  email: string | null;
  address: string;
  address_reference: string | null;
  zone: string | null;
  latitude: number | null;
  longitude: number | null;
  occupation: string | null;
  business_name: string | null;
  monthly_income: number | null;
  guarantor_name: string | null;
  guarantor_document: string | null;
  guarantor_phone: string | null;
  guarantor_address: string | null;
  guarantor_relationship: string | null;
  references_json: ClientReference[];
  credit_score: number;
  status: ClientStatus;
  notes: string | null;
  assigned_collector_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientDocument {
  id: string;
  client_id: string;
  kind: "foto_cliente" | "documento_anverso" | "documento_reverso" | "negocio" | "garantia" | "otro";
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface Loan {
  id: string;
  code: string;
  client_id: string;
  previous_loan_id: string | null;
  principal_amount: number;
  interest_rate: number;
  interest_type: InterestType;
  flat_rate_mode: FlatRateMode;
  frequency: LoanFrequency;
  term_count: number;
  installment_amount: number;
  total_interest: number;
  total_amount: number;
  paid_amount: number;
  late_fee_paid: number;
  balance_due: number;
  grace_days: number;
  late_fee_type: LateFeeType;
  late_fee_rate: number;
  late_fee_cap: number | null;
  exclude_sundays: boolean;
  first_due_date: string;
  maturity_date: string;
  status: LoanStatus;
  net_disbursed: number;
  refinanced_balance: number;
  disbursed_at: string;
  closed_at: string | null;
  collector_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  written_off_at: string | null;
  written_off_by: string | null;
  written_off_amount: number | null;
  write_off_reason: string | null;
}

export interface Installment {
  id: string;
  loan_id: string;
  installment_number: number;
  due_date: string;
  principal_due: number;
  interest_due: number;
  late_fee_due: number;
  principal_paid: number;
  interest_paid: number;
  late_fee_paid: number;
  late_fee_waived: number;
  interest_waived: number;
  paid_amount: number;
  status: InstallmentStatus;
  paid_at: string | null;
}

export interface Payment {
  id: string;
  code: string;
  loan_id: string;
  client_id: string;
  amount: number;
  applied_to_late_fee: number;
  applied_to_interest: number;
  applied_to_principal: number;
  late_fee_waived: number;
  interest_waived: number;
  payment_method: PaymentMethod;
  is_payoff: boolean;
  notes: string | null;
  collected_by: string | null;
  cash_session_id: string | null;
  paid_at: string;
  voided: boolean;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  refinanced_by_loan_id: string | null;
  /** Cobrado sobre un préstamo castigado (recuperación de cartera) */
  is_recovery: boolean;
}

export interface PaymentAllocation {
  id: string;
  payment_id: string;
  installment_id: string;
  late_fee: number;
  interest: number;
  principal: number;
}

export interface CollectionNote {
  id: string;
  loan_id: string | null;
  client_id: string;
  contact_result: ContactResult;
  promise_date: string | null;
  promise_amount: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CashSession {
  id: string;
  user_id: string;
  branch: string;
  opening_amount: number;
  expected_amount: number | null;
  counted_amount: number | null;
  difference: number | null;
  status: CashSessionStatus;
  opened_at: string;
  closed_at: string | null;
  closing_notes: string | null;
}

export interface CashMovement {
  id: string;
  cash_session_id: string | null;
  movement_type: CashMovementType;
  category: CashMovementCategory;
  amount: number;
  description: string | null;
  loan_id: string | null;
  payment_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  table_name: string;
  record_id: string | null;
  action: "insert" | "update" | "delete";
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  actor_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------- Vistas
export interface InstallmentStatusView extends Installment {
  loan_code: string;
  client_id: string;
  collector_id: string | null;
  loan_status: LoanStatus;
  frequency: LoanFrequency;
  outstanding: number;
  days_overdue: number;
}

export interface LoanPortfolioView {
  id: string;
  code: string;
  client_id: string;
  status: LoanStatus;
  principal_amount: number;
  interest_rate: number;
  interest_type: InterestType;
  frequency: LoanFrequency;
  term_count: number;
  installment_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  disbursed_at: string;
  maturity_date: string;
  collector_id: string | null;
  previous_loan_id: string | null;
  client_name: string;
  document_number: string;
  phone: string;
  address: string;
  address_reference: string | null;
  zone: string | null;
  credit_score: number;
  effective_collector_id: string | null;
  collector_name: string | null;
  next_due_date: string | null;
  next_due_amount: number | null;
  overdue_amount: number;
  overdue_count: number;
  days_overdue: number;
  late_fee_pending: number;
  paid_count: number;
}

export interface PaymentDetailView extends Payment {
  loan_code: string;
  client_name: string;
  document_number: string;
  phone: string;
  collector_name: string | null;
}

// ---------------------------------------------------------------- RPC
export interface DashboardKpis {
  capital_activo: number;
  saldo_cartera: number;
  meta_hoy: number;
  cobrado_hoy: number;
  cartera_vencida: number;
  prestamos_activos: number;
  prestamos_en_mora: number;
  interes_mes: number;
  saldo_caja: number;
  serie: { fecha: string; cobrado: number; desembolsado: number }[];
  distribucion: { al_dia: number; por_vencer: number; mora_1_7: number; mora_8_mas: number };
}

export interface RegisterPaymentResult {
  payment_id: string;
  code: string;
  applied: { late_fee: number; interest: number; principal: number };
  late_fee_waived: number;
  is_recovery?: boolean;
  balance_due: number;
  loan_status: LoanStatus;
}

export interface CreateLoanResult {
  loan_id: string;
  code: string;
  net_disbursed: number;
  refinanced_balance: number;
  installment_amount: number;
  total_amount: number;
}

export interface PayoffQuoteResult {
  principal: number;
  interest: number;
  future_interest: number;
  late_fee: number;
  total: number;
  total_without_future_interest: number;
}

// ---------------------------------------------------------------- Database (supabase-js)
// Los tipos mapeados convierten interfaces en object types (necesario para GenericTable de postgrest-js).
type Plain<T> = { [K in keyof T]: T[K] };
type Table<Row, Required extends keyof Row = never> = {
  Row: Plain<Row>;
  Insert: Plain<Partial<Row> & Pick<Row, Required>>;
  Update: Plain<Partial<Row>>;
  Relationships: [];
};
type View<Row> = { Row: Plain<Row>; Relationships: [] };
type Fn<Args, Returns> = { Args: Args; Returns: Returns };

/** Calidad de cartera. PAR n = capital pendiente de préstamos con más de n días de atraso. */
export interface PortfolioQuality {
  capital_cartera: number;
  par_1: number; par_30: number; par_90: number;
  prestamos_par_1: number; prestamos_par_30: number; prestamos_par_90: number;
  castigado_total: number; castigado_mes: number;
  recuperado_total: number; recuperado_mes: number;
}

export interface VoidLoanResult { loan_id: string; returned_to_cash: number; restored_loan_id: string | null }
export interface WriteOffLoanResult { loan_id: string; written_off_amount: number }

export type Database = {
  public: {
    Tables: {
      system_settings: Table<SystemSettings>;
      holidays: Table<Holiday, "holiday_date" | "description">;
      profiles: Table<Profile, "id">;
      clients: Table<Client, "document_number" | "first_name" | "last_name" | "phone" | "address">;
      client_documents: Table<ClientDocument, "client_id" | "kind" | "storage_path">;
      loans: Table<Loan>;
      installments: Table<Installment>;
      payments: Table<Payment>;
      payment_allocations: Table<PaymentAllocation>;
      collection_notes: Table<CollectionNote, "client_id" | "contact_result">;
      cash_sessions: Table<CashSession>;
      cash_movements: Table<CashMovement>;
      audit_logs: Table<AuditLog>;
    };
    Views: {
      v_installment_status: View<InstallmentStatusView>;
      v_loan_portfolio: View<LoanPortfolioView>;
      v_payments_detail: View<PaymentDetailView>;
    };
    Functions: {
      create_loan_with_schedule: Fn<{
        p_client_id: string; p_principal: number; p_interest_rate: number;
        p_interest_type: InterestType; p_frequency: LoanFrequency; p_term_count: number;
        p_start_date?: string; p_flat_rate_mode?: FlatRateMode; p_grace_days?: number;
        p_late_fee_type?: LateFeeType; p_late_fee_value?: number; p_late_fee_cap?: number | null;
        p_exclude_sundays?: boolean; p_previous_loan_id?: string | null; p_collector_id?: string | null;
        p_notes?: string | null;
      }, CreateLoanResult>;
      register_loan_payment: Fn<{
        p_loan_id: string; p_amount: number; p_method?: PaymentMethod; p_notes?: string | null;
        p_waive_late_fee?: boolean;
      }, RegisterPaymentResult>;
      liquidate_loan: Fn<{
        p_loan_id: string; p_method?: PaymentMethod; p_waive_late_fee?: boolean;
        p_waive_future_interest?: boolean; p_notes?: string | null;
      }, RegisterPaymentResult & { total: number; interest_waived: number }>;
      get_payoff_quote: Fn<{ p_loan_id: string; p_waive_future_interest?: boolean }, PayoffQuoteResult>;
      void_payment: Fn<{ p_payment_id: string; p_reason: string }, undefined>;
      void_loan: Fn<{ p_loan_id: string; p_reason: string }, VoidLoanResult>;
      write_off_loan: Fn<{ p_loan_id: string; p_reason: string }, WriteOffLoanResult>;
      refresh_late_fees: Fn<{ p_loan_id: string }, undefined>;
      refresh_all_late_fees: Fn<Record<string, never>, number>;
      recompute_client_score: Fn<{ p_client_id: string }, number>;
      open_cash_session: Fn<{ p_opening_amount: number; p_branch?: string }, string>;
      close_cash_session: Fn<{ p_counted_amount: number; p_notes?: string | null },
        { session_id: string; expected: number; counted: number; difference: number }>;
      admin_close_cash_session: Fn<{ p_session_id: string; p_counted_amount: number; p_notes?: string | null }, undefined>;
      add_cash_movement: Fn<{
        p_type: CashMovementType; p_category: CashMovementCategory; p_amount: number; p_description: string;
      }, string>;
      cash_session_expected: Fn<{ p_session_id: string }, number>;
      current_cash_session: Fn<Record<string, never>, string | null>;
      business_today: Fn<Record<string, never>, string>;
      get_dashboard_kpis: Fn<{ p_days?: number }, DashboardKpis>;
      get_portfolio_quality: Fn<Record<string, never>, PortfolioQuality>;
      report_aging: Fn<Record<string, never>, { bucket: string; loans: number; amount: number }[]>;
      report_collections: Fn<{ p_from: string; p_to: string }, {
        fecha: string; collector_id: string | null; collector_name: string; pagos: number;
        total: number; capital: number; interes: number; mora: number;
      }[]>;
      report_cash_flow: Fn<{ p_from: string; p_to: string }, {
        category: CashMovementCategory; movement_type: CashMovementType; total: number; movimientos: number;
      }[]>;
    };
    Enums: {
      user_role: UserRole;
      interest_type: InterestType;
      loan_frequency: LoanFrequency;
      late_fee_type: LateFeeType;
      loan_status: LoanStatus;
      installment_status: InstallmentStatus;
      payment_method: PaymentMethod;
    };
    CompositeTypes: Record<string, never>;
  };
}
