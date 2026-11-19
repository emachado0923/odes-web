import type { ReactNode } from 'react'
import { type EnlaceOficial as Enlace, type Horario, PIE } from './sapiencia-oficial'
import {
  ICONO_GOOGLE_MAPS,
  ICONOS_REDES,
  LOGO_COLOMBIA_COMPRA,
  LOGO_COLOMBIA_CO,
  LOGO_GOVCO,
  LOGO_SAPIENCIA_PIE,
} from './recursos'
import EnlaceOficial, { AVISO_PESTANA } from './EnlaceOficial'
import { IconoCorreo, IconoReloj, IconoTelefono } from './iconos'
import './sapiencia.css'

/** Una fila con ícono a la izquierda y, al lado, líneas de texto (contacto y horarios del sitio). */
function FilaIcono({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return (
    <div className="sap-pie-fila">
      <span className="sap-pie-fila-icono">{icono}</span>
      {children}
    </div>
  )
}

function LineasHorario({ horario }: { horario: Horario }) {
  return (
    <span className="sap-pie-lineas">
      <span className="sap-pie-destacado">{horario.dias}</span>
      <span>{horario.horas}</span>
    </span>
  )
}

/** Pin de Google Maps que abre la ubicación en otra pestaña (en el sitio, solo el ícono). */
function EnlaceMapa({ url, lugar }: { url: string; lugar: string }) {
  return (
    <a className="sap-pie-mapa" href={url} target="_blank" rel="noopener noreferrer">
      <img
        src={ICONO_GOOGLE_MAPS.src}
        alt={`Ver ${lugar} en Google Maps ${AVISO_PESTANA}`}
        width={ICONO_GOOGLE_MAPS.ancho}
        height={ICONO_GOOGLE_MAPS.alto}
        loading="lazy"
        decoding="async"
      />
    </a>
  )
}

function ListaEnlaces({ enlaces }: { enlaces: readonly Enlace[] }) {
  return enlaces.map((enlace) => (
    <p key={enlace.url} className="sap-pie-bloque">
      <EnlaceOficial className="sap-pie-enlace" enlace={enlace} />
    </p>
  ))
}

/**
 * Recreación del footer oficial de https://sapiencia.gov.co/ (medido el 26 de
 * octubre de 2026; contenido en datos/sapiencia-oficial.ts, estilos en
 * sapiencia.css): franja azul #295BD6, grilla de 1140 px con las columnas del
 * sitio —agencia, contacto y redes; contratación y políticas; sede principal;
 * sede Ciudadela Occidente— en letra Arial blanca (los enlaces, en Rubik).
 * Desde 768 px hacia abajo, las columnas van una debajo de otra.
 */
export default function PieSapiencia() {
  const { sedePrincipal: principal, sedeOccidente: occidente } = PIE
  return (
    <footer className="sap-pie">
      <div className="sap-pie-contenedor">
        <div className="sap-pie-columnas">
          {/* Columna 1: la agencia, contacto, redes y logo. */}
          <div className="sap-pie-col sap-pie-col--agencia">
            <p className="sap-pie-titulo sap-pie-titulo--sangria">{PIE.nombre}</p>
            <h2 className="sap-pie-titulo sap-pie-titulo--sangria">{PIE.tituloContacto}</h2>
            <ul className="sap-pie-contacto">
              {PIE.contacto.map((c) => (
                <li key={c.titulo}>
                  <FilaIcono
                    icono={
                      c.icono === 'telefono' ? (
                        <IconoTelefono className="sap-pie-icono-telefono" />
                      ) : (
                        <IconoCorreo className="sap-pie-icono-correo" />
                      )
                    }
                  >
                    <span className="sap-pie-lineas">
                      <span className="sap-pie-destacado">{c.titulo}</span>
                      <span>{c.detalle}</span>
                    </span>
                  </FilaIcono>
                </li>
              ))}
            </ul>
            <h2 className="sap-pie-titulo">{PIE.tituloRedes}</h2>
            <ul className="sap-pie-redes">
              {PIE.redes.map((r) => {
                const icono = ICONOS_REDES[r.red]
                return (
                  <li key={r.red}>
                    <a className="sap-pie-red" href={r.url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={icono.src}
                        alt={`${r.nombre} ${AVISO_PESTANA}`}
                        width={icono.ancho}
                        height={icono.alto}
                        loading="lazy"
                        decoding="async"
                      />
                    </a>
                  </li>
                )
              })}
            </ul>
            <p className="sap-pie-bloque">
              <img
                className="sap-pie-logo"
                src={LOGO_SAPIENCIA_PIE.src}
                alt="Sapiencia, Agencia de Educación Postsecundaria de Medellín. Alcaldía de Medellín, Distrito de Ciencia, Tecnología e Innovación"
                width={LOGO_SAPIENCIA_PIE.ancho}
                height={LOGO_SAPIENCIA_PIE.alto}
                loading="lazy"
                decoding="async"
              />
            </p>
          </div>

          <div className="sap-pie-col sap-pie-col--resto">
            {/* Columna 2: contratación, políticas y logos de Colombia y GOV.CO. */}
            <div className="sap-pie-sub">
              <h2 className="sap-pie-titulo">{PIE.tituloContratacion}</h2>
              <p className="sap-pie-bloque">
                <EnlaceOficial className="sap-pie-enlace sap-pie-enlace--secop" enlace={PIE.contratacion[0]}>
                  {PIE.contratacion[0].texto}
                  <img
                    src={LOGO_COLOMBIA_COMPRA.src}
                    alt="Colombia Compra Eficiente"
                    width={160}
                    height={58}
                    loading="lazy"
                    decoding="async"
                  />
                </EnlaceOficial>
              </p>
              <ListaEnlaces enlaces={PIE.contratacion.slice(1)} />
              <h2 className="sap-pie-titulo">{PIE.tituloPoliticas}</h2>
              <ListaEnlaces enlaces={PIE.politicas} />
              <p className="sap-pie-bloque">
                <a className="sap-pie-marca" href={PIE.urlColombia} target="_blank" rel="noopener noreferrer">
                  <img
                    src={LOGO_COLOMBIA_CO.src}
                    alt={`Colombia, marca país ${AVISO_PESTANA}`}
                    width={LOGO_COLOMBIA_CO.ancho}
                    height={LOGO_COLOMBIA_CO.alto}
                    loading="lazy"
                    decoding="async"
                  />
                </a>
              </p>
              <p className="sap-pie-bloque">
                <a className="sap-pie-marca" href={PIE.urlGovco} target="_blank" rel="noopener noreferrer">
                  <img
                    src={LOGO_GOVCO.src}
                    alt={`GOV.CO, portal único del Estado colombiano ${AVISO_PESTANA}`}
                    width={LOGO_GOVCO.ancho}
                    height={LOGO_GOVCO.alto}
                    loading="lazy"
                    decoding="async"
                  />
                </a>
              </p>
            </div>

            {/* Columna 3: sede principal. */}
            <div className="sap-pie-sub">
              <h2 className="sap-pie-titulo">{PIE.tituloUbicacion}</h2>
              <div className="sap-pie-bloque sap-pie-sede">
                <h3 className="sap-pie-destacado sap-pie-sede-nombre">{principal.nombre}</h3>
                <EnlaceMapa url={principal.mapa} lugar="la sede principal" />
                {principal.direccion.map((linea) => (
                  <span key={linea} className="sap-pie-linea">
                    {linea}
                  </span>
                ))}
                <span className="sap-pie-linea sap-pie-horario">{PIE.tituloHorario}</span>
                {principal.horario.map((h) => (
                  <FilaIcono key={h.dias} icono={<IconoReloj className="sap-pie-icono-reloj" />}>
                    <LineasHorario horario={h} />
                  </FilaIcono>
                ))}
              </div>
            </div>

            {/* Columna 4: sede Ciudadela Occidente y fecha de actualización. */}
            <div className="sap-pie-sub sap-pie-sub--occidente">
              <div className="sap-pie-bloque sap-pie-sede">
                <h3 className="sap-pie-destacado sap-pie-sede-nombre">{occidente.nombre}</h3>
                <EnlaceMapa url={occidente.peatonal.mapa} lugar="la entrada peatonal de la sede Ciudadela Occidente" />
                <span className="sap-pie-linea">{occidente.peatonal.titulo}</span>
                <span className="sap-pie-linea">{occidente.peatonal.direccion}</span>
                {/* En el sitio, este tramo está en un <p> y sale en Rubik delgada. */}
                <span className="sap-pie-tramo-rubik">
                  <EnlaceMapa url={occidente.vehicular.mapa} lugar="la entrada vehicular de la sede Ciudadela Occidente" />
                  <span className="sap-pie-linea">{occidente.vehicular.titulo}</span>
                  <span className="sap-pie-linea">{occidente.vehicular.direccion}</span>
                  <span className="sap-pie-linea sap-pie-horario">{PIE.tituloHorario}</span>
                </span>
                <FilaIcono icono={<IconoReloj className="sap-pie-icono-reloj" />}>
                  {occidente.horario.map((h) => (
                    <LineasHorario key={h.dias} horario={h} />
                  ))}
                </FilaIcono>
                <p className="sap-pie-destacado sap-pie-actualizacion">{PIE.fechaActualizacion}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
