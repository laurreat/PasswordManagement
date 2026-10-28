# LocalPass — Gestor de contraseñas local (escritorio)

LocalPass es un gestor de contraseñas para Windows que funciona **sin conexión**.
No hay servidor, no hay cuenta, no hay telemetría y no hay ningún servicio
remoto: la aplicación no necesita internet en ningún momento, ni siquiera la
primera vez.

## Qué significa "offline" en LocalPass

El modo offline no es una promesa de marketing: está aplicado en la capa de
Electron.

- La política CSP de la ventana usa `default-src 'self'` y `connect-src 'none'`,
  así que el renderer no puede abrir conexiones HTTP, WebSocket ni `fetch`.
- Las tipografías se sirven desde `public/fonts`; no se carga nada desde un CDN.
- La aplicación no incluye SDKs de nube, correo, SMS ni IA remota.
- El renderer corre con `sandbox: true`, `contextIsolation: true`,
  `nodeIntegration: false` y sin webviews.
- La navegación y las ventanas nuevas están bloqueadas fuera del origen local.
- No hay auto-actualizador ni comprobación de versiones.

Los datos del usuario nunca salen del equipo: el vault cifrado se guarda en el
`localStorage` del perfil de Electron, y las exportaciones son archivos que el
usuario elige dónde guardar.

## Características

- **Cifrado AES-256-GCM** con clave derivada por PBKDF2-SHA512 y 210.000
  iteraciones.
- **Generador criptográficamente seguro**: `crypto.getRandomValues`, muestreo
  por rechazo (sin sesgo de módulo) y mezcla Fisher-Yates. Garantiza al menos un
  carácter de cada clase habilitada.
- **Auditoría local determinista**: fortaleza, reutilización, similitud,
  patrones comunes, secuencias, duplicados y antigüedad. Sin modelos, sin API,
  sin red.
- **Recomendaciones por cuenta** mapeadas a NIST SP 800-63B, OWASP ASVS V2.1,
  OWASP Top 10 A07 y CWE-521.
- **Errores tipados del vault**: distingue contraseña incorrecta / datos
  alterados, archivo dañado, versión no soportada y vault ausente.
- **Resolución de conflictos** al importar vaults de otro dispositivo.
- **Auto-bloqueo** tras 10 minutos de inactividad.
- **Cinco idiomas**: inglés, español, portugués, francés y chino.
- **Temas claro y oscuro**.

## Stack

| Componente | Versión |
|------------|---------|
| Electron | 45.1.0 |
| Next.js (export estático) | 16.4.3 |
| React / React DOM | 19.3.1 |
| TypeScript | 5.7 |
| Tailwind CSS | 3.4 |
| electron-builder | 26.18.0 |
| Web Crypto API | nativa |

Ni Next.js ni Electron publican versiones LTS formales. Las versiones indicadas
son las últimas estables disponibles al 28 de octubre de 2026.

## Requisitos

- Node.js **22.12 o superior** (lo exige Electron 45; Next.js 16 pide 20.9+).
- npm.
- Windows x64 para generar el instalador y el portable.

## Empezar

```bash
npm install
npm run dev
```

`npm run dev` levanta Next.js en `http://localhost:9002` y abre Electron cuando
el servidor responde.

## Build de escritorio

```bash
npm run build
```

El comando ejecuta, en orden: build estático de Next.js, copia del icono y
empaquetado con electron-builder. El resultado queda en `dist/`:

- `LocalPass-Setup-1.1.0.exe` — instalador NSIS.
- `LocalPass-1.1.0-portable.exe` — ejecutable portable.

Cerrá cualquier instancia de LocalPass o Electron antes de compilar para evitar
el error `Access is denied` al reemplazar archivos.

## Comandos

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Desarrollo (Next.js + Electron) |
| `npm run dev:next` | Solo el servidor de desarrollo |
| `npm run build` | Build completo (Next.js + electron-builder) |
| `npm run build:next` | Solo el export estático en `out/` |
| `npm run build:electron` | Solo el empaquetado con electron-builder |
| `npm run typecheck` | Verificación de tipos |
| `npm test` | Tests unitarios (`node:test`) |

## Estructura del proyecto

```
electron/main.js                 Proceso principal, CSP y protocolo app://
src/app/                         Entrada de Next.js (App Router)
src/components/vault/            UI del vault, generador y auditoría
src/hooks/use-vault.tsx          Estado del vault y ciclo de vida
src/lib/vault-storage.ts         Formato en disco, cifrado y validación
src/lib/vault-errors.ts          Taxonomía de errores
src/lib/vault-merge.ts           Reglas de importación y conflictos
src/lib/password-generator.ts    Generación con CSPRNG
src/lib/security-audit.ts        Motor de auditoría local
src/lib/translations.ts          Traducciones (en, es, pt, fr, zh)
public/fonts/                    Tipografías self-hosted
tests/                           Tests de los módulos puros
docs/                            Documentación
```

## Documentación

- [docs/TECHNICAL.md](docs/TECHNICAL.md) — arquitectura, formato del vault y
  módulos.
- [docs/SECURITY.md](docs/SECURITY.md) — modelo de amenazas, criptografía,
  mapeo a frameworks y límites conocidos.
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — guía de uso.
- [docs/CHANGELOG.md](docs/CHANGELOG.md) — historial de cambios.

## Nota de seguridad

LocalPass no tiene mecanismo de recuperación de contraseña maestra. Si la
olvidás, el contenido del vault es matemáticamente irrecuperable. Exportá el
vault cifrado con regularidad y guardá el respaldo en un lugar seguro.

---

**Versión**: 1.1.0 · **Última actualización**: Octubre 2026
