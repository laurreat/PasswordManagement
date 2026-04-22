# LocalPass - Especificación Técnica

---

## Visión General

LocalPass es una aplicación de escritorio Electron que proporciona gestión segura de contraseñas 100% offline utilizando cifrado AES-256-GCM del sistema nativo.

---

## Stack Tecnológico

| Componente | Tecnología | Versión |
|------------|------------|---------|
| **Framework** | Electron | 33.x |
| **Frontend** | Next.js | 15.x |
| **UI** | React | 19.x |
| **Estilos** | Tailwind CSS | 3.x |
| **Componentes** | shadcn/ui + Radix UI | latest |
| **Cifrado** | Web Crypto API | native |
| **Validación** | Zod | 3.x |
| **Formularios** | React Hook Form | 7.x |
| **IA** | Genkit + Google GenAI | 1.x |
| **Bundling** | Electron Builder | 25.x |

---

## Arquitectura de Archivos

```
PasswordManagement/
├── electron/
│   └── main.js              # Proceso principal de Electron
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── layout.tsx       # Layout principal
│   │   ├── page.tsx         # Página de entrada
│   │   └── globals.css      # Estilos globales
│   ├── components/
│   │   ├── ui/              # Componentes base (shadcn/ui)
│   │   │   ├── button.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   └── ... (más componentes)
│   │   └── vault/            # Componentes de negocio
│   │       ├── dashboard.tsx  # Panel principal
│   │       ├── setup-vault.tsx
│   │       ├── unlock-vault.tsx
│   │       ├── password-generator.tsx
│   │       ├── password-strength.tsx
│   │       ├── conflict-resolver.tsx
│   │       └── documentation.tsx
│   ├── hooks/                # React hooks personalizados
│   │   ├── use-vault.tsx    # Gestión del vault
│   │   ├── use-ui-settings.tsx # Tema e idioma
│   │   └── use-toast.tsx    # Notificaciones
│   ├── lib/
│   │   ├── utils.ts         # Utilidades (cn)
│   │   ├── crypto.ts       # Funciones de cifrado
│   │   └── types.ts        # Definiciones de tipos
│   ├── ai/                 # Genkit AI flows
│   │   └── flows/
│   │       └── password-security-audit.ts
│   └── locales/            # Traducciones
│       ├── es.json
│       └── en.json
├── docs/                   # Documentación
├── public/                  # Assets estáticos
└── out/                    # Build de producción
```

---

## Módulos Principales

### `electron/main.js`

Punto de entrada de Electron. Gestiona:
- Creación de ventana principal
- Eventos de aplicación (inicio, cierre, menú)
- Comunicación IPC con renderer

### `src/lib/crypto.ts`

Funciones de cifrado/descifrado:

```typescript
// Derivación de clave desde contraseña
deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey>

// Cifrado AES-256-GCM
encrypt(data: string, key: CryptoKey): Promise<EncryptedData>

// Descifrado
decrypt(encrypted: EncryptedData, key: CryptoKey): Promise<string>
```

### `src/hooks/use-vault.tsx`

Hook para gestión del vault:

```typescript
interface VaultState {
  vault: Vault | null;
  isLocked: boolean;
  lock: () => void;
  unlock: (password: string) => Promise<boolean>;
  createVault: (password: string) => Promise<void>;
  updateVault: (updates: Partial<Vault>) => void;
  exportVault: () => Promise<string>;
  importVault: (file: File, password: string) => Promise<ImportResult>;
}
```

### `src/ai/flows/password-security-audit.ts`

Flujo de auditoría de seguridad con IA:

```typescript
interface AuditInput {
  password: string;
  site: string;
  username: string;
}

interface AuditOutput {
  isCompromised: boolean;
  isCommon: boolean;
  strength: 'weak' | 'moderate' | 'strong';
  suggestions: string[];
}
```

---

## API de Componentes

### Button

```typescript
<Button variant="default" | "destructive" | "outline" | "secondary" | "ghost" | "link" size="default" | "sm" | "lg" | "icon">
```

### Badge

```typescript
<Badge variant="default" | "secondary" | "destructive" | "outline">
```

### Card

```typescript
<Card>
  <CardHeader>
    <CardTitle />
    <CardDescription />
  </CardHeader>
  <CardContent />
  <CardFooter />
</Card>
```

### Dialog

```typescript
<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger>...</DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle />
      <DialogDescription />
    </DialogHeader>
    ...
    <DialogFooter>
      <DialogClose />
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Tipos de Datos

```typescript
interface AccountEntry {
  id: string;           // UUID v4
  sitio: string;       // URL o nombre del sitio
  usuario: string;      // Nombre de usuario
  password: string;    // Contraseña (plaintext en memoria)
  notes?: string;      // Notas adicionales
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
}

interface PasswordHistory {
  id: string;
  accountId: string;
  password: string;     // Hash o indicador
  changedAt: string;
}

interface Vault {
  accounts: AccountEntry[];
  history: PasswordHistory[];
  createdAt: string;
  version: string;
}

interface EncryptedVault {
  salt: string;        // Base64
  iv: string;         // Base64
  data: string;       // Base64 (AES-GCM encrypted JSON)
}
```

---

## IPC Events

Comunicación entre proceso principal y renderer:

| Evento | Dirección | Descripción |
|--------|-----------|-------------|
| `app:lock` | renderer → main | Solicitar bloqueo |
| `app:ready` | main → renderer | App lista |
| `vault:save` | renderer → main | Guardar vault |
| `vault:load` | main → renderer | Cargar vault |

---

## Variables de Entorno

```env
# Opcional - Para IA (auditoría de seguridad)
GOOGLE_GENAI_API_KEY=your-api-key

# No usar en producción
NODE_ENV=production
```

---

## Comandos de Build

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Desarrollo (Electron + Next.js) |
| `npm run build` | Build de producción |
| `npm run typecheck` | Verificación TypeScript |
| `npm run lint` | Linting ESLint |

---

## Output de Build

```
dist/
├── win-unpacked/           # App descomprimida
│   ├── LocalPass.exe
│   └── resources/
├── LocalPass-Setup-1.0.0.exe    # Instalador NSIS
└── LocalPass-1.0.0-portable.exe   # Portable
```

---

**Última actualización**: Abril 2026