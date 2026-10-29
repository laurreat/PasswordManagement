# LocalPass — Especificación técnica

---

## Visión general

LocalPass es una aplicación de escritorio Electron que gestiona contraseñas
**sin conexión**. El renderer es un export estático de Next.js; no hay servidor
HTTP en producción, no hay proceso de backend y no hay comunicación IPC: todo el
cifrado y toda la lógica de negocio viven en el renderer y usan la Web Crypto
API del sistema.

---

## Stack

| Componente | Tecnología | Versión |
|------------|------------|---------|
| Runtime de escritorio | Electron | 45.1.0 |
| Framework de UI | Next.js (App Router, `output: 'export'`) | 16.4.3 |
| Biblioteca de UI | React / React DOM | 19.3.1 |
| Lenguaje | TypeScript | 5.7 |
| Estilos | Tailwind CSS | 3.4 |
| Componentes | shadcn/ui + Radix UI | según `package.json` |
| Cifrado | Web Crypto API | nativa |
| Validación de formularios | React Hook Form + Zod | 7.x / 3.x |
| Empaquetado | electron-builder | 26.18.0 |
| Tests | `node:test` | Node 22.12+ |

Next.js y Electron no tienen canal LTS formal. Se usan las últimas versiones
estables publicadas al 28 de octubre de 2026. Tailwind 4 y TypeScript 7 no se
migraron porque son cambios mayores ajenos a este alcance.

---

## Arquitectura de procesos

```
┌──────────────────────────────────────────────┐
│ Proceso principal (electron/main.js)         │
│  · ventana BrowserWindow                     │
│  · protocolo app:// y cabeceras de seguridad │
│  · guardas de navegación y permisos          │
│  · IPC acotado + escritura atómica en disco  │
└──────────────────────┬───────────────────────┘
                       │ carga local
┌──────────────────────▼───────────────────────┐
│ Renderer (export estático de Next.js)        │
│  · React + estado del vault                  │
│  · Web Crypto (PBKDF2, AES-GCM)              │
│  · `vault.enc.json` a través del puente      │
└──────────────────────────────────────────────┘
```

`electron/preload.js` expone `window.localpass` con un conjunto fijo de canales:
`vault.*`, `sync.*`, `clipboard.copyTemp` y `app.info`. El renderer nunca manda
rutas: el proceso principal las deriva de `app.getPath('userData')` y de la
carpeta de sync que el usuario elige con un diálogo nativo. El renderer corre con
`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` y
`webviewTag: false`.

En desarrollo (`app.isPackaged === false`) la ventana carga
`http://localhost:9002` y abre DevTools. En producción carga
`app://./index.html` desde la carpeta `out/`.

---

## Estructura de archivos

```
PasswordManagement/
├── electron/
│   └── main.js                    Proceso principal y CSP
├── src/
│   ├── app/
│   │   ├── layout.tsx             Layout raíz
│   │   ├── page.tsx               Punto de entrada
│   │   └── globals.css            Tailwind + @font-face local
│   ├── components/
│   │   ├── ui/                    Componentes base (shadcn/ui)
│   │   └── vault/
│   │       ├── dashboard.tsx
│   │       ├── setup-vault.tsx
│   │       ├── unlock-vault.tsx
│   │       ├── password-generator.tsx
│   │       ├── password-strength.tsx
│   │       ├── security-audit.tsx
│   │       ├── conflict-resolver.tsx
│   │       └── documentation.tsx
│   ├── hooks/
│   │   ├── use-vault.tsx          Estado y ciclo de vida del vault
│   │   ├── use-ui-settings.tsx    Tema e idioma
│   │   ├── use-toast.ts           Notificaciones
│   │   └── use-mobile.tsx
│   └── lib/
│       ├── crypto-utils.ts        PBKDF2, AES-GCM, Base64
│       ├── vault-storage.ts       Formato en disco y validación
│       ├── vault-errors.ts        Taxonomía de errores
│       ├── vault-error-messages.ts Claves i18n por código
│       ├── vault-merge.ts         Importación y conflictos
│       ├── browser-csv.ts         Importación de CSV del navegador
│       ├── password-generator.ts  Generación con CSPRNG
│       ├── security-audit.ts      Motor de auditoría
│       ├── audit-remediation.ts   Corrección de contraseñas desde la auditoría
│       ├── types.ts               Tipos del dominio
│       ├── translations.ts        en / es / pt / fr / zh
│       └── utils.ts               `cn`
├── public/fonts/                  Tipografías self-hosted
├── tests/                         Tests de módulos puros
├── docs/
├── out/                           Export estático (generado)
└── dist/                          Instalador y portable (generado)
```

---

## Módulos principales

### `electron/main.js`

- Registra el esquema `app` como privilegiado (`standard`, `secure`) antes de
  `app.whenReady()`.
- Sirve `out/` con un mapa de MIME explícito y aplica las cabeceras de
  seguridad a **cada** respuesta.
- Impide path traversal: normaliza la ruta, la resuelve y verifica que siga
  dentro de `out/`.
- Devuelve `index.html` como fallback para rutas desconocidas del SPA.
- Bloquea ventanas nuevas, webviews y navegación fuera del origen.
- Deniega todos los permisos salvo escritura al portapapeles.
- Elimina el menú de la aplicación en producción.

### `src/lib/crypto-utils.ts`

```typescript
deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey>
encryptData(data: string, key: CryptoKey): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }>
decryptData(ciphertext: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<string>
```

Parámetros fijos:

| Parámetro | Valor |
|-----------|-------|
| KDF | PBKDF2 |
| Hash | SHA-512 |
| Iteraciones | 210.000 |
| Longitud de clave | 256 bits |
| Cifrado | AES-GCM |
| IV | 12 bytes aleatorios por operación |
| Salt | 16 bytes aleatorios por guardado |

El auth tag de GCM viaja dentro del ciphertext, que es lo que hace que una
contraseña incorrecta y un archivo alterado sean indistinguibles.

### `src/hooks/use-vault.tsx`

```typescript
type UnlockResult = { ok: true } | { ok: false; code: VaultErrorCode };

interface VaultContextType {
  isLocked: boolean;
  isInitialized: boolean;
  vault: VaultDecrypted | null;
  unlock(password: string): Promise<UnlockResult>;
  lock(): void;
  resetVault(): void;
  initialize(password: string): Promise<void>;
  updateVault(updater: (v: VaultDecrypted) => VaultDecrypted): Promise<void>;
  saveVault(decrypted: VaultDecrypted, password: string): Promise<void>;
  importVault(fileContent: string, password: string): Promise<void>;
  exportVault(): string;
}
```

`unlock` devuelve un resultado tipado. `updateVault` aplica las reglas de
deduplicación antes de guardar. La contraseña maestra se mantiene en memoria
mientras el vault está desbloqueado y se descarta al bloquear.

### `src/lib/vault-storage.ts`

```typescript
parseVaultEnvelope(rawJson: string, source: VaultSource): VaultEncryptedFile
decryptVaultFile(file, password, source): Promise<VaultDecrypted>
encryptVault(vault, password): Promise<VaultEncryptedFile>
buildExportPackage(vault, encrypted): ExportPackage
emptyVault(): VaultDecrypted
```

`parseVaultEnvelope` acepta tanto el sobre suelto como un paquete de exportación
(`{ exportVersion, exportedAt, deviceId, vaultData }`), tolera BOM y espacios, y
valida la forma del vault descifrado antes de entregarlo a la UI.

### `src/lib/vault-merge.ts`

La identidad de una cuenta es `sitio + usuario`, sin distinguir mayúsculas.

- `dedupeAccounts`: colapsa duplicados dentro de un vault. Si los passwords
  coinciden gana el más reciente; si difieren se registra un conflicto.
- `mergeImportedVault`: agrega cuentas nuevas, registra un conflicto por
  identidad divergente y no duplica conflictos ya conocidos.
- `applyConflictResolution`: aplica la elección del usuario conservando el orden
  de las cuentas.

### `src/lib/browser-csv.ts`

Importa el CSV en texto plano que exportan Chrome, Edge, Brave, Firefox,
Bitwarden y LastPass. El archivo lo lee el renderer y nunca sale del equipo.

- `parseCsvRows` implementa RFC 4180: comillas, `""` escapado, comas y saltos de
  línea embebidos, CRLF y BOM.
- `detectDelimiter` elige `,`, `;` o tabulador a partir de la cabecera.
- `detectFormat` reconoce los cinco exportadores; un archivo desconocido lanza
  `CsvImportError('csv_unrecognized_format')`.
- `normalizeSite` reduce la URL a un hostname porque la vista de detalle arma
  `https://${sitio}`. `android://<hash>@pkg` se reduce al package name y los
  esquemas no web usan la columna `name`.
- `previewCsvImport` cuenta cuentas nuevas, conflictos y filas ya actualizadas
  sin tocar el vault.
- `applyCsvImport` descarta las filas idénticas (mismo `sitio + usuario` y mismo
  password) para no perder notas ni historial local, y delega el resto en
  `mergeImportedVault`, que registra conflictos en lugar de sobrescribir.
- Límites: 5 MB y 20.000 filas. Los duplicados dentro del archivo se colapsan
  quedándose con la última aparición.

### `src/lib/password-generator.ts`

```typescript
generatePassword(options: PasswordGeneratorOptions): string
randomInt(maxExclusive: number): number
shuffle<T>(items: T[]): T[]
getEnabledSets(options): string[]
getPoolSize(options): number
```

Reglas:

- Toda la aleatoriedad sale de `crypto.getRandomValues`.
- `randomInt` usa muestreo por rechazo para evitar sesgo de módulo.
- Se genera al menos un carácter de cada clase habilitada y luego se mezcla con
  Fisher-Yates.
- Longitud mínima 12, máxima 128.
- Opción para excluir caracteres ambiguos (`I`, `l`, `1`, `O`, `0`, `o`).

### `src/lib/security-audit.ts`

Motor determinista, sin red y sin modelos. Ver `docs/SECURITY.md` para el mapeo
a frameworks.

```typescript
auditPassword(account: AccountEntry): AccountAudit
auditVault(vault: VaultDecrypted): VaultAudit
recommendationsFor(audit: AccountAudit): AuditIssueCode[]
estimateEntropyBits(password: string): number
arePasswordsSimilar(first: string, second: string): boolean
```

### `src/lib/audit-remediation.ts`

Convierte un hallazgo en un cambio concreto sin escribir nada por su cuenta. El
módulo no conoce React ni el vault cifrado: recibe cuentas y devuelve datos.

```typescript
isAdvisoryIssue(code: AuditIssueCode): boolean
remediationIssues(audit: AccountAudit): AuditIssueCode[]
advisoryIssues(audit: AccountAudit): AuditIssueCode[]
remainingFindingCodes(account, candidate, otherPasswords): AuditIssueCode[]
generateRemediationPassword(account, otherPasswords): string
applyPasswordRemediation(vault, accountId, newPassword, now?): VaultDecrypted
```

Reglas:

- `password_stale` y `account_duplicate` son informativos/estructurales y no se
  corrigen con una contraseña nueva; el diálogo los muestra, pero no ofrece
  corregirlos.
- El candidato se genera con `generatePassword` (20 caracteres, todas las
  clases) y se vuelve a auditar contra **todo** el vault, incluida
  reutilización y similitud, antes de ofrecerlo.
- `remainingFindingCodes` ignora los hallazgos `info`; el botón de guardar sigue
  deshabilitado mientras quede cualquier otro.
- `applyPasswordRemediation` sólo cambia `password` y `updatedAt`, y antepone la
  contraseña anterior con su fecha original a `history`. No toca el formato del
  vault.

---

## Formato del vault

### Sobre cifrado

```json
{
  "salt": "base64 (16 bytes)",
  "iv": "base64 (12 bytes)",
  "data": "base64 (ciphertext + auth tag)",
  "vaultVersion": "1.0"
}
```

### Contenido descifrado

```json
{
  "vaultVersion": "1.0",
  "deviceId": "uuid",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "accounts": [
    {
      "id": "uuid",
      "sitio": "github.com",
      "usuario": "user@example.com",
      "password": "texto plano en memoria",
      "notas": "",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601",
      "deviceId": "uuid",
      "history": [{ "password": "...", "updatedAt": "ISO-8601" }]
    }
  ],
  "conflicts": [
    {
      "conflictId": "uuid",
      "sitio": "github.com",
      "usuario": "user@example.com",
      "versionLocal": { "...": "AccountEntry" },
      "versionImportada": { "...": "AccountEntry" },
      "detectedAt": "ISO-8601"
    }
  ]
}
```

### Compatibilidad

El formato `1.0`, el KDF y los parámetros de cifrado no cambiaron respecto de la
versión anterior. Un vault creado con LocalPass 1.0.0 se abre sin migración. El
único cambio es que un envelope inválido ahora produce un error tipado en lugar
de un `false` genérico.

### Ubicación en disco

El sobre cifrado se guarda en `vault.enc.json`, dentro de
`app.getPath('userData')` (`%APPDATA%\LocalPass` en Windows). La escritura es
atómica: temporal en el mismo directorio, `fsync` y `rename`, así un corte de
luz deja el archivo anterior intacto o ninguno, nunca medio vault. No se escribe
ningún archivo de vault legible en claro.

En el build web (sin puente) el mismo sobre se guarda en `localStorage`, bajo la
clave `localpass_vault`. Un vault existente ahí se migra al archivo en la
primera lectura, una sola vez, y la copia vieja se conserva como red de
seguridad.

---

## Taxonomía de errores

| Código | Significado |
|--------|-------------|
| `vault_missing` | No hay vault en este dispositivo |
| `vault_corrupted` | El sobre o el contenido descifrado no tiene la forma esperada |
| `vault_authentication_failed` | Contraseña incorrecta **o** datos alterados (GCM no distingue) |
| `vault_unsupported_version` | `vaultVersion` distinto de `1.0` |
| `vault_read_failed` | El archivo del vault no se pudo leer |
| `vault_write_failed` | El archivo no se pudo escribir (permisos, disco lleno o cuota de `localStorage`) |
| `backup_corrupted` | El archivo importado no es un backup válido |
| `backup_authentication_failed` | Contraseña incorrecta o backup alterado |
| `backup_unsupported_version` | El backup usa otra versión de formato |

Cada código tiene una clave de traducción en `vault-error-messages.ts`.

---

## Modelo de auditoría

Cada cuenta recibe un `AccountAudit` con puntaje 0–100, entropía estimada,
severidad y hallazgos. El puntaje del vault es el promedio de sus cuentas.

### Hallazgos por cuenta

`password_empty`, `password_too_short`, `password_missing_upper`,
`password_missing_lower`, `password_missing_number`, `password_missing_symbol`,
`password_common`, `password_contains_account`, `password_sequential`,
`password_repeated`, `password_stale`.

### Hallazgos entre cuentas

`password_reused`, `password_similar`, `account_duplicate`.

### Cálculo

1. Entropía = `longitud × log2(pool detectado)`, redondeada. Es una cota
   superior: no modela estructura humana como haría un estimador de guesses.
2. Penalizaciones por hallazgo: patrón común −45, contiene la cuenta −25,
   reutilización −20, similitud/secuencia/repetición −10.
3. Severidad por puntaje: `< 50` alta, `< 70` media, `< 85` baja, `≥ 85`
   segura. Cualquier hallazgo crítico fuerza `critical`.
4. La antigüedad mayor a 365 días es informativa y **no** penaliza, siguiendo a
   NIST SP 800-63B.

---

## Interfaz

- Estado global mínimo: vault, tema e idioma.
- Vistas del dashboard: cuentas, generador, auditoría, conflictos,
  configuración y documentación.
- La auditoría se recalcula en memoria con `useMemo` sobre el vault; no hay
  botón "ejecutar" ni llamada externa.
- La auditoría tiene búsqueda propia por sitio, correo o usuario
  (substring sin distinguir mayúsculas) que se combina con los filtros de
  severidad. Las tarjetas se abren y cierran individualmente, y el control
  "Expandir/Contraer todo" actúa sólo sobre los resultados visibles.
- Una tarjeta plegada muestra sitio, usuario, puntaje y severidad. Expandida
  agrega la contraseña enmascarada con revelar/copiar, notas, última
  actualización y los hallazgos con su recomendación.
- Cada cuenta con hallazgos de contraseña ofrece "Corregir": abre un diálogo
  que genera un candidato CSPRNG, permite editarlo, revelarlo, copiarlo o
  regenerarlo, lo re-audita en vivo y sólo escribe al confirmar. El diálogo
  advierte que LocalPass no puede cambiar la contraseña en el sitio remoto.
- La configuración incluye la importación de CSV del navegador: se elige el
  archivo, se muestra un resumen (nuevas, conflictos, ya actualizadas, omitidas)
  y se confirma la importación. El CSV no está cifrado, así que la tarjeta pide
  borrarlo después de importar.
- Todos los textos visibles pasan por `translations.ts` con cinco locales.

---

## Build

```bash
npm run build
```

1. `next build` genera el export estático en `out/` (Turbopack).
2. `copy:icon` copia `icon.svg` e `icon.png` a `out/`.
3. `electron-builder` empaqueta `out/`, `electron/`, `public/` y `package.json`
   en un instalador NSIS y un portable.

`node_modules` se excluye del paquete: el renderer ya viene compilado y el
proceso principal sólo usa módulos nativos de Electron y Node.

### Icono de la aplicación

| Archivo | Rol |
|---------|-----|
| `build/icon.svg` | Fuente vectorial (1024×1024) |
| `build/icon.png` | Maestro 1024×1024; electron-builder deriva el `.ico` multi-tamaño para el `.exe`, el instalador NSIS y el portable |
| `public/icon.svg` | Copia servida al renderer |
| `public/icon.png` | Icono de la ventana en desarrollo y en el build |

`win.icon` apunta a `build/icon.png` y `win.signExecutable: false` permite que
electron-builder edite los recursos del ejecutable (icono y metadatos) sin
firmarlo. Con `signAndEditExecutable: false` el `.exe` se quedaba con el icono
genérico de Electron.

El arte es un contenedor navy con un keyhole ámbar. A 32 px se lee bien; a 16 px
los detalles (bisagras, patas, medallón) se funden, que es el límite esperable
de un icono con este nivel de detalle. `electron/main.js` sólo decodifica PNG
para el icono de ventana: `nativeImage` no soporta SVG.

### Protocolo `app://`

En producción el renderer no se carga con `file://` sino con un esquema
privilegiado registrado por la aplicación, lo que da un origen estable
(`app://.`) y permite que `localStorage` persista entre ejecuciones del
instalador y del portable.

---

## Tests

```bash
npm test
```

`node --test` ejecuta `tests/*.test.ts`. Los tests importan los módulos `.ts`
directamente (Node 22+ hace type stripping) y por eso `tsconfig.json` habilita
`allowImportingTsExtensions`. `tests/package.json` declara `"type": "module"`
para que los archivos de test se interpreten como ESM sin warnings.

Cobertura actual: generador, formato/cifrado del vault, reglas de merge, motor
de auditoría, corrección de contraseñas desde la auditoría, importación de CSV
y paridad de traducciones (85 tests).

---

## Limitaciones conocidas

- Las cadenas de JavaScript no se pueden borrar de memoria de forma confiable;
  el vault descifrado vive en el heap del renderer mientras está desbloqueado.
- No hay verificación de filtraciones tipo Have I Been Pwned: requeriría red y
  el producto es offline por diseño. La auditoría detecta patrones, no
  exposiciones reales.
- No hay auto-updater ni firma de código configurada.
- El empaquetado está limitado a Windows x64.
- La importación de CSV sólo acepta UTF-8. Un export UTF-16 (por ejemplo, de
  Excel) se rechaza como formato desconocido en lugar de adivinarse.
- El CSV sigue en disco hasta que el usuario lo borra; la aplicación no puede
  eliminarlo.
- Bitwarden incluye notas, tarjetas e identidades en el mismo export: sólo se
  importan los ítems de tipo `login`, porque LocalPass modela credenciales.
- "Corregir" en la auditoría sólo actualiza el vault: LocalPass no tiene red y
  no puede rotar la contraseña en el sitio remoto. El diálogo lo advierte.
- Un candidato se compara contra las contraseñas guardadas en este vault; una
  reutilización en un sitio que no está registrado aquí no se puede detectar.
- El renderer usa `script-src 'unsafe-inline'` porque el export estático de
  Next.js emite payloads de hidratación inline. Ver `docs/SECURITY.md`.

---

**Última actualización**: Octubre 2026
