# LocalPass - Guía de Usuario

> **Aplicación de escritorio para gestionar contraseñas de forma segura y local.**

---

## Primeros Pasos

### 1. Configuración Inicial

Al abrir la aplicación por primera vez:

1. **Crear Vault**: Define tu Contraseña Maestra
2. **Confirmar**: Ingrésala nuevamente
3. **Listo**: Tu vault está creado y cifrado

> ⚠️ **Importante**: Si olvidas la Contraseña Maestra, NO hay forma de recuperar tus datos. Guárdala en un lugar seguro.

### 2. Desbloquear Vault

Para acceder a tus contraseñas:

1. Abre la aplicación
2. Ingresa tu Contraseña Maestra
3. Haz clic en "Desbloquear"

---

## Gestión de Cuentas

### Agregar Nueva Cuenta

1. Haz clic en **"+ Agregar"**
2. Completa los campos:
   - **Sitio**: ejemplo.com
   - **Usuario**: tu nombre de usuario o email
   - **Contraseña**: la contraseña para ese sitio
   - **Notas**: información adicional (opcional)
3. Haz clic en **"Guardar"**

### Editar Cuenta

1. Selecciona la cuenta de la lista
2. Haz clic en el icono de **lápiz**
3. Modifica los campos necesarios
4. Haz clic en **"Guardar"**

### Eliminar Cuenta

1. Selecciona la cuenta
2. Haz clic en el icono de **papelera**
3. Confirma la eliminación

### Copiar Datos

1. Selecciona la cuenta
2. Haz clic en el icono de **copiar** junto al campo que necesitas
3. El dato se copia al portapapeles

---

## Generador de Contraseñas

### Cómo Usar

1. Ve a la sección **"Generador"**
2. Configura las opciones:
   - **Longitud**: 8-64 caracteres
   - **Mayúsculas**: A-Z
   - **Minúsculas**: a-z
   - **Números**: 0-9
   - **Símbolos**: !@#$%^&*...
3. Haz clic en **"Generar"**
4. Copia la contraseña o úsala directamente

### Configuraciones Recomendadas

| Uso | Longitud | Caracteres |
|-----|---------|------------|
| Redes sociales | 16+ | Todos |
| Bancos | 20+ | Todos |
| Correo | 16+ | Todos |
| Cuentas menores | 12+ | Mayúsculas + Minúsculas + Números |

---

## Auditoría de Seguridad

### Ejecutar Auditoría

1. Ve a la sección **"Auditoría"**
2. Revisa la lista de contraseñas
3. Cada cuenta muestra su nivel de seguridad

### Interpretar Resultados

| Indicador | Significado | Acción |
|-----------|--------------|--------|
| **Rojo** | Comprometida o muy débil | Cambiar inmediatamente |
| **Amarillo** | Moderada | Considerar cambiarla |
| **Verde** | Segura | Mantener |

### Después de la Auditoría

1. Identifica contraseñas marcadas en rojo/amarillo
2. Usa el generador para crear nuevas
3. Actualiza cada cuenta afectada

---

## Importar / Exportar

### Exportar Vault

1. Ve a **Configuración**
2. Selecciona **"Exportar Vault"**
3. Elige ubicación y nombre del archivo
4. Confirma la exportación

> 📦 El archivo exportado está **cifrado**. Necesitarás la Contraseña Maestra para importarlo.

### Importar Vault

1. Ve a **Configuración**
2. Selecciona **"Importar Vault"**
3. Selecciona el archivo `.json`
4. Ingresa la Contraseña Maestra del vault importado
5. Resuelve conflictos si los hay

---

## Resolución de Conflictos

Cuando importas un vault pueden existir duplicados:

### Tipos de Conflicto

| Tipo | Descripción |
|------|--------------|
| **Mismo sitio + mismo usuario** | Duplicado exacto |
| **Mismo sitio + diferente usuario** | Cuenta diferente en mismo sitio |

### Resolver

1. Revisa ambos registros
2. Elige cuál mantener:
   - **Mantener local**: Conserva tu versión
   - **Usar importado**: Toma la versión del archivo
   - **Fusionar**: Combina notas de ambas
3. Confirma la selección

---

## Configuración

### Tema

- **Claro**: Fondo claro
- **Oscuro**: Fondo oscuro
- **Sistema**: Sigue la configuración del sistema

### Idioma

- **Español**: Interfaz en español
- **English**: Interface in English

### Auto-bloqueo

- **5 minutos**: Bloqueo rápido
- **10 minutos**: Bloqueo estándar
- **30 minutos**: Bloqueo lento
- **Nunca**: Solo cierre manual

---

## Atajos de Teclado

| Acción | Atajo |
|--------|-------|
| **Nueva cuenta** | `Ctrl + N` |
| **Buscar** | `Ctrl + F` |
| **Copiar contraseña** | `Ctrl + Shift + C` |
| **Bloquear vault** | `Ctrl + L` |
| **Exportar** | `Ctrl + E` |

---

## Preguntas Frecuentes

### ¿Mis datos están seguros?

**Sí**. Todos los datos están cifrados con AES-256-GCM y nunca salen de tu dispositivo.

### ¿Puedo usar mi vault en otro dispositivo?

**Sí**. Exporta tu vault cifrado y cópialo a otro dispositivo. Necesitarás instalar LocalPass en ese dispositivo.

### ¿Qué pasa si olvido mi contraseña?

**No hay recuperación**. Tu Contraseña Maestra no se almacena. Asegúrate de recordarla o guardarla en un lugar seguro.

### ¿Puedo sincronizar entre dispositivos?

**No de forma automática**. Debes exportar e importar manualmente para transferir datos.

### ¿La app necesita internet?

**No**. Funciona 100% offline. Puedes usar incluso en modo avión.

---

## Solución de Problemas

### La app no responde

1. Cierra la aplicación
2. Ejecuta nuevamente
3. Si persiste, reinicia tu computadora

### Error al desbloquear

1. Verifica que estés ingresando la contraseña correcta
2. Si olvidaste la contraseña, no hay forma de recuperarla
3. Considera usar un respaldo si tienes

### Error al importar

1. Verifica que el archivo sea un vault válido de LocalPass
2. Asegúrate de usar la contraseña correcta
3. Verifica que el archivo no esté corrupto

---

**Soporte**: Para ayuda adicional, consulta la documentación técnica en `docs/SECURITY.md`.

**Última actualización**: Abril 2026