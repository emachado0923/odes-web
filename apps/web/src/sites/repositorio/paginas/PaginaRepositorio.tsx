/**
 * Página pública /repositorio: cabecera morada, buscador, filtros y
 * tarjetas. Los datos llegan de GET /api/repositorio/documentos.
 */
import { useEffect, useRef } from 'react'
import Explorador from '../componentes/Explorador'
import { CargandoDocumentos, ErrorDocumentos, SinDocumentos } from '../componentes/EstadosListado'
import Presentacion from '../componentes/Presentacion'
import { useListado } from '../datos/useListado'
import { ID_CONTENIDO } from '../rutas'

export default function PaginaRepositorio() {
  const { estado, reintentar } = useListado()
  const reintentando = useRef(false)
  const refCarga = useRef<HTMLDivElement>(null)
  const refReintentar = useRef<HTMLButtonElement>(null)

  // Al reintentar, el foco no se pierde: pasa al aviso de carga y luego al
  // buscador (si cargó) o de nuevo al botón (si volvió a fallar).
  useEffect(() => {
    if (!reintentando.current) return
    if (estado.fase === 'cargando') {
      refCarga.current?.focus()
      return
    }
    reintentando.current = false
    if (estado.fase === 'listo') document.getElementById('rp-q')?.focus()
    else refReintentar.current?.focus()
  }, [estado.fase])

  function onReintentar() {
    reintentando.current = true
    reintentar()
  }

  return (
    <main id={ID_CONTENIDO} className="rp-principal sap-contenido" tabIndex={-1}>
      <title>Repositorio de productos · Observatorio de Sapiencia</title>
      <div className="rp-contenedor">
        <Presentacion />
        {estado.fase === 'cargando' && <CargandoDocumentos refCaja={refCarga} />}
        {estado.fase === 'error' && (
          <ErrorDocumentos fallo={estado.fallo} onReintentar={onReintentar} refBoton={refReintentar} />
        )}
        {estado.fase === 'listo' &&
          (estado.listado.documentos.length ? <Explorador listado={estado.listado} /> : <SinDocumentos />)}
      </div>
    </main>
  )
}
