--
-- FIX: el numerador de solicitudes de fondos truncaba con lpad().
--
-- NO es una migración de notificaciones. Se encontró probando ese flujo (2026-09-10) y vivió
-- un rato dentro del archivo de disparadores de Fondos; se sacó a su propio archivo para que
-- revertir las notificaciones no arrastre este arreglo, y para que quien venga a preguntar
-- "por qué cambió el numerador" no tenga que leer una migración de la campana.
--

-- =====================================================================
-- D) FIX AJENO A NOTIFICACIONES: el numerador de solicitudes
-- =====================================================================
--
-- Vive en este archivo porque es del MISMO MODULO (Solicitudes de Fondos), no porque tenga
-- que ver con la campana. Se encontro probando el flujo de notificaciones, 2026-09-10: no se
-- podia crear una segunda solicitud contra la misma OT.
--
--     Key (request_number)=(FR-2026-2026) already exists.
--
-- El generador era:
--
--     'FR-' || to_char(now(),'YYYY') || '-' || lpad(nextval(seq)::text, 4, '0')
--
-- y lpad() NO solo rellena: cuando la cadena ya es mas larga que `length`, la TRUNCA por la
-- derecha (doc de PostgreSQL 9.4). Con la secuencia en 20260058:
--
--     lpad('20260058', 4, '0')  ->  '2026'      (no '20260058')
--
-- O sea que TODO valor entre 20260000 y 20269999 produce el mismo 'FR-2026-2026'. El primero
-- entro; del segundo en adelante, unique_violation.
--
-- Son dos problemas encimados:
--   1) LA FUNCION. El lpad a 4 es una bomba de tiempo independiente del setval: apenas la
--      firma pasara las 9.999 solicitudes, el 10000 se truncaria a '1000' y chocaria con
--      FR-<anio>-1000. Falla en silencio y solo se nota cuando ya hay datos.
--   2) LOS DATOS. La secuencia quedo en 20260058 cuando el maximo real usado es 2026 (los
--      numeros legitimos van 0001..0055): alguien corrio un setval en algun momento.
--
-- Si algun dia hay que revertir las notificaciones, ESTE BLOQUE NO debe revertirse con ellas.
--
-- =====================================================================
-- D.1) La funcion: rellenar a 4 sin truncar nunca
-- =====================================================================
--
-- El CASE es deliberadamente explicito en vez de un to_char con mascara: to_char(12345,
-- 'FM0000') devuelve '####' cuando el valor no entra en la mascara, que es otra forma
-- silenciosa de romperse. Asi, por debajo de 10.000 se ve 0001..9999 como siempre, y por
-- encima simplemente crece: 10000, 10001, ...
--
CREATE OR REPLACE FUNCTION public.set_fund_request_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $BODY$
DECLARE
  v_seq bigint;
BEGIN
  IF NEW.request_number IS NULL THEN
    v_seq := nextval('public.fund_request_number_seq');
    NEW.request_number := 'FR-' || to_char(now(), 'YYYY') || '-' ||
      CASE WHEN v_seq < 10000
           THEN lpad(v_seq::text, 4, '0')   -- 0001..9999, formato historico
           ELSE v_seq::text                 -- 10000+, sin truncar
      END;
  END IF;
  RETURN NEW;
END;
$BODY$;

COMMENT ON FUNCTION public.set_fund_request_number() IS
  'Numera las solicitudes de fondos como FR-<anio>-<secuencia>. La secuencia se rellena a 4 digitos SOLO mientras entre: lpad() trunca por la derecha y con valores mas largos generaba numeros duplicados (hallazgo 2026-09-10).';

-- =====================================================================
-- D.2) Los datos: la secuencia vuelve a un valor coherente
-- =====================================================================
--
-- Se la deja en el MAXIMO numero ya usado (no en el maximo "legitimo"): asi el proximo
-- nunca puede chocar con una fila existente, incluida la FR-2026-2026 que quedo de la
-- prueba. El costo es un salto estetico en la numeracion (0055 -> 2027), no un riesgo.
--
-- No se toca ninguna fila: renombrar request_number de una solicitud viva romperia
-- cualquier referencia externa (correos, planillas, capturas) que la mencione.
--
-- `is_called` es condicional y no `true` a secas. Con la tabla vacia el maximo es 0, el GREATEST
-- lo sube a 1, y marcar ese 1 como consumido hacia que el primer nextval() devolviera 2: una base
-- nueva arrancaba en FR-<anio>-0002 y el 0001 no existia nunca. Con filas, en cambio, el valor SI
-- esta consumido y el proximo tiene que ser max+1.
SELECT setval(
  'public.fund_request_number_seq',
  GREATEST(
    (SELECT COALESCE(max(substring(request_number from '[0-9]+$')::bigint), 0)
       FROM public.fund_requests
      WHERE request_number ~ '^FR-[0-9]{4}-[0-9]+$'),
    1),
  EXISTS (SELECT 1 FROM public.fund_requests
           WHERE request_number ~ '^FR-[0-9]{4}-[0-9]+$')
);
