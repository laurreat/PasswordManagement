# LocalPass — Roadmap

---

## v1.1.0 — Actual (2026-10-28)

### Completado

- [x] Generador con CSPRNG y muestreo sin sesgo
- [x] Errores tipados del vault y de la importación
- [x] Auditoría local determinista con mapeo a frameworks
- [x] Recomendaciones por cuenta (reutilización, similitud, patrones)
- [x] Tipografías self-hosted
- [x] CSP y aislamiento de Electron
- [x] Eliminación de Genkit, Firebase y dependencias de nube
- [x] Next.js 16.4.3, React 19.3.1, Electron 45.1.0
- [x] Portugués, francés y chino
- [x] Tests unitarios de los módulos puros

---

## v1.2.0 — Corto plazo

### Producto

- [ ] Autofill en aplicaciones de escritorio (sin red)
- [ ] Atajos de teclado personalizables
- [ ] Categorías y favoritos
- [ ] Búsqueda y filtros avanzados
- [ ] Historial de contraseñas por cuenta

### Experiencia

- [ ] Indicadores de fortaleza en tiempo real
- [ ] Tutorial interactivo para nuevos usuarios
- [ ] Exportación de reporte de auditoría a PDF local

### Backup

- [ ] Backup automático cifrado en una carpeta local configurable
- [ ] Recordatorio de backup sin conexión

---

## v1.3.0 — Sync multiplataforma (en curso)

### Alcance

- [ ] Registro de cambios por dispositivo con confirmación explícita
      (**Guardar** en el origen, **Cargar** en el destino)
- [ ] Bóveda en archivo con escritura atómica y borradores persistentes
- [ ] Empaquetado Linux: AppImage y `.deb`
- [ ] Cliente Android sobre Capacitor con acceso SAF
- [ ] Detección de Syncthing por loopback y guía de emparejamiento

### Fuera de esta versión

- Servicio de sync propio, cuentas o relay
- macOS: requiere notarización y se evalúa aparte

---

## v2.0.0 — Largo plazo

### Multiplataforma

- [ ] Soporte macOS (requiere notarización)
- [ ] Firma de código en Windows y Android

### Portabilidad de datos

- [ ] Importar vault desde QR (sin red)
- [ ] Exportación cifrada entre dispositivos mediante archivo
- [ ] Historial de importaciones

### Acceso

- [ ] Biometría local (huella/rostro) cuando el SO la exponga
- [ ] Claves de acceso (WebAuthn/FIDO2) con verificación local

---

## No planificado

- Sincronización cloud
- Cuentas, registro o relay propio
- Alertas por correo o SMS
- Telemetría
- Auditoría con servicios de IA remotos
- Recuperación de contraseña maestra
- Cualquier conexión saliente a internet

Estas exclusiones son parte del diseño: LocalPass no debe necesitar internet ni
enviar datos a terceros.

La única excepción es el loopback (`127.0.0.1`) hacia Syncthing, que el usuario
instala por separado y que sólo transporta el archivo cifrado. El renderer no
tiene acceso a ninguna red: la consulta de estado ocurre en el proceso
principal.

---

## Notas

Las prioridades pueden cambiar según feedback de usuarios y evaluación de
seguridad. Las propuestas deben respetar el principio offline.

---

**Última actualización**: Octubre 2026
