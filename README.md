# Sistema Core & CRM de Préstamos

Next.js 15 (App Router) · TypeScript estricto · Tailwind · componentes estilo shadcn · Supabase (Postgres + Auth + Storage + Realtime + RPC).

## Puesta en marcha

1. **Supabase**: cree un proyecto y ejecute en el SQL Editor, en orden:
   - `supabase/schema.sql` (tablas, RPC transaccionales, vistas, RLS, buckets de Storage, Realtime)
   - `supabase/seed.sql` (opcional, feriados)
2. **Variables**: copie `.env.example` a `.env.local` y complete URL, anon key y `SUPABASE_SERVICE_ROLE_KEY` (solo servidor, necesaria para crear usuarios desde Ajustes).
3. `npm install && npm run dev`
4. Cree el primer usuario en Supabase > Authentication > Add user. **El primer usuario del sistema se vuelve `admin` automáticamente**; los demás se crean desde *Ajustes > Usuarios y roles*.
5. (Recomendado) Active `pg_cron` y programe `select public.refresh_all_late_fees();` cada madrugada.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Desarrollo |
| `npm run build` | Build de producción |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Pruebas del motor financiero (node:test) |

## Arquitectura

```
supabase/schema.sql         Esquema completo + RPC ACID + RLS + Storage
src/services/finance/       Motor puro en céntimos (decimal.js): calendario, cronograma, mora, cascada, liquidación, score
src/app/(dashboard)/        Dashboard, clientes, préstamos, cobranzas, caja, reportes, ajustes
src/app/recibo/[id]         Ticket térmico 58/80 mm
src/app/estado-cuenta/[id]  Estado de cuenta A4 (imprimir / PDF)
src/app/api/export/[report] CSV (Excel) y respaldo JSON/CSV
```

### Integridad financiera
- Toda escritura de dinero pasa por RPC `SECURITY DEFINER` en una sola transacción: `create_loan_with_schedule`, `register_loan_payment`, `liquidate_loan`, `void_payment`, `open/close_cash_session`, `add_cash_movement`. Las tablas financieras no admiten INSERT/UPDATE directos desde el cliente (RLS).
- El cronograma se calcula en PostgreSQL (`build_schedule`) — fuente de verdad — y el simulador usa el mismo algoritmo en TypeScript. Verificado: 12 473 cuotas aleatorias idénticas al céntimo entre ambos motores.
- Cascada de imputación configurable (por defecto Mora → Interés vencido → Capital vencido → siguientes cuotas).
- Anulación de pagos solo admin, con motivo, reversión de asignaciones y contra-asiento en caja.
- `audit_logs` inmutable (trigger que bloquea UPDATE/DELETE) con valores anterior/nuevo.

### Roles (RLS en base de datos + UI)
- **admin**: todo, ajustes, anulaciones, auditoría, cierre global de cajas.
- **cajero**: desembolsos, cobros, su caja, clientes, reportes.
- **cobrador**: solo clientes/préstamos asignados (`assigned_collector_id` o `collector_id`), abonos y gestiones.

### Interés
- **Simple / flat**: tasa sobre el total (`Capital × Tasa`) o por periodo (`Capital × Tasa × N°cuotas`). Cuota redondeada al céntimo; la última absorbe la diferencia.
- **Francés**: la tasa se interpreta como **mensual** y se convierte al periodo (diario = /30, semanal = ×7/30, quincenal = /2).

### Atajos de teclado (escritorio)
`Alt+D` Dashboard · `Alt+C` Cobranzas · `Alt+P` Préstamos · `Alt+L` Clientes · `Alt+K` Caja · `Alt+R` Reportes · `Alt+N` Nuevo préstamo · `Alt+U` Nuevo cliente · `/` buscar.
