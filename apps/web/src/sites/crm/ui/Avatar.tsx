import { useState, type CSSProperties } from 'react'
import { colorPersona } from './colores'

export type TamanoAvatar = 'sm' | 'md' | 'lg' | 'xl'

/**
 * El círculo de una persona: su foto o, si no tiene (o no carga), sus
 * iniciales sobre su color (colores.ts, por `semilla` = id de la persona).
 *
 * Casi siempre va junto al nombre escrito, así que es decorativo (aria-hidden,
 * foto con alt vacío). Con `decorativo={false}` se anuncia con el nombre, para
 * cuando el círculo va solo.
 */
export default function Avatar({
  nombre,
  iniciales,
  foto,
  tamano = 'md',
  semilla,
  decorativo = true,
  className,
}: {
  nombre: string
  iniciales: string
  foto: string | null
  tamano?: TamanoAvatar
  semilla: number
  /** false: el círculo se anuncia como imagen con el nombre. */
  decorativo?: boolean
  className?: string
}) {
  // La URL que falló: si cambia la foto, se vuelve a intentar.
  const [fallida, setFallida] = useState<string | null>(null)
  const color = colorPersona(semilla)
  const estilo = {
    '--crm-av-fondo': color.fondo,
    '--crm-av-texto': color.texto,
    '--crm-av-anillo': color.anillo,
  } as CSSProperties
  const conFoto = Boolean(foto) && fallida !== foto

  return (
    <span
      className={`crm-avatar crm-avatar-${tamano}${conFoto ? ' crm-avatar--foto' : ''}${className ? ` ${className}` : ''}`}
      style={estilo}
      aria-hidden={decorativo ? true : undefined}
      role={decorativo ? undefined : 'img'}
      aria-label={decorativo ? undefined : nombre}
      title={decorativo ? undefined : nombre}
    >
      {conFoto && foto ? (
        <img className="crm-avatar-foto" src={foto} alt="" loading="lazy" decoding="async" onError={() => setFallida(foto)} />
      ) : (
        <span className="crm-avatar-iniciales">{iniciales}</span>
      )}
    </span>
  )
}
