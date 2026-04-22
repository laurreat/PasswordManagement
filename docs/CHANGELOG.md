# LocalPass - Changelog

Todos los cambios significativos de este proyecto se documentarán en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

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

## Notas de Versión Futura

### Planeado para v1.1

- [ ] Autofill en aplicaciones de escritorio
- [ ] Atajos de teclado personalizables
- [ ] Categorías para organizar cuentas
- [ ] Marcadores/favoritos

### Planeado para v1.2

- [ ] Backup automático cifrado
- [ ] Alertas de cambios en filtraciones
- [ ] Widget de menú del sistema

### Planeado para v2.0

- [ ] Soporte macOS
- [ ] Soporte Linux
- [ ] Sincronización WiFi local entre dispositivos

---

## Releases Anteriores

No hay releases públicos anteriores a esta versión.

---

**Herramienta de versionado**: [Standard Version](https://github.com/conventional-changelog/standard-version)