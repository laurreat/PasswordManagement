# LocalPass - Gestor de Contraseñas Seguro (Escritorio)

LocalPass es un gestor de contraseñas de alta seguridad diseñado para funcionar 100% offline. A diferencia de otros gestores, tus credenciales nunca salen de tu dispositivo y están protegidas con estándares de encriptación de grado militar.

**Esta es una aplicación de escritorio Electron.** Todo funciona de manera local en tu dispositivo:
- No requiere conexión a internet
- No utiliza navegadores ni servidores externos
- Los datos se almacenan localmente en tu computadora
- El archivo .exe portable o el instalador funcionan solos

## Características Principales

- **Total Privacidad (Diseño Air-Gapped):** Sin servidores, sin bases de datos en la nube, sin telemetría. Todo se procesa localmente en la aplicación de escritorio.
- **Encriptación AES-256-GCM:** Usa la API Web Crypto nativa del sistema para encriptar datos.
- **Derivación de Clave Robusta:** Implementa PBKDF2 con SHA-512 y 210,000 iteraciones para proteger tu Contraseña Maestra contra ataques de fuerza bruta.
- **Generador Local de Contraseñas:** Crea claves seguras con parámetros personalizables sin enviar datos a internet.
- **Auditoría de Seguridad:** Agente de seguridad determinista integrado que analiza la robustez de contraseñas y detecta patrones comunes localmente.
- **Gestión Inteligente de Conflictos:** Interfaz dedicada para resolver duplicados al importar o sincronizar vaults entre dispositivos.
- **Soporte Multilingüe:** Interfaz completa en inglés y español.
- **Auto-Bloqueo:** El vault se cierra automáticamente después de 10 minutos de inactividad para proteger tu sesión.

## Arquitectura de Seguridad

1. **Contraseña Maestra:** El usuario define una clave que nunca se almacena.
2. **Salt & IV:** Valores criptográficos aleatorios únicos se generan para cada sesión de guardado.
3. **Derivación:** PBKDF2 se usa para transformar la contraseña en un CryptoKey de 256 bits.
4. **Encriptación:** Los datos se transforman en un string JSON, se encriptan con AES-GCM, y se almacenan como un blob Base64 en un archivo local seguro en tu dispositivo.

## Stack Tecnológico

- **Escritorio:** Electron + Next.js 15 (App Router), React 19, Tailwind CSS.
- **Componentes UI:** Shadcn UI & Lucide Icons.
- **Seguridad:** Web Crypto API (Nativo del sistema).
- **Almacenamiento:** Archivo local encriptado (100% offline).

## Cómo Empezar

### Escritorio (Desarrollo)
1. Clona el repositorio.
2. Instala las dependencias: `npm install`.
3. Ejecuta el entorno de desarrollo: `npm run dev`.
4. La aplicación se abrirá en una ventana de Electron (Next.js en el puerto 9002).

> **Nota:** En desarrollo, la app usa Electron para simular el entorno de escritorio. En producción, usas el .exe portable o el instalador.

### Builds de Escritorio (Windows)
1. **Cierra** cualquier ventana de LocalPass o Electron que esté abierta (evita el error "Access is denied").
2. `npm run build`
3. En `dist/` tendrás:
   - **LocalPass-Setup-1.0.0.exe** — instalador (NSIS).
   - **LocalPass-1.0.0-portable.exe** — portable: un solo .exe, sin instalación, sin dependencias.
4. Tras añadir nuevas funciones, vuelve a ejecutar `npm run build` para que el portable y el instalador incluyan los últimos cambios.

---
**Nota de Seguridad:** LocalPass no tiene un mecanismo de "Recuperar Contraseña". Si olvidas tu Contraseña Maestra, tus datos son matemáticamente imposibles de recuperar. Respald a frecuentemente tus archivos .json vault encriptados.
