/**
 * Inicio de /crm: una tarjeta por persona del equipo (apiEquipo.personas, en
 * el orden del servidor). Se entra sin cuenta, con un clic en la tarjeta,
 * al tablero /crm/equipo/<id>. La tarjeta del líder lleva a /crm/lider, que
 * pide contraseña, y no muestra conteos.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { apiEquipo } from '../datos/clienteCrm'
import { useCarga } from '../datos/useCarga'
import { Cargando, ErrorCarga, MarcaEstado, saludo, TarjetaPersona, useTituloCrm, Vacio } from '../ui'
import { nombreLider } from './comun'
import './equipo.css'

export default function Inicio() {
  useTituloCrm(null)
  const [ahora] = useState(() => new Date())
  const { estado, datos, error, recargar } = useCarga((signal) => apiEquipo.personas(signal), [])
  const lider = datos?.find((persona) => persona.esLider) ?? null

  let contenido
  if (datos && datos.length === 0) {
    contenido = (
      <Vacio
        titulo="Todavía no hay personas en el equipo."
        texto="El líder las agrega desde su pantalla, con la contraseña."
        accion={
          <Link className="crm-boton crm-boton-secundario crm-boton-sm" to="/crm/lider">
            Entrar como líder
          </Link>
        }
      />
    )
  } else if (datos) {
    contenido = (
      <>
        <ul className="crm-rejilla-personas" aria-label="Personas del equipo">
          {datos.map((persona) => (
            <li key={persona.id}>
              {persona.esLider ? (
                <TarjetaPersona persona={persona} href="/crm/lider" etiqueta="Líder" pideClave mostrarConteos={false} />
              ) : (
                <TarjetaPersona persona={persona} href={`/crm/equipo/${persona.id}`} />
              )}
            </li>
          ))}
        </ul>
        <p className="crm-eq-inicio-nota">¿No encuentra su nombre? Pídale {nombreLider(lider?.nombre ?? null).a} que actualice el equipo.</p>
      </>
    )
  } else if (estado === 'error') {
    contenido = <ErrorCarga error={error} alReintentar={recargar} titulo="No se pudo cargar el equipo." />
  } else {
    contenido = <Cargando texto="Cargando el equipo…" />
  }

  return (
    <div className="crm-contenedor crm-pagina crm-eq-inicio">
      <header className="crm-eq-inicio-cabeza">
        <p className="crm-eq-saludo">
          <span className="crm-eq-marcas" aria-hidden="true">
            <MarcaEstado estado="pendiente" />
            <MarcaEstado estado="en_proceso" />
            <MarcaEstado estado="terminada" />
          </span>
          {saludo(ahora)}
        </p>
        <h1 className="crm-titulo-pagina">Tareas de la Oficina de Planeación</h1>
        <p className="crm-bajada">Elija su nombre para ver sus tareas.</p>
      </header>
      {contenido}
    </div>
  )
}
