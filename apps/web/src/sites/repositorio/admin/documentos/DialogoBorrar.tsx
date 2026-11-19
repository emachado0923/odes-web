/**
 * Borrado definitivo de un documento despublicado: hay que escribir su
 * identificador para confirmar (el servidor exige confirmarId === id).
 */
import { useId, useRef, useState, type FormEvent } from 'react'
import type { DocumentoAdmin } from '../../api-repositorio'
import { MensajeError } from '../componentes/Campo'
import Dialogo from '../componentes/Dialogo'
import Icono from '../componentes/IconoAdmin'
import { esErrorAdmin, mensajeDe } from '../datos/clienteAdmin'
import { useCliente } from '../sesion/contexto'

export default function DialogoBorrar({
  doc,
  abierto,
  onCerrar,
  onBorrado,
}: {
  doc: DocumentoAdmin
  abierto: boolean
  onCerrar: () => void
  onBorrado: () => void
}) {
  const cliente = useCliente()
  const id = useId()
  const [escrito, setEscrito] = useState('')
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refCampo = useRef<HTMLInputElement>(null)
  const coincide = escrito.trim() === doc.id

  function cerrar() {
    if (borrando) return
    setEscrito('')
    setError(null)
    onCerrar()
  }

  async function borrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!coincide || borrando) {
      if (!coincide) {
        setError(`Escriba exactamente «${doc.id}» para confirmar.`)
        refCampo.current?.focus()
      }
      return
    }
    setBorrando(true)
    setError(null)
    try {
      await cliente.borrarDocumento(doc.id, escrito.trim())
      onBorrado()
    } catch (e) {
      setBorrando(false)
      if (esErrorAdmin(e) && e.estado === 401) return
      setError(esErrorAdmin(e) && e.campos.confirmarId ? e.campos.confirmarId : mensajeDe(e))
      refCampo.current?.focus()
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      titulo="¿Borrar definitivamente?"
      onCerrar={cerrar}
      rol="alertdialog"
      idDescripcion={`${id}-descripcion`}
      enfoqueInicial={refCampo}
      bloqueado={borrando}
    >
      <form onSubmit={borrar} noValidate>
        <div id={`${id}-descripcion`}>
          <p>
            Se borrará «{doc.titulo}» con su archivo, su portada y su miniatura. <strong>No se puede deshacer.</strong>
          </p>
          <p className="ra-tenue">
            Si solo quiere que deje de verse en el sitio, basta con despublicarlo (ya lo está).
          </p>
        </div>
        <div className="ra-campo">
          <label className="ra-etiqueta" htmlFor={`${id}-confirmar`}>
            Para confirmar, escriba el identificador <code className="ra-codigo">{doc.id}</code>
          </label>
          <input
            ref={refCampo}
            id={`${id}-confirmar`}
            className="ra-control ra-control-codigo"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={escrito}
            onChange={(e) => {
              setEscrito(e.target.value)
              setError(null)
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            disabled={borrando}
          />
          {error && <MensajeError id={`${id}-error`} texto={error} />}
        </div>
        <div className="ra-dialogo-acciones">
          <button type="button" className="rp-boton rp-boton-borde" onClick={cerrar} disabled={borrando}>
            Cancelar
          </button>
          {/* Sin `disabled` mientras no coincide: al pulsarlo se explica qué falta. */}
          <button
            type="submit"
            className="rp-boton ra-boton-peligro"
            disabled={borrando}
            aria-disabled={!coincide || undefined}
          >
            <Icono nombre="borrar" />
            {borrando ? 'Borrando…' : 'Borrar definitivamente'}
          </button>
        </div>
      </form>
    </Dialogo>
  )
}
