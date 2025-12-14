-- Add COMPACT_FONT setting to global_settings
INSERT INTO public.global_settings (setting_key, setting_value, description)
VALUES ('COMPACT_FONT', 'false', 'When true, uses condensed font everywhere. When false, auto-switches to condensed on mobile.')
ON CONFLICT (setting_key) DO NOTHING;