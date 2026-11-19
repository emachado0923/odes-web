/**
 * Categorías: crear, renombrar, ordenar (subir/bajar: es el orden del filtro
 * "Categoría" de la página pública) y borrar las que no tienen documentos
 * (si tiene, el servidor responde 409 y se muestra su mensaje).
 */
import { useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { CategoriaAdmin } from '../../api-repositorio'
import { useAvisar } from '../componentes/avisar'
import { MensajeError } from '../componentes/Campo'
import Icono from '../componentes/IconoAdmin'
import { Cargando, ErrorCarga, TituloPagina } from '../componentes/Pagina'
import { esErrorAdmin, mensajeDe } from '../datos/clienteAdmin'
import { cantidad, textoLinea } from '../datos/formatos'
import { useCarga } from '../datos/useCarga'
import { RUTA_DOCUMENTOS } from '../rutasAdmin'
import { useCliente } from '../sesion/contexto'

const MAX_NOMBRE = 100

export default function PaginaCategorias() {
  const cliente = useCliente()
  const { estado, recargar, setDatos } = useCarga((signal) => cliente.listarCategorias(signal), 'categorias')
  return (
    <div className="ra-pagina ra-pagina-angosta">
      <TituloPagina documento="Categorías">Categorías</TituloPagina>
      <p className="ra-introduccion">
        El orden de esta lista es el del filtro «Categoría» en el repositorio. Para borrar una categoría, primero mueva
        sus documentos a otra.
      </p>
      {estado.fase === 'cargando' && <Cargando texto="Cargando las categorías…" />}
      {estado.fase === 'error' && (
        <ErrorCarga titulo="No se pudieron cargar las categorías" mensaje={estado.mensaje} onReintentar={recargar} />
      )}
      {estado.fase === 'listo' && <Categorias categorias={estado.datos} onCambio={setDatos} recargar={recargar} />}
    </div>
  )
}

function Categorias({
  categorias,
  onCambio,
  recargar,
}: {
  categorias: CategoriaAdmin[]
  onCambio: (c: CategoriaAdmin[]) => void
  recargar: () => void
}) {
  const cliente = useCliente()
  const avisar = useAvisar()
  const id = useId()
  const [nombre, setNombre] = useState('')
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<number | null>(null)
  const [ocupada, setOcupada] = useState<number | null>(null)
  const [error, setError] = useState<{ id: number; texto: string } | null>(null)
  const refNuevo = useRef<HTMLInputElement>(null)
  const refLista = useRef<HTMLOListElement>(null)

  async function crear(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const limpio = textoLinea(nombre)
    if (!limpio) {
      setErrorNuevo('Escriba el nombre de la categoría.')
      refNuevo.current?.focus()
      return
    }
    setCreando(true)
    setErrorNuevo(null)
    try {
      const nueva = await cliente.crearCategoria(limpio)
      onCambio([...categorias, nueva].sort((a, b) => a.orden - b.orden))
      setNombre('')
      avisar(`Se creó la categoría «${nueva.nombre}».`)
    } catch (e) {
      if (!(esErrorAdmin(e) && e.estado === 401)) setErrorNuevo(esErrorAdmin(e) && e.campos.nombre ? e.campos.nombre : mensajeDe(e))
      refNuevo.current?.focus()
    } finally {
      setCreando(false)
    }
  }

  async function mover(c: CategoriaAdmin, posicion: number, boton: 'arriba' | 'abajo') {
    setOcupada(c.id)
    setError(null)
    try {
      await cliente.actualizarCategoria(c.id, { orden: posicion })
      const lista = categorias.filter((x) => x.id !== c.id)
      lista.splice(posicion - 1, 0, c)
      onCambio(lista.map((x, i) => ({ ...x, orden: i + 1 })))
      avisar(`«${c.nombre}» quedó en la posición ${posicion} de ${lista.length}.`)
      // El foco sigue en el mismo botón de la fila movida (o en el otro si ese ya no aplica).
      requestAnimationFrame(() => {
        const fila = refLista.current?.querySelector<HTMLElement>(`[data-id="${c.id}"]`)
        const preferido = fila?.querySelector<HTMLButtonElement>(`[data-mover="${boton}"]:not(:disabled)`)
        ;(preferido ?? fila?.querySelector<HTMLButtonElement>('[data-mover]:not(:disabled)'))?.focus()
      })
    } catch (e) {
      if (!(esErrorAdmin(e) && e.estado === 401)) setError({ id: c.id, texto: mensajeDe(e) })
      recargar()
    } finally {
      setOcupada(null)
    }
  }

  async function borrar(c: CategoriaAdmin) {
    setOcupada(c.id)
    setError(null)
    try {
      await cliente.borrarCategoria(c.id)
      onCambio(categorias.filter((x) => x.id !== c.id).map((x, i) => ({ ...x, orden: i + 1 })))
      avisar(`Se borró la categoría «${c.nombre}».`)
      refNuevo.current?.focus()
    } catch (e) {
      if (!(esErrorAdmin(e) && e.estado === 401)) setError({ id: c.id, texto: mensajeDe(e) })
    } finally {
      setOcupada(null)
    }
  }

  return (
    <>
      <form className="ra-panel ra-form-linea" onSubmit={crear} noValidate>
        <div className="ra-campo">
          <label className="ra-etiqueta" htmlFor={`${id}-nueva`}>
            Nueva categoría
          </label>
          <div className="ra-linea">
            <input
              ref={refNuevo}
              id={`${id}-nueva`}
              className="ra-control"
              type="text"
              value={nombre}
              maxLength={MAX_NOMBRE}
              onChange={(e) => {
                setNombre(e.target.value)
                setErrorNuevo(null)
              }}
              aria-invalid={errorNuevo ? true : undefined}
              aria-describedby={errorNuevo ? `${id}-nueva-error` : undefined}
              autoComplete="off"
            />
            <button type="submit" className="rp-boton" disabled={creando}>
              <Icono nombre="agregar" />
              {creando ? 'Agregando…' : 'Agregar'}
            </button>
          </div>
          {errorNuevo && <MensajeError id={`${id}-nueva-error`} texto={errorNuevo} />}
        </div>
      </form>

      {categorias.length === 0 ? (
        <p className="rp-vacio">Todavía no hay categorías.</p>
      ) : (
        <ol className="ra-lista-catalogo" ref={refLista} aria-label="Categorías, en su orden">
          {categorias.map((c, i) => (
            <li key={c.id} data-id={c.id} className="ra-item-catalogo">
              {editando === c.id ? (
                <FormRenombrar
                  categoria={c}
                  onListo={(nueva) => {
                    setEditando(null)
                    // El formulario desaparece: el foco vuelve a "Renombrar" de esa fila.
                    requestAnimationFrame(() =>
                      refLista.current?.querySelector<HTMLElement>(`[data-id="${c.id}"] [data-renombrar]`)?.focus(),
                    )
                    if (nueva) {
                      onCambio(categorias.map((x) => (x.id === nueva.id ? { ...x, nombre: nueva.nombre } : x)))
                      avisar(`La categoría ahora se llama «${nueva.nombre}».`)
                    }
                  }}
                />
              ) : (
                <>
                  <span className="ra-posicion" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="ra-item-nombre">
                    <strong>{c.nombre}</strong>
                    <Link className="ra-tenue" to={`${RUTA_DOCUMENTOS}?categoria=${encodeURIComponent(c.nombre)}`}>
                      {cantidad(c.documentos, 'documento')}
                      <span className="rp-oculto"> en «{c.nombre}»</span>
                    </Link>
                  </span>
                  <span className="ra-item-acciones">
                    <button
                      type="button"
                      className="ra-boton-icono"
                      data-mover="arriba"
                      onClick={() => void mover(c, i, 'arriba')}
                      disabled={i === 0 || ocupada !== null}
                      aria-label={`Subir «${c.nombre}» (posición ${i + 1} de ${categorias.length})`}
                    >
                      <Icono nombre="arriba" />
                    </button>
                    <button
                      type="button"
                      className="ra-boton-icono"
                      data-mover="abajo"
                      onClick={() => void mover(c, i + 2, 'abajo')}
                      disabled={i === categorias.length - 1 || ocupada !== null}
                      aria-label={`Bajar «${c.nombre}» (posición ${i + 1} de ${categorias.length})`}
                    >
                      <Icono nombre="abajo" />
                    </button>
                    <button
                      type="button"
                      className="rp-boton rp-boton-borde ra-boton-chico"
                      data-renombrar
                      onClick={() => setEditando(c.id)}
                      disabled={ocupada !== null}
                    >
                      Renombrar<span className="rp-oculto"> «{c.nombre}»</span>
                    </button>
                    <button
                      type="button"
                      className="ra-boton-texto ra-peligro"
                      onClick={() => void borrar(c)}
                      disabled={ocupada !== null}
                      aria-describedby={c.documentos > 0 ? `${id}-uso-${c.id}` : undefined}
                    >
                      Borrar<span className="rp-oculto"> «{c.nombre}»</span>
                    </button>
                    {c.documentos > 0 && (
                      <span className="rp-oculto" id={`${id}-uso-${c.id}`}>
                        Tiene {cantidad(c.documentos, 'documento')}; el servidor no la borrará.
                      </span>
                    )}
                  </span>
                  {error?.id === c.id && (
                    <div className="ra-aviso ra-aviso-error ra-item-error" role="alert">
                      <Icono nombre="error" />
                      <p>{error.texto}</p>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

function FormRenombrar({
  categoria,
  onListo,
}: {
  categoria: CategoriaAdmin
  onListo: (nueva: CategoriaAdmin | null) => void
}) {
  const cliente = useCliente()
  const id = useId()
  const [nombre, setNombre] = useState(categoria.nombre)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const limpio = textoLinea(nombre)
    if (!limpio) {
      setError('Escriba el nombre.')
      return
    }
    if (limpio === categoria.nombre) {
      onListo(null)
      return
    }
    setGuardando(true)
    try {
      onListo(await cliente.actualizarCategoria(categoria.id, { nombre: limpio }))
    } catch (e) {
      setGuardando(false)
      if (!(esErrorAdmin(e) && e.estado === 401)) setError(esErrorAdmin(e) && e.campos.nombre ? e.campos.nombre : mensajeDe(e))
    }
  }

  return (
    <form className="ra-renombrar" onSubmit={guardar} noValidate>
      <label className="ra-etiqueta" htmlFor={`${id}-nombre`}>
        Nuevo nombre de «{categoria.nombre}»
      </label>
      <div className="ra-linea">
        <input
          id={`${id}-nombre`}
          className="ra-control"
          type="text"
          value={nombre}
          maxLength={MAX_NOMBRE}
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- el campo aparece al pulsar "Renombrar"
          autoFocus
          onChange={(e) => {
            setNombre(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onListo(null)
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-ayuda${error ? ` ${id}-error` : ''}`}
          autoComplete="off"
        />
        <button type="submit" className="rp-boton ra-boton-chico" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="rp-boton rp-boton-borde ra-boton-chico" onClick={() => onListo(null)} disabled={guardando}>
          Cancelar
        </button>
      </div>
      <p className="ra-ayuda" id={`${id}-ayuda`}>
        Los {cantidad(categoria.documentos, 'documento')} de esta categoría pasan a mostrar el nombre nuevo.
      </p>
      {error && <MensajeError id={`${id}-error`} texto={error} />}
    </form>
  )
}
