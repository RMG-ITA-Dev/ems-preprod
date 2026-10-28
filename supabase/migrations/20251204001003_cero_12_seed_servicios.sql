-- Migración cero — Fase 4 (plan §4.1/§4.2): seed de servicios (ex taxonomies), 29 filas.
-- Fuente: bugs/migracion_cero/practicas.md, sección "Servicios" (idéntica a la recarga ya
-- ejecutada en Dev 2.0, bugs/practicas/reload_taxonomies_servicios.sql: código placeholder
-- secuencial S01..S29, todas globales — practica_id = NULL, is_active = true). El cero a la
-- izquierda conserva el orden numérico cuando la UI ordena alfabéticamente por `code`.
-- La fila 18 trae espacios en el catálogo maestro (" Deal Advisory, M&A ") — trim() explícito.
-- No depende de practicas/categories (practica_id queda NULL en las 29).

INSERT INTO public.servicios (code, name, practica_id, is_active) VALUES
  ('S01', trim('Audit Engagements Regulados Nuevos'),                                  NULL, true),
  ('S02', trim('Audit Engagements Regulados Recurrente'),                              NULL, true),
  ('S03', trim('Audit Engagements No Regulados Nuevos'),                               NULL, true),
  ('S04', trim('Audit Engagements No Regulados Recurrente'),                           NULL, true),
  ('S05', trim('Agreed upon procedures'),                                              NULL, true),
  ('S06', trim('ADV - Process consulting'),                                            NULL, true),
  ('S07', trim('ADV - Impairment'),                                                    NULL, true),
  ('S08', trim('Other Advisory services'),                                             NULL, true),
  ('S09', trim('M&A / Corporate'),                                                     NULL, true),
  ('S10', trim('Legal Compliance'),                                                    NULL, true),
  ('S11', trim('Commercial Law'),                                                      NULL, true),
  ('S12', trim('Other Legal services'),                                                NULL, true),
  ('S13', trim('Family Office & Private Client Services'),                             NULL, true),
  ('S14', trim('GMS Employment Tax Compliance (Expats)'),                              NULL, true),
  ('S15', trim('GMS Mobility Consulting Services'),                                    NULL, true),
  ('S16', trim('Domestic Corporate & Asset Management Tax Advisory'),                  NULL, true),
  ('S17', trim('International Tax'),                                                   NULL, true),
  ('S18', trim(' Deal Advisory, M&A '),                                                NULL, true),
  ('S19', trim('Valuations'),                                                          NULL, true),
  ('S20', trim('Tax Disputes/Litigation involving Independent Arbitration/Courts'),    NULL, true),
  ('S21', trim('Tax Compliance'),                                                      NULL, true),
  ('S22', trim('Transfer Pricing Compliance & Documentation'),                         NULL, true),
  ('S23', trim('Smart Digital Finance'),                                               NULL, true),
  ('S24', trim('Internal Audit and SOAS Strategic Sourcing'),                          NULL, true),
  ('S25', trim('Bookkeeping'),                                                         NULL, true),
  ('S26', trim('Payroll Services'),                                                    NULL, true),
  ('S27', trim('Strategy Support'),                                                    NULL, true),
  ('S28', trim('Other Assurance Engagements'),                                         NULL, true),
  ('S29', trim('Related Services (Non-Assurance)'),                                    NULL, true)
ON CONFLICT (lower(trim(code))) DO NOTHING;
