/**
 * Palabras clave: lista con el número de documentos de cada una, búsqueda,
 * renombrar (si el nombre nuevo ya existe sin tildes ni mayúsculas, las dos
 * se fusionan; se avisa antes) y borrar las que no se usan.
 */
import { useDeferredValue, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { PalabraClaveAdmin } from '../../api-repositorio'
import { useAvisar } from '../componentes/avisar'
import { MensajeError } from '../componentes/Campo'
import Icono from '../componentes/IconoAdmin'
import { Cargando, ErrorCarga, TituloPagina } from '../componentes/Pagina'
import { esErrorAdmin, mensajeDe } from '../datos/clienteAdmin'
import { cantidad, claveNormalizada, textoLinea } from '../datos/formatos'
import { useCarga } from '../datos/useCarga'
import { RUTA_DOCUMENTOS } from '../rutasAdmin'
import { useCliente } from '../sesion/contexto'
import { filtrarPalabras, type Orden } from './palabras'

export default function PaginaPalabras() {
  const cliente = useCliente()
  const { estado, recargar, setDatos } = useCarga((signal) => cliente.listarPalabras(signal), 'palabras')
  return (
    <div className="ra-pagina ra-pagina-angosta">
      <TituloPagina documento="Palabras clave">Palabras clave</TituloPagina>
      <p className="ra-introduccion">
        Cada palabra clave se escribe igual en todas las tarjetas. Al renombrar una, cambia en todos sus documentos; si
        el nombre nuevo ya existe (sin contar tildes ni mayúsculas), las dos se unen en una sola.
      </p>
      {estado.fase === 'cargando' && <Cargando texto="Cargando las palabras clave…" />}
      {estado.fase === 'error' && (
        <ErrorCarga titulo="No se pudieron cargar las palabras clave" mensaje={estado.mensaje} onReintentar={recargar} />
      )}
      {estado.fase === 'listo' && <Palabras palabras={estado.datos} onCambio={setDatos} recargar={recargar} />}
    </div>
  )
}

function Palabras({
  palabras,
  onCambio,
  recargar,
}: {
  palabras: PalabraClaveAdmin[]
  onCambio: (p: PalabraClaveAdmin[]) => void
  recargar: () => void
}) {
  const cliente = useCliente()
  const avisar = useAvisar()
  const id = useId()
  const [q, setQ] = useState('')
  const [soloSinUso, setSoloSinUso] = useState(false)
  const [orden, setOrden] = useState<Orden>('documentos')
  const [editando, setEditando] = useState<number | null>(null)
  const [ocupada, setOcupada] = useState<number | null>(null)
  const [error, setError] = useState<{ id: number; texto: string } | null>(null)
  const refTabla = useRef<HTMLTableElement>(null)
  const qDiferida = useDeferredValue(q)
  const visibles = useMemo(
    () => filtrarPalabras(palabras, qDiferida, soloSinUso, orden),
    [palabras, qDiferida, soloSinUso, orden],
  )
  const sinUso = palabras.filter((p) => p.documentos === 0).length

  async function borrar(p: PalabraClaveAdmin) {
    setOcupada(p.id)
    setError(null)
    try {
      await cliente.borrarPalabra(p.id)
      onCambio(palabras.filter((x) => x.id !== p.id))
      avisar(`Se borró la palabra clave «${p.texto}».`)
      document.getElementById(`${id}-q`)?.focus()
    } catch (e) {
      if (!(esErrorAdmin(e) && e.estado === 401)) setError({ id: p.id, texto: mensajeDe(e) })
    } finally {
      setOcupada(null)
    }
  }

  return (
    <>
      <div className="ra-filtros ra-filtros-palabras">
        <div className="ra-campo ra-campo-buscar">
          <label className="ra-etiqueta" htmlFor={`${id}-q`}>
            Buscar palabra clave
          </label>
          <div className="rp-buscar">
            <Icono nombre="buscar" />
            <input
              id={`${id}-q`}
              className="rp-entrada"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="ra-campo">
          <label className="ra-etiqueta" htmlFor={`${id}-orden`}>
            Ordenar por
          </label>
          <div className="rp-select">
            <select id={`${id}-orden`} value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
              <option value="documentos">Más usadas</option>
              <option value="texto">Alfabético</option>
            </select>
            <Icono nombre="flecha" />
          </div>
        </div>
        <label className="ra-radio ra-casilla-filtro">
          <input type="checkbox" checked={soloSinUso} onChange={(e) => setSoloSinUso(e.target.checked)} />
          Solo las que no se usan ({sinUso})
        </label>
      </div>
      <p className="ra-conteo" role="status" aria-live="polite">
        {visibles.length === palabras.length
          ? cantidad(palabras.length, 'palabra clave', 'palabras clave')
          : `${visibles.length} de ${cantidad(palabras.length, 'palabra clave', 'palabras clave')}`}
      </p>
      {visibles.length === 0 ? (
        <p className="rp-vacio">Ninguna palabra clave coincide.</p>
      ) : (
        <div className="ra-tabla-marco">
          <table className="ra-tabla" ref={refTabla}>
            <caption className="rp-oculto">Palabras clave y cuántos documentos las usan</caption>
            <thead>
              <tr>
                <th scope="col">Palabra clave</th>
                <th scope="col" className="ra-col-numero">
                  <span className="ra-texto-largo">Documentos</span>
                  <span className="ra-texto-corto" aria-hidden="true">
                    Docs.
                  </span>
                </th>
                <th scope="col" className="ra-col-acciones">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) =>
                editando === p.id ? (
                  <tr key={p.id} data-id={p.id}>
                    <td colSpan={3}>
                      <FormRenombrar
                        palabra={p}
                        palabras={palabras}
                        onListo={(cambio) => {
                          setEditando(null)
                          requestAnimationFrame(() =>
                            refTabla.current?.querySelector<HTMLElement>(`[data-id="${cambio?.id ?? p.id}"] [data-renombrar]`)?.focus(),
                          )
                          if (!cambio) return
                          if (cambio.id !== p.id) {
                            avisar(`«${p.texto}» se unió con «${cambio.texto}».`)
                            recargar()
                          } else {
                            onCambio(palabras.map((x) => (x.id === cambio.id ? cambio : x)))
                            avisar(`La palabra clave ahora es «${cambio.texto}».`)
                          }
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} data-id={p.id}>
                    <td>
                      {p.texto}
                      {error?.id === p.id && (
                        <div className="ra-aviso ra-aviso-error ra-item-error" role="alert">
                          <Icono nombre="error" />
                          <p>{error.texto}</p>
                        </div>
                      )}
                    </td>
                    <td className="ra-col-numero">
                      {p.documentos > 0 ? (
                        <Link to={`${RUTA_DOCUMENTOS}?clave=${encodeURIComponent(p.texto)}`}>
                          {p.documentos}
                          <span className="rp-oculto"> documentos con «{p.texto}»</span>
                        </Link>
                      ) : (
                        <span className="ra-tenue">0</span>
                      )}
                    </td>
                    <td className="ra-col-acciones">
                      <div className="ra-acciones-fila">
                        <button
                          type="button"
                          className="rp-boton rp-boton-borde ra-boton-chico"
                          data-renombrar
                          onClick={() => setEditando(p.id)}
                          disabled={ocupada !== null}
                        >
                          Renombrar<span className="rp-oculto"> «{p.texto}»</span>
                        </button>
                        {p.documentos === 0 && (
                          <button
                            type="button"
                            className="ra-boton-texto ra-peligro"
                            onClick={() => void borrar(p)}
                            disabled={ocupada !== null}
                          >
                            Borrar<span className="rp-oculto"> «{p.texto}»</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function FormRenombrar({
  palabra,
  palabras,
  onListo,
}: {
  palabra: PalabraClaveAdmin
  palabras: readonly PalabraClaveAdmin[]
  onListo: (resultado: PalabraClaveAdmin | null) => void
}) {
  const cliente = useCliente()
  const id = useId()
  const [texto, setTexto] = useState(palabra.texto)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const limpio = textoLinea(texto)
  const otra = palabras.find((p) => p.id !== palabra.id && claveNormalizada(p.texto) === claveNormalizada(limpio))

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!limpio) {
      setError('Escriba la palabra clave.')
      return
    }
    if (limpio === palabra.texto) {
      onListo(null)
      return
    }
    setGuardando(true)
    try {
      onListo(await cliente.renombrarPalabra(palabra.id, limpio))
    } catch (e) {
      setGuardando(false)
      if (!(esErrorAdmin(e) && e.estado === 401)) setError(esErrorAdmin(e) && e.campos.texto ? e.campos.texto : mensajeDe(e))
    }
  }

  return (
    <form className="ra-renombrar" onSubmit={guardar} noValidate>
      <label className="ra-etiqueta" htmlFor={`${id}-texto`}>
        Nuevo texto de «{palabra.texto}»
      </label>
      <div className="ra-linea">
        <input
          id={`${id}-texto`}
          className="ra-control"
          type="text"
          value={texto}
          maxLength={80}
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- el campo aparece al pulsar "Renombrar"
          autoFocus
          onChange={(e) => {
            setTexto(e.target.value)
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
          {guardando ? 'Guardando…' : otra ? 'Unir' : 'Guardar'}
        </button>
        <button type="button" className="rp-boton rp-boton-borde ra-boton-chico" onClick={() => onListo(null)} disabled={guardando}>
          Cancelar
        </button>
      </div>
      <p className={`ra-ayuda${otra ? ' ra-ayuda-atencion' : ''}`} id={`${id}-ayuda`} aria-live="polite">
        {otra
          ? `Ya existe «${otra.texto}» (${cantidad(otra.documentos, 'documento')}): al guardar, las dos se unen y queda «${limpio}» en ${cantidad(otra.documentos + palabra.documentos, 'documento')} como máximo.`
          : `Cambia en ${cantidad(palabra.documentos, 'documento')}.`}
      </p>
      {error && <MensajeError id={`${id}-error`} texto={error} />}
    </form>
  )
}
