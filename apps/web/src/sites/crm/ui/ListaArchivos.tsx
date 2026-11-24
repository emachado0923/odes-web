import { tamanoLegible, type ArchivoCrm } from '../api-crm'
import { tipoArchivo, type TipoArchivo } from './archivos'
import { fechaHora } from './formato'
import Icono from './Icono'

/** Marca dentro de la hoja según el tipo: líneas (texto), cuadrícula (hoja), pantalla, paisaje. */
const MARCA_TIPO: Record<TipoArchivo, string> = {
  pdf: 'M8.5 13h7M8.5 16h7M8.5 10h3',
  texto: 'M8.5 11h7M8.5 14h7M8.5 17h4.5',
  hoja: 'M8 11h8v6.5H8zM8 14.2h8M12 11v6.5',
  presentacion: 'M8 11h8v5H8zM12 16v2',
  imagen: 'M8 17.5l2.6-3.2 1.8 2 1.6-1.8 2 3M14.5 11.2v.1',
  otro: 'M9 13h6m-6 3h4',
}

const NOMBRE_TIPO: Record<TipoArchivo, string> = {
  pdf: 'PDF',
  texto: 'Documento de Word',
  hoja: 'Hoja de cálculo',
  presentacion: 'Presentación',
  imagen: 'Imagen',
  otro: 'Archivo',
}

function IconoArchivo({ tipo }: { tipo: TipoArchivo }) {
  return (
    <span className="crm-archivo-icono" data-tipo={tipo} aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" focusable="false">
        <path d="M7 3.5h6.5L18 8v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Zm6.5 0V8H18" />
        <path d={MARCA_TIPO[tipo]} />
      </svg>
    </span>
  )
}

/**
 * Archivos de una tarea: ícono por tipo, el nombre como enlace de descarga
 * (archivo.url), tamaño y cuándo se subió. Con `alQuitar`, un botón «Quitar»
 * por archivo; los de `ocupados` (quitándose) se ven atenuados y quietos.
 */
export default function ListaArchivos({
  archivos,
  alQuitar,
  vacio,
  ocupados,
}: {
  archivos: ArchivoCrm[]
  alQuitar?: (archivo: ArchivoCrm) => void
  vacio?: string
  ocupados?: ReadonlySet<number>
}) {
  if (archivos.length === 0) return vacio ? <p className="crm-archivos-vacio">{vacio}</p> : null
  return (
    <ul className="crm-archivos">
      {archivos.map((archivo) => {
        const ocupado = ocupados?.has(archivo.id) ?? false
        const tipo = tipoArchivo(archivo.nombre, archivo.mime)
        return (
          <li key={archivo.id} className="crm-archivo" data-ocupado={ocupado ? '' : undefined} aria-busy={ocupado || undefined}>
            <IconoArchivo tipo={tipo} />
            <span className="crm-archivo-datos">
              <a className="crm-archivo-nombre" href={archivo.url} download={archivo.nombre}>
                {archivo.nombre}
              </a>
              <span className="crm-archivo-meta">
                <span className="crm-sr">{NOMBRE_TIPO[tipo]}, </span>
                {tamanoLegible(archivo.bytes)}, subido el {fechaHora(archivo.subidoEn)}
              </span>
            </span>
            {alQuitar ? (
              <button
                type="button"
                className="crm-boton-icono crm-boton-icono-peligro"
                disabled={ocupado}
                aria-label={`Quitar ${archivo.nombre}`}
                title="Quitar"
                onClick={() => alQuitar(archivo)}
              >
                {ocupado ? <span className="crm-giro" aria-hidden="true" /> : <Icono nombre="borrar" />}
              </button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
