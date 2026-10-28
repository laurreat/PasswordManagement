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

## v2.0.0 — Largo plazo

### Multiplataforma

- [ ] Soporte macOS
- [ ] Soporte Linux
- [ ] Build portable para Linux

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
- Alertas por correo o SMS
- Telemetría
- Auditoría con servicios de IA remotos
- Recuperación de contraseña maestra
- Cualquier función que requiera una conexión de red

Estas exclusiones son parte del diseño: LocalPass no debe necesitar internet ni
enviar datos a terceros.

---

## Notas

Las prioridades pueden cambiar según feedback de usuarios y evaluación de
seguridad. Las propuestas deben respetar el principio offline.

---

**Última actualización**: Octubre 2026
