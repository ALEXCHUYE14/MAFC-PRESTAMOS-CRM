import type {
  CashMovementCategory, ContactResult, InstallmentStatus, LoanStatus, PaymentMethod,
} from "@/types/database";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo", transferencia: "Transferencia", yape: "Yape", plin: "Plin",
  tarjeta: "Tarjeta", refinanciamiento: "Refinanciamiento", otro: "Otro",
};

export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  activo: "Activo", pagado: "Pagado", refinanciado: "Refinanciado", anulado: "Anulado", castigado: "Castigado",
};

export const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = {
  pendiente: "Pendiente", parcial: "Parcial", pagado: "Pagado", condonado: "Condonado",
};

export const CONTACT_RESULT_LABEL: Record<ContactResult, string> = {
  contactado: "Contactado", no_contesta: "No contesta", promesa_pago: "Promesa de pago",
  visita_realizada: "Visita realizada", cliente_ausente: "Cliente ausente",
  numero_erroneo: "Número erróneo", se_niega_pagar: "Se niega a pagar", otro: "Otro",
};

export const CASH_CATEGORY_LABEL: Record<CashMovementCategory, string> = {
  cobro_cuota: "Cobro de cuota", desembolso: "Desembolso", inyeccion_capital: "Inyección de capital",
  gasto_operativo: "Gasto operativo", retiro_utilidad: "Retiro de utilidad",
  anulacion_pago: "Anulación de pago", ajuste: "Ajuste", otro: "Otro",
  anulacion_prestamo: "Anulación de préstamo",
};

export const MANUAL_CASH_CATEGORIES: CashMovementCategory[] = [
  "inyeccion_capital", "gasto_operativo", "retiro_utilidad", "ajuste", "otro",
];
