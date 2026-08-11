# G8 — §4 Escenarios de autenticación (live, contra "Test")

> Fuente: `plan_v2.md` §G8/§4. No depende del flag del Scheduler — se puede correr con
> `VITE_SCHEDULER_ENABLED` en cualquier valor. Foco: la sesión de esta misma Fase 7
> (`sessionRecovery.ts`, `SessionCacheGuard.tsx`, `useAuth.tsx` rearm) funciona igual contra un
> backend real que contra los mocks de los tests unitarios.

- [ ] Login correcto.
- [ ] Password incorrecta.
- [ ] Cuenta bloqueada (lockout tras N intentos).
- [ ] Cuenta desbloqueada.
- [ ] Sesión expirada (esperar/forzar expiración) → debe ver el toast
      `auth.sessionExpiredRevoked` y volver a la pantalla de login, sin loop.
- [ ] Refresh token inválido (revocar la sesión desde otro lugar, ej. el dashboard de
      Supabase → "Revoke session") → mismo comportamiento que el ítem anterior.
- [ ] Logout.
- [ ] **Login con otro usuario en la misma sesión SPA** (sin recargar la pestaña) → el
      `SessionCacheGuard` debe limpiar el cache de React Query del usuario anterior.
- [ ] Recuperación de contraseña exitosa.
- [ ] Recuperación de contraseña fallida (email inexistente, o servidor de auth caído) → **no**
      debe cerrar la sesión actual si había una.
- [ ] Error 401 de sesión (ej. token vencido a mitad de una acción) → un solo `signOut` + un solo
      toast, no un loop de reintentos.
- [ ] Error 403 de permisos (acción sin el rol necesario) → mensaje de "sin permiso", **no**
      dispara el flujo de sesión revocada (403 ≠ 401).
- [ ] **Varios 401 simultáneos del Scheduler** (ej. varias queries en `/scheduler` a la vez con
      sesión vencida) → un solo `signOut` y un solo toast, no uno por request.
- [ ] Request de la cuenta vieja completando después del login de la nueva (condición de carrera)
      → **no** cierra la sesión nueva (el guard de epoch de `sessionRecovery.ts` debe descartar la
      respuesta tardía).
- [ ] Acceso directo a una ruta del Scheduler sin sesión → redirige a login, no queda colgado.
- [ ] Acceso directo sin el permiso necesario → pantalla de "access denied", no crash.
- [ ] **Caché aislada después de cambiar de usuario** → datos del usuario A no se filtran a la
      vista del usuario B tras el cambio.

## Resultado

(pendiente de completar)
