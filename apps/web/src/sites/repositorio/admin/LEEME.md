# Administración del repositorio (`/repositorio/admin`)

Aquí se agregan, editan, publican, despublican y borran los documentos del
Repositorio de Productos, con su archivo y su portada, sin tocar código. Habla
solo con la API de administración (`/api/repositorio/admin/*`, contrato en
`../api-repositorio.ts`) y se carga en un chunk aparte: nada de esto llega a
la página pública, y pdf.js solo se descarga al generar una portada.

## Rutas

| Ruta | Página |
| ---- | ------ |
| `/repositorio/admin` | Documentos: búsqueda, filtros, orden, 50 por página, publicar/despublicar (`?categoria=` y `?clave=` = categoría o palabra clave exacta, desde sus páginas) |
| `/repositorio/admin/documentos/nuevo` | Nuevo documento (se crea despublicado) |
| `/repositorio/admin/documentos/:id` | Editar: datos, palabras clave, archivo, portada, vista previa, estado, borrar |
| `/repositorio/admin/categorias` | Crear, renombrar, ordenar y borrar categorías |
| `/repositorio/admin/palabras-clave` | Palabras clave con su uso: renombrar/unir y borrar las que no se usan |
| `/repositorio/admin/cambios` | Registro de cambios (`?documento=<id>` = historial de un documento) |
| `/repositorio/admin/asistente` | Índice del Asistente ODES y botón "Reindexar" (contrato en `../../odes/chat/protocolo.ts`) |

## Archivos

```
admin/
├── AdminRepositorio.tsx     raíz: sesión, avisos, barra "Administración", rutas, <main id="contenido">
├── admin.css                estilos (clases ra-*, sobre los tokens y clases rp-* de repositorio.css)
├── rutasAdmin.ts            rutas de la administración
├── sesion/                  ProveedorSesion (GET /sesion, iniciar, cerrar, "vencida"), PaginaIngreso
├── datos/                   ClienteAdmin (fetch + XHR para subir), errores, validación de respuestas, formatos, useCarga
├── componentes/             Campo (etiqueta/ayuda/error), Dialogo (<dialog> modal), Avisos, cambios pendientes, íconos
├── documentos/              listado (TS puro), PaginaDocumentos, formulario (TS puro), PaginaDocumento,
│                            CampoClaves (combobox), SubidaArchivo, EditorPortada, DialogoBorrar, revisiones
├── portada/                 composicion.ts (TS puro, port de portada.py), generarPortada.ts (canvas), pdf.ts (pdf.js)
├── catalogos/               categorías, palabras clave, registro de cambios
├── odes/                    índice del Asistente ODES
└── pruebas/                 API simulada (fetch y XHR) y utilidades de las pruebas
```

## Sesión y seguridad

- Al entrar se pide `GET /sesion`. Sin sesión se muestra el inicio de sesión
  **en la misma URL**: al entrar se llega a la página pedida.
- Formulario real (`method="post"`, `autocomplete="username"` y
  `"current-password"`) para que los gestores de contraseñas funcionen.
  Mensaje genérico con 401; con 429, "Espere N minutos" según `Retry-After`.
- Cookie `HttpOnly` (la pone el servidor) y `fetch` del mismo origen con
  `credentials: 'same-origin'`. Toda petición que cambia algo lleva
  `X-CSRF-Token` con el `csrf` de la sesión, que vive solo en memoria.
- Un 401 en cualquier petición muestra "Su sesión venció" sin desmontar la
  página: al volver a entrar, lo que se estaba editando sigue ahí.
- Cambios sin guardar: salir de la página (enlace, Atrás, cerrar la pestaña)
  o cerrar la sesión pide confirmación.

## Formulario de un documento

- Todos los campos de `DatosDocumento`, con etiqueta, ayuda, contador y
  error junto al campo (también los `campos` que devuelve el servidor) y un
  resumen de errores con enlaces al campo.
- Reglas de `formulario.ts`, las mismas del servidor: título obligatorio,
  largos, año 1900–2100 o vacío ("S. F."), mes solo con año, URL http(s),
  tableros y entradas con URL externa y sin descarga, máximo 7 palabras
  clave.
- Palabras clave: combobox con sugerencias de las existentes; si se escribe
  una que ya existe con otras tildes o mayúsculas, se usa la forma existente.
- Archivo: arrastrar o elegir; antes de subir se revisan tipo (PDF, PNG,
  JPEG, DOCX, PPTX) y tamaño (80 MB). Se sube al guardar, con progreso (XHR).
- Tableros y entradas de blog no llevan archivo propio: «Ver» abre la URL
  externa (en la vista previa y en la API pública). Al pasar a ese tipo se
  descarta el archivo elegido y aún sin subir (con un aviso); si el documento
  ya tenía uno, se avisa que no se publica y que se puede quitar.
- "Guardar" aplica en orden: datos (POST/PUT), quitar archivo, subir
  archivo, subir portada (y publicar, con "Guardar y publicar").
- Vista previa en vivo con la tarjeta de la página pública
  (`componentes/TarjetaDocumento`, prop `urlPortadaLocal` para la portada
  aún no guardada).
- Barra fija «Guardar cambios»: su alto se mide en `--ra-alto-barra` y
  `admin.css` lo reserva con `scroll-padding-bottom`, para que el campo que
  se enfoca con el teclado (o desde el resumen de errores) no quede tapado.
- Borrado definitivo solo de documentos despublicados, escribiendo su
  identificador.

## Portadas

Al elegir un PDF para un documento sin portada, la portada se genera sola;
también con "Generar desde el PDF" (el PDF nuevo o el guardado) o "Usar una
imagen…" (una imagen cuadrada se usa tal cual, llevada a 720 px).

- pdf.js rasteriza la primera página a 1400 px de ancho, como el paquete.
- `composicion.ts` es un port exacto de `portada.py` (Pillow) con la regla
  del LEEME del paquete: página entera centrada con margen del 6 % y sombra,
  fondo = la misma página desenfocada 36 px y mezclada al 45 % con #f7f7f7,
  recorte desde arriba de las páginas de más de 1,42 de alto por 1 de ancho.
  Con la misma página de entrada da los mismos píxeles que Pillow (las
  pruebas lo comprueban con huellas sha256).
- JPEG 720 × 720 calidad 80 y miniatura WebP 192 × 192 (PNG si el navegador
  no codifica WebP; el servidor acepta las dos).
- CSP de producción: el worker de pdf.js y sus recursos (wasm de JPEG 2000 y
  JBIG2, fuentes Symbol y ZapfDingbats) salen del propio sitio con su URL de
  Vite; pdf.js 6 ya no usa `eval` (no existe la opción `isEvalSupported`).

Diferencia conocida con las portadas del paquete: pdf.js convierte los
colores CMYK sin perfil ICC (poppler sí usa uno), así que las páginas con
colores CMYK salen un poco más claras. Para usar el perfil haría falta servir
`pdfjs-dist/wasm/` e `iccs/` sin hash (como `/sivu/draco/`) y abrir los PDF
con `useWorkerFetch: true`, `wasmUrl` e `iccUrl`.

## Pruebas

`npm test` incluye, con `fetch` y XHR simulados (`pruebas/apiSimulada.ts`):
sesión (ingreso, 429, ruta conservada, cierre, 401 trabajando), cabecera
CSRF en las mutaciones, validación y errores del servidor por campo, reglas
de tipo, límite de palabras clave, tipo de archivo rechazado, portada
automática (módulo simulado), borrado con confirmación, cambios sin guardar,
listado, categorías, palabras clave, registro, Asistente ODES, y la
composición de la portada (geometría y píxeles iguales a Pillow).
