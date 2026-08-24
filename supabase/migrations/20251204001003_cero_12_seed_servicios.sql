-- Migración cero — Fase 4 (plan §4.1/§4.2): seed de servicios (ex taxonomies), 29 filas.
-- Fuente: bugs/migracion_cero/practicas.md, sección "Servicios" (idéntica a la recarga ya
-- ejecutada en Dev 2.0, bugs/practicas/reload_taxonomies_servicios.sql: código placeholder
-- secuencial s1..s29, todas globales — practica_id = NULL, is_active = true).
-- La fila 18 trae espacios en el catálogo maestro (" Deal Advisory, M&A ") — trim() explícito.
-- No depende de practicas/categories (practica_id queda NULL en las 29).

INSERT INTO public.servicios (code, name, practica_id, is_active) VALUES
  ('s1',  trim('Audit Engagements Regulados Nuevos'),                                  NULL, true),
  ('s2',  trim('Audit Engagements Regulados Recurrente'),                              NULL, true),
  ('s3',  trim('Audit Engagements No Regulados Nuevos'),                               NULL, true),
  ('s4',  trim('Audit Engagements No Regulados Recurrente'),                           NULL, true),
  ('s5',  trim('Agreed upon procedures'),                                              NULL, true),
  ('s6',  trim('ADV - Process consulting'),                                            NULL, true),
  ('s7',  trim('ADV - Impairment'),                                                    NULL, true),
  ('s8',  trim('Other Advisory services'),                                             NULL, true),
  ('s9',  trim('M&A / Corporate'),                                                     NULL, true),
  ('s10', trim('Legal Compliance'),                                                    NULL, true),
  ('s11', trim('Commercial Law'),                                                      NULL, true),
  ('s12', trim('Other Legal services'),                                                NULL, true),
  ('s13', trim('Family Office & Private Client Services'),                             NULL, true),
  ('s14', trim('GMS Employment Tax Compliance (Expats)'),                              NULL, true),
  ('s15', trim('GMS Mobility Consulting Services'),                                    NULL, true),
  ('s16', trim('Domestic Corporate & Asset Management Tax Advisory'),                  NULL, true),
  ('s17', trim('International Tax'),                                                   NULL, true),
  ('s18', trim(' Deal Advisory, M&A '),                                                NULL, true),
  ('s19', trim('Valuations'),                                                          NULL, true),
  ('s20', trim('Tax Disputes/Litigation involving Independent Arbitration/Courts'),    NULL, true),
  ('s21', trim('Tax Compliance'),                                                      NULL, true),
  ('s22', trim('Transfer Pricing Compliance & Documentation'),                         NULL, true),
  ('s23', trim('Smart Digital Finance'),                                               NULL, true),
  ('s24', trim('Internal Audit and SOAS Strategic Sourcing'),                          NULL, true),
  ('s25', trim('Bookkeeping'),                                                         NULL, true),
  ('s26', trim('Payroll Services'),                                                    NULL, true),
  ('s27', trim('Strategy Support'),                                                    NULL, true),
  ('s28', trim('Other Assurance Engagements'),                                         NULL, true),
  ('s29', trim('Related Services (Non-Assurance)'),                                    NULL, true)
ON CONFLICT (lower(trim(code))) DO NOTHING;
