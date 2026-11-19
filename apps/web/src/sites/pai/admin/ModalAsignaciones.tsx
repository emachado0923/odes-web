/**
 * Asignar a un responsable procesos completos o indicadores sueltos
 * (PUT /admin/usuarios/:id/asignaciones), con un árbol dependencia ->
 * proceso -> indicador de casillas con tres estados (asignaciones.ts). Los
 * indicadores de cada proceso se despliegan con su botón; la búsqueda los
 * despliega solos y, mientras está, las casillas de dependencia y de proceso
 * actúan solo sobre lo que se ve. Avisa antes de descartar cambios sin
 * guardar. Guarda las asignaciones de la vigencia elegida en la barra.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { UsuarioPai } from '../api-pai'
import { useCambiosPendientes } from '../componentes/cambiosPendientes'
import { Cargando, ErrorCarga } from '../componentes/EstadoCarga'
import ModalPai from '../componentes/ModalPai'
import { mensajeDe } from '../datos/clientePai'
import type { EstadoCarga } from '../datos/useCarga'
import { useSesionPai } from '../sesion/contexto'
import {
  alternarDependenciaVisible,
  alternarIndicador,
  alternarProcesoVisible,
  asignacionesDe,
  indicadorMarcado,
  indicadoresVisibles,
  marcaDependenciaVisible,
  marcaProcesoVisible,
  mismasAsignaciones,
  procesoParcial,
  resumenAsignaciones,
  seleccionDe,
  visiblesConBusqueda,
  type NodoDependencia,
  type NodoProceso,
  type Seleccion,
} from './asignaciones'
import CasillaTriestado from './CasillaTriestado'

export default function ModalAsignaciones({
  usuario,
  arbol,
  onReintentar,
  onCerrar,
  onGuardado,
}: {
  usuario: UsuarioPai
  arbol: EstadoCarga<NodoDependencia[]>
  onReintentar: () => void
  onCerrar: () => void
  onGuardado: (usuario: UsuarioPai) => void
}) {
  const titulo = `Asignaciones de ${usuario.nombre || usuario.usuario}`
  if (arbol.fase !== 'listo') {
    return (
      <ModalPai abierto titulo={titulo} onCerrar={onCerrar} tamano="lg">
        {arbol.fase === 'cargando' ? (
          <Cargando texto="Cargando los procesos e indicadores…" />
        ) : (
          <ErrorCarga
            titulo="No se pudieron cargar los procesos e indicadores."
            mensaje={arbol.mensaje}
            onReintentar={onReintentar}
          />
        )}
      </ModalPai>
    )
  }
  return (
    <ArbolAsignaciones
      usuario={usuario}
      arbol={arbol.datos}
      titulo={titulo}
      onCerrar={onCerrar}
      onGuardado={onGuardado}
    />
  )
}

function ArbolAsignaciones({
  usuario,
  arbol,
  titulo,
  onCerrar,
  onGuardado,
}: {
  usuario: UsuarioPai
  arbol: NodoDependencia[]
  titulo: string
  onCerrar: () => void
  onGuardado: (usuario: UsuarioPai) => void
}) {
  const { cliente, vigenciaElegida } = useSesionPai()
  const id = useId()
  const [seleccion, setSeleccion] = useState<Seleccion>(() => seleccionDe(usuario.asignaciones))
  const [busqueda, setBusqueda] = useState('')
  const [abiertos, setAbiertos] = useState<ReadonlySet<number>>(() => new Set())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [descartar, setDescartar] = useState(false)
  const refError = useRef<HTMLDivElement>(null)

  // "Guardar asignaciones" se deshabilita mientras guarda: si falla, el foco va al aviso.
  useEffect(() => {
    if (error) refError.current?.focus()
  }, [error])

  const original = useMemo(() => asignacionesDe(seleccionDe(usuario.asignaciones), arbol), [usuario, arbol])
  const actual = useMemo(() => asignacionesDe(seleccion, arbol), [seleccion, arbol])
  const sucio = !mismasAsignaciones(original, actual)
  useCambiosPendientes(sucio)
  const visibles = useMemo(() => visiblesConBusqueda(arbol, busqueda), [arbol, busqueda])

  function cambiar(nueva: Seleccion) {
    setSeleccion(nueva)
    setDescartar(false)
  }

  function alternarAbierto(proceso: NodoProceso) {
    setAbiertos((previo) => {
      const siguiente = new Set(previo)
      if (siguiente.has(proceso.id)) siguiente.delete(proceso.id)
      else siguiente.add(proceso.id)
      return siguiente
    })
  }

  function pedirCierre() {
    if (guardando) return
    if (sucio && !descartar) {
      setDescartar(true)
      return
    }
    onCerrar()
  }

  async function guardar() {
    if (guardando) return
    if (!sucio) {
      onCerrar()
      return
    }
    setGuardando(true)
    setError(null)
    try {
      onGuardado(await cliente.asignar(usuario.id, actual, vigenciaElegida))
    } catch (e) {
      setGuardando(false)
      setError(mensajeDe(e))
    }
  }

  return (
    <ModalPai
      abierto
      titulo={titulo}
      onCerrar={pedirCierre}
      bloqueado={guardando}
      tamano="lg"
      pie={
        descartar ? (
          <>
            <p className="me-auto mb-0" role="alert">
              Hay cambios sin guardar. ¿Descartarlos?
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setDescartar(false)}>
              Seguir editando
            </button>
            <button type="button" className="btn btn-outline-danger" onClick={onCerrar}>
              Descartar cambios
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-outline-neutral" onClick={pedirCierre} disabled={guardando}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar asignaciones'}
            </button>
          </>
        )
      }
    >
      {error && (
        <div className="alert alert-danger" role="alert" tabIndex={-1} ref={refError}>
          {error}
        </div>
      )}
      <p>
        Marque un proceso para asignarlo completo (incluye sus indicadores) o despliéguelo para elegir indicadores
        sueltos. {usuario.nombre || usuario.usuario} podrá reportar solo lo que quede marcado.
      </p>
      <div className="mb-3">
        <label className="form-label" htmlFor={`${id}-buscar`}>
          Buscar proceso o indicador
        </label>
        <input
          id={`${id}-buscar`}
          className="form-control"
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Código o nombre, p. ej. SAF-TH"
        />
      </div>
      <p className="pai-arbol-resumen" role="status" aria-live="polite">
        Seleccionado: {resumenAsignaciones(actual)}
      </p>
      {visibles && visibles.procesos.size === 0 && <p className="text-neutral-50">Ningún proceso coincide con la búsqueda.</p>}
      <ul className="pai-arbol list-unstyled mb-0" aria-label="Procesos e indicadores">
        {arbol.map((dependencia) => {
          const procesos = visibles ? dependencia.procesos.filter((p) => visibles.procesos.has(p.id)) : dependencia.procesos
          if (procesos.length === 0) return null
          return (
            <li key={dependencia.id} className="pai-arbol-dependencia">
              <CasillaTriestado
                id={`${id}-d${dependencia.id}`}
                marca={marcaDependenciaVisible(dependencia, seleccion, visibles)}
                onCambiar={() => cambiar(alternarDependenciaVisible(seleccion, dependencia, visibles))}
                deshabilitada={guardando}
              >
                <strong>{dependencia.sigla}</strong> · {dependencia.nombre}
                {visibles && procesos.length < dependencia.procesos.length && (
                  <span className="pai-arbol-cantidad">
                    {' '}
                    ({procesos.length} de {dependencia.procesos.length} procesos: los que coinciden)
                  </span>
                )}
              </CasillaTriestado>
              <ul className="list-unstyled pai-arbol-procesos">
                {procesos.map((proceso) => {
                  const abierto = visibles !== null || abiertos.has(proceso.id)
                  const indicadores = indicadoresVisibles(proceso, visibles)
                  const parcial = procesoParcial(proceso, visibles)
                  const idLista = `${id}-p${proceso.id}-indicadores`
                  return (
                    <li key={proceso.id}>
                      <div className="pai-arbol-fila">
                        <button
                          type="button"
                          className="btn btn-outline-neutral btn-sm pai-arbol-expandir"
                          aria-expanded={abierto}
                          aria-controls={idLista}
                          onClick={() => alternarAbierto(proceso)}
                          disabled={proceso.indicadores.length === 0 || visibles !== null}
                        >
                          <span aria-hidden="true">{abierto ? '−' : '+'}</span>
                          <span className="pai-solo-lector">
                            {abierto ? 'Ocultar' : 'Ver'} los indicadores de {proceso.codigo}
                          </span>
                        </button>
                        <CasillaTriestado
                          id={`${id}-p${proceso.id}`}
                          marca={marcaProcesoVisible(proceso, seleccion, visibles)}
                          onCambiar={() => cambiar(alternarProcesoVisible(seleccion, proceso, visibles))}
                          deshabilitada={guardando}
                        >
                          <span className="pai-codigo">{proceso.codigo}</span> · {proceso.nombre}{' '}
                          <span className="pai-arbol-cantidad">
                            {parcial
                              ? `(${indicadores.length} de ${proceso.indicadores.length} indicadores: los que coinciden)`
                              : `(${proceso.indicadores.length} ${proceso.indicadores.length === 1 ? 'indicador' : 'indicadores'})`}
                          </span>
                        </CasillaTriestado>
                      </div>
                      <ul id={idLista} className="list-unstyled pai-arbol-indicadores" hidden={!abierto}>
                        {indicadores.map((indicador) => (
                          <li key={indicador.id}>
                            <div className="form-check">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                id={`${id}-i${indicador.id}`}
                                checked={indicadorMarcado(proceso, indicador.id, seleccion)}
                                onChange={() => cambiar(alternarIndicador(seleccion, proceso, indicador.id))}
                                disabled={guardando}
                              />
                              <label className="form-check-label" htmlFor={`${id}-i${indicador.id}`}>
                                <span className="pai-codigo">{indicador.codigo}</span> · {indicador.nombre}
                              </label>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ul>
    </ModalPai>
  )
}
