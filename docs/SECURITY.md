# LocalPass — Documentación de seguridad

> Aplicación de escritorio **100% offline**. Ningún dato del usuario sale del
> equipo.

---

## 1. Principios

### 1.1 Aislamiento de red

LocalPass no necesita internet y no puede usarlo:

| Control | Implementación |
|---------|----------------|
| CSP del renderer | `default-src 'self'`, `connect-src 'none'`, `font-src 'self'`, `object-src 'none'`, `frame-src 'none'`, `base-uri 'none'`, `form-action 'none'` |
| Tipografías | Servidas desde `public/fonts` con `@font-face` local |
| Dependencias de nube | Ninguna: no hay Firebase, Genkit, SDK de correo, SMS ni IA remota |
| Telemetría | Ninguna |
| Auto-actualizador | Ninguno |
| Navegación | `will-navigate` limitado al origen de la app; ventanas nuevas y webviews bloqueadas |
| Permisos | Sólo escritura al portapapeles; cámara, micrófono, geolocalización y notificaciones denegados |

`connect-src 'none'` es la garantía técnica: aunque un bug intentara hacer
`fetch`, el navegador rechazaría la conexión.

### 1.2 Aislamiento del renderer

- `sandbox: true`
- `contextIsolation: true`
- `nodeIntegration: false`
- `webviewTag: false`
- `webSecurity: true`
- `devTools: false` en producción
- Sin `preload.js` y sin IPC: el renderer no tiene ninguna vía hacia APIs de
  Node o del sistema operativo.

### 1.3 Sin cuentas ni recuperación

No hay registro, correo, SMS ni servidor. La contraseña maestra nunca se
almacena ni se transmite. Si se olvida, el vault es irrecuperable por diseño.

---

## 2. Modelo de amenazas

### Dentro del alcance

| Amenaza | Mitigación |
|---------|------------|
| Robo del archivo o del disco | AES-256-GCM con clave derivada por PBKDF2-SHA512 (210k iteraciones) |
| Copia del perfil de Electron | El vault en `localStorage` está cifrado; sin la contraseña maestra no es legible |
| Fuga de un backup exportado | El backup también está cifrado con la contraseña maestra |
| Contraseñas débiles, repetidas o predecibles | Generador CSPRNG y auditoría local |
| Contenido remoto malicioso | No se carga contenido remoto; CSP y navegación bloqueadas |
| XSS desde datos del usuario | React escapa por defecto; no se usa `dangerouslySetInnerHTML` |
| Apertura de ventanas o navegación inesperada | Guardas en el proceso principal |
| Acceso a archivos fuera de `out/` | Verificación de path traversal en el protocolo `app://` |
| CSV de navegador en texto plano | Se lee en memoria del renderer, nunca se envía; la UI recuerda borrarlo |

### Fuera del alcance

| Amenaza | Motivo |
|---------|--------|
| Sistema operativo comprometido (keylogger, lector de memoria, debugger) | El atacante ve las contraseñas cuando se descifran |
| Reemplazo del binario de Electron o del ejecutable | No hay firma de código ni verificación de integridad en runtime |
| Cadena de suministro de npm/Electron | Se mitiga con versiones fijas y revisión, no en runtime |
| Acceso físico con la app desbloqueada | El auto-bloqueo reduce la ventana, no la elimina |
| Ataques de canal lateral (tiempo, caché) | Fuera del modelo de una app de escritorio |
| Filtraciones del servicio remoto | LocalPass no puede saber si un sitio fue vulnerado |
| El CSV original en disco | La app no puede borrarlo; eliminarlo queda a cargo del usuario |

---

## 3. Criptografía

### 3.1 Derivación de clave

```
Contraseña maestra
      │
      ▼
PBKDF2-SHA512 · 210.000 iteraciones · salt aleatorio de 16 bytes
      │
      ▼
CryptoKey AES-256 (no exportable)
```

- El salt es nuevo en **cada guardado**, así que dos vaults con la misma
  contraseña producen claves distintas.
- La clave se crea con `extractable: false`.
- La contraseña maestra se mantiene en memoria sólo mientras el vault está
  desbloqueado y se descarta al bloquear.

### 3.2 Cifrado

| Aspecto | Valor |
|---------|-------|
| Algoritmo | AES-256-GCM (cifrado autenticado) |
| IV | 12 bytes aleatorios por operación |
| Auth tag | 128 bits, incluido en el ciphertext |
| Codificación en disco | Base64 dentro de un JSON |

GCM autentica el ciphertext. Un tag inválido significa **contraseña incorrecta o
datos alterados**, y criptográficamente no hay forma de distinguirlos. La UI lo
dice así en lugar de mentir con un "contraseña incorrecta" genérico.

### 3.3 Generación de contraseñas

`src/lib/password-generator.ts`:

- Usa exclusivamente `crypto.getRandomValues`.
- `randomInt` aplica muestreo por rechazo para eliminar el sesgo de módulo.
- Garantiza al menos un carácter de cada clase habilitada.
- Mezcla el resultado con Fisher-Yates impulsado por el CSPRNG, para que los
  caracteres garantizados no queden en posiciones predecibles.
- Longitud mínima 12 y máxima 128.
- La UI muestra la entropía estimada del espacio de búsqueda.

`Math.random()` no se usa en ningún punto del código.

---

## 4. Almacenamiento

| Aspecto | Implementación |
|---------|----------------|
| Ubicación | `localStorage`, clave `localpass_vault`, perfil de Electron (`%APPDATA%\LocalPass`) |
| Formato | JSON con `salt`, `iv`, `data` y `vaultVersion` |
| Contenido en claro | Nunca se escribe en disco |
| Backups | Archivo JSON cifrado que el usuario exporta manualmente |
| Borrado | `resetVault` elimina la clave de `localStorage` |

Advertencias honestas:

- El sistema operativo protege el perfil con los permisos de la cuenta de
  Windows. LocalPass no agrega permisos POSIX/ACL propios.
- `localStorage` vive en LevelDB. Borrar la clave elimina el registro lógico,
  pero bloques liberados del disco podrían conservar bytes cifrados. Para un
  borrado físico hace falta cifrado de disco completo o saneamiento del disco.
- Se recomienda BitLocker (o equivalente) en el equipo.

---

## 5. Política de seguridad de contenido (CSP)

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'none';
media-src 'none';
object-src 'none';
frame-src 'none';
frame-ancestors 'none';
worker-src 'self';
base-uri 'none';
form-action 'none';
```

### Por qué `'unsafe-inline'` en scripts y estilos

El export estático de Next.js emite payloads de hidratación y estilos inline. Un
export estático no puede generar nonces por request, así que la alternativa
realista era `'unsafe-inline'` o ninguna CSP. Se eligió CSP con
`'unsafe-inline'` porque sigue bloqueando:

- cualquier origen remoto (`default-src 'self'`),
- cualquier conexión de red (`connect-src 'none'`),
- objetos, frames, formularios y `base-uri`.

El riesgo residual de XSS por script inline se reduce con el aislamiento del
renderer, la ausencia de contenido remoto y el escapado de React.

---

## 6. Auditoría de seguridad local

La auditoría es un motor de reglas determinista. **No hay IA, no hay modelo y no
hay llamada de red.** El nombre "auditoría" describe el análisis, no un servicio.

### 6.1 Qué analiza

| Categoría | Hallazgos |
|-----------|-----------|
| Fortaleza | `password_empty`, `password_too_short` |
| Composición | `password_missing_upper`, `password_missing_lower`, `password_missing_number`, `password_missing_symbol` |
| Patrones | `password_common`, `password_contains_account`, `password_sequential`, `password_repeated` |
| Entre cuentas | `password_reused`, `password_similar`, `account_duplicate` |
| Higiene | `password_stale` |

### 6.2 Mapeo a frameworks

| Hallazgo | Severidad | Referencia |
|----------|-----------|------------|
| Contraseña vacía, demasiado corta o común | Crítica / alta | NIST SP 800-63B §5.1.1.2, OWASP ASVS V2.1, CWE-521 |
| Contiene el sitio o el usuario | Alta | NIST SP 800-63B §5.1.1.2, OWASP ASVS V2.1, OWASP Top 10 A07:2021, CWE-521 |
| Reutilización entre cuentas | Alta | OWASP Top 10 A07:2021, CWE-521 |
| Similitud entre contraseñas | Media | OWASP Top 10 A07:2021, CWE-521 |
| Secuencias y repeticiones | Media | OWASP ASVS V2.1, CWE-521 |
| Falta de una clase de carácter | Baja | OWASP ASVS V2.1 |
| Contraseña antigua (> 365 días) | Informativa | Sin penalización: NIST desaconseja la rotación forzada |
| Identidad duplicada (sitio + usuario) | Informativa | Higiene de datos |

Notas:

- NIST SP 800-63B prioriza longitud, blocklist y ausencia de reglas de
  composición. Por eso las clases faltantes son sólo defensa en profundidad y no
  un requisito de cumplimiento.
- OWASP Top 10 A07:2021 agrupa las fallas de identificación y autenticación,
  incluida la reutilización de credenciales.
- CWE-521 describe requisitos de contraseña débiles.

### 6.3 Puntaje

- Entropía estimada: `longitud × log2(pool detectado)`.
- Penalizaciones: patrón común −45, contiene la cuenta −25, reutilización −20,
  similitud/secuencia/repetición −10.
- El puntaje del vault es el promedio de las cuentas.
- Es una métrica explicable, no una auditoría certificada.

### 6.4 Qué **no** hace

- No comprueba filtraciones reales (requeriría red).
- No mide la probabilidad real de crackeo con un modelo de guesses.
- No conoce el contexto del sitio ni sus políticas.
- No reemplaza un gestor de identidades ni una auditoría profesional.

---

## 7. Errores y recuperación

El vault distingue errores que antes se confundían:

| Código | Mensaje al usuario |
|--------|--------------------|
| `vault_missing` | No hay vault en este dispositivo |
| `vault_corrupted` | El archivo está dañado |
| `vault_authentication_failed` | Contraseña incorrecta **o** datos alterados |
| `vault_unsupported_version` | Versión de formato no soportada |
| `vault_write_failed` | No se pudo guardar |
| `backup_*` | Equivalentes para archivos importados |
| `csv_empty`, `csv_unrecognized_format`, `csv_too_large` | El CSV no se pudo leer (vacío, formato desconocido o demasiado grande) |

Un vault dañado no se trata como "no inicializado": la app no ofrece crear uno
nuevo encima del archivo que el usuario quizá pueda recuperar.

---

## 8. Límites conocidos

- **Memoria**: las cadenas de JavaScript son inmutables y el recolector de basura
  decide cuándo liberarlas. No se puede garantizar el borrado seguro de la
  contraseña maestra ni del vault descifrado en RAM.
- **Sin firma de código**: el ejecutable no está firmado; Windows puede mostrar
  advertencias de SmartScreen.
- **Sin verificación de filtraciones**: por diseño offline.
- **Sin actualizaciones automáticas**: el usuario decide cuándo actualizar.
- **Windows únicamente**: el empaquetado actual es x64.
- **CSP con `'unsafe-inline'`**: ver sección 5.
- **Dependencias**: la seguridad de Electron, Next.js y las librerías de UI
  depende de mantenerlas actualizadas y de revisar sus avisos.

---

## 9. Recomendaciones al usuario

- Usá una contraseña maestra larga y única; una frase de acceso de 5 o 6
  palabras es mejor que una variación de una palabra del diccionario.
- Activá el cifrado de disco del sistema operativo.
- Exportá el vault con regularidad y guardá el respaldo en un lugar seguro.
- Revisá la auditoría después de importar cuentas o de cambiar contraseñas.
- No uses LocalPass en equipos compartidos sin bloquear el vault al terminar.

---

## 10. Reporte de vulnerabilidades

Si encontrás una vulnerabilidad, **no** abras un issue público. Contactá al
mantenedor del repositorio de forma privada con:

- versión de LocalPass y de Electron,
- pasos de reproducción,
- impacto esperado,
- evidencia (sin incluir contraseñas reales).

---

## 11. Glosario

| Término | Definición |
|---------|------------|
| AES-256-GCM | Cifrado simétrico autenticado de 256 bits |
| PBKDF2 | Derivación de clave a partir de una contraseña |
| Salt | Valor aleatorio que evita tablas precomputadas |
| IV / Nonce | Valor aleatorio único por operación de cifrado |
| Entropía | Medida de la incertidumbre de una contraseña |
| CSP | Content Security Policy |
| CSPRNG | Generador de números pseudoaleatorios criptográfico |
| CWE-521 | Categoría de debilidad: requisitos de contraseña débiles |
| ASVS | Application Security Verification Standard de OWASP |

---

**Última actualización**: Octubre 2026
