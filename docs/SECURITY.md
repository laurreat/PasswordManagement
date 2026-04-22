# LocalPass - Documentación de Seguridad

> **Aplicación de escritorio 100% offline** - Ningún dato sale de tu dispositivo.

---

## Principios de Seguridad

### 1. Cero Confianza en la Red

- **Sin conexión a internet requerida** - La app funciona completamente desconectada
- **Sin telemetría** - No se envían datos de uso, errores o métricas
- **Sin actualizaciones automáticas** - El usuario decide cuándo actualizar
- **Sin servidor externo** - Todo se ejecuta localmente

### 2. Cifrado de Grado Militar

| Aspecto | Implementación |
|---------|----------------|
| **Algoritmo** | AES-256-GCM (Authenticated Encryption) |
| **Derivación de clave** | PBKDF2 con SHA-512 |
| **Iteraciones** | 210,000 (resistente a GPU/ASIC) |
| **Sal única** | 256 bits aleatorios por sesión |
| **IV/Nonce** | 96 bits aleatorios por cifrado |

### 3. Protección de Contraseña Maestra

```
Master Password → PBKDF2 (SHA-512, 210K iteraciones) → CryptoKey (AES-256)
```

- **La contraseña NUNCA se almacena** - Solo se usa para derivar la clave
- **No hay mecanismo de recuperación** - Si olvidas la contraseña, los datos son irrecuperables
- **Auto-bloqueo** - El vault se cierra tras 10 minutos de inactividad

---

## Arquitectura de Datos

### Flujo de Cifrado

```
1. Usuario ingresa Master Password
2. Se genera sal aleatoria (256 bits)
3. PBKDF2 deriva CryptoKey desde contraseña + sal
4. Datos → JSON.stringify() → UTF-8 → AES-GCM encrypt → Base64
5. Se almacena: { salt, iv, data } en archivo local
```

### Estructura del Vault

```json
{
  "salt": "base64-encoded-salt",
  "iv": "base64-encoded-iv", 
  "data": "base64-encoded-encrypted-data"
}
```

Donde `data` decrypted contiene:

```json
{
  "accounts": [
    {
      "id": "uuid",
      "sitio": "example.com",
      "usuario": "user@example.com",
      "password": "encrypted-password",
      "notes": "notas-opcionales",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "history": []
}
```

---

## Medidas de Protección

### En Memoria

| Protección | Descripción |
|------------|-------------|
| **Memoria segura** | Las contraseñas en RAM se sobreescriben tras uso |
| **No persistencia** | Datos desencriptados nunca se guardan en disco |
| **Auto-lock** | Vault cierra tras 10 min de inactividad |

### En Disco

| Protección | Descripción |
|------------|-------------|
| **Archivo cifrado** | Todo el vault está cifrado con AES-256-GCM |
| **Sin archivos temporales** | No se crean archivos temporales con datos sensibles |
| **Permisos de archivo** | Solo el propietario puede leer el archivo vault |

---

## Recomendaciones para el Usuario

### ✅ Contraseña Maestra Segura

- Mínimo 12 caracteres
- Mezcla de mayúsculas, minúsculas, números y símbolos
- No uses palabras del diccionario
- No reutilices esta contraseña en otros servicios

### ✅ Respaldos Regulares

1. Exporta el vault cifrado periódicamente
2. Guarda el respaldo en un lugar seguro
3. Considera cifrar el archivo de respaldo adicionalmente

### ⚠️ Nunca Hacer

- Compartir la Master Password
- Almacenar la Master Password digitalmente
- Usar la app en computadoras compartidas sin bloquear
- Ignorar las alertas de seguridad de la auditoría

---

## Auditoría de Contraseñas

La función de auditoría analiza:

1. **Compromiso** - ¿La contraseña aparece en filtraciones conocidas?
2. **Debilidad** - ¿Es vulnerable a ataques de diccionario?
3. **Patrones** - ¿Contiene secuencias predecibles?
4. **Entropía** - ¿Tiene suficiente aleatoriedad?

### Niveles de Alerta

| Nivel | Color | Significado |
|-------|-------|--------------|
| **Crítico** | Rojo | Contraseña comprometida o muy débil |
| **Advertencia** | Amarillo | Contraseña moderada o con patrones |
| **Aceptable** | Verde | Contraseña con entropía suficiente |

---

## Glosario de Seguridad

| Término | Definición |
|---------|-----------|
| **AES-256-GCM** | Estándar de cifrado avanzado con autenticación |
| **PBKDF2** | Función de derivación de clave basada en contraseña |
| **Sal** | Datos aleatorios para prevenir ataques de tabla arcoíris |
| **IV/Nonce** | Vector de inicialización para cifrado |
| **Entropía** | Medida de aleatoriedad/fortaleza |
| **Vault** | Archivo cifrado que contiene las contraseñas |

---

## Reporte de Vulnerabilidades

Si descubres una vulnerabilidad de seguridad, **NO** uses el tracker de GitHub. Contacta directamente al desarrollador.

---

**Última actualización**: Abril 2026