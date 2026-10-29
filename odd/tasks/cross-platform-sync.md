# LocalPass — Sync multiplataforma y plan de releases

> **Estado**: FASE 0 EN CURSO · **Rama**: `feat/cross-platform-sync`
> **Base**: `4f1e20c` (feat/security-hardening)

## Objetivo

LocalPass sincroniza una única bóveda cifrada entre Windows, Android y Linux (y
macOS de forma opcional posterior) mediante un **registro de cambios por
dispositivo con confirmación explícita** (Guardar / Cargar), sin cuentas, sin
nube, sin retención de datos y con el mismo formato de sobre cifrado 1.0.

## Modelo elegido (decisión registrada)

- **Cada edición es un cambio**, no una escritura directa del vault:
  1. Editar → se crea un *borrador* cifrado local, visible en la sección
     "Cambios" con tipo, hora y dispositivo de origen.
  2. **Guardar** (solo dispositivo de origen) → la entrada se aplica local y
     se publica en el archivo del dispositivo.
  3. **Cargar** (los demás dispositivos) → la entrada se aplica localmente.
- El botón cambia de etiqueta según rol: entrada propia = Guardar, ajena =
  Cargar. Se resuelve con `deviceId` en cada entrada.
- **Un archivo por dispositivo** (`changes-<deviceId>.enc.json`): Syncthing
  nunca ve dos escritores sobre el mismo archivo → sin `.sync-conflict`.
- **`baseRevision` por cuenta**: al cargar, si la base no coincide con la
  revisión actual → conflicto explícito (resolver existente). Sin esto dos
  dispositivos editando la misma cuenta offline se pisan en silencio.
- **`seq` monotónico por dispositivo** para orden/dedup. La hora es sólo
  informativa (los relojes se desfasan).
- **Baseline inicial**: primera vez que se activa sync, el dispositivo escribe
  una entrada con el vault completo; los nuevos dispositivos reconstruyen desde
  ahí. Sin poda del log en esta fase.
- **Borradores**: persisten cifrados localmente; advertencia al cerrar sin
  guardar.
- Transporte: Syncthing aparte (no bundleado), detección + guía. Estado leído
  por loopback (`127.0.0.1`) únicamente.
- Cargar aplica + resume; preview solo si hay conflicto o borrado.
- KDF se mantiene (PBKDF2-SHA512 210k); Argon2id se evalúa después como
  formato 1.2, separado del sync.

## Alcance

- Fase 0: licencia GPL-3.0-or-later, CI, corrección de ROADMAP/SECURITY,
  `docs/SYNC.md`.
- Fase 1: dominio de cambios (`src/lib/sync/`), sin UI.
- Fase 2: `VaultStore` en archivo + borradores + asistente primera ejecución.
- Fase 3: motor de sync + sección "Cambios" + badge navbar + i18n ×5.
- Fase 4: Linux AppImage + `.deb` (CI ubuntu), prueba en 3 distros.
- Fase 5: Android via Capacitor (SAF, `allowBackup=false`, keystore).
- Fase 6: distribución (F-Droid primero; Play Store después) y firma.
- Opcional: macOS (requiere notarización, ~USD 99/año; no en camino crítico).

## Fuera de alcance

- Respuestas/servidores propios, cuentas, recuperación de master password.
- Telemetría, IA remota, cualquier cosa que necesite internet.

## Tareas Fase 0

- [x] T0.1 Crear rama `feat/cross-platform-sync` desde `4f1e20c`.
- [x] T0.2 Crear este documento de tarea + espejo en Engram.
- [ ] T0.3 `LICENSE` GPL-3.0-or-later + campo `license` en `package.json`
      + sección en `README.md`.
- [ ] T0.4 CI: `.github/workflows/ci.yml` (typecheck / tests / build Windows).
- [ ] T0.5 Corregir `docs/ROADMAP.md` (excepción loopback) y ampliar
      `docs/SECURITY.md` (política de sync local).
- [ ] T0.6 `docs/SYNC.md`: topologías (2 dispositivos, 3 con puente en dual
      boot), modelo de cambios, fases, riesgos.
- [ ] T0.7 Verificación: `npm run typecheck`, `npm test`, `npm run build`.
      CI no es ejecutable en local: se valida sintaxis YAML y estructura de
      jobs; el resultado real queda pendiente del primer push.

## Tareas Fase 1 (dominio, sin UI)

- [ ] T1.1 `src/lib/sync/changes.ts`: tipos, validación, seq, creación.
- [ ] T1.2 `src/lib/sync/apply.ts`: aplicar entrada, `baseRevision` vs
      revisión, conflicto → resolver.
- [ ] T1.3 `src/lib/sync/device.ts`: deviceId/nombre persistente.
- [ ] T1.4 Sellado/apertura cifrado del archivo de cambios (reusar primitivas).
- [ ] T1.5 Tests: conflicto, borrado, replay, idempotencia, tampering.
- [ ] T1.6 Portapapeles con auto-limpieza 30s (barato, va aquí).

## Criterios de aceptación Fase 0

1. `LICENSE` presenta GPL-3.0-or-later y `package.json` lo declara.
2. CI verde en los tres jobs al primer push (verificable sólo tras push).
3. ROADMAP ya no excluye sync local; SECURITY documenta superficie añadida.
4. `typecheck` y `npm test` en verde tras los cambios.

## Registro de verificación

- (Vacío — se completa por tarea con el comando y su resultado observado.)

## Próximo paso

T0.3: licencia, campo en package.json y README.

---
**Actualizado**: 2026-10-28
