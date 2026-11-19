import type { ReactNode } from 'react'
import { type EnlaceOficial as Enlace, type Horario, PIE } from '../../datos/sapiencia-oficial'
import {
  ICONO_GOOGLE_MAPS,
  ICONOS_REDES,
  LOGO_COLOMBIA_COMPRA,
  LOGO_COLOMBIA_CO,
  LOGO_GOVCO,
  LOGO_SAPIENCIA_PIE,
} from '../../recursos/recursos'
import EnlaceOficial, { AVISO_PESTANA } from './EnlaceOficial'
import { IconoCorreo, IconoReloj, IconoTelefono } from './iconos'
import './sapiencia.css'

/** Una fila con ícono a la izquierda y, al lado, líneas de texto (contacto y horarios del sitio). */
function FilaIcono({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return (
    <div className="pe-sap-pie-fila">
      <span className="pe-sap-pie-fila-icono">{icono}</span>
      {children}
    </div>
  )
}

function LineasHorario({ horario }: { horario: Horario }) {
  return (
    <span className="pe-sap-pie-lineas">
      <span className="pe-sap-pie-destacado">{horario.dias}</span>
      <span>{horario.horas}</span>
    </span>
  )
}

/** Pin de Google Maps que abre la ubicación en otra pestaña (en el sitio, solo el ícono). */
function EnlaceMapa({ url, lugar }: { url: string; lugar: string }) {
  return (
    <a className="pe-sap-pie-mapa" href={url} target="_blank" rel="noopener noreferrer">
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
    <p key={enlace.url} className="pe-sap-pie-bloque">
      <EnlaceOficial className="pe-sap-pie-enlace" enlace={enlace} />
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
    <footer className="pe-sap-pie">
      <div className="pe-sap-pie-contenedor">
        <div className="pe-sap-pie-columnas">
          {/* Columna 1: la agencia, contacto, redes y logo. */}
          <div className="pe-sap-pie-col pe-sap-pie-col--agencia">
            <p className="pe-sap-pie-titulo pe-sap-pie-titulo--sangria">{PIE.nombre}</p>
            <h2 className="pe-sap-pie-titulo pe-sap-pie-titulo--sangria">{PIE.tituloContacto}</h2>
            <ul className="pe-sap-pie-contacto">
              {PIE.contacto.map((c) => (
                <li key={c.titulo}>
                  <FilaIcono
                    icono={
                      c.icono === 'telefono' ? (
                        <IconoTelefono className="pe-sap-pie-icono-telefono" />
                      ) : (
                        <IconoCorreo className="pe-sap-pie-icono-correo" />
                      )
                    }
                  >
                    <span className="pe-sap-pie-lineas">
                      <span className="pe-sap-pie-destacado">{c.titulo}</span>
                      <span>{c.detalle}</span>
                    </span>
                  </FilaIcono>
                </li>
              ))}
            </ul>
            <h2 className="pe-sap-pie-titulo">{PIE.tituloRedes}</h2>
            <ul className="pe-sap-pie-redes">
              {PIE.redes.map((r) => {
                const icono = ICONOS_REDES[r.red]
                return (
                  <li key={r.red}>
                    <a className="pe-sap-pie-red" href={r.url} target="_blank" rel="noopener noreferrer">
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
            <p className="pe-sap-pie-bloque">
              <img
                className="pe-sap-pie-logo"
                src={LOGO_SAPIENCIA_PIE.src}
                alt="Sapiencia, Agencia de Educación Postsecundaria de Medellín. Alcaldía de Medellín, Distrito de Ciencia, Tecnología e Innovación"
                width={LOGO_SAPIENCIA_PIE.ancho}
                height={LOGO_SAPIENCIA_PIE.alto}
                loading="lazy"
                decoding="async"
              />
            </p>
          </div>

          <div className="pe-sap-pie-col pe-sap-pie-col--resto">
            {/* Columna 2: contratación, políticas y logos de Colombia y GOV.CO. */}
            <div className="pe-sap-pie-sub">
              <h2 className="pe-sap-pie-titulo">{PIE.tituloContratacion}</h2>
              <p className="pe-sap-pie-bloque">
                <EnlaceOficial className="pe-sap-pie-enlace pe-sap-pie-enlace--secop" enlace={PIE.contratacion[0]}>
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
              <h2 className="pe-sap-pie-titulo">{PIE.tituloPoliticas}</h2>
              <ListaEnlaces enlaces={PIE.politicas} />
              <p className="pe-sap-pie-bloque">
                <a className="pe-sap-pie-marca" href={PIE.urlColombia} target="_blank" rel="noopener noreferrer">
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
              <p className="pe-sap-pie-bloque">
                <a className="pe-sap-pie-marca" href={PIE.urlGovco} target="_blank" rel="noopener noreferrer">
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
            <div className="pe-sap-pie-sub">
              <h2 className="pe-sap-pie-titulo">{PIE.tituloUbicacion}</h2>
              <div className="pe-sap-pie-bloque pe-sap-pie-sede">
                <h3 className="pe-sap-pie-destacado pe-sap-pie-sede-nombre">{principal.nombre}</h3>
                <EnlaceMapa url={principal.mapa} lugar="la sede principal" />
                {principal.direccion.map((linea) => (
                  <span key={linea} className="pe-sap-pie-linea">
                    {linea}
                  </span>
                ))}
                <span className="pe-sap-pie-linea pe-sap-pie-horario">{PIE.tituloHorario}</span>
                {principal.horario.map((h) => (
                  <FilaIcono key={h.dias} icono={<IconoReloj className="pe-sap-pie-icono-reloj" />}>
                    <LineasHorario horario={h} />
                  </FilaIcono>
                ))}
              </div>
            </div>

            {/* Columna 4: sede Ciudadela Occidente y fecha de actualización. */}
            <div className="pe-sap-pie-sub pe-sap-pie-sub--occidente">
              <div className="pe-sap-pie-bloque pe-sap-pie-sede">
                <h3 className="pe-sap-pie-destacado pe-sap-pie-sede-nombre">{occidente.nombre}</h3>
                <EnlaceMapa url={occidente.peatonal.mapa} lugar="la entrada peatonal de la sede Ciudadela Occidente" />
                <span className="pe-sap-pie-linea">{occidente.peatonal.titulo}</span>
                <span className="pe-sap-pie-linea">{occidente.peatonal.direccion}</span>
                {/* En el sitio, este tramo está en un <p> y sale en Rubik delgada. */}
                <span className="pe-sap-pie-tramo-rubik">
                  <EnlaceMapa url={occidente.vehicular.mapa} lugar="la entrada vehicular de la sede Ciudadela Occidente" />
                  <span className="pe-sap-pie-linea">{occidente.vehicular.titulo}</span>
                  <span className="pe-sap-pie-linea">{occidente.vehicular.direccion}</span>
                  <span className="pe-sap-pie-linea pe-sap-pie-horario">{PIE.tituloHorario}</span>
                </span>
                <FilaIcono icono={<IconoReloj className="pe-sap-pie-icono-reloj" />}>
                  {occidente.horario.map((h) => (
                    <LineasHorario key={h.dias} horario={h} />
                  ))}
                </FilaIcono>
                <p className="pe-sap-pie-destacado pe-sap-pie-actualizacion">{PIE.fechaActualizacion}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
