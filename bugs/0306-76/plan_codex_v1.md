# Bug 0306-76 — Validación de NIT solo en frontend

  ## Summary

  Corregir el bug únicamente en el frontend del módulo Clientes, de modo
  que el campo NIT acepte solo caracteres numéricos 0-9 en alta y edición
  de cliente. No se harán cambios en Supabase, migraciones, constraints ni
  limpieza de datos existentes.

  La ruta afectada sigue siendo:

  - src/components/forms/ClientForm.tsx
  - src/pages/ClientNew.tsx
  - src/pages/ClientEdit.tsx
  - src/locales/es.json
  - src/locales/en.json
  - src/components/forms/__tests__/ClientForm.test.tsx o el archivo de
    pruebas frontend equivalente que el equipo prefiera crear

  La captura sigue siendo consistente con este alcance: muestra que el
  valor inválido ya quedó persistido y luego visible en el listado, pero
  este plan corrige solo la prevención desde la UI.

  ## Key Changes

  - En src/components/forms/ClientForm.tsx, cambiar la validación de
    unique_tax_id para que:
      - sea obligatoria
      - haga trim
      - acepte únicamente regex de dígitos puros: ^\d+$
  - Mantener unique_tax_id como string; no convertirlo a number.
  - Aplicar la misma regla a ambos renders del campo NIT:
      - formulario completo
      - formulario compacto
  - Añadir ayudas de frontend en ambos inputs:
      - inputMode="numeric"
      - pattern="[0-9]*"
      - opcionalmente autoComplete="off" si el equipo quiere evitar
        rellenos raros, pero no es necesario para cerrar el bug
  - Mostrar error inline con FormMessage usando i18n cuando el NIT
    contenga letras, espacios internos, símbolos o esté vacío.
  - No modificar useClientMutations, useEmsData, Clients.tsx ni archivos
    SQL, salvo que algún test frontend necesite mocks existentes.

  ## Public Interfaces / Types

  - No cambian APIs públicas ni payloads.
  - unique_tax_id sigue siendo string en frontend y en el payload enviado.
  - Se agregan claves i18n nuevas para errores de validación del NIT:
      - requerida
      - formato inválido solo numérico

  ## Tests to Add or Update

  - src/components/forms/__tests__/ClientForm.test.tsx
      - renderiza ClientForm en modo alta
      - al ingresar ABC123 o qweeeee en NIT y enviar, muestra error y no
        dispara guardado
      - al ingresar 123456789 en NIT y enviar, permite submit
      - conserva cadenas numéricas como string
  - Si el setup es simple, agregar un caso extra para compact y confirmar
    que la validación es la misma en edición.
  - No agregar tests de BD ni migraciones.
  - No mover la regla a src/lib/validation.ts salvo que el equipo quiera
    reutilizarla; para este ticket el cambio local al formulario es
    suficiente.

  ## Verification Steps

  - Manual:
      - abrir /clients/new
      - ingresar nombre válido y NIT con letras
      - verificar error inline y bloqueo del submit
      - reemplazar por un NIT solo numérico y verificar guardado
      - repetir en /clients/:id
  - Frontend regression:
      - confirmar que ambos layouts del formulario siguen renderizando
        bien
      - confirmar que mobile keyboard sugiera teclado numérico
      - confirmar que un NIT con ceros a la izquierda sigue visible y no
        se transforma
  - Commands:
      - npx vitest run src/components/forms/__tests__/ClientForm.test.tsx
      - si el entorno vuelve a bloquear Vitest en sandbox, ejecutar el
        mismo comando fuera del sandbox

  ## Assumptions

  - “Solo numérico” significa exclusivamente dígitos ASCII 0-9, sin
    guiones, espacios, letras ni sufijos.
  - El bug se considera resuelto bloqueando la entrada/guardado desde el
    formulario de frontend, aunque existan datos históricos inválidos.
  - La corrección no incluye saneamiento de registros ya persistidos ni
    validación adicional en backend/DB.

    inválido si existieran.
  - Si negocio después requiere formatos especiales de NIT, esta regex
    deberá relajarse.
  - Si algún test actual dependía de mensajes hardcodeados en inglés,
    habrá que ajustarlo al usar i18n.

  ## Out of Scope

  - Constraints SQL o migraciones en supabase/migrations
  - Limpieza de datos existentes
  - Cambios en la tabla/listado de clientes
  - Validación server-side o edge functions

  ## Open Questions

  - ¿Desean bloquear caracteres inválidos mientras se escribe, o solo
    permitir escribir y mostrar error al validar? Mi preferencia para
    cambio mínimo es validar en frontend y bloquear submit, sin
    sanitización agresiva.
  - ¿Quieren cubrir también el modo compact con test explícito, o basta
    con un test del schema compartido dentro de ClientForm?

  ## Disagreement Targets

  - Sanitizar el input en vivo vs validar al enviar.
      - Prefiero validar en frontend y bloquear submit, porque es el
        cambio más pequeño y menos invasivo.
  - Extraer helper reusable vs dejar la regla en ClientForm.
      - Prefiero dejarla local al formulario para no expandir el alcance.
  - Usar NumericInput vs mantener Input.
      - Prefiero mantener Input, porque NIT es identificador string y no
        una cantidad numérica.# Bug 0306-76 — Validación de NIT solo en frontend

  ## Summary

  Corregir el bug únicamente en el frontend del módulo Clientes, de modo
  que el campo NIT acepte solo caracteres numéricos 0-9 en alta y edición
  de cliente. No se harán cambios en Supabase, migraciones, constraints ni
  limpieza de datos existentes.

  La ruta afectada sigue siendo:

  - src/components/forms/ClientForm.tsx
  - src/pages/ClientNew.tsx
  - src/pages/ClientEdit.tsx
  - src/locales/es.json
  - src/locales/en.json
  - src/components/forms/__tests__/ClientForm.test.tsx o el archivo de
    pruebas frontend equivalente que el equipo prefiera crear

  La captura sigue siendo consistente con este alcance: muestra que el
  valor inválido ya quedó persistido y luego visible en el listado, pero
  este plan corrige solo la prevención desde la UI.

  ## Key Changes

  - En src/components/forms/ClientForm.tsx, cambiar la validación de
    unique_tax_id para que:
      - sea obligatoria
      - haga trim
      - acepte únicamente regex de dígitos puros: ^\d+$
  - Mantener unique_tax_id como string; no convertirlo a number.
  - Aplicar la misma regla a ambos renders del campo NIT:
      - formulario completo
      - formulario compacto
  - Añadir ayudas de frontend en ambos inputs:
      - inputMode="numeric"
      - pattern="[0-9]*"
      - opcionalmente autoComplete="off" si el equipo quiere evitar
        rellenos raros, pero no es necesario para cerrar el bug
  - Mostrar error inline con FormMessage usando i18n cuando el NIT
    contenga letras, espacios internos, símbolos o esté vacío.
  - No modificar useClientMutations, useEmsData, Clients.tsx ni archivos
    SQL, salvo que algún test frontend necesite mocks existentes.

  ## Public Interfaces / Types

  - No cambian APIs públicas ni payloads.
  - unique_tax_id sigue siendo string en frontend y en el payload enviado.
  - Se agregan claves i18n nuevas para errores de validación del NIT:
      - requerida
      - formato inválido solo numérico

  ## Tests to Add or Update

  - src/components/forms/__tests__/ClientForm.test.tsx
      - renderiza ClientForm en modo alta
      - al ingresar ABC123 o qweeeee en NIT y enviar, muestra error y no
        dispara guardado
      - al ingresar 123456789 en NIT y enviar, permite submit
      - conserva cadenas numéricas como string
  - Si el setup es simple, agregar un caso extra para compact y confirmar
    que la validación es la misma en edición.
  - No agregar tests de BD ni migraciones.
  - No mover la regla a src/lib/validation.ts salvo que el equipo quiera
    reutilizarla; para este ticket el cambio local al formulario es
    suficiente.

  ## Verification Steps

  - Manual:
      - abrir /clients/new
      - ingresar nombre válido y NIT con letras
      - verificar error inline y bloqueo del submit
      - reemplazar por un NIT solo numérico y verificar guardado
      - repetir en /clients/:id
  - Frontend regression:
      - confirmar que ambos layouts del formulario siguen renderizando
        bien
      - confirmar que mobile keyboard sugiera teclado numérico
      - confirmar que un NIT con ceros a la izquierda sigue visible y no
        se transforma
  - Commands:
      - npx vitest run src/components/forms/__tests__/ClientForm.test.tsx
      - si el entorno vuelve a bloquear Vitest en sandbox, ejecutar el
        mismo comando fuera del sandbox

  ## Assumptions

  - “Solo numérico” significa exclusivamente dígitos ASCII 0-9, sin
    guiones, espacios, letras ni sufijos.
  - El bug se considera resuelto bloqueando la entrada/guardado desde el
    formulario de frontend, aunque existan datos históricos inválidos.
  - La corrección no incluye saneamiento de registros ya persistidos ni
    validación adicional en backend/DB.

    inválido si existieran.
  - Si negocio después requiere formatos especiales de NIT, esta regex
    deberá relajarse.
  - Si algún test actual dependía de mensajes hardcodeados en inglés,
    habrá que ajustarlo al usar i18n.

  ## Out of Scope

  - Constraints SQL o migraciones en supabase/migrations
  - Limpieza de datos existentes
  - Cambios en la tabla/listado de clientes
  - Validación server-side o edge functions

  ## Open Questions

  - ¿Desean bloquear caracteres inválidos mientras se escribe, o solo
    permitir escribir y mostrar error al validar? Mi preferencia para
    cambio mínimo es validar en frontend y bloquear submit, sin
    sanitización agresiva.
  - ¿Quieren cubrir también el modo compact con test explícito, o basta
    con un test del schema compartido dentro de ClientForm?

  ## Disagreement Targets

  - Sanitizar el input en vivo vs validar al enviar.
      - Prefiero validar en frontend y bloquear submit, porque es el
        cambio más pequeño y menos invasivo.
  - Extraer helper reusable vs dejar la regla en ClientForm.
      - Prefiero dejarla local al formulario para no expandir el alcance.
  - Usar NumericInput vs mantener Input.
      - Prefiero mantener Input, porque NIT es identificador string y no
        una cantidad numérica.