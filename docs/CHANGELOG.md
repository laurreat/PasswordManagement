# LocalPass — Changelog

Todos los cambios significativos de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

---

## [Unreleased]

### Agregado

- **Empaquetado Linux (configuración)**: objetivos AppImage y `.deb` (x64) con
  electron-builder, ícono de 1024×1024, entrada de escritorio y dependencias del
  paquete. El build real se ejecuta en Linux; todavía no se generaron artefactos.
- Script `npm run build:linux`, que encadena export estático, copia del ícono y
  `electron-builder --linux`.
- **Historial de cambios por cuenta**: cada creación, edición, borrado,
  importación y conflicto resuelto deja una entrada cifrada dentro del vault,
  con valores antes/después, tipo, hora y dispositivo de origen.
- **Ventana visible de 3 días**: las entradas más antiguas no se eliminan; se
  ocultan por defecto y se pueden revelar manualmente desde la pestaña
  **Historial** de la sección Cambios.
- `src/lib/change-history.ts`: dominio puro para crear, deduplicar y separar el
  historial por antigüedad.
- `tests/change-history.test.ts`: cobertura de la retención, el límite de tres
  días, la deduplicación y los cambios replicados.
- **App Android**: el mismo renderer, el mismo formato de bóveda `1.0` y el
  mismo contrato `LocalPassBridge`, envueltos con Capacitor. La bóveda vive en
  el directorio privado de la app; la carpeta de sync se elige con el selector
  del sistema (Storage Access Framework) y el permiso sobrevive a los
  reinicios. Sin permiso `INTERNET`: el bundle se sirve con
  `WebViewLocalServer` y el sistema operativo impide abrir sockets. Copias de
  seguridad y transferencia entre dispositivos deshabilitadas.
- Scripts `android:sync`, `android:copy` y `android:open`.
- **Ícono y splash propios** en todas las densidades, con *adaptive icon* en
  Android 8+, generados desde `public/icon.svg` con `@capacitor/assets`.

### Corregido

- **Empaquetado en CI**: electron-builder intenta publicar cuando detecta un
  entorno de CI y abortaba sin `GH_TOKEN`. `--publish never` en
  `build:electron` y `build:electron:linux` hace explícito que el proyecto no
  publica desde el build.
- **Guardar todos**: los borradores se aplican sobre un único snapshot del
  vault. Antes, el segundo borrador partía de la copia anterior y podía pisar
  el primero.
- **Estado real de activación**: el sync se considera activo sólo cuando existe
  el baseline del dispositivo. Elegir carpeta ya no marca el sync como activo ni
  oculta el botón **Activar sync**, así que la activación siempre crea el
  baseline.
- **Publicación idempotente de borradores**: el `changeId` se deriva del
  `draftId` y un reintento tras un fallo de guardado reaplica la entrada
  existente en lugar de duplicarla.
- **Mutaciones fuera de borradores**: la remediación de auditoría, la
  importación CSV de cuentas nuevas y la resolución de conflictos ahora
  publican su cambio en el log propio. La bóveda local se guarda primero; si la
  escritura del log falla, se avisa que el cambio no se publicó.

---

## [1.1.0] - 2026-10-28

### Cambiado

- **Generador de contraseñas**: reemplazo de `Math.random()` por
  `crypto.getRandomValues` con muestreo por rechazo y mezcla Fisher-Yates.
  Ahora garantiza al menos un carácter de cada clase habilitada.
- **Contraseña mínima del generador**: de 8 a 12 caracteres; valor por defecto
  20.
- **Desbloqueo del vault**: `unlock()` devuelve un resultado tipado en lugar de
  `false`, y la UI distingue contraseña incorrecta/datos alterados, archivo
  dañado, versión no soportada y vault ausente.
- **Importación de backups**: mismos errores tipados, sin mensajes genéricos.
- **Auditoría**: reemplazo del flujo Genkit por un motor local determinista con
  análisis por cuenta y entre cuentas, puntaje 0–100, severidad y mapeo a
  NIST SP 800-63B, OWASP ASVS V2.1, OWASP Top 10 A07 y CWE-521.
- **Auditoría navegable**: búsqueda por sitio, correo o usuario; tarjetas
  plegables de forma individual o masiva; contraseña enmascarada con
  revelar/copiar y hallazgos visibles sólo al expandir.
- **Tipografías**: Inter y Space Grotesk se sirven desde `public/fonts`; se
  eliminó la carga desde Google Fonts.
- **Electron**: `main.js` reescrito con CSP, cabeceras de seguridad, sandbox,
  guardas de navegación y de permisos, y verificación de path traversal.
- **Stack**: Next.js 16.4.3, React/React DOM 19.3.1, Electron 45.1.0,
  electron-builder 26.18.0, `@types/node` 22.
- **Idiomas**: portugués, francés y chino sumados a las traducciones existentes
  (en, es, pt, fr, zh).
- **Documentación**: TECHNICAL, SECURITY, README y CHANGELOG alineados con la
  implementación real.

### Agregado

- `src/lib/password-generator.ts`: generación pura y testeable.
- `src/lib/vault-storage.ts`: parseo, cifrado y validación del sobre.
- `src/lib/vault-errors.ts` y `vault-error-messages.ts`: taxonomía de errores.
- `src/lib/vault-merge.ts`: deduplicación, merge y resolución de conflictos.
- `src/lib/security-audit.ts`: motor de auditoría local.
- `src/components/vault/security-audit.tsx`: UI de auditoría con filtros,
  puntaje y recomendaciones por cuenta.
- **Corrección desde la auditoría**: cada cuenta con hallazgos de contraseña
  ofrece "Corregir". El diálogo genera un candidato CSPRNG, lo re-audita contra
  el vault completo, bloquea el guardado mientras queden hallazgos y conserva la
  contraseña anterior en el historial. Nunca escribe sin confirmación.
- `src/lib/audit-remediation.ts` y `tests/audit-remediation.test.ts`: motor de
  corrección con 13 tests.
- `tests/`: 85 tests con `node:test` para generador, vault, merge, auditoría,
  corrección de contraseñas, importación de CSV y paridad de traducciones.
- Script `npm test`.
- **Importación de CSV del navegador**: lee Chrome/Edge/Brave, Firefox,
  Bitwarden y LastPass en una sola operación, normaliza las URLs, muestra un
  resumen antes de confirmar y reutiliza las reglas de merge existentes.
- `tests/translations.test.ts`: guarda que verifica paridad de claves entre los
  cinco locales, que toda clave usada por la UI exista y que no se muestre una
  clave cruda.
- `public/fonts/`: cuatro archivos WOFF2 self-hosted.
- **Icono de aplicación**: arte vectorial en `build/icon.svg`, maestro PNG en
  `build/icon.png` e icono de ventana en `public/icon.png`. Reemplaza el icono
  genérico de Electron en el `.exe`, el instalador y el portable.

### Corregido

- **Generador**: faltaban `generator.entropy_label`, `generator.local_note` y
  `generator.exclude_ambiguous` en los cinco locales; la UI mostraba la clave
  cruda. La guarda de traducciones evita que vuelva a pasar.

### Eliminado

- `src/ai/` (Genkit y flujos de IA).
- Dependencias `firebase`, `genkit`, `genkit-cli`, `@genkit-ai/google-genai`,
  `@genkit-ai/next`, `dotenv` y `patch-package`.
- `apphosting.yaml`, `.modified` y los assets de imágenes de marcador de
  posición.
- Scripts `genkit:dev` y `genkit:watch`.
- Carga remota de Google Fonts y los `remotePatterns` de imágenes.

### Seguridad

- CSP con `default-src 'self'` y `connect-src 'none'` aplicada a cada respuesta
  del protocolo `app://`.
- Renderer con `sandbox: true`, `contextIsolation: true`,
  `nodeIntegration: false`, sin webviews y sin DevTools en producción.
- Permisos del sistema denegados salvo escritura al portapapeles.
- Ventanas nuevas, navegación externa y webviews bloqueadas.
- `Menu.setApplicationMenu(null)` en producción.
- Sin telemetría, sin servicios remotos y sin llamadas de red en runtime.

### Compatibilidad

- El formato de vault `1.0`, PBKDF2-SHA512 (210.000 iteraciones), AES-256-GCM y
  el salt de 16 bytes no cambian. Los vaults de 1.0.0 se abren sin migración.

---

## [1.0.0] - 2026-04-22

### Agregado

- Aplicación de escritorio Electron completa
- Sistema de cifrado AES-256-GCM con PBKDF2
- Gestión de vault local (crear, abrir, bloquear)
- CRUD completo de cuentas
- Generador de contraseñas con configuración
- Auditoría de seguridad con IA (Genkit + Google GenAI)
- Resolución de conflictos para importación
- Soporte multilingüe (ES/EN)
- Temas claro/oscuro
- Documentación completa (USUARIO, SEGURIDAD, TÉCNICA)

### Características de Seguridad

- Contraseña Maestra con 210,000 iteraciones PBKDF2
- Auto-bloqueo tras 10 minutos de inactividad
- Sin telemetría ni conexión a internet
- Almacenamiento 100% local

### Build

- Installer NSIS (.exe)
- Portable (.exe)
- Windows x64

---

## Notas de versión futura

### Planeado para v1.2

- [ ] Autofill en aplicaciones de escritorio
- [ ] Atajos de teclado personalizables
- [ ] Categorías y favoritos
- [ ] Backup automático cifrado en una carpeta local

### Planeado para v2.0

- [ ] Soporte macOS
- [ ] Soporte Linux
- [ ] Importación/exportación entre dispositivos mediante archivo cifrado
      (sin red)

---

**Herramienta de versionado**: [Standard Version](https://github.com/conventional-changelog/standard-version)
