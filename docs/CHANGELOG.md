# LocalPass — Changelog

Todos los cambios significativos de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

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
- `tests/`: 41 tests con `node:test` para generador, vault, merge y auditoría.
- Script `npm test`.
- `public/fonts/`: cuatro archivos WOFF2 self-hosted.
- **Icono de aplicación**: arte vectorial en `build/icon.svg`, maestro PNG en
  `build/icon.png` e icono de ventana en `public/icon.png`. Reemplaza el icono
  genérico de Electron en el `.exe`, el instalador y el portable.

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
