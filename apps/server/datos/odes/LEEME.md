# datos/odes — índice del repositorio para el Asistente ODES

| Archivo | Qué es | ¿En git? |
| --- | --- | --- |
| `indice.sqlite` | Índice SQLite FTS5 que lee el servidor (solo lectura). Lo genera `npm run odes:indexar` o el botón "Reindexar" de la administración. Va en git porque la imagen de Docker se construye desde el repositorio: después de cambiar documentos, reindexar, hacer commit y volver a construir. | Sí |
| `indice.sqlite.lock` | Cerrojo mientras corre una indexación (solo una a la vez). Se borra al terminar; uno abandonado se reemplaza solo. | No |
| `cache/` | Texto ya extraído (pdftotext, OCR, XML de Office) por sha256 de cada archivo. Reindexar sin cambios tarda segundos y, con la base, no descarga ningún archivo. | No |
| `evaluacion-busqueda.json` | Casos para medir la búsqueda con `npm run odes:evaluar-busqueda`. | Sí |

## Fuentes

El indexador lee los documentos de una de dos fuentes (`--fuente` u `ODES_FUENTE`):

| Fuente | Qué lee | Enlaces ("Ver documento") | Miniaturas |
| --- | --- | --- | --- |
| `mysql` (por defecto si `REPOSITORIO_MYSQL_*` está configurada) | La base de la rama `/repositorio`: **solo los documentos publicados** y sus archivos guardados en la base. | La copia propia, `/api/repositorio/documentos/<id>/ver` (inline: `#page=N` abre el PDF en la página citada); sin archivo, la URL externa (Power BI, blog, OneDrive). | `/api/repositorio/documentos/<id>/miniatura?v=<versión>` (desde la base). |
| `paquete` | El paquete de datos (`repositorio.json`, `documentos/`, `portadas/`). | La URL original del paquete (`url_ver`). | `/odes/portadas/<id>.webp` (`--miniaturas` las genera). |

Con la base, los archivos se copian a una carpeta temporal **solo si hay que
extraerles el texto** (si la caché ya tiene su sha256, no se pide nada) y se
borran al terminar con cada documento. Un documento despublicado durante la
indexación no entra. Si la base deja de responder a mitad de camino, la
indexación se detiene y el índice anterior queda intacto.

La interfaz usa la miniatura de la base y, si no carga, la de
`/odes/portadas/<id>.webp` (que sigue en git) y luego un icono.

## Generar el índice

Desde `apps/server` (en desarrollo; en la VM, ver [Despliegue](#despliegue)):

```bash
# Desde la base del repositorio (REPOSITORIO_MYSQL_* en apps/server/.env)
npm run odes:indexar
# Desde el paquete de datos
npm run odes:indexar -- --paquete ../../../../Septiembre/observatorio/repositorio-datos --miniaturas
npm run odes:evaluar-busqueda
```

- `--fuente mysql|paquete` (o `ODES_FUENTE`). Sin ella: `paquete` si se da
  `--paquete`; si no, `mysql` cuando la base está configurada; si no,
  `paquete` con `ODES_PAQUETE`.
- `--paquete` (o `ODES_PAQUETE`): carpeta con `repositorio.json`, `documentos/` y `portadas/`. Solo se lee.
- `--miniaturas` (solo paquete): genera las miniaturas WebP de 192 px en `apps/web/public/odes/portadas/` (se versionan).
- `--solo-metadatos`: solo fichas, sin extraer texto (segundos, sin herramientas externas).
- `--permitir-fallos`: escribe el índice aunque falle la extracción de más de
  la mitad de los archivos (por defecto no se reemplaza el índice: protege de
  publicar uno sin texto).
- Otras: `--indice`, `--cache <carpeta>`, `--sin-ocr`, `--max-ocr <n>`, `--concurrencia <n>`, `--sin-cache`, `--resultado <archivo.json>`, `--ayuda`.

Códigos de salida: 0 bien, 1 error, 2 uso o configuración, 3 faltan
herramientas, 75 ya hay otra indexación en curso, 143 cancelada.

Herramientas necesarias **solo en la máquina que indexa** (el servidor web no
las usa para servir): poppler (`pdftotext`, `pdftoppm`, `pdfinfo`),
`tesseract` con los idiomas `spa` y `eng`, `unzip` y, con `--miniaturas`,
`cwebp`. Se comprueban antes de empezar; si falta alguna, el índice no se toca
y el mensaje dice qué instalar.

```bash
# Ubuntu/Debian
sudo apt-get install poppler-utils tesseract-ocr tesseract-ocr-spa unzip   # + webp para --miniaturas
# macOS (Homebrew)
brew install poppler tesseract tesseract-lang
```

El índice se escribe en un temporal y se renombra (atómico). Un servidor en
marcha lo detecta y lo recarga solo en menos de un minuto, sin reiniciar (al
reindexar desde la administración, de inmediato).

## Reindexar desde la administración

En `/repositorio/admin`, después de agregar, editar, publicar o retirar
documentos. La API (con la sesión de administración; el POST lleva
`X-CSRF-Token`) está en `src/odes/chat/protocolo.ts` (`EstadoIndiceAdmin`):

| Ruta | Qué hace |
| --- | --- |
| `GET /api/repositorio/admin/odes/indice` | Fecha, origen y conteos del índice; publicados en la base y si cambiaron desde el índice (`repositorio.cambiado`, `motivo`); estado de la última reindexación (en curso, completada o fallida con su motivo, y las últimas líneas del registro). |
| `POST /api/repositorio/admin/odes/reindexar` | 202: lanza `dist/odes/cli/indexar.js --fuente mysql` como proceso hijo (prioridad baja). 409 si ya hay una en curso (también si la lanzó `npm run odes:indexar`) o si el indexador no está compilado. |

Viven bajo `/api/repositorio/admin` porque la cookie de la sesión tiene
`Path=/api/repositorio/admin`. Sin sesión: 401; sin token CSRF o desde otro
sitio: 403; sin base: 503.

La máquina del servidor necesita las mismas herramientas de arriba. Si
faltan, la reindexación falla con ese mensaje en el estado y el índice
anterior sigue en uso. Opcional: `ODES_REINDEXAR_CONCURRENCIA` (por defecto
la mitad de los núcleos) y `ODES_REINDEXAR_TIMEOUT_MINUTOS` (60).

## Despliegue

Con la base del repositorio en la VM basta con instalar las herramientas y
usar "Reindexar" (o, en la VM, `cd /opt/sapiencia-web/apps/server && sudo -u sapiencia node dist/odes/cli/indexar.js`:
no recompila; como `sapiencia` porque `.env` solo lo lee ese usuario y
porque, corrido como root, dejaría `indice.sqlite`, `cache/` y el cerrojo
con dueño root y el servicio no podría reemplazarlos).
También se puede generar `indice.sqlite` en otra máquina con acceso a la base
y copiarlo a `apps/server/datos/odes/indice.sqlite` (o donde diga
`ODES_INDICE`). El servidor necesita Node 24.15+ (o 22.22.3+); `node:sqlite`
viene incluido. Sin índice el servidor arranca igual: el repositorio queda
"no disponible" y lo avisa una vez en el registro.

Nota: `npm run odes:indexar` compila antes (`nest build`, que borra y rehace
`dist/`): es para desarrollo. En la VM, si el servidor corre desde `dist/`,
use `sudo -u sapiencia node dist/odes/cli/indexar.js` o el botón de la
administración.

## Esquema

Versión 1 (`src/odes/repositorio/esquema-indice.ts`). La columna
`documentos.url_miniatura` y las claves de meta `fuente_tipo` y
`huella_fuente` son opcionales: un índice anterior se sigue leyendo (sin
miniaturas de la base) y un servidor anterior ignora las nuevas.

## Variables de entorno

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `ODES_INDICE` | `datos/odes/indice.sqlite` | Archivo del índice. Relativa = contra `apps/server`. Si la carpeta no existe, el indexador la crea. |
| `ODES_URL_DOCUMENTO` | vacío (el enlace del índice) | Plantilla del enlace de los documentos con archivo propio, con `{id}` y/o `{url_ver}`. No hace falta reindexar. |
| `ODES_FUENTE` | `mysql` si hay base, si no `paquete` | Solo el indexador: de dónde lee. |
| `ODES_PAQUETE` | — | Solo el indexador (fuente paquete): carpeta del paquete. |
| `ODES_REINDEXAR_CONCURRENCIA` | mitad de los núcleos | Reindexación desde la administración: procesos externos a la vez. |
| `ODES_REINDEXAR_TIMEOUT_MINUTOS` | `60` | Reindexación desde la administración: tiempo máximo. |
