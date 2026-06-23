-- Eliminar el módulo viejo de Gastos: tabla expense_logs
-- =======================================================
-- El módulo de Gastos (expense_logs) fue reemplazado por el módulo de Solicitud
-- de Fondos (fund_request_expenses). Ya no se usa desde la app.
--
-- Se MANTIENE `expense_types` (tabla lookup compartida que sigue usando
-- fund_request_expenses y la gestión en Settings). NO se toca.
--
-- ⚠️ DESTRUCTIVO E IRREVERSIBLE: elimina la tabla y TODOS sus registros
-- históricos de gastos, junto con sus índices, triggers y políticas RLS.
-- Confirmar que no se necesitan esos datos antes de ejecutar en producción.

DROP TABLE IF EXISTS public.expense_logs CASCADE;

NOTIFY pgrst, 'reload schema';
