-- Migración cero — Fase 4 (plan §4.1/§4.2): seed de global_settings, 19 claves.
-- Lista cerrada por el operador 2026-08-23 (docs/migraciones/legado-consolidacion.md §4bis):
-- 14 claves de bugs/migracion_cero/datos_maestros.md + AUTH_MAX_FAILED_ATTEMPTS/TS_WORK_DAYS/
-- TS_AUTO_SAVE_SECONDS (tienen consumidor real en el código). DAILY_LIMIT/WEEKLY_LIMIT/
-- reporting_periods se descartan como legacy sin consumidor.
-- LANGUAGE/ALLOW_WEEKEND_TRACKING sumadas después (hallazgo de review de PR #310): faltaban en
-- la lista cerrada original — no estaban ni en datos_maestros.md ni en la reconciliación de
-- §1.6.c (que solo comparó contra el replay local, no contra Dev 2.0 real) — pero
-- Settings.handleSaveSettings las escribe siempre con una mutación update-only; sin la fila,
-- CUALQUIER guardado de Configuración fallaba en cuanto llegaba a esa clave. Defaults = el
-- mismo fallback que ya usa el código si la clave faltara (Settings.tsx).
--
-- Depende de cero_11 (ADM_ACTIVITY_ID resuelve por sub-select de la fila ADM sembrada ahí).
-- Corre DESPUÉS de cero_14 (admin bootstrap): mientras ALLOWED_EMAIL_DOMAIN no exista,
-- validate_email_domain() no bloquea el INSERT en auth.users del bootstrap (plan §4.2.1.3).
-- HOLIDAY_ENGAGEMENT_ID queda vacío por diseño (no existe todavía el encargo de feriados).

INSERT INTO public.global_settings (setting_key, setting_value, description) VALUES
  ('TAX_RATE',                  '0.13',                   'VAT tax rate (13%)'),
  ('DAILY_MIN',                 '8',                      'Minimum hours per day (visual indicator in timesheet grid)'),
  ('DAILY_MAX',                 '10',                     'Maximum hours per day (visual indicator and tracker guard)'),
  ('WEEKLY_MIN',                '40',                     'Minimum weekly hours required to submit timesheet'),
  ('WEEKLY_MAX',                '50',                     'Maximum weekly hours allowed to submit timesheet'),
  ('TS_MAX_BACKLOG_WEEKS',      '1',                      'Maximum number of incomplete past weeks allowed before blocking new submissions'),
  ('TS_MONTH_END_RULE',         'COMPLETE_SPANNING_WEEK', 'Rule for month-end: weeks containing month-end must be submitted by that date'),
  ('TS_EMPLOYEE_RETRO_DAYS',    '30',                     'Number of days employees can edit past entries; beyond this only managers can modify'),
  ('COMPACT_FONT',              'false',                  'When true, uses condensed font everywhere. When false, auto-switches to condensed on mobile.'),
  ('ALLOWED_EMAIL_DOMAIN',      'ruizmier.com',           'Allowed email domain for user registration'),
  ('SESSION_TIMEOUT_MINUTES',   '30',                     'Minutes of inactivity before automatic logout'),
  ('AUTH_LOCKOUT_MINUTES',      '15',                     'Minutes an account stays locked after exceeding failed login attempts'),
  ('AUTH_MAX_FAILED_ATTEMPTS',  '5',                       'Failed login attempts allowed before the account is locked'),
  ('TS_WORK_DAYS',              '5',                      'Number of work days per week (5 = Mon-Fri, 6 = Mon-Sat)'),
  ('TS_AUTO_SAVE_SECONDS',      '3',                      'Debounce delay for auto-saving time entries in seconds'),
  ('HOLIDAY_ENGAGEMENT_ID',     '',                       'Engagement ID allowed for time entries on holiday dates'),
  ('LANGUAGE',                  'en',                     'UI language (en/es)'),
  ('ALLOW_WEEKEND_TRACKING',    'false',                  'Whether Saturday/Sunday count as work days for timesheet limits')
ON CONFLICT (setting_key) DO NOTHING;

-- ADM_ACTIVITY_ID vía sub-select de la fila ADM (is_system=true) sembrada en cero_11 — nunca
-- un UUID hardcodeado, así queda vivo si algún reset futuro cambia el gen_random_uuid().
INSERT INTO public.global_settings (setting_key, setting_value, description)
SELECT 'ADM_ACTIVITY_ID', activity_id::text,
       'System activity ID for non-chargeable engagements (auto-assigned by trigger)'
FROM public.activity_codes
WHERE activity_code = 'ADM' AND is_system = true
ON CONFLICT (setting_key) DO NOTHING;
