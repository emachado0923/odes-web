/**
 * Listado de documentos de la administración: búsqueda (la misma de la
 * página pública, más el identificador), filtros, conteos, orden por
 * columnas, 50 por página y acciones rápidas (editar, publicar/despublicar).
 *
 * Tabla accesible: <caption>, encabezados con aria-sort y botones de orden;
 * en pantallas angostas se ocultan columnas y sus datos pasan a una línea
 * bajo el título.
 */
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { CategoriaAdmin, DocumentoAdmin } from '../../api-repositorio'
import { urlSegura } from '../../datos/enlaces'
import { useAvisar } from '../componentes/avisar'
import Icono from '../componentes/IconoAdmin'
import { Cargando, ErrorCarga, TituloPagina } from '../componentes/Pagina'
import { esErrorAdmin, mensajeDe } from '../datos/clienteAdmin'
import { cantidad, fechaCorta, nombreTipo } from '../datos/formatos'
import { useCarga } from '../datos/useCarga'
import { RUTA_NUEVO, rutaDocumento } from '../rutasAdmin'
import { useCliente } from '../sesion/contexto'
import {
  FILTROS_INICIALES,
  TEXTOS_FALTA,
  filtrarDocumentos,
  hayFiltros,
  indexarAdmin,
  paginar,
  resumir,
  tieneDestino,
  type Direccion,
  type Falta,
  type FiltrosAdmin,
  type OrdenAdmin,
} from './listado'
import { useFiltrosUrl } from './useFiltrosUrl'

interface Datos {
  documentos: DocumentoAdmin[]
  categorias: CategoriaAdmin[]
}

/** Dirección con la que empieza cada columna al pulsarla. */
const DIRECCION_INICIAL: Record<OrdenAdmin, Direccion> = {
  relevancia: 'asc',
  posicion: 'asc',
  titulo: 'asc',
  categoria: 'asc',
  anio: 'desc',
  estado: 'desc',
  actualizado: 'desc',
}

export default function PaginaDocumentos() {
  const cliente = useCliente()
  const { estado, recargar, setDatos } = useCarga<Datos>(
    async (signal) => {
      const [documentos, categorias] = await Promise.all([
        cliente.listarDocumentos(signal),
        cliente.listarCategorias(signal),
      ])
      return { documentos, categorias }
    },
    'documentos',
  )

  return (
    <div className="ra-pagina">
      <div className="ra-encabezado">
        <TituloPagina documento="Documentos">Documentos</TituloPagina>
        <Link className="rp-boton" to={RUTA_NUEVO}>
          <Icono nombre="agregar" />
          Nuevo documento
        </Link>
      </div>
      {estado.fase === 'cargando' && <Cargando texto="Cargando documentos…" />}
      {estado.fase === 'error' && (
        <ErrorCarga titulo="No se pudieron cargar los documentos" mensaje={estado.mensaje} onReintentar={recargar} />
      )}
      {estado.fase === 'listo' && (
        <Listado
          datos={estado.datos}
          onActualizado={(doc) =>
            setDatos((d) => ({ ...d, documentos: d.documentos.map((x) => (x.id === doc.id ? doc : x)) }))
          }
        />
      )}
    </div>
  )
}

function Listado({ datos, onActualizado }: { datos: Datos; onActualizado: (doc: DocumentoAdmin) => void }) {
  const cliente = useCliente()
  const avisar = useAvisar()
  const id = useId()
  const [filtros, cambiar] = useFiltrosUrl()
  const indice = useMemo(() => indexarAdmin(datos.documentos), [datos.documentos])
  // La búsqueda puede tardar unos milisegundos con 372+ documentos: el campo no espera.
  const q = useDeferredValue(filtros.q)
  const filas = useMemo(() => filtrarDocumentos(indice, { ...filtros, q }), [indice, filtros, q])
  const pagina = paginar(filas, filtros.pagina)
  const resumen = useMemo(() => resumir(datos.documentos), [datos.documentos])
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const refCaption = useRef<HTMLTableCaptionElement>(null)
  const cambioPagina = useRef(false)
  const conteo = useConteoPausado(filas.length, datos.documentos.length, hayFiltros(filtros))

  const categorias = useMemo(() => {
    const nombres = datos.categorias.map((c) => c.nombre)
    for (const d of datos.documentos) if (!nombres.includes(d.categoria)) nombres.push(d.categoria)
    return nombres
  }, [datos])

  useEffect(() => {
    if (!cambioPagina.current) return
    cambioPagina.current = false
    refCaption.current?.focus()
  }, [pagina.pagina])

  function irAPagina(n: number) {
    cambioPagina.current = true
    cambiar({ pagina: n })
  }

  function ordenarPor(columna: OrdenAdmin) {
    const actual = filtros.orden ?? (filtros.q.trim() ? 'relevancia' : 'posicion')
    if (actual === columna) {
      const dir = filtros.orden ? filtros.dir : DIRECCION_INICIAL[columna]
      cambiar({ orden: columna, dir: dir === 'asc' ? 'desc' : 'asc' })
    } else {
      cambiar({ orden: columna, dir: DIRECCION_INICIAL[columna] })
    }
  }

  function ordenDe(columna: OrdenAdmin): 'ascending' | 'descending' | undefined {
    const actual = filtros.orden ?? (filtros.q.trim() ? 'relevancia' : 'posicion')
    if (actual !== columna) return undefined
    const dir = filtros.orden ? filtros.dir : 'asc'
    return dir === 'asc' ? 'ascending' : 'descending'
  }

  async function alternar(doc: DocumentoAdmin) {
    setOcupado(doc.id)
    setErrorAccion(null)
    try {
      const nuevo = await cliente.publicar(doc.id, !doc.publicado)
      onActualizado(nuevo)
      avisar(`«${nuevo.titulo}» ${nuevo.publicado ? 'quedó publicado' : 'quedó despublicado'}.`)
    } catch (e) {
      if (!(esErrorAdmin(e) && e.estado === 401)) {
        setErrorAccion(`No se pudo ${doc.publicado ? 'despublicar' : 'publicar'} «${doc.titulo}». ${mensajeDe(e)}`)
      }
    } finally {
      setOcupado(null)
    }
  }

  const encabezado = (columna: OrdenAdmin, texto: string, clase = '') => (
    <th scope="col" className={clase} aria-sort={ordenDe(columna)}>
      <button type="button" className="ra-ordenar" onClick={() => ordenarPor(columna)}>
        {texto}
        <Icono nombre={ordenDe(columna) === 'descending' ? 'flecha' : ordenDe(columna) ? 'flecha-arriba' : 'ordenar'} />
      </button>
    </th>
  )

  return (
    <>
      <ul className="ra-resumen" aria-label="Resumen del repositorio">
        <li>
          <strong>{resumen.total}</strong> documentos
        </li>
        <BotonResumen activo={filtros.estado === 'publicado'} onClick={() => cambiar({ estado: filtros.estado === 'publicado' ? '' : 'publicado' })}>
          <strong>{resumen.publicados}</strong> publicados
        </BotonResumen>
        <BotonResumen activo={filtros.estado === 'despublicado'} onClick={() => cambiar({ estado: filtros.estado === 'despublicado' ? '' : 'despublicado' })}>
          <strong>{resumen.despublicados}</strong> despublicados
        </BotonResumen>
        <BotonResumen activo={filtros.falta === 'archivo'} onClick={() => cambiar({ falta: filtros.falta === 'archivo' ? '' : 'archivo' })}>
          <strong>{resumen.sinArchivo}</strong> documentos sin archivo
        </BotonResumen>
        <BotonResumen activo={filtros.falta === 'portada'} onClick={() => cambiar({ falta: filtros.falta === 'portada' ? '' : 'portada' })}>
          <strong>{resumen.sinPortada}</strong> sin portada
        </BotonResumen>
      </ul>

      <form className="ra-filtros" role="search" aria-label="Buscar y filtrar documentos" onSubmit={(e) => e.preventDefault()}>
        <div className="ra-campo ra-campo-buscar">
          <label className="ra-etiqueta" htmlFor={`${id}-q`}>
            Buscar
          </label>
          <div className="rp-buscar">
            <Icono nombre="buscar" />
            <input
              id={`${id}-q`}
              className="rp-entrada"
              type="search"
              value={filtros.q}
              onChange={(e) => cambiar({ q: e.target.value })}
              placeholder="Título, palabra clave, número, año o identificador"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        <Selector etiqueta="Categoría" id={`${id}-categoria`} valor={filtros.categoria} onCambio={(v) => cambiar({ categoria: v })}>
          <option value="">Todas</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Estado" id={`${id}-estado`} valor={filtros.estado} onCambio={(v) => cambiar({ estado: v as FiltrosAdmin['estado'] })}>
          <option value="">Todos</option>
          <option value="publicado">Publicados</option>
          <option value="despublicado">Despublicados</option>
        </Selector>
        <Selector etiqueta="Tipo" id={`${id}-tipo`} valor={filtros.tipo} onCambio={(v) => cambiar({ tipo: v as FiltrosAdmin['tipo'] })}>
          <option value="">Todos</option>
          <option value="documento">Documento</option>
          <option value="tablero">Tablero interactivo</option>
          <option value="entrada">Entrada de blog</option>
        </Selector>
        <Selector etiqueta="Idioma" id={`${id}-idioma`} valor={filtros.idioma} onCambio={(v) => cambiar({ idioma: v as FiltrosAdmin['idioma'] })}>
          <option value="">Todos</option>
          <option value="es">Español</option>
          <option value="en">Inglés</option>
        </Selector>
        <Selector etiqueta="Le falta" id={`${id}-falta`} valor={filtros.falta} onCambio={(v) => cambiar({ falta: v as Falta | '' })}>
          <option value="">Nada en particular</option>
          {(Object.keys(TEXTOS_FALTA) as Falta[]).map((f) => (
            <option key={f} value={f}>
              {TEXTOS_FALTA[f]}
            </option>
          ))}
        </Selector>
        {/* Filtro exacto que llega desde Palabras clave («N documentos con «X»»). */}
        {filtros.clave.trim() && (
          <div className="ra-campo" role="group" aria-labelledby={`${id}-clave`}>
            <span className="ra-etiqueta" id={`${id}-clave`}>
              Palabra clave
            </span>
            <p className="ra-filtro-clave">
              <span className="ra-clave">
                <span className="ra-clave-texto">{filtros.clave}</span>
                <button
                  type="button"
                  className="ra-clave-boton"
                  onClick={() => {
                    cambiar({ clave: '' })
                    // El botón desaparece con el filtro: el foco pasa al buscador.
                    document.getElementById(`${id}-q`)?.focus()
                  }}
                  aria-label={`Quitar el filtro de la palabra clave «${filtros.clave}»`}
                >
                  <Icono nombre="cerrar" />
                </button>
              </span>
            </p>
          </div>
        )}
      </form>

      <div className="ra-estado-listado">
        <p className="ra-conteo" role="status" aria-live="polite" aria-atomic="true">
          {conteo}
        </p>
        {hayFiltros(filtros) && (
          <button type="button" className="ra-boton-texto" onClick={() => cambiar({ ...FILTROS_INICIALES, orden: filtros.orden, dir: filtros.dir })}>
            <Icono nombre="cerrar" />
            Limpiar filtros
          </button>
        )}
      </div>

      {errorAccion && (
        <div className="ra-aviso ra-aviso-error" role="alert">
          <Icono nombre="error" />
          <p>{errorAccion}</p>
          <button type="button" className="ra-boton-texto" onClick={() => setErrorAccion(null)}>
            Cerrar
          </button>
        </div>
      )}

      {datos.documentos.length === 0 ? (
        <div className="rp-vacio">
          <Icono nombre="documento" />
          <p className="rp-vacio-titulo">Todavía no hay documentos</p>
          <p className="rp-vacio-texto">Agregue el primero con «Nuevo documento».</p>
        </div>
      ) : filas.length === 0 ? (
        <div className="rp-vacio">
          <Icono nombre="buscar" />
          <p className="rp-vacio-titulo">Ningún documento coincide</p>
          <p className="rp-vacio-texto">Pruebe con otras palabras o quite algún filtro.</p>
        </div>
      ) : (
        <>
          <div className="ra-tabla-marco">
            <table className="ra-tabla ra-tabla-documentos">
              <caption ref={refCaption} tabIndex={-1}>
                Documentos {pagina.desde}–{pagina.hasta} de {filas.length}
                {pagina.paginas > 1 && ` (página ${pagina.pagina} de ${pagina.paginas})`}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="ra-col-portada">
                    <span className="rp-oculto">Portada</span>
                  </th>
                  {encabezado('posicion', 'Pos.', 'ra-col-posicion ra-col-ancha')}
                  {encabezado('titulo', 'Título', 'ra-col-titulo')}
                  {encabezado('categoria', 'Categoría', 'ra-col-media')}
                  {encabezado('anio', 'Año', 'ra-col-media ra-col-anio')}
                  <th scope="col" className="ra-col-ancha">
                    Archivo
                  </th>
                  {encabezado('estado', 'Estado', 'ra-col-estado')}
                  {encabezado('actualizado', 'Modificado', 'ra-col-ancha')}
                  <th scope="col" className="ra-col-acciones">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagina.elementos.map(({ doc }) => (
                  <FilaDocumento key={doc.id} doc={doc} ocupado={ocupado === doc.id} onAlternar={alternar} />
                ))}
              </tbody>
            </table>
          </div>
          {pagina.paginas > 1 && (
            <nav className="ra-paginacion" aria-label="Páginas del listado">
              <button
                type="button"
                className="rp-boton rp-boton-borde"
                disabled={pagina.pagina <= 1}
                onClick={() => irAPagina(pagina.pagina - 1)}
              >
                Anterior
              </button>
              <p>
                Página {pagina.pagina} de {pagina.paginas}
              </p>
              <button
                type="button"
                className="rp-boton rp-boton-borde"
                disabled={pagina.pagina >= pagina.paginas}
                onClick={() => irAPagina(pagina.pagina + 1)}
              >
                Siguiente
              </button>
            </nav>
          )}
        </>
      )}
    </>
  )
}

/** Conteo para la región aria-live: se actualiza 400 ms después de la última tecla (como la página pública). */
function useConteoPausado(coinciden: number, total: number, filtrando: boolean): string {
  const texto = filtrando
    ? `${coinciden} de ${cantidad(total, 'documento')} ${coinciden === 1 ? 'coincide' : 'coinciden'}`
    : `${cantidad(total, 'documento')} en el repositorio`
  const [visible, setVisible] = useState(texto)
  useEffect(() => {
    const t = setTimeout(() => setVisible(texto), 400)
    return () => clearTimeout(t)
  }, [texto])
  return visible
}

function BotonResumen({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <li>
      <button type="button" className="ra-chip" aria-pressed={activo} onClick={onClick}>
        {children}
      </button>
    </li>
  )
}

function Selector({
  etiqueta,
  id,
  valor,
  onCambio,
  children,
}: {
  etiqueta: string
  id: string
  valor: string
  onCambio: (valor: string) => void
  children: ReactNode
}) {
  return (
    <div className="ra-campo">
      <label className="ra-etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <div className="rp-select">
        <select id={id} value={valor} onChange={(e) => onCambio(e.target.value)}>
          {children}
        </select>
        <Icono nombre="flecha" />
      </div>
    </div>
  )
}

function textoArchivo(doc: DocumentoAdmin): string {
  if (doc.archivo) return nombreTipo(doc.archivo.tipo || doc.archivo.extension.toUpperCase())
  if (doc.urlVerExterna) return 'Enlace externo'
  return 'Sin archivo'
}

function FilaDocumento({
  doc,
  ocupado,
  onAlternar,
}: {
  doc: DocumentoAdmin
  ocupado: boolean
  onAlternar: (doc: DocumentoAdmin) => void
}) {
  const imagen = urlSegura(doc.urlMiniatura) ?? urlSegura(doc.urlPortada)
  const anio = doc.anio ?? 'S. F.'
  const sinDestino = !tieneDestino(doc)
  const tipo = doc.tipo === 'tablero' ? 'Tablero' : doc.tipo === 'entrada' ? 'Entrada de blog' : null
  return (
    <tr className={doc.publicado ? undefined : 'ra-fila-despublicada'}>
      <td className="ra-col-portada">
        {imagen ? (
          <img src={imagen} alt="" width={48} height={48} loading="lazy" decoding="async" />
        ) : (
          <span className="ra-sin-portada" title="Sin portada">
            <Icono nombre="documento" />
          </span>
        )}
      </td>
      <td className="ra-col-posicion ra-col-ancha">{doc.orden}</td>
      <td className="ra-col-titulo">
        <Link className="ra-enlace-titulo" to={rutaDocumento(doc.id)} lang={doc.idioma === 'en' ? 'en' : undefined}>
          {doc.titulo}
        </Link>
        <span className="ra-id">{doc.id}</span>
        <span className="ra-meta ra-meta-angosta">
          {doc.categoria}
          {doc.numero ? ` ${doc.numero}` : ''} · {anio} ·{' '}
          <span className={`ra-estado ra-estado-chico ${doc.publicado ? 'ra-estado-publicado' : 'ra-estado-despublicado'}`}>
            {doc.publicado ? 'Publicado' : 'Despublicado'}
          </span>
        </span>
        <span className="ra-meta ra-meta-media">
          {[tipo, doc.idioma === 'en' ? 'En inglés' : null, textoArchivo(doc), `Modificado ${fechaCorta(doc.actualizadoEn)}`]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {(tipo || doc.idioma === 'en') && (
          <span className="ra-etiquetas ra-col-ancha-flex">
            {tipo && <span className="ra-etiqueta-chica">{tipo}</span>}
            {doc.idioma === 'en' && (
              <span className="ra-etiqueta-chica" lang="es">
                En inglés
              </span>
            )}
          </span>
        )}
      </td>
      <td className="ra-col-media">
        {doc.categoria}
        {doc.numero && <span className="ra-numero"> N.º {doc.numero}</span>}
        {/* En tableta la columna "Año" se oculta y el año va aquí. */}
        <span className="ra-anio-en-categoria"> · {anio}</span>
      </td>
      <td className="ra-col-media ra-col-anio">{anio}</td>
      <td className="ra-col-ancha">
        <span className={doc.archivo ? undefined : 'ra-tenue'}>{textoArchivo(doc)}</span>
        {!doc.urlPortada && <span className="ra-falta">Sin portada</span>}
      </td>
      <td className="ra-col-estado">
        <span className={`ra-estado ${doc.publicado ? 'ra-estado-publicado' : 'ra-estado-despublicado'}`}>
          {doc.publicado ? 'Publicado' : 'Despublicado'}
        </span>
      </td>
      <td className="ra-col-ancha">
        {fechaCorta(doc.actualizadoEn)}
        {doc.actualizadoPor && <span className="ra-tenue ra-bloque">{doc.actualizadoPor}</span>}
      </td>
      <td className="ra-col-acciones">
        <div className="ra-acciones-fila">
          <Link className="rp-boton rp-boton-borde ra-boton-chico" to={rutaDocumento(doc.id)}>
            Editar<span className="rp-oculto"> «{doc.titulo}»</span>
          </Link>
          <button
            type="button"
            className={`rp-boton ra-boton-chico ${doc.publicado ? 'rp-boton-borde' : ''}`}
            onClick={() => onAlternar(doc)}
            disabled={ocupado || (!doc.publicado && sinDestino)}
            aria-describedby={!doc.publicado && sinDestino ? `ra-nodestino-${doc.id}` : undefined}
          >
            {ocupado ? (doc.publicado ? 'Despublicando…' : 'Publicando…') : doc.publicado ? 'Despublicar' : 'Publicar'}
            <span className="rp-oculto"> «{doc.titulo}»</span>
          </button>
          {!doc.publicado && sinDestino && (
            <span className="ra-ayuda-fila" id={`ra-nodestino-${doc.id}`}>
              Falta el archivo o la URL
            </span>
          )}
        </div>
      </td>
    </tr>
  )
}
