# Contribuir a LocalPass

¡Gracias por tu interés en contribuir! Este documento proporciona guías para hacer tu primera contribución.

---

## Código de Conducta

Al participar en este proyecto, aceptas mantener un ambiente de respeto para todos.

### Nuestros Estándares

- **Respeto**: Tratar a todos con dignidad
- **Inclusión**: Welcome a todos los aportes
- **Profesionalismo**: Mantener discusiones constructivas
- **Apertura**: Acceptar crítica constructiva de buena fe

### Violaciones

Casos de comportamiento inaceptable pueden ser reportados al maintainer del proyecto.

---

## Cómo Contribuir

### Reportar Bugs

1. Usa el tracker de Issues para reportar bugs
2. Incluye:
   - Descripción clara del bug
   - Pasos para reproducir
   - Comportamiento esperado vs actual
   - Screenshots si aplica
   - Versión de la aplicación

### Sugerir Features

1. Busca issues existentes primero
2. Crea un nuevo issue con:
   - Descripción detallada
   - Caso de uso
   - Posibles implementaciones
   - Alternativas consideradas

### Pull Requests

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcion`)
3. Haz commit de tus cambios (`git commit -m 'Agregar nueva funcion'`)
4. Push a la rama (`git push origin feature/nueva-funcion`)
5. Abre un Pull Request

### Estándares de Código

```typescript
// Nombres descriptivos
const getAccountById = async (id: string) => {}

// Componentes con mayúscula inicial
function AccountCard({ account }: AccountCardProps) {}

// Tipos con sufijo descriptivo
interface AccountEntry {
  id: string;
  sitio: string;
  usuario: string;
  password: string;
}

// Comentarios para lógica compleja
// Utiliza PBKDF2 para derivar la clave desde la contraseña
const deriveKey = async (password: string, salt: Uint8Array) => {}
```

### Convenciones de Commits

```
feat: nueva característica
fix: corrección de bug
docs: cambios en documentación
style: formateo, sin cambio de lógica
refactor: refactorización de código
test: agregar tests
chore: mantenimiento general
```

---

## Proceso de Desarrollo

### Setup Local

```bash
# Clonar repositorio
git clone https://github.com/usuario/PasswordManagement.git
cd PasswordManagement

# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev
```

### Testing

```bash
# Verificación de tipos
npm run typecheck

# Linting
npm run lint
```

### Build

```bash
# Build de producción
npm run build
```

---

## Estructura de Commits

Cada commit debe:

1. **Tener un solo propósito** - No mezclar cambios no relacionados
2. **Ser atómico** - Completamente funcional
3. **Incluir mensaje claro** - Describir qué y por qué

### Formato de Mensaje

```
<tipo>(<alcance>): <descripción>

[ cuerpo opcional ]

[ pie opcional ]
```

### Ejemplos

```
feat(vault): agregar función de exportación

Añade capacidad de exportar el vault cifrado a un archivo .json
para backup y transferencia.

Closes #123
```

```
fix(crypto): corregir generación de IV

El IV ahora usa crypto.getRandomValues() para asegurar
aleatoriedad criptográficamente segura.
```

---

## Recursos Útiles

- [Documentación de Electron](https://www.electronjs.org/docs)
- [Documentación de Next.js](https://nextjs.org/docs)
- [Radix UI](https://www.radix-ui.com/)
- [Tailwind CSS](https://tailwindcss.com/)

---

## Preguntas

Si tienes preguntas, abre un issue o contacta al maintainer.

---

**Última actualización**: Abril 2026