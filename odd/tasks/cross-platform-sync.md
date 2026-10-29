# LocalPass — Sync multiplataforma y plan de releases

> **Estado**: FASE 2 COMPLETA (salvo prueba manual) · **Rama**: `feat/cross-platform-sync`
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
- [x] T0.3 `LICENSE` GPL-3.0-or-later + campo `license` en `package.json`
      + sección en `README.md`. — `ae756ad`
- [x] T0.4 CI: `.github/workflows/ci.yml` (typecheck / tests / build Windows).
      — `b14ef61`
- [x] T0.5 Corregir `docs/ROADMAP.md` (excepción loopback) y ampliar
      `docs/SECURITY.md` (política de sync local). — `d4a8dc0`
- [x] T0.6 `docs/SYNC.md`: topologías (2 dispositivos, 3 con puente en dual
      boot), modelo de cambios, fases, riesgos. — `c9201c7`
- [x] T0.7 Verificación: `npm run typecheck`, `npm test`, `npm run build`.
      CI no es ejecutable en local: se valida sintaxis YAML y estructura de
      jobs; el resultado real queda pendiente del primer push.

## Tareas Fase 1 (dominio, sin UI)

- [x] T1.1 `src/lib/sync/changes.ts`: tipos, validación, seq, creación.
      — `5177316`
- [x] T1.2 `src/lib/sync/apply.ts`: aplicar entrada, `baseRevision` vs
      revisión, conflicto → resolver. — `64a82b0`
- [x] T1.3 `src/lib/sync/device.ts`: deviceId/nombre persistente. — `1af0c63`
- [x] T1.4 Sellado/apertura cifrado del archivo de cambios (reusar primitivas).
      — `485013f`
- [x] T1.5 Tests: conflicto, borrado, replay, idempotencia, tampering.
      — repartidos en los cuatro commits anteriores.
- [ ] T1.6 Portapapeles con auto-limpieza 30s (barato, va aquí).
      **Diferido a T2.6**: el renderer sólo tiene `clipboard-write`, así que no
      puede leer lo que copió para restaurarlo ni comprobar si sigue ahí. Hace
      falta IPC en el proceso principal, que llega en la Fase 2. No se puede
      implementar dentro de la Fase 1 sin abrir esa superficie antes de tiempo.

## Tareas Fase 2 (VaultStore de archivo + borradores + primera ejecución)

Hoy la bóveda vivía en `localStorage` del renderer. Eso funciona en Windows,
pero no es un archivo que el usuario pueda respaldar, no sobrevive a un borrado
de datos del WebView en Android y crece dentro del perfil de Chromium. La Fase 2
la mueve a disco sin cambiar el formato 1.0.

- [x] T2.1 `electron/preload.js` + IPC mínimo en `electron/main.js`:
      `contextBridge` con `vault.read/write`, `sync.readLog/writeLog/listLogs`,
      `clipboard.copyTemp`, `app.info`. El renderer nunca envía rutas: el
      proceso principal las deriva de `app.getPath('userData')` y de la carpeta
      de sync elegida. — `bc5e992`
- [x] T2.2 `src/lib/vault-store.ts`: interfaz `VaultStore` (`read`, `write`,
      `remove`) con dos implementaciones: archivo (IPC) y `localStorage`
      (fallback web/dev). Migración única `localStorage` → archivo, sin borrar
      el original hasta confirmar escritura. — `dcb4a78`
- [x] T2.3 Escritura atómica en el proceso principal: temporal en el mismo
      directorio + `fsync` + `rename`, permisos `0600` donde el SO los soporte.
      — `e850d53`
- [x] T2.6 Portapapeles con autolimpieza 30s vía IPC (cierra T1.6).
      — `85ec740`
- [ ] T2.4 Borradores cifrados → **movido a T3.4**.
- [ ] T2.5 Asistente de primera ejecución → **movido a T3.5**.

### Reordenamiento Fase 2 → Fase 3

T2.4 y T2.5 no se pueden cerrar antes del motor de sync sin dejar la app a
medias:

- Un borrador sin la sección "Cambios" no tiene dónde verse, guardarse ni
  descartarse. Construir el almacén ahora obliga a rediseñarlo cuando exista la
  lista.
- El baseline de activación lo mantiene el motor: crearlo en la Fase 2 deja un
  archivo que queda obsoleto con la primera edición, y un dispositivo nuevo
  reconstruiría desde un estado falso.
- El nombre de dispositivo sí quedó resuelto: se sugiere en la primera
  ejecución (`suggestDeviceName`) y renombrarlo vive en la sección de sync,
  donde el nombre se usa de verdad.

## Tareas Fase 3 (motor de sync + sección "Cambios")

- [ ] T3.1 `src/lib/sync/engine.ts`: crear el cambio a partir de una edición,
      sellar y escribir el log local, mantener el baseline al activar y leer
      los logs de los pares.
- [ ] T3.2 `src/lib/sync/sync-store.ts`: acceso del renderer a `sync.*` del
      puente (carpeta, listar, leer, escribir) con errores tipados.
- [ ] T3.3 Sección "Cambios": tipo, hora y dispositivo de origen; botón
      Guardar (propio) / Cargar (ajeno); badge en la navbar.
- [ ] T3.4 Borradores cifrados (desde T2.4): editar crea un borrador, Guardar lo
      aplica y lo publica; advertencia al cerrar y recuperación al desbloquear.
- [ ] T3.5 Asistente de sync (desde T2.5): nombre de dispositivo editable,
      elección de carpeta y baseline inicial.
- [ ] T3.6 i18n ×5 de todas las cadenas nuevas.
- [ ] T3.7 `applyConflictResolution` debe subir `revision` al aplicar la versión
      elegida. Sin eso, el siguiente cambio remoto vuelve a chocar contra una
      revisión que ya cambió de contenido.

## Criterios de aceptación Fase 0

1. `LICENSE` presenta GPL-3.0-or-later y `package.json` lo declara.
2. CI verde en los tres jobs al primer push (verificable sólo tras push).
3. ROADMAP ya no excluye sync local; SECURITY documenta superficie añadida.
4. `typecheck` y `npm test` en verde tras los cambios.

## Registro de verificación

- `LICENSE`: 35.149 bytes, ASCII puro, sin BOM. Origen: `COPYING` de GNU
  coreutils, copia canónica de la FSF. Se descartó el texto de SPDX: usa
  comillas tipográficas y `©`, no el formato canónico. `gnu.org` no responde
  desde esta red (reset en 80 y 443 tras completar TCP); la elección se validó
  contra dos copias GNU independientes (coreutils y GCC), que sólo difieren en
  `https://fsf.org/` vs `http://fsf.org/`.
- `package.json`: parsea correctamente y declara `"license": "GPL-3.0-or-later"`.
- `.github/workflows/ci.yml`: parseado con `js-yaml`; jobs detectados:
  `verify`, `build-windows`.
- `npm run typecheck`: sin errores.
- `npm test`: 85 tests, 85 pass, 0 fail.
- `npm run build`: completo. Artefactos: `LocalPass-Setup-1.1.0.exe` (116,3 MB)
  y `LocalPass-1.1.0-portable.exe` (105,6 MB).
- CI real: **no verificado**. Requiere push a `origin`; no se hizo push.

### Fase 1

- `npm run typecheck`: sin errores.
- `npm test`: 138 tests, 138 pass, 0 fail (85 previos + 53 nuevos).
- Cobertura nueva: `sync-changes` (18), `sync-apply` (14), `sync-seal` (9),
  `sync-device` (12).
- Idempotencia comprobada: aplicar dos veces el mismo log no duplica cuentas ni
  conflictos; el cursor por dispositivo corta el replay.
- Conflicto comprobado: `baseRevision` desfasada deja la versión local intacta y
  registra `conflict:<changeId>` con la versión remota.
- Borrado comprobado: un `update` sobre una cuenta borrada localmente se
  descarta (`missing_account`); un `delete` sin cuenta es no-op.
- Manipulación comprobada: ciphertext o IV alterados fallan como
  `sync_authentication_failed`; contenido autenticado con versión desconocida
  falla como `sync_unsupported_version` y nunca se interpreta.
- El sobre sellado no contiene el sitio ni la contraseña en claro.

### Fase 2

- `npm run typecheck`: sin errores.
- `npm test`: 173 tests, 173 pass, 0 fail.
- Cobertura nueva: `electron-storage` (16), `vault-store` (13) y
  `clipboard` (6). Total 35 pruebas nuevas.
- Escritura atómica: el test comprueba que no queda ningún `.tmp` y que una
  segunda escritura reemplaza el contenido anterior.
- Recorrido de rutas: `syncLogPath` rechaza `../../etc/passwd`, `a/b`, cadena
  vacía y un id de 65 caracteres. `listChangeLogs` ignora cualquier archivo que
  no sea `changes-<id>.enc.json`.
- Migración: un vault viejo en `localStorage` se copia al archivo una sola vez,
  nunca pisa un archivo existente y se reintenta si la escritura falla.
- `node --check` sobre `electron/main.js`, `electron/preload.js` y
  `electron/storage.js`: sin errores de sintaxis.
- `npm run build:next`: compila. Sigue siendo export estático.
- **No verificado**: la app Electron no se abrió. Los canales IPC, el diálogo de
  carpeta y el borrado del portapapeles están probados en su lógica y en su
  contrato, no en una ventana real. Falta una prueba manual de extremo a extremo
  (abrir, crear bóveda, cerrar, reabrir) antes de dar la Fase 2 por cerrada en
  producción.

## Próximo paso

Fase 3, T3.1: motor de sync. Es la pieza que convierte una edición en un cambio
firmado por `seq`, lo publica en `changes-<deviceId>.enc.json` y aplica los
cambios de los pares con `baseRevision` como única regla.

---
**Actualizado**: 2026-10-28
