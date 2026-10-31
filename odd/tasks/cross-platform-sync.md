# LocalPass — Sync multiplataforma y plan de releases

> **Estado**: FASE 4 EN CURSO (T4.4 Linux real y CI bloqueado por facturación) · **Rama**: `feat/cross-platform-sync`
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

- [x] T3.1 `src/lib/sync/engine.ts`: crear el cambio a partir de una edición,
      sellar y escribir el log local, mantener el baseline al activar y leer
      los logs de los pares. — `a08f464`
- [x] T3.2 `src/lib/sync/sync-store.ts`: acceso del renderer a `sync.*` del
      puente (carpeta, listar, leer, escribir) con errores tipados. — `204cdbb`
- [x] T3.3 Sección "Cambios": tipo, hora y dispositivo de origen; botón
      Guardar (propio) / Cargar (ajeno); badge en la navbar. — `feat(sync)`
- [x] T3.4 Borradores cifrados (desde T2.4): editar crea un borrador, Guardar lo
      aplica y lo publica; advertencia al cerrar y recuperación al desbloquear. — `feat(sync)`
- [x] T3.5 Asistente de sync (desde T2.5): nombre de dispositivo editable,
      elección de carpeta y baseline inicial. — `feat(sync)`
- [x] T3.6 i18n ×5 de todas las cadenas nuevas. — `feat(sync)`
- [x] T3.7 `applyConflictResolution` debe subir `revision` al aplicar la versión
      elegida. Sin eso, el siguiente cambio remoto vuelve a chocar contra una
      revisión que ya cambió de contenido. — `52984f2`
- [x] T3.8 Replicación en cadena: al cargar un log ajeno, las entradas
      aplicadas se re-publican en el log propio con `seq` nuevo y conservan
      `originDeviceId`/`originSeq`. El origen no se reaplica y un peer que ya
      vio el original lo salta. — `relayAppliedChanges`, `applyChangeLog`.
- [x] T3.9 Preview antes de cargar cuando el lote tiene borrados o conflictos,
      con detalle por cuenta, y resumen por tipo (nuevas, modificadas,
      eliminadas, conflictos) en el toast. — `previewPeerChanges`.
- [x] T3.10 Baseline de relay: si el baseline propio está vacío y el vault ya
      tiene cuentas, se regenera para que un peer nuevo pueda reconstruir el
      estado completo. — `ensureRelayBaseline`.
- [ ] T3.11 Prueba manual de dos perfiles en una ventana Electron (ciclo
      Guardar → Cargar → verificar). Los tests cubren el dominio y la cadena de
      tres dispositivos, pero no la interacción real con el diálogo ni el
      portapapeles.

## Fase 3.5 — Correcciones de confiabilidad del sync

Auditoría del árbol de trabajo. Tres defectos bloquean la promesa "todo cambio
confirmado llega a los demás dispositivos". Se corrigen en este orden, con la
publicación local primero y la remota después.

- [x] T3.12 **Estado real de activación.** `isSyncEnabled` usaba
      `folder && vault.sync.deviceName`, pero `deviceName` se escribe siempre al
      crear la bóveda. Al elegir carpeta la UI decía "Activa" y ocultaba
      "Activar sync", así que `enableSync()` (el que crea el baseline) nunca se
      ejecutaba. Pasa a depender de `ownLog?.baseline`. `commitDrafts` sólo
      publica cuando hay baseline; sin él, el commit es estrictamente local.
      Criterio: elegir carpeta muestra "Solo local" + botón "Activar sync";
      activar crea el baseline y recién entonces el badge pasa a "Activa".
      — `b698773`

- [x] T3.13 **Publicación idempotente de borradores.** `commitDrafts` escribía
      el log antes de guardar la bóveda. Si el guardado fallaba, el cambio ya
      estaba publicado y el reintento lo volvía a stagear con `changeId` y `seq`
      nuevos. El `changeId` se deriva del `draftId` (estable) y `commitDraft`
      reaplica la entrada existente en lugar de duplicarla.
      Criterio: log escrito + fallo de bóveda + reintento = una sola entrada y
      el borrador desaparece. — `4c9abae`, `b698773`

- [x] T3.14 **Publicar las mutaciones que no pasan por borradores.** La
      importación CSV, la remediación de auditoría y la resolución de conflictos
      escribían la bóveda sin entrada en el log, así que nunca llegaban a los
      pares. Se añade `publishAccountChanges` al proveedor de sync y se llama
      después de guardar localmente. Requisitos del modelo: `revision` sube
      exactamente 1 por edición y las cuentas nuevas nacen en `revision: 1`;
      `applyPasswordRemediation` y `applyConflictResolution` se ajustan a esa
      regla y `toAccountEntries` deja de omitir `revision`.
      Criterio: un cambio de contraseña desde auditoría, una cuenta nueva por
      CSV y un conflicto resuelto aparecen en el log propio y un peer los
      carga. Si la escritura del log falla, la bóveda local queda guardada y se
      avisa que no se publicó. — `688787d`

- [x] T3.15 **Límites documentados.** La importación de una bóveda completa
      (`importVault`) sigue siendo una migración local: sus revisiones vienen
      de otro dispositivo y no se publican como cambios. `docs/SYNC.md` lo dice
      explícitamente para que no se confunda con una edición normal.
      — `688787d`

## Tareas Fase 4 (empaquetado Linux)

El empaquetado de Windows ya existe (`nsis` + `portable`). Falta Linux, con la
misma app y el mismo formato de bóveda: no hay ramas de código por plataforma,
sólo configuración de empaquetado y una ruta de datos distinta que Electron ya
resuelve (`~/.config/localpass`).

- [x] T4.1 **Objetivos de build Linux** en `package.json`: `build.linux` con
      `AppImage` y `deb` (x64), `category`, `synopsis`, `maintainer` y el ícono
      de 1024×1024 que ya existe. Scripts `build:linux` y `build:electron:linux`
      sin tocar los de Windows. Criterio: `electron-builder --linux dir` genera
      `dist/linux-unpacked` con el binario y el `resources/app.asar` completo.
      — `f51a4fe`. Verificado en Windows: `dist/linux-unpacked/localpass`,
      `resources/app.asar` y `app.asar.unpacked/out/index.html` presentes.

- [x] T4.2 **Job de CI Linux** en `.github/workflows/ci.yml`: `ubuntu-latest`,
      `needs: verify`, `npm ci` + `npm run build:linux`, y subida de
      `dist/*.AppImage` y `dist/*.deb` como artefactos. Criterio: YAML válido y
      job dependiente de `verify`; la ejecución real queda pendiente del
      desbloqueo de facturación (ver T4.5). — `f51a4fe`

- [x] T4.3 **Documentación**: `README.md` con la sección de instalación Linux,
      `docs/ROADMAP.md` marcando el empaquetado como configurado y
      `docs/CHANGELOG.md` con la entrada correspondiente. — `f51a4fe`

- [ ] T4.4 **Verificación en Linux real** (en la máquina Linux del usuario):
      `npm ci && npm run build:linux`, instalar el `.deb` y ejecutar el
      AppImage. Criterio: la bóveda se crea en `~/.config/localpass/vault.enc.json`
      con permisos `0600`, se puede crear/editar una cuenta y el ciclo
      Guardar/Cargar funciona contra otra instancia.
      Distros: Ubuntu 24.04, Debian 12 y Fedora. Ubuntu 24.04 primero porque la
      restricción de *user namespaces* de AppArmor es el punto donde los
      AppImage de Electron suelen romper; si falla ahí, el `.deb` necesita un
      perfil AppArmor y el AppImage una nota en la documentación. En la misma
      pasada, confirmar que `apt install ./LocalPass-<version>-x64.deb` resuelve
      las dependencias en Ubuntu 24.04 (`libgtk-3-0` pasó a `libgtk-3-0t64` con
      la transición t64) y en Debian 12.

- [ ] T4.5 **Bloqueo externo registrado**: GitHub Actions rechaza los runs con
      *"The job was not started because your account is locked due to a billing
      issue"*. Ningún job de CI se ejecutó nunca; el único run existente
      (`f65aac4`) falla sin pasos. Se destraba desde la configuración de
      facturación de la cuenta; hasta entonces todo el CI es configuración no
      verificada.

## Tareas Fase 5 (Android)

Prioridad fijada por el usuario el 2026-10-30: **Windows + Android primero,
Linux al final**. T4.4 queda en espera y el orden de las fases 5 y 6 no cambia.

El objetivo no es una app Android distinta: es el mismo renderer, el mismo
formato de bóveda `1.0` y el mismo contrato `LocalPassBridge`. En Android no hay
preload de Electron, así que el puente lo construye un plugin nativo y la
carpeta de sync la elige el usuario con el Storage Access Framework, porque es
la única forma portátil de compartir un directorio con otra app (Syncthing) sin
pedir permiso de almacenamiento amplio.

- [x] T5.1 **Shell Capacitor**: `@capacitor/core|android|filesystem|preferences|clipboard|app`
      y `@capacitor/cli`, `capacitor.config.ts` con `appId com.localpass.app` y
      `webDir out`, `npx cap add android`. Criterio: `android/` con
      `build.gradle`, `settings.gradle`, `gradlew` y `AndroidManifest.xml`
      válidos; minSdk 24, compileSdk 36. Verificado: proyecto generado con esas
      versiones.

- [x] T5.2 **Plugin nativo `LocalPassStorage`**
      (`android/app/src/main/java/com/localpass/app/LocalPassStoragePlugin.java`):
      bóveda y `settings.json` en el directorio privado de la app con escritura
      atómica (temporal + `fsync` + rename) y permisos `0600`; carpeta de sync
      vía SAF con `takePersistableUriPermission`; `syncList`/`syncRead`/
      `syncWrite`/`syncRemove` con el patrón `changes-<deviceId>.enc.json` y el
      mismo tope de 5 MB que `electron/storage.js`; `clipboardCopyTemp` con TTL
      acotado a 5–120 s. Criterio: cada método de `LocalPassBridge` tiene su
      contraparte y la validación de payload replica la del escritorio
      (JSON objeto, `deviceId` con `^[A-Za-z0-9_-]{1,64}$`). Registrado en
      `MainActivity` antes de `super.onCreate`.

- [x] T5.3 **Puente del renderer**: `src/lib/capacitor-bridge.ts` adapta el
      plugin a `LocalPassBridge` (incluido el caso "el usuario cancela el
      selector" → devuelve la carpeta anterior, igual que el diálogo de
      Electron) y `src/lib/capacitor-boot.ts` instala `window.localpass` sólo
      cuando `Capacitor.isNativePlatform()`, sin pisar un puente existente.
      Importado como primer efecto en `src/app/page.tsx`. Criterio:
      `vault-store` y `sync-store` no cambian una línea y siguen eligiendo
      archivo cuando hay puente.

- [x] T5.4 **Endurecimiento del backup**: `android:allowBackup="false"`,
      `fullBackupContent="false"`, `dataExtractionRules` con todos los dominios
      excluidos (el *device transfer* de Android 12+ ignora `allowBackup`) y
      `usesCleartextTraffic="false"`. Criterio: ninguna copia automática puede
      sacar la bóveda del dispositivo sin que el usuario lo pida. Sin permiso
      `INTERNET`: Capacitor sirve el bundle con `WebViewLocalServer`
      (`https://localhost` interceptado en proceso), así que el SO impide abrir
      sockets en vez de confiar en que el código no lo haga.

- [x] T5.5 **Compilar el APK debug**. Toolchain portable en `%TEMP%\lp-android`
      (JDK 21 Temurin + cmdline-tools + platform-36 + build-tools 36) porque la
      máquina no tiene JDK ni Android Studio. Criterio: `gradlew assembleDebug`
      termina sin errores y produce `android/app/build/outputs/apk/debug/`.
      Verificado: `app-debug.apk` de 4.5 MB, `versionName 1.1.0`, minSdk 24,
      targetSdk 36 y `LocalPassStoragePlugin` presente en el dex.

- [ ] T5.6 **Prueba en dispositivo real**: instalar el APK, crear la bóveda,
      cerrar y reabrir la app (la bóveda debe seguir), elegir una carpeta SAF
      observada por Syncthing, activar sync, **Guardar** en Android, **Cargar**
      en Windows y el camino inverso. Criterio: el ciclo funciona en los dos
      sentidos y la bóveda sobrevive a un reinicio de la app y del teléfono.

- [ ] T5.7 **Documentación Android**: sección de instalación en `README.md`
      (requisitos, SAF + Syncthing, por qué no hay backup automático),
      `docs/SYNC.md` con la diferencia entre ruta de archivo (escritorio) y
      content URI (Android), y entrada en `docs/CHANGELOG.md`. Criterio: un
      usuario puede configurar el sync Android ↔ Windows sin leer el código.

- [ ] T5.8 **CI Android** (evaluar): job que compile el APK debug en cada push
      con `ubuntu-latest` + `android-actions/setup-android`. Criterio: job verde
      o decisión registrada de no añadirlo (el APK de release y la firma son
      Fase 6).

- [ ] T5.9 **Iconos y splash propios**: reemplazar los recursos por defecto de
      Capacitor (`mipmap-*`, `drawable/splash.png`) por el ícono de
      `build/icon.png`, en todas las densidades y con *adaptive icon* en
      `mipmap-anydpi-v26`. Criterio: el lanzador muestra el ícono de LocalPass,
      no el de Capacitor, y el splash mantiene el fondo del tema.

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

### Fase 3

- `npm run typecheck`: sin errores.
- `npm test`: 218 tests, 218 pass, 0 fail.
- Cobertura nueva: `sync-engine` (18), `sync-store` (12) y `sync-relay` (7).
- Motor: crear/actualizar/borrar aplican al vault local y dejan la entrada con
  el `seq` siguiente. Un borrador viejo (base que ya no coincide) se rechaza
  con `sync_invalid_change` en lugar de escribir una versión que el usuario no
  eligió.
- Dos pares editando la misma cuenta con la misma base: el primero aplica y el
  segundo queda como conflicto. El orden es determinista (deviceId).
- Repetir la carga no reaplica nada: el cursor por dispositivo lo corta.
- Baseline: `adoptBaseline` sólo actúa sobre un vault vacío y sin cursores,
  arranca el cursor en `baseline.seq` y nunca toca un dispositivo existente.
- Almacén: el archivo que se escribe no contiene ni el sitio ni la contraseña;
  cada escritura usa sal e IV nuevos; una contraseña equivocada da
  `sync_authentication_failed` y un archivo que no es sobre da `sync_corrupted`.
- Cadena de tres dispositivos: Windows crea, Android carga y replica, Linux
  carga desde Android. El cambio llega una sola vez y conserva el autor
  original. Windows ignora su propio cambio cuando vuelve por Android y Linux
  no lo duplica si después lee el archivo de Windows directamente.
- Preview: un lote con borrados o conflictos no se aplica hasta confirmar; el
  resumen separa nuevas, modificadas, eliminadas y conflictos.
- **No verificado**: la UI no se probó todavía en una ventana Electron real.
  Queda T3.11: dos perfiles, Guardar/Cargar y verificación del diálogo.

### Fase 3.5

- `npm run typecheck`: sin errores.
- `npm test`: 233 tests, 233 pass, 0 fail (226 previos + 7 nuevos).
- Idempotencia: escribir el log y fallar el guardado de la bóveda, reintentar
  el mismo borrador deja una sola entrada, con el `changeId` derivado del
  `draftId`, y el borrador desaparece.
- Publicación: un update con salto de revisión (+2) o sin campos cambiados se
  rechaza antes de tocar el log. La resolución de conflicto que conserva la
  versión local publica una entrada sólo de revisión (`allowEmptyDiff`) para
  que los pares converjan.
- Activación: `isSyncEnabled` depende del baseline del log propio; elegir
  carpeta deja el estado en "Solo local" hasta pulsar **Activar sync**.
- Import CSV: las cuentas nuevas nacen con `revision: 1` y la importación
  devuelve los cambios aplicados; los conflictos no se publican.
- **No verificado**: la UI en una ventana Electron real. T3.11 sigue pendiente.

### Fase 4

- `npm run typecheck`: sin errores.
- `npm test`: 233 tests, 233 pass, 0 fail.
- `electron-builder --linux dir` sobre Windows: genera `dist/linux-unpacked` con
  `localpass`, `resources/app.asar` y el export estático en
  `app.asar.unpacked/out/`. Valida la configuración y el árbol de archivos, no
  el empaquetado final: AppImage y `.deb` requieren Linux.
- `.github/workflows/ci.yml` parsea como YAML válido y el job `build-linux`
  depende de `verify`.
- **CI ejecutado** (destrabada la facturación): `verify` verde en Ubuntu con
  Node 22; `build-windows` y `build-linux` fallaban en el paso de empaquetado.
  Causa real, leída de la anotación del run `41167181605`:
  `GitHub Personal Access Token is not set, neither programmatically, nor using
  env "GH_TOKEN"`. electron-builder 26 intenta **publicar** cuando detecta un
  entorno de CI, y sin token aborta antes de terminar el empaquetado. En local
  nunca se reprodujo porque no hay entorno CI. Corregido con `--publish never`
  en `build:electron` y `build:electron:linux`: el proyecto no publica desde el
  build, y el flag lo hace explícito en vez de depender del entorno.
- Se descartaron por reproducción local: clon limpio + `npm ci` + `npm run
  build`, `next build` con Node v22.23.4, `next build` con `CI=true` y
  electron-builder con caché vacío (descarga NSIS y genera los dos
  instaladores). Ninguna de esas era la causa.
- **No verificado**: artefactos `.AppImage`/`.deb`, instalación y ejecución en
  Linux. Queda T4.4 en la máquina Linux del usuario.

### Fase 5

- `npm run typecheck`: sin errores con `capacitor-bridge.ts`, `capacitor-boot.ts`
  y el import de efecto en `src/app/page.tsx`.
- `npm test`: 233 tests, 233 pass, 0 fail (el renderer no cambia de
  comportamiento sin plataforma nativa).
- `android/` generado por `npx cap add android`: minSdk 24, compileSdk 36,
  targetSdk 36, Java 21.
- **APK compilado**: `gradlew assembleDebug` (Gradle 8.14.3, AGP 8.13.0, JDK 21)
  genera `android/app/build/outputs/apk/debug/app-debug.apk` (4.5 MB). Del
  paquete, no del fuente: `com.localpass.app`, `versionName 1.1.0`, minSdk 24,
  targetSdk 36, `allowBackup=false`, `fullBackupContent=false`,
  `usesCleartextTraffic=false`, `dataExtractionRules` presente, **sin permiso
  `INTERNET`** y `LocalPassStoragePlugin` en el dex.
- **No verificado**: la prueba en dispositivo (T5.6) y el ciclo Guardar/Cargar
  Android ↔ Windows.

## Próximo paso

Compilar el APK debug con el toolchain portable (T5.5), corregir los errores de
compilación Java y después probar en el teléfono (T5.6). En paralelo, conseguir
el log del job **Windows build** del run `41007216989` para cerrar el fallo de
electron-builder: `verify` ya pasa en Ubuntu, así que el código está sano y el
problema está en el entorno del runner. T4.4 (Linux real) queda al final, por
decisión del usuario.

---
**Actualizado**: 2026-10-30
