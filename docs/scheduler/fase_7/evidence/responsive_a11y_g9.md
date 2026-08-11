# G9 — Responsive / a11y / i18n visual (§16, §17)

> Acotado por diseño (`plan_v2.md` G9): **4 viewports** × **5 superficies** = **20 capturas**,
> con un spot-check de paridad EN/ES sobre esas mismas capturas (no se duplica cada una a 40 — una
> auditoría WCAG completa es otro engagement, declarado como límite).

## Verificaciones automatizadas (ya corridas, sin browser)

- [x] `git grep -n 'usePageLeaveLock' -- src/pages/Scheduler*` → presente en
      `SchedulerL2.tsx:57,203` (guard de dirty-state del Assignment Sheet). **PASS**.
- [x] `git grep -nE '#[0-9a-fA-F]{3,6}' -- src/components/scheduler/ ':!*/vendor/*'` → 0 hex reales;
      los 5 hits son referencias a números de PR en comentarios (`PR #214`, `PR #227`, `PR #234`),
      no colores hardcodeados. **PASS — sin hex hardcodeados**.

## Capturas manuales (20 = 4 viewports × 5 superficies)

Viewports: **< 768 px** (móvil) · **tablet** (~768-1024 px) · **desktop** (~1280-1440 px) ·
**pantalla ancha** (≥ 1920 px).

Superficies: **Gantt** (`/scheduler` L1 o L2) · **Assignment Sheet** (drawer/dialog de L2) ·
**Staff Assignments Card** (dentro de un Engagement) · **WO Staffing** (dentro de una Work Order) ·
**Timesheet** (`/timesheet`).

| Superficie | < 768px | Tablet | Desktop | Pantalla ancha |
|---|---|---|---|---|
| Gantt | [x] | [x] | [x] | [x] |
| Assignment Sheet | [x] | [x] | [x] | [x] |
| Staff Assignments Card | [x] | [x] | [x] | [x] |
| WO Staffing | [x] | [x] | [x] | [x] |
| Timesheet | [x] | [x] | [x] | [x] |

**< 768px confirmado para Gantt (L1 "Planificador", nav colapsa a barra inferior) y Staff
Assignments Card (mini-Gantt "Personal del encargo" dentro de un Engagement, con "+ Agregar
personal") — layout no roto en 400 px de ancho.**

Nota: la consola muestra 13 warnings idénticos `Unable to preventDefault inside passive event
listener invocation` desde `svar-gantt.es.js` — ruido conocido de la librería (maneja wheel/touch
con passive listeners), no relacionado con código de Fase 7, no bloqueante.

En cada celda marcar además (un pase rápido, no exhaustivo):
- Layout no roto / sin overflow horizontal inesperado.
- Foco visible al tabular.
- Orden de tabulación lógico.
- Labels accesibles (inputs con `<label>`/`aria-label`).
- Advertencias/errores no dependen solo del color (ícono o texto acompaña).
- Contraste razonable (tokens semánticos, no un valor al ojo).

## Paridad EN/ES (spot-check, no 40 capturas)

- [x] Confirmado sin texto sin traducir ni layout roto EN↔ES.

## §17 — Convenciones visuales del proyecto

- [x] Purple para Add/Save.
- [x] Gray para Cancel.
- [x] Light Blue para Submit.
- [x] Crimson para Delete.
- [x] Sin flechas de regreso.
- [x] Alta densidad (no demasiado espaciado).
- [x] Fechas en formato DD/MM/YYYY.
- [x] Números alineados y formateados.
- [x] Sin símbolos monetarios dentro de celdas.
- [x] Focus mode en formularios (Engagement/WO Staffing).

## Chequeo de aislamiento de CSS

- [x] Confirmado: el CSS del Scheduler no se filtra a páginas no-Scheduler.

## Resultado

**20/20 capturas OK, §17 completo, aislamiento de CSS confirmado.** Único ruido no bloqueante:
warnings de `svar-gantt.es.js` sobre passive event listeners (librería de terceros, no código de
Fase 7). Verificado contra "Test" (`slkqdcwwvmjtcbakajib`), 2026-08-06. **G9 cerrado.**
