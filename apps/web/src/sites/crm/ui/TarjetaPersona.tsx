import { useId } from 'react'
import { Link } from 'react-router'
import type { PersonaCrm } from '../api-crm'
import Avatar from './Avatar'
import { plural, unirConY } from './formato'
import Icono from './Icono'
import MarcaEstado from './MarcaEstado'

/**
 * Tarjeta de una persona en la pantalla de inicio: todo el bloque es el
 * enlace a su tablero. Círculo grande con su color, nombre y lo que tiene
 * abierto («3 pendientes», «1 en proceso», «2 vencidas» en rojo).
 *
 * `etiqueta` («Líder») va en una pastilla bajo el nombre; `pideClave` pone un
 * candado y le dice al lector de pantalla que pide contraseña.
 * `mostrarConteos={false}` quita la línea de tareas (p. ej. en la del líder).
 *
 * Se ponen dentro de <ul className="crm-rejilla-personas"> (un <li> por
 * persona): rejilla en pantallas anchas, lista en el celular.
 */
export default function TarjetaPersona({
  persona,
  href,
  etiqueta,
  pideClave = false,
  mostrarConteos = true,
}: {
  persona: PersonaCrm
  href: string
  etiqueta?: string
  pideClave?: boolean
  mostrarConteos?: boolean
}) {
  const id = useId()
  const { pendientes, enProceso, vencidas } = persona.conteo

  const conteos: { clave: string; texto: string; tipo: 'pendiente' | 'en_proceso' | 'vencida' }[] = []
  if (pendientes > 0) conteos.push({ clave: 'p', texto: plural(pendientes, 'pendiente', 'pendientes'), tipo: 'pendiente' })
  if (enProceso > 0) conteos.push({ clave: 'e', texto: `${enProceso.toLocaleString('es-CO')} en proceso`, tipo: 'en_proceso' })
  if (vencidas > 0) conteos.push({ clave: 'v', texto: plural(vencidas, 'vencida', 'vencidas'), tipo: 'vencida' })
  const resumen = conteos.length > 0 ? `${unirConY(conteos.map((c) => c.texto))}.` : 'Sin tareas pendientes.'

  const idsNombre = [`${id}-nombre`, etiqueta ? `${id}-etiqueta` : null, pideClave ? `${id}-clave` : null]
    .filter(Boolean)
    .join(' ')

  return (
    <Link
      to={href}
      className="crm-tarjeta-persona"
      aria-labelledby={idsNombre}
      aria-describedby={mostrarConteos ? `${id}-conteos` : undefined}
    >
      <Avatar nombre={persona.nombre} iniciales={persona.iniciales} foto={persona.foto} tamano="xl" semilla={persona.id} />
      <span className="crm-tp-texto">
        <span className="crm-tp-nombre" id={`${id}-nombre`}>
          {persona.nombre}
        </span>
        {etiqueta || pideClave ? (
          <span className="crm-tp-marcas">
            {etiqueta ? (
              <span className="crm-etiqueta" id={`${id}-etiqueta`}>
                {etiqueta}
              </span>
            ) : null}
            {pideClave ? (
              <span className="crm-tp-clave" title="Pide contraseña">
                <Icono nombre="candado" tamano={16} />
                <span className="crm-sr" id={`${id}-clave`}>
                  pide contraseña
                </span>
              </span>
            ) : null}
          </span>
        ) : null}
        {mostrarConteos ? (
          <span className="crm-tp-conteos">
            {conteos.length === 0 ? (
              <span className="crm-tp-conteo" aria-hidden="true">
                Sin tareas pendientes
              </span>
            ) : (
              conteos.map((c) => (
                <span key={c.clave} className="crm-tp-conteo" data-tipo={c.tipo} aria-hidden="true">
                  {c.tipo === 'vencida' ? <Icono nombre="alerta" tamano={15} /> : <MarcaEstado estado={c.tipo} />}
                  {c.texto}
                </span>
              ))
            )}
            <span className="crm-sr" id={`${id}-conteos`}>
              {resumen}
            </span>
          </span>
        ) : null}
      </span>
    </Link>
  )
}
