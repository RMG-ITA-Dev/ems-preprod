 # Plan Bug 0319-87

  ## Context

  El bug ocurre en OPERACIONES-Aprobaciones, específicamente en la vista de
  detalle de aprobación de horas (/timesheet/approvals/:periodId). El
  reporte dice que al cancelar sin haber hecho cambios aparece un diálogo
  redundante, y la sugerencia es salir directamente si no existen cambios.

  Archivos relevantes identificados:

  - src/pages/TimesheetApprovalDetail.tsx
  - src/hooks/usePageLeaveLock.ts
  - src/components/ui/leave-page-dialog.tsx
  - src/pages/__tests__/TimesheetApprovalDetail.lock-navigation.test.tsx
  - Referencias de riesgo por uso compartido del hook: src/pages/
    WorksheetNew.tsx, src/pages/Settings.tsx

  Análisis de capturas:

  - 0319-87-1.png muestra la pantalla de detalle de aprobación con 0 a
    aprobar, 0 a rechazar y 1 pendientes. Eso confirma que no hay decisiones
    locales pendientes; la pantalla está limpia.
  - 0319-87-2.png muestra el modal ¿Salir de esta pantalla? con el texto Use
    Guardar o Cancelar para salir de esta pantalla.. Esto confirma el
    problema reportado: se está bloqueando la salida aun cuando no hay
    cambios.
  - 0319-87-3.png muestra el modal estándar de cambios sin guardar (Tiene
    cambios sin guardar). Esa captura agrega un detalle importante que el
    texto no explicita: ya existe un flujo separado y correcto para cuando
    sí hay cambios, por lo que el fix debe preservar ese comportamiento y
    sólo eliminar el bloqueo en estado limpio.

  ## Root Cause Hypothesis

  - En src/pages/TimesheetApprovalDetail.tsx:86-90, la página calcula
    correctamente hasDecisions, pero llama a usePageLeaveLock({ locked:
    true, isDirty: hasDecisions }). Eso significa que la navegación queda
    bloqueada siempre, incluso cuando hasDecisions === false.
  - En src/hooks/usePageLeaveLock.ts:12-17, el useBlocker depende sólo de
    locked y no de isDirty. Si locked es true, cualquier cambio de ruta
    queda interceptado.
  - En src/components/ui/leave-page-dialog.tsx:29-47, cuando el bloqueo
    ocurre con isDirty === false, el diálogo muestra la variante
    “limpia” (¿Salir de esta pantalla? / Cancelar para salir de esta
    pantalla.). El diálogo no es la causa primaria; sólo expone el estado
    erróneo del lock.
  - La regresión no está bien cubierta por tests. src/pages/__tests__/
    TimesheetApprovalDetail.lock-navigation.test.tsx:14-16 mockea
    usePageLeaveLock, y :45-54 sólo verifica que allowNextNavigation() se
    llama antes de navigate(). No verifica que el lock se active únicamente
    cuando hay decisiones locales.

  ## Proposed Fix

  Hacer el cambio mínimo y local en TimesheetApprovalDetail:

  - Derivar el lock desde hasDecisions en vez de dejarlo permanente.
  - Cambiar la llamada a usePageLeaveLock para que use locked: hasDecisions
    y isDirty: hasDecisions.
  - No tocar usePageLeaveLock ni LeavePageDialog en este bug.

  Rationale:

  - Corrige exactamente el escenario reportado.
  - Preserva el modal de “cambios sin guardar” cuando sí existen decisiones
    locales.
  - Evita alterar el comportamiento global de otras pantallas que hoy usan
    el hook compartido con semántica posiblemente intencional de “focus mode
    bloqueado” aunque no haya cambios.

  ## Files to Change

  - src/pages/TimesheetApprovalDetail.tsx
      - Cambiar la configuración de usePageLeaveLock para que el bloqueo
        dependa de hasDecisions en vez de ser siempre true.
      - Opcionalmente introducir una constante explícita como const
        shouldLockNavigation = hasDecisions; para dejar la intención clara.
  - src/pages/__tests__/TimesheetApprovalDetail.lock-navigation.test.tsx
      - Dejar de mockear el hook como una caja negra fija y capturar los
        argumentos con los que la página lo invoca.
      - Agregar casos que distingan estado limpio vs. estado con decisiones.

  ## Tests to Add or Update

  - src/pages/__tests__/TimesheetApprovalDetail.lock-navigation.test.tsx
      - Caso 1: cuando la página carga con aprobaciones pendientes pero sin
        decisiones locales seleccionadas, usePageLeaveLock debe recibir
        locked: false e isDirty: false.
      - Caso 2: cuando el usuario selecciona una decisión (approve o reject)
        para una línea aprobable, usePageLeaveLock debe recibir locked: true
        e isDirty: true.
      - Caso 3: el diálogo LeavePageDialog debe seguir recibiendo isDirty:
        true cuando existan decisiones locales, para conservar el modal de
        “Tiene cambios sin guardar”.
      - Mantener el test existente que valida que el botón de regreso/cancel
        llama allowNextNavigation() antes de navegar.

  Si el test actual no permite simular fácilmente la selección en la grilla,
  una alternativa aceptable es mockear ApprovalTimesheetGrid con un stub que
  invoque onDecisionChange(...) desde un botón de prueba. Eso mantiene el
  test acotado a la página y evita fragilidad de UI.

  ## Verification Steps

  Comandos:

  - npx vitest run src/pages/__tests__/TimesheetApprovalDetail.lock-
    navigation.test.tsx
  - npx vitest run src/pages/__tests__/TimesheetApprovalDetail.lock-
    navigation.test.tsx src/pages/__tests__/Settings.global-focus-
    cancel.test.tsx

  Reproducción manual:

  1. Abrir una aprobación en /timesheet/approvals/:periodId con al menos una
     línea pendiente.
  2. Confirmar que el resumen superior muestre 0 a aprobar, 0 a rechazar.
  3. Hacer clic en Cancelar.
  4. Verificar que la pantalla salga directamente a /timesheet/approvals sin
     mostrar modal.
  5. Volver a entrar, marcar una línea como Aprobar o Rechazar.
  6. Hacer clic en Cancelar.
  7. Verificar que ahora sí aparezca el modal de Tiene cambios sin guardar.
  8. Verificar que Guardar Decisiones siga funcionando y que, tras guardar
     sin pendientes restantes, navegue normalmente.

  Regression checks:

  - Navegación con browser back desde la pantalla limpia no debe disparar el
    modal redundante.
  - Navegación con decisiones locales pendientes sí debe seguir
    bloqueándose.
  - No debe cambiar el comportamiento de WorksheetNew ni de Settings, ya que
    este fix no toca el hook compartido.

  ## Regression Risks

  - Riesgo bajo en la pantalla de detalle de aprobaciones: el cambio es
    local y sólo modifica cuándo se activa el lock.
  - Riesgo medio si alguien intenta “mejorar” esto cambiando
    usePageLeaveLock globalmente. Ese hook se usa en pantallas como src/
    pages/WorksheetNew.tsx:30 y src/pages/Settings.tsx:148-151; una
    modificación global puede alterar otros flujos de focus mode o
    navegación protegida.
  - Riesgo funcional menor: si existiera algún requerimiento implícito de
    bloquear salida en aprobaciones aun sin cambios, este fix lo removería.
    Las capturas y el ticket, sin embargo, apuntan en sentido contrario.

  ## Out of Scope

  - Rediseñar el copy del modal genérico de salida.
  - Cambiar la semántica global de usePageLeaveLock.
  - Auditar todas las páginas en focus mode para unificar la política de
    navegación limpia vs. dirty.
  - Ajustar estilos, variantes de botón o layout de la vista de
    aprobaciones.

  ## Open Questions

  - El ticket dice “repetir 2 veces la acción de Cancelar”, pero el código y
    la captura sólo prueban con claridad un bloqueo redundante de navegación
    en estado limpio. No queda 100% claro si el usuario lo reproduce
    haciendo clic en el botón Cancelar de la página, con browser back, o con
    otra navegación saliente.
  - CAPTURA trae tres imágenes, no una sola. La tercera parece mostrar un
    caso distinto pero relacionado: el flujo correcto cuando sí hay cambios.
    Asumo que debe preservarse y no corregirse.
  - No está explícito si se desea el mismo comportamiento “salir directo si
    no hay cambios” en otras pantallas que usan usePageLeaveLock. Por el
    constraint de alcance, este plan no lo extiende más allá de Aprobaciones
    de Horas.

  ## Disagreement Targets

  - Cambio local en TimesheetApprovalDetail.tsx vs. cambio global en
    usePageLeaveLock.ts.
      - Prefiero cambio local, porque el hook compartido se usa en otras
        pantallas con semántica distinta y un cambio global expande el
        alcance sin respaldo del ticket.
  - Mantener LeavePageDialog intacto vs. eliminar su rama “clean”.
      - Prefiero no tocar el diálogo; el problema es que la pantalla entra
        al estado bloqueado cuando no debería, no que el diálogo renderice
        mal.
  - Testear argumentos del hook a nivel de página vs. escribir un test
    unitario nuevo del hook.
      - Prefiero test de página, porque la regresión nace de cómo
        TimesheetApprovalDetail configura el hook, no de la implementación
        básica del hook en abstracto.