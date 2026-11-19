import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorSinSesion, type SesionTableros } from "../sesion-tableros";
import Buscador, {
  CargandoResultado,
  SinResultados,
} from "./ventanilla/Buscador";
import EventosPersona from "./ventanilla/EventosPersona";
import FichaBeneficio from "./ventanilla/FichaBeneficio";
import { cortoPrograma } from "./ventanilla/ficha";
import { type OrigenDatos, OrigenDatosContexto } from "./ventanilla/origen";
import Resguardo from "./ventanilla/Resguardo";
import ResumenPersona from "./ventanilla/ResumenPersona";
import type {
  ConsultaReciente,
  FichaFondos,
  ResultadoConsulta,
} from "./ventanilla/tipos";
import "./ventanilla/base.css";

/**
 * Ventanilla de consulta de los fondos (/tableros/fondos-2026/ventanilla): se
 * escribe un documento y sale el expediente de esa persona: quién es y cada
 * uno de sus beneficios (programa y convocatoria) con su recorrido por
 * periodo, como las páginas de consulta del Power BI de seguimiento.
 *
 * Datos personales: POST con X-CSRF-Token (el documento no va en la URL), solo
 * por documento exacto; el servidor registra cada consulta. Nada se guarda en
 * el navegador: las consultas recientes viven en memoria y se pierden al salir.
 *
 * Esta pantalla solo coordina: consulta, qué beneficios están desplegados y a
 * dónde saltar. Cada pieza está en ./ventanilla (ver su LEEME.md).
 */

export const URL_CONSULTA_FONDOS = "/api/sivu/tableros/fondos-2026/consulta";

export type { FichaFondos } from "./ventanilla/tipos";

const MAX_RECIENTES = 6;

/** id del beneficio n.º `indice` y de los eventos: destino de los saltos desde la persona. */
const idBeneficio = (base: string, indice: number) =>
  `${base}-beneficio-${indice}`;
const idEventos = (base: string) => `${base}-eventos`;

async function consultar(
  documento: string,
  sesion: SesionTableros,
): Promise<ResultadoConsulta> {
  const respuesta = await fetch(URL_CONSULTA_FONDOS, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": sesion.csrf,
    },
    credentials: "same-origin",
    body: JSON.stringify({ documento }),
  });
  if (respuesta.status === 401) throw new ErrorSinSesion();
  if (!respuesta.ok) {
    let mensaje = `El servidor respondió con el código ${respuesta.status}.`;
    try {
      const cuerpo = (await respuesta.json()) as { mensaje?: unknown };
      if (typeof cuerpo.mensaje === "string" && cuerpo.mensaje)
        mensaje = cuerpo.mensaje;
    } catch {
      /* sin cuerpo JSON */
    }
    throw new Error(mensaje);
  }
  return (await respuesta.json()) as ResultadoConsulta;
}

/** Con uno o dos beneficios se muestran desplegados; con más, solo el primero (los demás, a un clic). */
function abiertasAlLlegar(beneficios: number): Set<number> {
  return new Set(
    beneficios <= 2 ? Array.from({ length: beneficios }, (_, i) => i) : [0],
  );
}

export default function VentanillaFondos({
  sesion,
  alVencer,
}: {
  sesion: SesionTableros;
  alVencer: () => void;
}) {
  const [documento, setDocumento] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoConsulta | null>(null);
  const [abiertas, setAbiertas] = useState<ReadonlySet<number>>(new Set());
  const [recientes, setRecientes] = useState<ConsultaReciente[]>([]);
  const [origen, setOrigen] = useState<OrigenDatos>("carga");
  const resultados = useRef<HTMLDivElement>(null);

  // De dónde salen los datos (fichas cargadas con corte, o en vivo de Sapiencia): cambia los textos del corte.
  useEffect(() => {
    let vigente = true;
    fetch(URL_CONSULTA_FONDOS, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ origen?: unknown }>) : null))
      .then((cuerpo) => {
        if (vigente && cuerpo?.origen === "sapiencia") setOrigen("sapiencia");
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);
  const turno = useRef(0);
  const base = "vc";

  const beneficios: FichaFondos[] =
    resultado?.fichas.filter((f) => f.p !== "EVENTOS") ?? [];
  const eventos = resultado?.fichas.find((f) => f.p === "EVENTOS") ?? null;

  const alConsultar = useCallback(
    async (otro?: string) => {
      const pedido = (otro ?? documento).trim();
      if (!pedido) return;
      if (otro !== undefined) setDocumento(otro);
      const mio = ++turno.current;
      setBuscando(true);
      setError(null);
      try {
        const r = await consultar(pedido, sesion);
        if (mio !== turno.current) return;
        const fichas = r.fichas.filter((f) => f.p !== "EVENTOS");
        setResultado(r);
        setAbiertas(abiertasAlLlegar(fichas.length));
        if (r.fichas.length > 0) {
          const reciente: ConsultaReciente = {
            documento: r.documento,
            nombre: fichas.find((f) => f.n)?.n ?? null,
            beneficios: fichas.length,
          };
          setRecientes((antes) =>
            [
              reciente,
              ...antes.filter((c) => c.documento !== r.documento),
            ].slice(0, MAX_RECIENTES),
          );
        }
        requestAnimationFrame(() => {
          const zona = resultados.current;
          if (!zona) return;
          // Si se consultó desde la barra pegada con la página desplazada, el expediente nuevo empieza arriba.
          if (
            zona.getBoundingClientRect().top < 0 &&
            typeof zona.scrollIntoView === "function"
          )
            zona.scrollIntoView({ block: "start" });
          zona.focus({ preventScroll: true });
        });
      } catch (e) {
        if (mio !== turno.current) return;
        if (e instanceof ErrorSinSesion) {
          alVencer();
          return;
        }
        setResultado(null);
        setError(
          e instanceof Error ? e.message : "No se pudo hacer la consulta.",
        );
      } finally {
        if (mio === turno.current) setBuscando(false);
      }
    },
    [documento, sesion, alVencer],
  );

  /** Despliega el destino y lleva la vista hasta él (sin animación si la persona la redujo). */
  const alIrA = useCallback((destino: number | "eventos") => {
    if (destino !== "eventos")
      setAbiertas((antes) => new Set(antes).add(destino));
    const id =
      destino === "eventos" ? idEventos(base) : idBeneficio(base, destino);
    requestAnimationFrame(() => {
      const elemento = document.getElementById(id);
      if (!elemento) return;
      const sinMovimiento =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false;
      elemento.scrollIntoView({
        behavior: sinMovimiento ? "auto" : "smooth",
        block: "start",
      });
      elemento.focus({ preventScroll: true });
    });
  }, []);

  const alternar = (indice: number) =>
    setAbiertas((antes) => {
      const nuevas = new Set(antes);
      if (!nuevas.delete(indice)) nuevas.add(indice);
      return nuevas;
    });

  return (
    <OrigenDatosContexto value={origen}>
      <div className="vc">
        <Buscador
          documento={documento}
          alCambiar={setDocumento}
          alConsultar={(otro) => void alConsultar(otro)}
          buscando={buscando}
          error={error}
          recientes={recientes}
          compacto={resultado !== null}
        />

        {buscando && !resultado && <CargandoResultado />}

        {resultado && (
          <div
            className="vc-resultados"
            ref={resultados}
            tabIndex={-1}
            aria-busy={buscando}
          >
            {resultado.fichas.length === 0 ? (
              <SinResultados documento={resultado.documento} />
            ) : (
              <>
                {/* Cada parte va en su resguardo (con la consulta en la key: una consulta nueva lo reinicia). */}
                <Resguardo
                  key={`${resultado.documento}-persona`}
                  que="el resumen de la persona"
                >
                  <ResumenPersona
                    documento={resultado.documento}
                    beneficios={beneficios}
                    eventos={eventos}
                    abiertas={abiertas}
                    alIrA={alIrA}
                    alAbrirTodas={() =>
                      setAbiertas(new Set(beneficios.map((_, i) => i)))
                    }
                    alCerrarTodas={() => setAbiertas(new Set())}
                  />
                </Resguardo>
                {beneficios.map((ficha, i) => (
                  // eslint-disable-next-line react/no-array-index-key -- una ficha por beneficio, en el orden de la base
                  <Resguardo
                    key={`${resultado.documento}-${ficha.p}-${ficha.c}-${i}`}
                    que={`el beneficio de ${cortoPrograma(ficha.p)}${ficha.c ? `, convocatoria ${ficha.c}` : ""}`}
                  >
                    <FichaBeneficio
                      ficha={ficha}
                      id={idBeneficio(base, i)}
                      abierta={abiertas.has(i)}
                      alAlternar={() => alternar(i)}
                    />
                  </Resguardo>
                ))}
                {eventos && (
                  <Resguardo
                    key={`${resultado.documento}-eventos`}
                    que="los eventos"
                  >
                    <EventosPersona ficha={eventos} id={idEventos(base)} />
                  </Resguardo>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </OrigenDatosContexto>
  );
}
