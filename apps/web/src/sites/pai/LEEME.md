# Rama `/pai` (Plan de Acción Institucional)

Aplicativo para que los responsables de cada proceso o proyecto reporten cada
bimestre el avance de sus indicadores del PAI, y para que Planeación
(administrador) haga el seguimiento, abra y cierre el bimestre, gestione
usuarios y asignaciones y otorgue autorizaciones. Lleva la plantilla de
Sapiencia (kit) y la cabecera y el pie del Observatorio, como `/tableros`.

El contrato de la API es `api-pai.ts`, **idéntico byte a byte** al de
`apps/server/src/pai/api-pai.ts` (la prueba `src/pai/api-pai.spec.ts` del
servidor lo comprueba): si cambia, copie el archivo completo al otro paquete.

| Archivo | Qué es |
| --- | --- |
| `PaiSitio.tsx` | La rama: plantilla, cabecera, sesión, barra, rutas y pie. |
| `rutas.ts` | Rutas de la rama (`/pai`, `/pai/indicadores/:codigo`, `/pai/cuenta`, `/pai/admin/...`), `rutaTablero(filtros)`, logos. |
| `pai.css` | Marco de la página, foco visible, barra, modal, correcciones generales del kit (botones en `input-group` y tablas sin los 164 px mínimos, casilla parcial, título de los modales) y el botón de accesibilidad en magenta (todo bajo `.pai`, clases `pai-…`). |
| `componentes/EstilosPai.tsx` | Hojas del kit y `src/compartido/plantilla/correcciones-plantilla.css` (las pruebas lo simulan). |
| `componentes/CabeceraPai.tsx`, `PiePai.tsx` | Cabecera y pie magenta del Observatorio. |
| `componentes/ModalPai.tsx` | Modal del kit dibujado por React: foco atrapado con oyentes en el documento (sigue funcionando si el control enfocado se deshabilita o desaparece), Escape, pila de modales (solo responde el de arriba) y foco de vuelta (o a `enfoqueFinal`). |
| `componentes/EstadoCarga.tsx`, `useTituloPai.ts` | Cargando / error y título de la pestaña. |
| `componentes/cambiosPendientes.ts`, `GuardiaCambios.tsx` | Registro de cambios sin guardar y de guardados en curso (`seguir`, `esperarGuardados`): la barra espera a que termine un guardado antes de cerrar la sesión, y GuardiaCambios pregunta antes de salir de la página (useBlocker: enlaces, Atrás, Adelante) y activa `beforeunload` mientras haya cambios. |
| `datos/clientePai.ts` | Cliente de la API: un método por endpoint, CSRF en memoria, 401 -> ingreso, 503 con reintento, subidas con progreso. |
| `datos/validacionPai.ts`, `errores.ts`, `useCarga.ts`, `formatos.ts` | Validación de respuestas, `ErrorPai`, carga con cancelación y formatos es-CO. |
| `sesion/contexto.ts` | Tipos y hooks de la sesión (`useSesionPai`, `useClientePai`). |
| `sesion/` | `ProveedorSesionPai` (verificando / error / anónima / activa / vencida; un 403 `prohibido` hace comprobar GET /sesion por si en otra pestaña entró otra persona; `generacion` sube al iniciar sesión y `useCarga` repite sola la carga que falló con 401; `vigenciaElegida`), `PuertaSesionPai`, `PaginaIngresoPai`, `CambioContrasenaObligatorio`, `PaginaCuenta`, `FormularioContrasena`, `textos.ts` y `sesion.css`. |
| `componentes/BarraPai.tsx`, `textoVigencia.ts`, `barra-pai.css` | Barra de navegación por rol, con el texto del bimestre abierto y, si hay más de una vigencia, el selector «Vigencia» que consultan todas las páginas. |
| `admin/` | Seguimiento, Usuarios (con `ModalUsuario` y el árbol de `ModalAsignaciones`), Bimestre, Autorizaciones, Registro y `SoloAdministrador`; lógica pura en `asignaciones.ts`, `autorizaciones.ts`, `contrasenaTemporal.ts`, `fechas.ts`, `registro.ts`, `seguimiento.ts`, `usuarios.ts`; estilos en `admin.css`. |
| `tablero/` | `PaginaTablero`, `BarraFiltros`, `ListaIndicadores`, `CasillaBimestre`, `useFiltrosPai`; lógica pura en `filtros.ts` (misma semántica que la exportación CSV del servidor), `presentacion.ts` (colores, textos y números es-CO) y `datosTablero.ts`; estilos en `tablero-pai.css`. |
| `modales/` | `ModalObservaciones`, `ModalEvidencias`, `PestanasBimestre`, `formularioObservaciones.ts` (lógica pura), `idsModales.ts`, `modales-pai.css`. |
| `ficha/` | `PaginaFichaIndicador` (`/pai/indicadores/:codigo`), `piezasReporte.tsx`, `ficha-pai.css`. |
| `paginas/NoEncontradoPai.tsx` | 404 de la rama. |
| `pruebas/` | `ProveedorSesionPrueba` y `datosPrueba.ts`: sesión de prueba para probar páginas sueltas. |
| `admin/pruebas/` | API simulada con estado (`apiSimulada.ts`: sesión, CSRF, 401/403 y rutas de administración), `datos.ts` y `renderizar.tsx` para el sitio completo. |
| `tablero/apiPruebaPai.ts`, `tablero/datosPruebaTablero.ts` | Solo para pruebas: `fetch` y XHR simulados para el tablero y los modales, y un tablero de ejemplo. |

Pruebas: simule `./componentes/EstilosPai` (React espera a que carguen las
hojas del kit y jsdom nunca las carga) y `fetch` (`vi.stubGlobal`). Para una
página suelta use `ProveedorSesionPrueba` de `pruebas/`; para el sitio
completo con sesión, la API simulada de `admin/pruebas/` o la de
`tablero/apiPruebaPai.ts`.

Las reglas (quién ve qué, qué casilla es editable, qué bimestre es 'futuro')
las decide el servidor: la interfaz usa las banderas `editables` / `motivos` /
`editable` y los `estados` que llegan en las respuestas y nunca las recalcula.
Un bimestre 'futuro' (aún no se reporta: viene después del abierto o, sin
abierto, del último ya terminado, y no tiene nada reportado) se pinta neutro
(borde punteado, «—», «aún no se reporta» para lectores de pantalla) y en el
seguimiento dice «Aún no se reporta», nunca «sin avance» ni avance bajo.

Detalles del tablero que conviene no romper:

- **Recargas en segundo plano** (`PaginaTablero.refrescar`): solo tras un
  409/403 o la primera evidencia de un bimestre. Si mientras tanto se guardó
  algo, la recarga se descarta y se pide otra (traería filas viejas). La
  casilla que espera el token de la primera evidencia lo espera antes del PUT
  (`tokenAlDia`).
- **Casilla** (`CasillaBimestre`): el PUT lleva el token con que se empezó a
  escribir (si llega otro valor, 409 en vez de pisarlo); el aviso del 409
  queda hasta que se vuelve a escribir o se pulsa Escape; mientras el PUT va
  en camino no cuenta como "sin guardar".
- **Filtro de estado**: la fila guardada se queda a la vista hasta que
  cambian los filtros.
- **Reportados**: el mismo texto en la cabecera de cada proceso y en el
  seguimiento (`admin/seguimiento.ts`, `textoReportados`: sobre los que tienen
  meta o ya reportaron; «Sin meta en el bimestre N» si no hay ninguno). Las
  barras del seguimiento usan el umbral del tablero (verde = 100 % de la meta)
  y tienen leyenda.
- **Modo oscuro**: la raíz `.pai` fija `data-bs-theme="light"`; las reglas
  oscuras solo con `.pai[data-bs-theme='dark']` (nunca la forma de ancestro).
  `estilos.test.ts` revisa el texto de las hojas (también las barras
  `progress` sin el `::before` del kit, la región aria-live de la casilla y el
  contraste de las ayudas y casillas marcadas); `vite.config.ts` deja pasar
  como texto (`?raw`) solo las hojas de esta rama.
