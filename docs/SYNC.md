# LocalPass — Sincronización entre dispositivos

> **Estado**: Fase 3 implementada (motor, sección Cambios y replicación en
> cadena); falta la prueba manual de la UI. Fases 4–6 pendientes: Linux, Android
> y distribución. Este documento describe el comportamiento actual del sync de
> escritorio.

LocalPass sincroniza una única bóveda cifrada entre Windows, Linux y Android
sin cuentas, sin servidores y sin que ningún tercero retenga datos. El
transporte es Syncthing, instalado por separado; la aplicación sólo mueve
sobres cifrados y nunca ve la red.

---

## 1. Principios

1. **Sin cuentas.** No hay registro, correo ni perfil hospedado. La identidad es
   un `deviceId` criptográfico generado localmente.
2. **Sin nube.** El transporte es entre dispositivos. Ningún servidor propio ni
   de terceros almacena la bóveda.
3. **La contraseña maestra nunca viaja.** Cada dispositivo descifra localmente.
4. **Nada se aplica solo.** El usuario decide cuándo guardar y cuándo cargar,
   incluso en la misma red.
5. **Sin auto-merge.** Si dos dispositivos editaron la misma cuenta, el
   conflicto es explícito.
6. **Formato estable.** El sobre cifrado sigue siendo `vaultVersion: 1.0`.

---

## 2. Topologías

| Escenario | Emparejamientos | Requisito |
|-----------|-----------------|-----------|
| Windows + Android | W ↔ A | El teléfono online durante la sesión de escritorio |
| Linux + Android | L ↔ A | Ídem |
| Dual boot sin partición | W ↔ A y A ↔ L, nunca W ↔ L | El teléfono online en **ambas** sesiones |
| Tres o más equipos | Todos contra un hub siempre encendido | Un equipo 24/7 (Raspberry Pi, NAS, router) |

En dual boot sólo corre un sistema a la vez, así que el teléfono es el único
nodo que puede sostener el estado intermedio. Si el teléfono está apagado
cuando Windows guarda, el cambio queda en Windows hasta la próxima sesión.

---

## 3. Modelo de cambios

Cada edición es un **cambio**, no una escritura directa del vault.

```
Edición en la UI
      │
      ▼
Borrador local (cifrado, NO se sincroniza)
      │  Guardar  ← sólo en el dispositivo de origen
      ▼
Entrada de cambio
      │
      ▼
changes-<deviceId>.enc.json  ──►  Syncthing  ──►  otros dispositivos
                                                        │
                                                        ▼
                                              "Cargar" (explícito)
```

### 3.1 Etiquetas

El botón depende de quién es el autor:

| Dispositivo | Entrada propia | Entrada ajena |
|-------------|----------------|---------------|
| Origen | **Guardar** | — |
| Destino | — | **Cargar** |

Se resuelve comparando el `deviceId` de la entrada con el local.

### 3.2 Borradores

- Persisten cifrados en el dispositivo y sobreviven al reinicio.
- No se sincronizan.
- Cerrar la aplicación con borradores pendientes muestra una advertencia.

### 3.3 Qué operaciones se publican

No toda escritura local es un cambio sincronizable. Se publican en el log
propio:

- Los borradores confirmados con **Guardar**.
- La remediación de una contraseña desde la auditoría.
- La importación CSV de cuentas nuevas.
- La resolución de un conflicto, incluso al conservar la versión local: la
  entrada sólo sube la revisión y deja constancia de que ese es el estado
  resuelto, para que los pares dejen de divergir.

**No se publica** la importación de una bóveda completa (`importVault`). Es una
migración local: las revisiones de sus cuentas vienen de otro dispositivo y se
cargan tal cual. Publicarla como cambio rompería la serie de revisiones local y
generaría conflictos falsos. Para replicar esa bóveda, cada dispositivo debe
importarla o reconstruirse desde un baseline.

Regla de fallo: la bóveda local se guarda primero. Si después falla la escritura
del log, el cambio queda aplicado en este dispositivo y se avisa al usuario de
que no se publicó para los demás; la bóveda no se revierte.

---

## 4. Entrada de cambio

| Campo | Función |
|-------|---------|
| `changeId` | Identificador único; hace la aplicación idempotente |
| `deviceId` | Autor; define la etiqueta Guardar/Cargar |
| `seq` | Entero monotónico por dispositivo; ordena y deduplica |
| `createdAt` | Hora informativa, no ordena |
| `type` | `create`, `update` o `delete` |
| `accountKey` | `sitio + usuario`, en minúsculas |
| `baseRevision` | Revisión de la cuenta sobre la que se hizo el cambio |
| `before` / `after` | Valores anteriores y nuevos, incluidos passwords |
| `originDeviceId` / `originSeq` | Autor y secuencia originales, sólo en entradas replicadas |

### 4.1 Regla de conflicto

Cada cuenta lleva un contador `revision`. Al cargar:

- `baseRevision === revision` → se aplica y la revisión sube.
- `baseRevision !== revision` → **conflicto explícito**. Se abre el resolvedor
  existente; nunca se elige por el usuario.

Sin esta regla, dos dispositivos que editan la misma cuenta sin conexión
producen dos entradas y la segunda pisa la primera en silencio.

### 4.2 Borrados

Borrar es una entrada `delete`, no una ausencia. Si se infiere el borrado por
ausencia, el merge resucita la cuenta desde cualquier dispositivo que todavía
la tenga.

### 4.3 Baseline

La primera vez que se habilita sync, el dispositivo escribe una entrada
`baseline` con la bóveda completa. Un dispositivo nuevo se reconstruye desde
ahí y luego aplica el resto del log.

### 4.4 Sin poda

El log no se compacta en esta fase. Cientos de cambios ocupan kilobytes
cifrados. Si el tamaño se vuelve un problema, se agrega compactación con
consenso de cursores.

### 4.5 Replicación en cadena

En la topología Windows → Android → Linux, Linux no lee el archivo de Windows.
Cuando Android **Carga** un cambio de Windows, además de aplicarlo lo
re-publica en su propio log con un `seq` nuevo. Esa copia conserva el autor
original en `originDeviceId` y `originSeq`.

- El dispositivo de origen reconoce su propio cambio y no lo vuelve a aplicar.
- Un peer que ya aplicó el original —directamente o por otro relay— lo salta
  por el cursor del autor original.
- El cambio replicado se marca con el dispositivo que lo publicó, pero el
  cursor de deduplicación sigue al autor real.

Esto permite que Linux reconstruya el estado desde el baseline de Android y
aplique después los cambios replicados, sin duplicados ni conflictos falsos.

---

## 5. Archivos

```
<carpeta sincronizada>/
  changes-<deviceId>.enc.json
```

- **Un escritor por archivo.** Ningún archivo lo escriben dos dispositivos, así
  que Syncthing no genera `.sync-conflict`.
- Mismo sobre que el vault: `salt`, `iv`, `data`, `vaultVersion`.
- Salt e IV nuevos en cada escritura.
- Escritura atómica: `.tmp` + `rename`, con `.bak` de la versión anterior.

### 5.1 Ruta de archivo y content URI

En Windows y Linux la carpeta de sync es una ruta real y el proceso principal
escribe con `.tmp` + `rename` + `.bak`. En Android no existe una ruta
equivalente: el usuario elige la carpeta con el Storage Access Framework y la
app recibe un *content URI* que conserva el permiso entre reinicios.

Consecuencias prácticas:

- La carpeta se elige una vez. Si el usuario cancela el selector, se mantiene la
  anterior, igual que en el diálogo de Electron.
- No hay `.bak`: el proveedor puede no soportar renombrar. La escritura usa un
  archivo temporal y, si el rename falla, reescribe en el lugar.
- Sin permiso de almacenamiento amplio: la app sólo ve el árbol que el usuario
  autorizó.
- Sigue siendo un dispositivo, un log. Dos copias de la app en el mismo teléfono
  no son un caso soportado.

---

## 6. Interfaz

Sección **Cambios**, con tres vistas:

1. **Por guardar** — borradores locales. Acción: Guardar.
2. **Por cargar** — entradas de otros dispositivos. Acción: Cargar.
3. **Historial** — cambios de cuenta aplicados, con tipo, hora, origen y
   detalle antes/después.

Detalles:

- El historial se guarda **cifrado dentro del vault**, no depende de que el sync
  esté activo y cubre cambios locales, remotos e importaciones. Las entradas
  que ya existían en el log de sync se rellenan al leerlo.
- Por defecto se muestran los cambios de los **últimos 3 días**. Los anteriores
  quedan ocultos, no se borran, y se pueden mostrar manualmente con
  **Mostrar antiguos**.
- Cada entrada conserva los valores anteriores y nuevos de sitio, usuario,
  contraseña y notas. La contraseña se muestra enmascarada hasta pulsar
  **Mostrar contraseña**.
- Badge en el navbar con el total pendiente.
- Con la bóveda cerrada la sección está deshabilitada: sin contraseña maestra en
  memoria no se puede descifrar nada.
- Al cargar se muestra un resumen: cuentas nuevas, modificadas, borradas y
  conflictos.
- Preview previo sólo cuando hay conflicto o borrado.
- Traducciones en los cinco idiomas existentes.

---

## 7. Ejemplo completo

Windows cambia la contraseña de GitHub:

1. El usuario edita la cuenta. Se crea un borrador; el vault no cambia.
2. Pulsa **Guardar**. Se crea la entrada `seq: 14`, `baseRevision: 7`, y se
   aplica localmente. La revisión pasa a 8.
3. Syncthing copia `changes-<windows>.enc.json` a Android.
4. Android muestra en **Por cargar**:
   `GitHub · contraseña modificada · 14:32 · Windows`.
5. El usuario pulsa **Cargar**. Se descifra, se valida `baseRevision 7 === 7`,
   se aplica y la revisión local pasa a 8.
6. Android escribe su propio archivo. Linux carga desde Android, no desde
   Windows.

Si Linux hubiera editado GitHub antes del paso 5, su `baseRevision` sería 7 y
la revisión local 8: conflicto visible en lugar de una pisada silenciosa.

---

## 8. Seguridad

- Sólo se sincronizan sobres cifrados. Ni Syncthing ni el disco ven passwords.
- AES-256-GCM autentica: un archivo alterado falla y se reporta como tal.
- `seq` + cursor por dispositivo impiden aplicar dos veces o aceptar un archivo
  viejo.
- La contraseña maestra debe ser **idéntica** en todos los dispositivos. Si se
  olvida, no hay recuperación: es el precio de que nadie más pueda leerla.
- Syncthing ve metadatos: IDs de dispositivo, IPs, tamaños y horarios. No ve
  contenido.
- Cada dispositivo sincronizado es una puerta: malware o un keylogger captura
  la contraseña maestra al desbloquear.

---

## 9. Límites conocidos

- **Manual por diseño.** Un cambio en la cadena Windows → Android → Linux
  requiere dos acciones de carga.
- **El teléfono debe estar despierto** durante ambas sesiones de escritorio.
- **Doze** puede retrasar el transporte; conviene Syncthing-Fork con batería sin
  restricciones.
- **El log crece** hasta que exista compactación.
- **La hora mostrada** depende del reloj del dispositivo; el orden real es por
  `seq`.
- **Sin Syncthing no hay sync.** La aplicación funciona igual, en modo local.

---

## 10. Instalación del transporte

| Plataforma | Cliente | Notas |
|------------|---------|-------|
| Windows | Syncthing nativo | Inicio automático; watch for changes |
| Linux | Syncthing + `systemd --user` | Arranca con la sesión |
| Android | Syncthing-Fork | Batería sin restricciones; carpeta vía SAF |

Reglas:

- Emparejar por device ID o QR. Sin cuentas.
- No poner la carpeta en Google Drive, OneDrive ni Dropbox: eso sí es retención
  de un tercero.
- En Android, `allowBackup="false"` para que el sobre no termine en un backup
  de Google.
- No compartir la carpeta con dispositivos ajenos.

---

## 11. Fases

| Fase | Contenido |
|------|-----------|
| 0 | Licencia, CI, documentación de seguridad |
| 1 | Dominio de cambios y tests |
| 2 | Bóveda en archivo, borradores, primera ejecución |
| 3 | Motor de sync y sección Cambios |
| 4 | Linux: AppImage y `.deb` |
| 5 | Android: Capacitor y SAF |
| 6 | Distribución y firma |

---

**Última actualización**: Octubre 2026
