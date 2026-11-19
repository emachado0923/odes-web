// @ts-nocheck -- código del tablero estático, traído casi sin cambios (ver abajo).
/* oxlint-disable react-hooks/exhaustive-deps, react/immutability, react-hooks/rules-of-hooks -- código probado del
   tablero estático: sus listas de dependencias son a propósito y cambiarlas cambiaría cuándo se redibujan los
   gráficos. Visual llama useMemo dentro de la rama de su tipo, que no cambia mientras vive: los visuales son los
   de la variante y Variante se vuelve a montar (key) al cambiar de variante. */
/* ====================================================================== */
/*  Batería de indicadores de educación postsecundaria                    */
/*  Observatorio de Educación de Sapiencia                                */
/*                                                                        */
/*  Es js/dashboard.jsx del tablero estático (la versión de los datos     */
/*  20261011) con cambios de integración en el sitio:                     */
/*  - React, ECharts y KaTeX se importan (antes eran globales y el JSX se */
/*    transpilaba en el navegador con Babel). KaTeX solo se descarga al   */
/*    mostrar una fórmula (catálogo de indicadores).                      */
/*  - La navegación usa las rutas del sitio (React Router):               */
/*    /tableros/bateria-indicadores/<vista>?v=<variante> en vez de        */
/*    #/<vista>?v=<variante> (ver rutas-bateria.ts).                      */
/*  - Los datos siguen en window.ODES. La estructura de navegación        */
/*    (vistas.js), las geometrías (geo.js) y los textos (definiciones.js) */
/*    los carga PaginaBateria.tsx ANTES de importar este módulo, porque   */
/*    aquí arriba se calculan constantes con ellos. Los datos de cada     */
/*    vista (v/<vista>.js) se cargan bajo demanda desde URL_DATOS_BATERIA.*/
/*  - El logo de la bienvenida se importa y el módulo exporta App en vez  */
/*    de montarse solo.                                                   */
/*  - Para el lint, se quitaron las ayudas que nadie usaba (titulo,       */
/*    Leyenda) y las variables sin uso.                                   */
/*  - El contenedor del inicio se llama inicio-bateria (antes inicio, sin */
/*    estilos propios): .inicio es la raíz de la portada del sitio        */
/*    (src/inicio/inicio.css), que se carga en todas las páginas y le     */
/*    ponía su fondo y su alto de pantalla completa.                      */
/* ====================================================================== */

import * as echarts from 'echarts';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { LOGO_OBSERVATORIO } from '../recursos/recursos';
import { URL_DATOS_BATERIA } from '../rutas';
import { cargarScript } from './cargar-script';
import { leerRuta, rutaVista } from './rutas-bateria';

const NAV = window.ODES.vistas;
const DEF = window.ODES.definiciones;
const GEO = window.ODES.geo || {};
/* Datos de las vistas ya cargados. Cada datos/v/<vista>.js los deja en
   window.ODES.datos; se guardan también aquí, porque otra página del sitio
   puede reemplazar window.ODES (la del tablero de matrícula lo hace). */
const DATOS = {};
function datosVista(id) {
  const d = window.ODES && window.ODES.datos && window.ODES.datos[id];
  if (d && !DATOS[id]) DATOS[id] = d;
  return DATOS[id] || null;
}

/* ---------------------------------------------------------------- color */

const TIPO = '"Rubik", system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const TAM = 10.5;
const ALTO = 360;
const TAM_BARRAS = 12;
const TAM_CIFRA = 15;
const TAM_PARTE = 13;

/* Paleta institucional (colores.pdf): seis colores primarios y el magenta
   de Sapiencia. Cada dimensión conserva su color en todo el tablero. */
const AZUL = '#003C57';
const CELESTE = '#26AAE2';
const MORADO = '#A14A9C';
const VERDE = '#169B4F';
const AMARILLO = '#FBDB2D';
const NARANJA = '#F4782C';
const MAGENTA = '#962B8C';
const SERIES = [AZUL, CELESTE, MORADO, VERDE, NARANJA, AMARILLO, '#1C91D0', '#78C043', '#F68C2B', '#15A5B2'];
const COLOR_FAMILIA = {
  secondary: AZUL, info: CELESTE, primary: MORADO, success: VERDE,
  warning: NARANJA, amarillo: AMARILLO, magenta: MAGENTA
};
/* Escala secuencial de los mapas y matrices: complementarios azules de la paleta. */
const ESCALA = ['#E1F4FB', '#95D6DA', '#19BFD5', '#26AAE2', '#1C91D0', '#003C57'];
const paleta = i => SERIES[i % SERIES.length];
/* Colores planos: sin degradados. */
const degradado = color => color;
const areaDegradado = color => aclarar(color, 0.82);
const TINTA = '#151717';
const TINTA2 = '#3D4041';
const GRIS = '#4E5254';
const LINEA = '#DCDCDC';
const PISTA = '#F4F4F4';

/* Color por dimensión: una misma variable se reconoce por su color. */
const COLOR_DIM = [
  [/sexo|g[eé]nero/i, MORADO],
  [/nivel.*formaci|tipo de formaci|tipo de pregrado|nivel acad/i, CELESTE],
  [/metodolog|modalidad/i, NARANJA],
  [/[aá]rea|n[uú]cleo|campo/i, VERDE],
  [/estrato/i, AMARILLO],
  [/comuna|municipio|departamento|pa[ií]s|regi[oó]n/i, AZUL],
  [/ies|instituci|universidad|sector|car[aá]cter|sede/i, AZUL],
  [/convocatoria|a[nñ]o|vigencia|semestre|per[ií]odo|cohorte/i, CELESTE]
];
function colorDe(dim, fijo) {
  if (fijo) return fijo;
  const d = String(dim || '');
  for (let i = 0; i < COLOR_DIM.length; i++) if (COLOR_DIM[i][0].test(d)) return COLOR_DIM[i][1];
  return AZUL;
}

/* -------------------------------------------------------------- formatos */

const fNum = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const fDec = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fDec2 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const vacio = v => v === null || v === undefined || (typeof v === 'number' && isNaN(v));
const num = v => (vacio(v) ? '—' : fNum.format(Math.round(v)));
const dec = v => (vacio(v) ? '—' : fDec.format(v));
const dec2 = v => (vacio(v) ? '—' : fDec2.format(v));
const pct = (v, d) => (vacio(v) ? '—' : v.toFixed(d === undefined ? 1 : d).replace('.', ',') + '%');
const parte = (v, total) => (!total ? null : (v * 100) / total);
/* Formato según la declaración de la medida: num, dec, dec2, pct (fracción
   0-1), pct100 (ya en porcentaje), pesos. */
function formato(v, f) {
  if (vacio(v)) return '—';
  if (f === 'pct') return pct(v * 100);
  if (f === 'pct100') return pct(v);
  if (f === 'dec') return dec(v);
  if (f === 'dec2') return dec2(v);
  if (f === 'pesos') return '$ ' + num(v);
  return num(v);
}

const clave = t =>
  String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sinTilde = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const recortar = (t, n) => (String(t).length > n ? String(t).slice(0, n - 1) + '…' : String(t));

const medirTexto = (function () {
  const ctx = document.createElement('canvas').getContext('2d');
  return (texto, tam, peso) => {
    ctx.font = (peso ? peso + ' ' : '') + tam + 'px ' + TIPO;
    return ctx.measureText(String(texto)).width;
  };
})();

function lineasDe(texto, ancho, tam) {
  const espacio = medirTexto(' ', tam);
  let lineas = 1, actual = 0;
  String(texto).split(' ').forEach(p => {
    const w = medirTexto(p, tam);
    if (!actual) actual = w;
    else if (actual + espacio + w <= ancho) actual += espacio + w;
    else { lineas++; actual = w; }
  });
  return lineas;
}

function envolver(texto, ancho, maximo) {
  const palabras = String(texto).replace(/-/g, '- ').split(' ');
  const lineas = [];
  let actual = '';
  palabras.forEach(p => {
    if (!actual) { actual = p; return; }
    if ((actual + ' ' + p).length <= ancho) actual += (actual.slice(-1) === '-' ? '' : ' ') + p;
    else { lineas.push(actual); actual = p; }
  });
  if (actual) lineas.push(actual);
  if (maximo && lineas.length > maximo) {
    const cortadas = lineas.slice(0, maximo);
    cortadas[maximo - 1] = recortar(cortadas[maximo - 1], ancho);
    return cortadas.join('\n');
  }
  return lineas.join('\n');
}

function aclarar(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const m = (c, k) => Math.round(c + (255 - c) * k);
  return '#' + [m(n >> 16 & 255, t), m(n >> 8 & 255, t), m(n & 255, t)]
    .map(v => ('0' + v.toString(16)).slice(-2)).join('');
}

/* Orden natural para categorías que son períodos, años o rangos. */
function ordenNatural(a, b) {
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}
const esTemporal = col => /a[nñ]o|vigencia|semestre|per[ií]odo|periodo|cohorte|convocatoria|fecha/i.test(String(col));

/* =================================================================== */
/*  Datos de una vista: tabla con columnas categóricas (diccionario) y   */
/*  numéricas. filas: arreglos; las categóricas guardan el índice en     */
/*  vals.                                                                */
/* =================================================================== */

function prepararDatos(d) {
  if (!d || d._listo) return d;
  const idx = {};
  d.cols.forEach((c, i) => { idx[c.n] = i; });
  d.idx = idx;
  d.col = n => idx[n];
  d.esCat = n => d.cols[idx[n]] && d.cols[idx[n]].t === 'c';
  d.rotulo = (n, v) => (d.esCat(n) ? d.cols[idx[n]].vals[v] : v);
  d._listo = true;
  return d;
}

function aplicarFiltros(d, filtros, excepto) {
  const claves = Object.keys(filtros).filter(k => k !== excepto && filtros[k] && filtros[k].length);
  if (!claves.length) return d.filas;
  const pares = claves.map(k => [d.col(k), new Set(filtros[k])]);
  return d.filas.filter(f => {
    for (let i = 0; i < pares.length; i++) if (!pares[i][1].has(f[pares[i][0]])) return false;
    return true;
  });
}

function opcionesFiltro(d, filas, col) {
  const i = d.col(col);
  const c = d.cols[i];
  const vistos = new Set();
  filas.forEach(f => vistos.add(f[i]));
  const lista = Array.from(vistos);
  lista.sort((a, b) => ordenNatural(c.vals[a], c.vals[b]));
  return lista;
}

/* Agregación de una medida sobre filas: sum, count (suma de n), avg, min,
   max, distinct. `col` es el nombre de la columna; para count puede omitirse. */
function agregar(d, filas, medida) {
  const agg = medida.agg || 'sum';
  if (agg === 'constante') return medida.valor;
  const ci = medida.col !== undefined ? d.col(medida.col) : undefined;
  const cn = d.col('n');
  if (agg === 'count') {
    if (cn !== undefined) { let s = 0; filas.forEach(f => { s += f[cn] || 0; }); return s; }
    return filas.length;
  }
  if (agg === 'distinct') {
    const s = new Set(); filas.forEach(f => { if (f[ci] !== null && f[ci] !== undefined) s.add(f[ci]); }); return s.size;
  }
  if (agg === 'sum') { let s = 0; filas.forEach(f => { const v = f[ci]; if (v !== null && v !== undefined) s += v; }); return s; }
  if (agg === 'avg') {
    /* Promedio ponderado por n cuando las filas vienen agrupadas. */
    let s = 0, w = 0;
    filas.forEach(f => {
      const v = f[ci]; if (v === null || v === undefined) return;
      const p = cn !== undefined && medida.ponderado !== false ? (f[cn] || 1) : 1;
      s += v * p; w += p;
    });
    return w ? s / w : null;
  }
  if (agg === 'min' || agg === 'max') {
    let r = null;
    filas.forEach(f => { const v = f[ci]; if (v === null || v === undefined) return; if (r === null || (agg === 'min' ? v < r : v > r)) r = v; });
    return r;
  }
  if (agg === 'last') {
    let r = null; filas.forEach(f => { const v = f[ci]; if (v !== null && v !== undefined) r = v; }); return r;
  }
  return null;
}

/* Agrupa por una dimensión: devuelve [{k, nombre, filas}] ordenados. */
function agruparPor(d, filas, dim, orden) {
  const ci = d.col(dim);
  const mapa = new Map();
  filas.forEach(f => {
    const k = f[ci];
    if (k === null || k === undefined) return;
    let e = mapa.get(k);
    if (!e) { e = { k: k, nombre: String(d.rotulo(dim, k)), filas: [] }; mapa.set(k, e); }
    e.filas.push(f);
  });
  const lista = Array.from(mapa.values());
  if (orden === 'natural' || (orden === undefined && esTemporal(dim))) lista.sort((a, b) => ordenNatural(a.nombre, b.nombre));
  return lista;
}

function serieDe(d, filas, dim, medida, orden) {
  const grupos = agruparPor(d, filas, dim, orden);
  const lista = grupos.map(g => ({ k: g.k, nombre: g.nombre, valor: agregar(d, g.filas, medida) }))
    .filter(e => e.valor !== null && e.valor !== undefined);
  if (!(orden === 'natural' || (orden === undefined && esTemporal(dim)))) lista.sort((a, b) => (b.valor || 0) - (a.valor || 0));
  return lista;
}

/* =================================================================== */
/*  Descargas                                                           */
/* =================================================================== */

function descargarCsv(nombreArchivo, encabezados, filas) {
  const celda = v => {
    if (vacio(v)) return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    const t = String(v);
    return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const texto = [encabezados].concat(filas).map(f => f.map(celda).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombreArchivo + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function descargarPng(ec, nombreSalida, tit) {
  const pr = 3;
  const base = ec.getDataURL({ type: 'png', pixelRatio: pr, backgroundColor: '#fff' });
  const img = new Image();
  img.onload = function () {
    const cabecera = 76 * pr, pie = 38 * pr, margen = 22 * pr;
    const lienzo = document.createElement('canvas');
    lienzo.width = img.width; lienzo.height = img.height + cabecera + pie;
    const c = lienzo.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, lienzo.width, lienzo.height);
    c.textBaseline = 'middle';
    c.fillStyle = AZUL; c.font = '600 ' + 16 * pr + 'px ' + TIPO; c.fillText(tit, margen, 30 * pr);
    c.fillStyle = GRIS; c.font = 11 * pr + 'px ' + TIPO; c.fillText(DEF.observatorio, margen, 54 * pr);
    c.strokeStyle = LINEA; c.lineWidth = 1 * pr; c.beginPath();
    c.moveTo(margen, cabecera - 8 * pr); c.lineTo(lienzo.width - margen, cabecera - 8 * pr); c.stroke();
    c.drawImage(img, 0, cabecera);
    c.fillStyle = GRIS; c.font = 10 * pr + 'px ' + TIPO; c.fillText(DEF.nota, margen, img.height + cabecera + pie / 2);
    const a = document.createElement('a');
    a.href = lienzo.toDataURL('image/png'); a.download = nombreSalida + '.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
  img.src = base;
}

/* =================================================================== */
/*  Piezas de interfaz (plantilla de Sapiencia)                         */
/* =================================================================== */

const Icono = ({ nombre, className }) => (
  <span className={'material-symbols-outlined' + (className ? ' ' + className : '')} aria-hidden="true">{nombre}</span>
);

const BotonIcono = ({ icono, rotulo, onClick }) => (
  <button type="button" className="btn btn-icon btn-outline-neutral btn-mn" title={rotulo} aria-label={rotulo} onClick={onClick}>
    <Icono nombre={icono} />
  </button>
);

function Descargas({ csv, instancia, nombre, titulo }) {
  return (
    <span className="acciones-grafico">
      {csv ? (
        <BotonIcono icono="download" rotulo="Descargar los datos en CSV"
          onClick={() => { const d = csv(); if (d) descargarCsv(nombre || 'datos_odes', d.encabezados, d.filas); }} />
      ) : null}
      {instancia ? (
        <BotonIcono icono="image" rotulo="Descargar el gráfico en PNG"
          onClick={() => { const ec = instancia.current; if (ec) descargarPng(ec, nombre || 'grafico_odes', titulo); }} />
      ) : null}
    </span>
  );
}

function SelectorMultiple({ etiqueta, opciones, valores, onCambio, rotulo, secundario, buscador, resumenVacio, ancho, unico }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const caja = useRef(null);
  const id = 'sel-' + clave(etiqueta);

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = e => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    const esc = e => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, [abierto]);

  const visibles = useMemo(() => {
    if (!texto) return opciones.slice(0, 400);
    const t = sinTilde(texto);
    return opciones.filter(o => sinTilde(rotulo(o)).indexOf(t) >= 0 ||
      (secundario ? sinTilde(secundario(o)).indexOf(t) >= 0 : false)).slice(0, 400);
  }, [opciones, texto]);

  const resumen = valores.length === 0 ? (resumenVacio || 'Todos')
    : valores.length === 1 ? rotulo(valores[0]) : valores.length + ' seleccionados';

  const alternar = v => {
    if (unico) { onCambio(valores.indexOf(v) >= 0 ? [] : [v]); setAbierto(false); return; }
    const s = valores.slice();
    const i = s.indexOf(v);
    if (i >= 0) s.splice(i, 1); else s.push(v);
    onCambio(s);
  };

  return (
    <div className={'selector' + (ancho ? ' selector-ancho' : '')} ref={caja}>
      <button type="button" className="form-select" id={id} aria-haspopup="true" aria-expanded={abierto}
        aria-controls={id + '-lista'} aria-label={etiqueta + ': ' + resumen} title={resumen}
        data-activo={valores.length ? '1' : '0'} onClick={() => setAbierto(a => !a)}>
        {resumen}
      </button>
      {abierto ? (
        <div className="dropdown-menu show" id={id + '-lista'} role="group" aria-label={etiqueta}>
          {buscador || opciones.length > 10 ? (
            <input className="form-control form-control-sm mb-2" type="search" value={texto} autoFocus
              placeholder={'Buscar en ' + etiqueta.toLowerCase()} aria-label={'Buscar en ' + etiqueta.toLowerCase()}
              onChange={e => setTexto(e.target.value)} />
          ) : null}
          <div className="selector-lista">
            {visibles.length === 0
              ? <p className="small text-neutral-50 text-center my-3">Sin resultados</p>
              : visibles.map((o, i) => (
                <div className="form-check" key={String(o)}>
                  <input className="form-check-input" type={unico ? 'radio' : 'checkbox'} id={id + '-' + i}
                    checked={valores.indexOf(o) >= 0} onChange={() => alternar(o)} />
                  <label className="form-check-label" htmlFor={id + '-' + i}>
                    {rotulo(o)}
                    {secundario ? <span className="secundario">{secundario(o)}</span> : null}
                  </label>
                </div>
              ))}
          </div>
          {opciones.length > visibles.length ? (
            <p className="small text-neutral-50 mt-2 mb-0">Use el buscador para ver el resto.</p>
          ) : null}
          <div className="border-top mt-2 pt-2">
            <button type="button" className="btn btn-outline-neutral btn-sm" onClick={() => onCambio([])}>Quitar selección</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const COLORES_PASOS = [AZUL, CELESTE, MORADO, VERDE, AMARILLO, NARANJA];

function Intro({ onCerrar }) {
  const t = DEF.intro || {};
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', esc);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = antes; };
  }, []);
  return (
    <div className="bienvenida-fondo" onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="bienvenida" role="dialog" aria-modal="true" aria-labelledby="intro-tit">
        <div className="bienvenida-cabecera">
          <img src={LOGO_OBSERVATORIO.src} alt="Observatorio de Sapiencia" width={LOGO_OBSERVATORIO.ancho} height={LOGO_OBSERVATORIO.alto} />
          <button type="button" className="bienvenida-cerrar" aria-label="Cerrar" onClick={onCerrar}><Icono nombre="close" /></button>
        </div>
        <div className="bienvenida-cuerpo">
          <div className="bienvenida-etiqueta">{t.etiqueta}</div>
          <h2 className="bienvenida-titulo" id="intro-tit">{t.titulo}</h2>
          <p className="bienvenida-texto">{t.texto}</p>
          <h3 className="bienvenida-sub">{t.subtitulo}</h3>
          <ul className="bienvenida-pasos">
            {(t.pasos || []).map((p, i) => (
              <li key={p.titulo}>
                <span className="bienvenida-circulo" style={{ background: COLORES_PASOS[i % COLORES_PASOS.length] }}><Icono nombre={p.icono} /></span>
                <div>
                  <div className="bienvenida-paso-tit">{p.titulo}</div>
                  <div className="bienvenida-paso-txt">{p.texto}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="bienvenida-pie">
          <span className="bienvenida-fuente">{DEF.nota}</span>
          <button type="button" className="bienvenida-boton" onClick={onCerrar} autoFocus>{t.boton || 'Entendido'}</button>
        </div>
      </div>
    </div>
  );
}

function Ficha({ titulo, accion, pie, claro, children, sinPie }) {
  return (
    <section className="card card-lg h-100" data-bs-theme={claro ? 'light' : undefined}>
      <div className="card-header d-flex justify-content-between align-items-center gap-3">
        <h3 className="card-title mb-0">{titulo}</h3>
        {accion || null}
      </div>
      <div className="card-body">{children}</div>
      {sinPie ? null : <div className="card-footer small ficha-fuente">{pie || DEF.fuente}</div>}
    </section>
  );
}

const SinDatos = ({ texto }) => (
  <p className="text-neutral-50 text-center py-5 mb-0">{texto || 'Sin datos para la selección activa.'}</p>
);

function Grafico({ opcion, altoPx, instancia, alSeleccionar }) {
  const caja = useRef(null);
  const inst = useRef(null);
  const [ancho, setAncho] = useState(0);

  useEffect(() => {
    if (!echarts || !caja.current) return undefined;
    inst.current = echarts.init(caja.current, null, { renderer: 'canvas' });
    if (instancia) instancia.current = inst.current;
    const medir = () => { if (caja.current) setAncho(caja.current.clientWidth); };
    const redimensionar = () => { if (inst.current) inst.current.resize(); medir(); };
    medir();
    let obs = null;
    if (window.ResizeObserver) { obs = new ResizeObserver(redimensionar); obs.observe(caja.current); }
    window.addEventListener('resize', redimensionar);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (inst.current) inst.current.resize(); });
    return () => {
      window.removeEventListener('resize', redimensionar);
      if (obs) obs.disconnect();
      if (inst.current) inst.current.dispose();
      inst.current = null;
      if (instancia) instancia.current = null;
    };
  }, []);

  const op = typeof opcion === 'function' ? (ancho ? opcion(ancho) : null) : opcion;
  useEffect(() => { if (inst.current && op) inst.current.setOption(op, true); }, [op]);
  useEffect(() => {
    const ec = inst.current;
    if (!ec) return undefined;
    ec.off('click');
    if (alSeleccionar) ec.on('click', alSeleccionar);
    return () => { if (ec) ec.off('click'); };
  });
  if (!echarts) return <SinDatos texto="Los gráficos no están disponibles en esta sesión." />;
  return <div ref={caja} className="grafico" style={altoPx ? { height: altoPx } : null} />;
}

function FichaGrafico({ titulo, altoPx, opcion, csv, archivo, pie, extra, alSeleccionar }) {
  const instancia = useRef(null);
  return (
    <Ficha titulo={titulo} pie={pie} claro accion={<Descargas csv={csv} instancia={instancia} nombre={archivo} titulo={titulo} />}>
      {opcion ? <Grafico opcion={opcion} altoPx={altoPx} instancia={instancia} alSeleccionar={alSeleccionar} /> : <SinDatos />}
      {opcion ? extra || null : null}
    </Ficha>
  );
}

/** Tabla ordenable con el estilo de la plantilla. */
function Tabla({ columnas, filas, altura, orden, alSeleccionar, seleccion, sinTotal }) {
  const [col, setCol] = useState(orden || (columnas[1] && columnas[1].clave));
  const [asc, setAsc] = useState(false);
  const def = columnas.filter(c => c.clave === col)[0] || columnas[0];
  const ordenadas = useMemo(() => {
    const c = def.clave;
    const s = filas.slice().sort((a, b) => {
      const va = a[c], vb = b[c];
      if (typeof va === 'string' || typeof vb === 'string') return ordenNatural(va, vb);
      return (va || 0) - (vb || 0);
    });
    return asc ? s : s.reverse();
  }, [filas, col, asc]);
  const totales = useMemo(() => {
    const t = {};
    columnas.forEach(c => { if (c.total === 'suma') t[c.clave] = filas.reduce((s, f) => s + (f[c.clave] || 0), 0); });
    return t;
  }, [filas]);
  if (!filas.length) return <div className="grafico"><SinDatos texto="Sin registros para la selección activa." /></div>;
  const hayTotal = !sinTotal && columnas.some(c => c.total === 'suma');
  return (
    <div className="tabla-caja" style={altura ? { height: altura } : null}>
      <table className="table table-hover table-sm align-middle">
        <thead>
          <tr>
            {columnas.map((c, i) => {
              const ordenar = () => { if (col === c.clave) setAsc(a => !a); else { setCol(c.clave); setAsc(c.tipo === 'texto'); } };
              return (
                <th key={c.clave} className={i === 0 ? 'fija' : ''} style={c.ancho ? { minWidth: c.ancho } : null}
                  tabIndex={0} onClick={ordenar}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ordenar(); } }}
                  aria-sort={col === c.clave ? (asc ? 'ascending' : 'descending') : undefined}>
                  <span className="th-texto">
                    {c.rotulo}
                    {col === c.clave ? <Icono nombre={asc ? 'arrow_upward' : 'arrow_downward'} className="orden activo" /> : null}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f, j) => (
            <tr key={j} className={(alSeleccionar ? 'clicable' : '') + (seleccion && f.k !== undefined && seleccion.indexOf(f.k) >= 0 ? ' table-active' : '')}
              onClick={alSeleccionar ? () => alSeleccionar(f) : undefined}>
              {columnas.map((c, i) => (
                <td key={c.clave} className={i === 0 ? 'izq fija' : ''}>
                  {c.tipo === 'texto' ? f[c.clave] : formato(f[c.clave], c.formato)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {hayTotal ? (
          <tfoot>
            <tr>
              {columnas.map((c, i) => (
                <td key={c.clave} className={i === 0 ? 'izq fija' : ''}>
                  {i === 0 ? 'Total' : c.total === 'suma' ? formato(totales[c.clave], c.formato) : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function Kpi({ icono, familia, etiqueta, valor, pie }) {
  return (
    <div className={'card card-lg h-100 kpi kpi-' + familia}>
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-start gap-2">
          <div className="kpi-etiqueta text-neutral-40">{etiqueta}</div>
          <span className="kpi-icono" style={{ background: COLOR_FAMILIA[familia] || AZUL }}><Icono nombre={icono || 'analytics'} /></span>
        </div>
        <div className="kpi-valor">{valor}</div>
        {pie ? <div className="kpi-pie small text-neutral-50 text-truncate">{pie}</div> : null}
      </div>
    </div>
  );
}

/* =================================================================== */
/*  Configuración de los gráficos (ECharts)                             */
/* =================================================================== */

const base = () => ({
  textStyle: { fontFamily: TIPO, fontSize: TAM, color: TINTA2 },
  animationDuration: 240,
  tooltip: {
    trigger: 'item', confine: true, backgroundColor: '#ffffff', borderColor: LINEA, borderWidth: 1,
    padding: [8, 11], textStyle: { color: TINTA, fontSize: TAM, fontFamily: TIPO }
  }
});
const leyenda = tam => ({
  top: 0, left: 0, icon: 'rect', itemWidth: 11, itemHeight: 11, itemGap: 16,
  textStyle: { color: TINTA2, fontSize: tam || TAM, fontFamily: TIPO }
});
const opcionesBarras = (ancho, extra) => Object.assign({
  anchoMax: Math.round(Math.min(400, Math.max(120, ancho * 0.4))),
  letra: TAM_BARRAS, letraCifra: TAM_CIFRA, letraParte: TAM_PARTE, nombresCompletos: true, grosor: 15, paso: 28
}, extra);

function barrasH(categorias, valores, opciones) {
  const o = Object.assign({}, opciones);
  const color = o.color || AZUL;
  const fmt = o.formato || 'num';
  const total = o.total || valores.reduce((a, b) => a + b, 0);
  const maximo = Math.max.apply(null, [1e-9].concat(valores));
  const op = base();
  const letra = o.letra || TAM, letraCifra = o.letraCifra || letra, letraParte = o.letraParte || letra;
  let anchoCol = o.ancho || 180;
  if (o.nombresCompletos && o.anchoMax) {
    const masLargo = Math.max.apply(null, [0].concat(categorias.map(c => medirTexto(c, letra))));
    anchoCol = Math.round(Math.min(o.anchoMax, masLargo + 18));
  }
  const anchoRotulo = anchoCol - 14;
  const altoLinea = Math.round(letra * 1.2);
  const lineas = o.nombresCompletos ? Math.max.apply(null, [1].concat(categorias.map(c => lineasDe(c, anchoRotulo, letra)))) : 1;
  const paso = Math.max(o.paso || 26, lineas * altoLinea + 10);
  const alto = o.alto || ALTO;
  const caben = Math.max(3, Math.floor((alto - 34) / paso));
  const recorre = categorias.length > caben;
  const conParte = o.conParte && fmt === 'num';
  const anchoEtiqueta = medirTexto(formato(maximo, fmt), letraCifra, 600) + (conParte && total
    ? medirTexto('  ', letra) + medirTexto(pct(parte(maximo, total)), letraParte, 500) : 0);
  op.grid = {
    left: anchoCol, right: Math.max(Math.round((conParte ? 120 : 80) * letra / TAM), Math.ceil(anchoEtiqueta) + 18) + (recorre ? 26 : 0),
    top: 6, bottom: 6, containLabel: false
  };
  if (recorre) {
    op.dataZoom = [
      { type: 'inside', yAxisIndex: 0, startValue: 0, endValue: caben - 1, zoomOnMouseWheel: false, moveOnMouseWheel: true, moveOnMouseMove: true },
      { type: 'slider', yAxisIndex: 0, startValue: 0, endValue: caben - 1, right: 2, width: 14, top: 6, bottom: 6,
        showDetail: false, brushSelect: false, zoomLock: true, borderColor: LINEA, backgroundColor: '#FAFAFA',
        fillerColor: 'rgba(0,60,87,.14)', handleStyle: { color: '#fff', borderColor: '#CCCCCC' }, moveHandleStyle: { color: LINEA },
        dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } }, selectedDataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } } }
    ];
  }
  op.xAxis = { type: 'value', max: maximo * 1.02, axisLine: { show: true, lineStyle: { color: LINEA } }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } };
  op.yAxis = {
    type: 'category', data: categorias, inverse: true,
    axisLine: { show: true, lineStyle: { color: LINEA } }, axisTick: { show: false },
    axisLabel: { color: TINTA2, fontSize: letra, margin: 12, lineHeight: o.nombresCompletos ? altoLinea : 15, width: anchoRotulo, overflow: o.nombresCompletos ? 'break' : 'truncate' }
  };
  op.tooltip.formatter = p => '<b>' + String(p.name).replace(/\n/g, ' ') + '</b><br/>' + formato(p.value, fmt) + ' ' + (o.unidad || '') +
    (conParte && total ? '<br/>' + pct(parte(p.value, total)) + ' del total' : '');
  /* El grosor crece cuando hay pocas categorías, para que las barras llenen la tarjeta. */
  const visibles = Math.max(1, Math.min(categorias.length, caben));
  const grosor = Math.max(14, Math.min(46, Math.floor(((alto - 12) / visibles) * 0.62)));
  const curva = o.curva === undefined ? Math.min(6, Math.round(grosor / 3)) : o.curva;
  const multicolor = o.multicolor !== false && categorias.length <= 12;
  op.series = [{
    type: 'bar', data: valores, barMaxWidth: grosor, barCategoryGap: '30%', showBackground: true,
    backgroundStyle: { color: PISTA, borderRadius: curva },
    itemStyle: { color: p => degradado(multicolor ? paleta(p.dataIndex) : color, false), borderRadius: curva },
    emphasis: { itemStyle: { color: p => aclarar(multicolor ? paleta(p.dataIndex) : color, 0.2) } },
    label: {
      show: true, position: 'right', distance: 9, fontSize: letra, fontFamily: TIPO,
      formatter: p => (conParte && total ? '{v|' + formato(p.value, fmt) + '}  {p|' + pct(parte(p.value, total)) + '}' : '{v|' + formato(p.value, fmt) + '}'),
      rich: { v: { color: TINTA, fontSize: letraCifra, fontWeight: 500, fontFamily: TIPO }, p: { color: GRIS, fontSize: letraParte, fontFamily: TIPO, fontWeight: letraParte > letra ? 500 : 'normal' } }
    }
  }];
  return op;
}

/** Columnas de una o varias series (agrupadas); con `apilar`, apiladas. */
function columnas(categorias, series, opciones) {
  const o = Object.assign({}, opciones);
  const letra = o.letra || TAM, letraCifra = o.letraCifra || 12;
  const fmt = o.formato || 'num';
  const op = base();
  const varias = series.length > 1;
  op.grid = { left: 8, right: 8, top: varias ? 34 : Math.max(26, Math.round(letraCifra * 1.9)), bottom: 2, containLabel: true };
  if (varias) op.legend = Object.assign(leyenda(letra), { data: series.map(s => s.nombre) });
  /* Caben ocho categorías cortas o seis largas; el resto se recorre con el control inferior. */
  const largas = categorias.some(c => String(c).length > 12);
  const caben = largas ? 6 : 8;
  const muchas = categorias.length > caben;
  if (muchas) {
    op.grid.bottom = 22;
    op.dataZoom = [{ type: 'inside', xAxisIndex: 0, startValue: 0, endValue: caben - 1, zoomOnMouseWheel: false, moveOnMouseWheel: true },
      { type: 'slider', xAxisIndex: 0, startValue: 0, endValue: caben - 1, height: 10, bottom: 4, showDetail: false, brushSelect: false, zoomLock: true,
        borderColor: LINEA, backgroundColor: '#FAFAFA', fillerColor: 'rgba(0,60,87,.14)', handleStyle: { color: '#fff', borderColor: '#CCCCCC' },
        dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } }, selectedDataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } } }];
  }
  op.xAxis = {
    type: 'category', data: categorias, axisLine: { lineStyle: { color: LINEA } }, axisTick: { show: false },
    axisLabel: { color: TINTA2, fontSize: letra, interval: 0, lineHeight: Math.round(letra * 1.3), formatter: v => envolver(v, o.corte || 12, 3) }
  };
  op.yAxis = { type: 'value', axisLine: { show: true, lineStyle: { color: LINEA } }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } };
  op.tooltip.trigger = 'axis';
  op.tooltip.axisPointer = { type: 'shadow', shadowStyle: { color: 'rgba(0,60,87,.05)' } };
  op.tooltip.formatter = ps => '<b>' + ps[0].name + '</b><br/>' + ps.map(p => p.marker + ' ' + (varias ? p.seriesName + ': ' : '') + formato(p.value, fmt)).join('<br/>');
  const mostrarEtiqueta = categorias.length * series.length <= 40;
  const multicolor = !varias && o.multicolor !== false && categorias.length <= 12;
  op.series = series.map((s, k) => ({
    name: s.nombre, type: 'bar', data: s.datos, barMaxWidth: varias ? 48 : 120, barCategoryGap: varias ? '25%' : '32%', barGap: '12%', stack: o.apilar ? 'total' : undefined,
    itemStyle: { color: p => degradado(s.color || (varias ? SERIES[k % SERIES.length] : multicolor ? paleta(p.dataIndex) : (o.color || AZUL)), true), borderRadius: o.apilar ? 0 : [5, 5, 0, 0] },
    label: { show: mostrarEtiqueta, position: o.apilar ? 'inside' : 'top', fontSize: varias ? 10.5 : letraCifra, fontFamily: TIPO, color: o.apilar ? '#fff' : TINTA, fontWeight: 500,
      formatter: p => (p.value === 0 || p.value === null ? '' : formato(p.value, fmt)) }
  }));
  return op;
}

/** Líneas (o áreas) de una o varias series sobre un eje temporal. */
function lineas(categorias, series, opciones) {
  const o = Object.assign({}, opciones);
  const fmt = o.formato || 'num';
  const letra = o.letra || TAM;
  const op = base();
  const varias = series.length > 1;
  op.grid = { left: 8, right: 18, top: varias ? 34 : 24, bottom: 2, containLabel: true };
  if (varias) op.legend = Object.assign(leyenda(letra), { data: series.map(s => s.nombre) });
  op.xAxis = { type: 'category', data: categorias, boundaryGap: false, axisLine: { lineStyle: { color: LINEA } }, axisTick: { show: false },
    axisLabel: { color: TINTA2, fontSize: letra, interval: categorias.length > 8 ? 'auto' : 0, hideOverlap: true, formatter: v => envolver(v, 12, 2) } };
  op.yAxis = { type: 'value', scale: true, axisLine: { show: true, lineStyle: { color: LINEA } }, axisTick: { show: false }, splitLine: { show: true, lineStyle: { color: '#F1F3F4' } },
    axisLabel: { color: TINTA2, fontSize: letra, formatter: v => formato(v, fmt === 'pct' ? 'pct' : fmt === 'pct100' ? 'pct100' : 'num') } };
  op.tooltip.trigger = 'axis';
  op.tooltip.formatter = ps => '<b>' + ps[0].name + '</b><br/>' + ps.map(p => p.marker + ' ' + (varias ? p.seriesName + ': ' : '') + formato(p.value, fmt)).join('<br/>');
  const pocas = categorias.length <= 24;
  op.series = series.map((s, k) => {
    const color = s.color || (varias ? SERIES[k % SERIES.length] : (o.color || AZUL));
    return {
      name: s.nombre, type: 'line', data: s.datos, smooth: true, symbol: 'circle', symbolSize: 8,
      lineStyle: { width: 3, color: color }, itemStyle: { color: color, borderColor: '#fff', borderWidth: 2 },
      areaStyle: o.area || (!varias && o.sinArea !== true) ? { color: areaDegradado(color), opacity: 0.9 } : undefined, connectNulls: true,
      label: { show: pocas && !varias, position: 'top', fontSize: 11, fontFamily: TIPO, color: TINTA, formatter: p => formato(p.value, fmt) }
    };
  });
  return op;
}

/** Columnas con una o varias líneas superpuestas. */
function combo(categorias, barras, lineasSeries, opciones) {
  const op = columnas(categorias, barras, opciones);
  const fmt = (opciones && opciones.formato) || 'num';
  op.legend = Object.assign(leyenda(TAM), { data: barras.map(s => s.nombre).concat(lineasSeries.map(s => s.nombre)) });
  op.grid.top = 40;
  lineasSeries.forEach((s, k) => op.series.push({
    name: s.nombre, type: 'line', data: s.datos, smooth: true, symbol: 'circle', symbolSize: 7,
    lineStyle: { width: 3, color: s.color || SERIES[(barras.length + k) % SERIES.length] }, itemStyle: { color: s.color || SERIES[(barras.length + k) % SERIES.length], borderColor: '#fff', borderWidth: 2 },
    label: { show: false }
  }));
  op.tooltip.formatter = ps => '<b>' + ps[0].name + '</b><br/>' + ps.map(p => p.marker + ' ' + p.seriesName + ': ' + formato(p.value, fmt)).join('<br/>');
  return op;
}

/** Barras horizontales apiladas al cien por ciento. */
function apiladas100(categorias, series, opciones) {
  const o = Object.assign({}, opciones);
  const letra = o.letra || TAM;
  const totales = categorias.map((c, i) => series.reduce((s, e) => s + (e.datos[i] || 0), 0));
  const op = base();
  op.tooltip.trigger = 'axis';
  op.tooltip.axisPointer = { type: 'shadow', shadowStyle: { color: 'rgba(0,60,87,.05)' } };
  op.tooltip.formatter = ps => {
    if (!ps.length) return '';
    const i = ps[0].dataIndex, t = totales[i];
    return '<b>' + categorias[i] + '</b><br/>' + ps.map(p => p.marker + ' ' + p.seriesName + ': ' + num(series[p.seriesIndex].datos[i]) + '  (' + pct(parte(series[p.seriesIndex].datos[i], t)) + ')').join('<br/>') + '<br/>Total: ' + num(t);
  };
  op.legend = Object.assign(leyenda(letra), { data: series.map(s => s.nombre) });
  let anchoCol = o.ancho || 120;
  if (o.anchoMax) {
    const masLargo = Math.max.apply(null, [0].concat(categorias.map(c => medirTexto(c, letra))));
    anchoCol = Math.round(Math.min(o.anchoMax, masLargo + 18));
  }
  op.grid = { left: anchoCol, right: 12, top: Math.max(30, Math.round(letra * 2.4)), bottom: 2, containLabel: false };
  op.xAxis = { type: 'value', max: 100, axisLine: { show: true, lineStyle: { color: LINEA } }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } };
  op.yAxis = { type: 'category', data: categorias, inverse: true, axisLine: { show: true, lineStyle: { color: LINEA } }, axisTick: { show: false },
    axisLabel: { color: TINTA2, fontSize: letra, width: anchoCol - 14, margin: 12, overflow: 'break', lineHeight: Math.round(letra * 1.2) } };
  const anchoTrazo = o.anchoGrafico ? o.anchoGrafico - anchoCol - 24 : 0;
  const cabe = v => (anchoTrazo ? (v / 100) * anchoTrazo >= medirTexto(pct(v), letra, 600) + 12 : v >= 11);
  op.series = series.map((s, k) => ({
    name: s.nombre, type: 'bar', stack: 'total', barMaxWidth: 18,
    data: categorias.map((c, i) => (totales[i] ? (s.datos[i] * 100) / totales[i] : 0)),
    itemStyle: { color: s.color || SERIES[k % SERIES.length], borderColor: '#fff', borderWidth: 2, borderRadius: 9 },
    label: { show: true, fontSize: letra, fontFamily: TIPO, color: '#fff', fontWeight: 500, formatter: p => (cabe(p.value) ? pct(p.value) : '') }
  }));
  return op;
}

/** Anillo con el total en el centro y la leyenda (nombre, valor y porcentaje) a la derecha. */
function anillo(datos, opciones) {
  const o = Object.assign({}, opciones);
  const fmt = o.formato || 'num';
  const total = datos.reduce((s, d) => s + d.value, 0);
  const op = base();
  op.tooltip.formatter = p => '<b>' + p.name + '</b><br/>' + formato(p.value, fmt) + (o.unidad ? ' ' + o.unidad : '') + (fmt === 'num' ? '<br/>' + pct(parte(p.value, total)) + ' del total' : '');
  const ancho = o.ancho || 600;
  const anchoLeyenda = Math.min(300, Math.max(170, Math.round(ancho * 0.46)));
  const anchoNombre = anchoLeyenda - 96;
  const valores = {};
  datos.forEach(d => { valores[d.name] = d.value; });
  op.legend = {
    orient: 'vertical', right: 0, top: 'middle', icon: 'circle', itemWidth: 10, itemHeight: 10, itemGap: 9,
    textStyle: { color: TINTA2, fontSize: 11.5, fontFamily: TIPO, rich: {
      n: { width: anchoNombre, fontSize: 11.5, color: TINTA2, fontFamily: TIPO, align: 'left' },
      v: { width: 56, align: 'right', fontSize: 11.5, fontWeight: 500, color: TINTA, fontFamily: TIPO },
      p: { width: 40, align: 'right', fontSize: 11, color: GRIS, fontFamily: TIPO }
    } },
    formatter: name => '{n|' + recortar(name, Math.max(10, Math.floor(anchoNombre / 6.2))) + '}{v|' + formato(valores[name], fmt) + '}' + (fmt === 'num' ? '{p|' + pct(parte(valores[name], total)) + '}' : '')
  };
  const cx = Math.round((ancho - anchoLeyenda) / 2);
  /* El anillo cabe entre el borde izquierdo y la leyenda, sin solaparse. */
  const alto = o.alto || ALTO;
  const r = Math.max(60, Math.min(cx - 12, alto / 2 - 10));
  op.series = [{
    type: 'pie', radius: [Math.round(r * 0.64), r], center: [cx, '50%'], avoidLabelOverlap: true, padAngle: 1.5,
    itemStyle: { borderColor: '#fff', borderWidth: 2 },
    label: { show: false },
    data: datos.map((d, i) => Object.assign({}, d, { itemStyle: { color: (o.colores && o.colores[i]) || SERIES[i % SERIES.length] } }))
  }];
  op.graphic = [
    { type: 'text', left: cx - 40, top: '44%', style: { text: fmt === 'num' ? num(total) : formato(o.centro, fmt), fontSize: 20, fontWeight: 500, fill: TINTA, fontFamily: TIPO, textAlign: 'center', width: 80 } },
    { type: 'text', left: cx - 40, top: '54%', style: { text: o.rotuloCentro || 'total', fontSize: TAM, fill: GRIS, fontFamily: TIPO, textAlign: 'center', width: 80 } }
  ];
  return op;
}

/** Embudo (nivel académico, etapas). */
function embudo(datos) {
  const total = datos.reduce((s, d) => s + d.value, 0);
  const op = base();
  op.tooltip.formatter = p => '<b>' + p.name + '</b><br/>' + num(p.value) + '<br/>' + pct(parte(p.value, total)) + ' del total';
  op.series = [{
    type: 'funnel', left: '2%', right: '2%', top: 4, bottom: 4, sort: 'descending', gap: 4, minSize: '22%',
    itemStyle: { borderColor: '#fff', borderWidth: 2 },
    label: { show: true, position: 'inside', fontSize: 12, fontFamily: TIPO, color: '#fff', fontWeight: 500, formatter: p => p.name + '\n' + num(p.value) + ' · ' + pct(parte(p.value, total)) },
    data: datos.map((d, i) => Object.assign({}, d, { itemStyle: { color: SERIES[i % SERIES.length] } }))
  }];
  return op;
}

/** Árbol de bloques. */
function arbol(datos, total, opciones) {
  const o = Object.assign({}, opciones);
  const fmt = o.formato || 'num';
  const op = base();
  op.tooltip.formatter = p => '<b>' + p.name + '</b><br/>' + formato(p.value, fmt) + (fmt === 'num' ? '<br/>' + pct(parte(p.value, total)) + ' del total' : '');
  op.series = [{
    type: 'treemap', data: datos.map((d, i) => Object.assign({}, d, { itemStyle: { color: SERIES[i % SERIES.length] } })),
    top: 0, left: 0, right: 0, bottom: 0, roam: false, nodeClick: false, breadcrumb: { show: false },
    itemStyle: { borderColor: '#fff', borderWidth: 2, gapWidth: 2 },
    label: { fontSize: 11.5, fontFamily: TIPO, overflow: 'truncate', lineHeight: 15, formatter: p => (p.value >= total * 0.02 ? envolver(p.name, 20, 3) + '\n' + formato(p.value, fmt) + (fmt === 'num' ? ' · ' + pct(parte(p.value, total)) : '') : '') }
  }];
  return op;
}

/** Mapa coroplético sobre una geometría registrada (comunas, departamentos, municipios). */
function mapa(nombreMapa, datos, opciones) {
  const o = Object.assign({}, opciones);
  const fmt = o.formato || 'num';
  const valores = datos.map(d => d.value).filter(v => v !== null && v !== undefined);
  const maximo = Math.max.apply(null, [0].concat(valores));
  const minimo = Math.min.apply(null, [0].concat(valores));
  const total = valores.reduce((a, b) => a + b, 0);
  const op = base();
  op.tooltip.formatter = p => (p.value === undefined || isNaN(p.value) ? '<b>' + p.name + '</b><br/>Sin dato'
    : '<b>' + p.name + '</b><br/>' + formato(p.value, fmt) + (fmt === 'num' && o.conParte !== false ? '<br/>' + pct(parte(p.value, total)) + ' del total' : ''));
  op.visualMap = {
    min: minimo, max: maximo || 1, left: 0, bottom: 0, orient: 'horizontal', itemWidth: 12, itemHeight: 110, calculable: false,
    inRange: { color: ESCALA }, textStyle: { color: TINTA2, fontSize: TAM, fontFamily: TIPO }, text: [formato(maximo, fmt), formato(minimo, fmt)],
    formatter: v => formato(v, fmt)
  };
  if (o.nota) op.graphic = [{ type: 'text', right: 4, bottom: 4, style: { text: o.nota, fontSize: 10, fill: GRIS, fontFamily: TIPO } }];
  op.series = [{
    type: 'map', map: nombreMapa, roam: false, selectedMode: false, aspectScale: 1, layoutCenter: ['50%', '50%'], layoutSize: '100%',
    itemStyle: { borderColor: '#fff', borderWidth: 1.2, areaColor: '#F4F4F4' },
    emphasis: { label: { show: true }, itemStyle: { areaColor: AMARILLO, borderColor: '#fff' } },
    label: { show: o.rotulos !== false, fontSize: 9.5, fontFamily: TIPO, color: TINTA, formatter: p => (p.value === undefined || isNaN(p.value) ? '' : (o.rotuloCorto ? p.name.replace(/^Corregimiento de /, '').replace(/^(\d+)\.\s*/, '') : p.name)) },
    data: datos
  }];
  return op;
}

/* Las geometrías se registran una vez en ECharts. */
const MAPAS = { comunas: 'Comunas de Medellín', departamentos: 'Departamentos de Colombia', municipiosAntioquia: 'Municipios de Antioquia' };
let mapasRegistrados = false;
function registrarMapas() {
  if (mapasRegistrados || !echarts) return;
  Object.keys(MAPAS).forEach(k => { if (GEO[k]) echarts.registerMap(k, GEO[k]); });
  mapasRegistrados = true;
}
const normGeo = t => sinTilde(t).toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
/* Nombre de la geometría que corresponde a una categoría de los datos. */
function casarGeo(tipo, nombre) {
  const fc = GEO[tipo];
  if (!fc) return null;
  if (!fc._indice) {
    fc._indice = new Map();
    fc.features.forEach(f => {
      const p = f.properties;
      fc._indice.set(normGeo(p.name), p.name);
      if (p.nombre) fc._indice.set(normGeo(p.nombre), p.name);
      if (p.codigo) fc._indice.set(normGeo(p.codigo), p.name);
      if (tipo === 'comunas') {
        fc._indice.set(normGeo(p.nombre.replace(/^Corregimiento de /, '')), p.name);
        fc._indice.set(normGeo(p.codigo + ' ' + p.nombre), p.name);
        fc._indice.set(normGeo(p.codigo + ' ' + p.nombre.replace(/^Corregimiento de /, '')), p.name);
        fc._indice.set(normGeo(parseInt(p.codigo, 10) + ' ' + p.nombre.replace(/^Corregimiento de /, '')), p.name);
        if (p.identifica) fc._indice.set(normGeo(p.identifica), p.name);
      }
    });
    /* Alias frecuentes en las bases. */
    const alias = tipo === 'comunas' ? {
      'SAN SEBASTIAN DE PALMITAS': 'Corregimiento de San Sebastián de Palmitas', 'PALMITAS': 'Corregimiento de San Sebastián de Palmitas',
      'SAN CRISTOBAL': 'Corregimiento de San Cristóbal', 'ALTAVISTA': 'Corregimiento de Altavista', 'SANTA ELENA': 'Corregimiento de Santa Elena',
      'SAN ANTONIO DE PRADO': 'Corregimiento de San Antonio de Prado', 'LAURELES': 'Laureles Estadio', 'LAURELES ESTADIO': 'Laureles Estadio',
      'DOCE DE OCTUBRE': 'Doce de Octubre', '12 DE OCTUBRE': 'Doce de Octubre', 'LA AMERICA': 'La América', 'BELEN': 'Belén', 'POBLADO': 'El Poblado'
    } : tipo === 'departamentos' ? {
      'BOGOTA DC': 'BOGOTA', 'BOGOTA D C': 'BOGOTA', 'SANTAFE DE BOGOTA D C': 'BOGOTA', 'BOGOTA DISTRITO CAPITAL': 'BOGOTA',
      'SAN ANDRES Y PROVIDENCIA': 'SAN ANDRES PROVIDENCIA Y SANTA CATALINA', 'SAN ANDRES': 'SAN ANDRES PROVIDENCIA Y SANTA CATALINA',
      'ARCHIPIELAGO DE SAN ANDRES': 'SAN ANDRES PROVIDENCIA Y SANTA CATALINA', 'ARCHIPIELAGO DE SAN ANDRES PROVIDENCIA Y SANTA CATALINA': 'SAN ANDRES PROVIDENCIA Y SANTA CATALINA',
      'VALLE': 'VALLE DEL CAUCA', 'GUAJIRA': 'LA GUAJIRA', 'NORTE SANTANDER': 'NORTE DE SANTANDER'
    } : { 'MEDELLIN': 'MEDELLIN', 'EL CARMEN DE VIBORAL': 'CARMEN DE VIBORAL', 'SANTAFE DE ANTIOQUIA': 'SANTA FE DE ANTIOQUIA', 'DON MATIAS': 'DONMATIAS', 'SAN PEDRO DE LOS MILAGROS': 'SAN PEDRO', 'EL SANTUARIO': 'SANTUARIO', 'EL PENOL': 'PENOL', 'EL RETIRO': 'RETIRO', 'SAN JOSE DE LA MONTANA': 'SAN JOSE DE LA MONTANA', 'ITAGUI': 'ITAGUI' };
    Object.keys(alias).forEach(k => { const v = fc._indice.get(normGeo(alias[k])); if (v) fc._indice.set(normGeo(k), v); });
  }
  let n = normGeo(nombre);
  if (tipo === 'comunas') n = n.replace(/^0*(\d+)\s*/, (m, d) => parseInt(d, 10) + ' ');
  if (fc._indice.has(n)) return fc._indice.get(n);
  const sin = n.replace(/^\d+ /, '');
  if (fc._indice.has(sin)) return fc._indice.get(sin);
  return null;
}

/* =================================================================== */
/*  Render de una visualización declarada                               */
/* =================================================================== */

/* Todas las visualizaciones ocupan la misma área: dos por fila y el mismo alto. */
const ANCHO_CLASE = { completa: 'col-12 col-lg-6', media: 'col-12 col-lg-6', tercio: 'col-12 col-lg-6', dosTercios: 'col-12 col-lg-6' };

function medidaDe(v) {
  return v.medida || { agg: 'count' };
}

function Visual({ v, d, filas, sel, arch, fuente }) {
  const fmt = v.formato || (medidaDe(v).formato) || 'num';
  const tit = v.titulo;
  const csvSerie = (serie, rot) => () => ({ encabezados: [rot || v.dim, 'Valor'], filas: serie.map(e => [e.nombre, e.valor]) });
  const alto = ALTO;
  const clic = v.dim && sel ? p => { if (p && p.name !== undefined) sel(v.dim, p.name); } : undefined;

  /* --- series simples por una dimensión --- */
  if (['barrasH', 'barrasV', 'anillo', 'torta', 'arbol', 'embudo', 'mapa'].indexOf(v.tipo) >= 0 && !v.dim2 && !(v.medidas && v.medidas.length > 1)) {
    const serie = useMemo(() => serieDe(d, filas, v.dim, medidaDe(v), v.orden), [d, filas, v]);
    const lista = v.limite ? serie.slice(0, v.limite) : serie;
    if (!serie.length) return <Ficha titulo={tit} pie={fuente} claro><SinDatos /></Ficha>;
    const total = serie.reduce((s, e) => s + (e.valor || 0), 0);
    const color = colorDe(v.dim, v.color);
    let opcion = null, extra = null;
    const altoReal = alto;
    if (v.tipo === 'barrasH') {
      opcion = ancho => barrasH(lista.map(e => e.nombre), lista.map(e => e.valor), opcionesBarras(ancho, { color: color, conParte: v.conParte !== false, formato: fmt, unidad: v.unidad, total: total, alto: alto }));
    } else if (v.tipo === 'barrasV') {
      opcion = columnas(lista.map(e => e.nombre), [{ nombre: tit, datos: lista.map(e => e.valor) }], { color: color, formato: fmt, corte: v.corte });
    } else if (v.tipo === 'anillo' || v.tipo === 'torta') {
      const top = v.limite || 9;
      const vis = serie.slice(0, top);
      const resto = serie.slice(top).reduce((s, e) => s + (e.valor || 0), 0);
      const datos = vis.map(e => ({ name: e.nombre, value: e.valor })).concat(resto > 0 ? [{ name: 'Otros', value: resto }] : []);
      opcion = ancho => anillo(datos, { formato: fmt, rotuloCentro: v.unidad || v.rotuloTotal || 'total', unidad: v.unidad, ancho: ancho });
    } else if (v.tipo === 'arbol') {
      opcion = arbol(serie.map(e => ({ name: e.nombre, value: e.valor })), total, { formato: fmt });
    } else if (v.tipo === 'embudo') {
      opcion = embudo(serie.map(e => ({ name: e.nombre, value: e.valor })));
    } else if (v.tipo === 'mapa') {
      registrarMapas();
      const geo = v.mapa || 'comunas';
      const acumulado = new Map();
      let fuera = 0;
      serie.forEach(e => {
        const g = casarGeo(geo, e.nombre);
        if (g) acumulado.set(g, (acumulado.get(g) || 0) + (e.valor || 0)); else fuera += e.valor || 0;
      });
      const datos = Array.from(acumulado.entries()).map(e => ({ name: e[0], value: e[1] }));
      opcion = mapa(geo, datos, { formato: fmt, rotuloCorto: geo === 'comunas', rotulos: geo === 'comunas', conParte: fmt === 'num',
        nota: fuera > 0 && fmt === 'num' ? num(fuera) + ' registros fuera del mapa o sin ubicación (' + pct(parte(fuera, total)) + ')' : null });
    }
    return <FichaGrafico titulo={tit} opcion={opcion} altoPx={altoReal} csv={csvSerie(serie)} archivo={arch + '-' + clave(tit)} pie={fuente} extra={extra} alSeleccionar={clic} />;
  }

  /* --- series por una dimensión y varias medidas, o por dos dimensiones --- */
  if (['barrasV', 'linea', 'area', 'combo', 'apiladas100', 'barrasAgrupadas', 'columnasApiladas'].indexOf(v.tipo) >= 0 || v.dim2 || (v.medidas && v.medidas.length > 1)) {
    const { categorias, series } = useMemo(() => {
      const grupos = agruparPor(d, filas, v.dim, v.orden || (esTemporal(v.dim) || v.tipo === 'linea' || v.tipo === 'area' ? 'natural' : undefined));
      let gs = grupos;
      if (!(v.orden === 'natural' || esTemporal(v.dim) || v.tipo === 'linea' || v.tipo === 'area')) {
        const m = v.medidas ? v.medidas[0] : medidaDe(v);
        gs = grupos.map(g => ({ g: g, t: agregar(d, g.filas, m) || 0 })).sort((a, b) => b.t - a.t).map(x => x.g);
      }
      if (v.limite) gs = gs.slice(0, v.limite);
      const categorias = gs.map(g => g.nombre);
      let series;
      if (v.dim2) {
        const m = medidaDe(v);
        const sub = new Map();
        gs.forEach((g, gi) => {
          agruparPor(d, g.filas, v.dim2, 'natural').forEach(h => {
            if (!sub.has(h.nombre)) sub.set(h.nombre, new Array(gs.length).fill(null));
            sub.get(h.nombre)[gi] = agregar(d, h.filas, m);
          });
        });
        const claves2 = Array.from(sub.keys()).sort(ordenNatural);
        series = claves2.map(k => ({ nombre: k, datos: sub.get(k) }));
      } else {
        const ms = v.medidas || [medidaDe(v)];
        series = ms.map(m => ({ nombre: m.rotulo || m.col, datos: gs.map(g => agregar(d, g.filas, m)), color: m.color }));
      }
      return { categorias, series };
    }, [d, filas, v]);
    if (!categorias.length) return <Ficha titulo={tit} pie={fuente} claro><SinDatos /></Ficha>;
    const csv = () => ({ encabezados: [v.dim].concat(series.map(s => s.nombre)), filas: categorias.map((c, i) => [c].concat(series.map(s => s.datos[i]))) });
    let opcion = null;
    const color = colorDe(v.dim2 || v.dim, v.color);
    if (v.tipo === 'linea' || v.tipo === 'area') opcion = lineas(categorias, series, { formato: fmt, area: v.tipo === 'area', color: color });
    else if (v.tipo === 'combo') opcion = combo(categorias, series.filter((s, i) => !(v.lineas || []).some(l => l === s.nombre || l === (v.medidas && v.medidas[i] && v.medidas[i].col))), series.filter((s, i) => (v.lineas || []).some(l => l === s.nombre || l === (v.medidas && v.medidas[i] && v.medidas[i].col))), { formato: fmt });
    else if (v.tipo === 'apiladas100') opcion = ancho => apiladas100(categorias, series, { anchoMax: Math.round(Math.min(320, Math.max(120, ancho * 0.35))), letra: TAM_BARRAS, anchoGrafico: ancho });
    else if (v.tipo === 'barrasAgrupadas') {
      opcion = ancho => {
        const op = columnas(categorias, series, { formato: fmt, corte: 40 });
        /* Barras horizontales agrupadas: se intercambian los ejes. */
        const x = op.xAxis, y = op.yAxis;
        op.yAxis = Object.assign({}, x, { type: 'category', inverse: true, axisLabel: { color: TINTA2, fontSize: TAM_BARRAS, width: Math.round(Math.min(260, ancho * 0.32)), overflow: 'break', lineHeight: 14 } });
        op.xAxis = Object.assign({}, y, { type: 'value' });
        op.grid = { left: Math.round(Math.min(260, ancho * 0.32)) + 14, right: 54, top: 30, bottom: 2, containLabel: false };
        op.series.forEach((s, k) => { s.label.position = 'right'; s.itemStyle = { color: degradado(s.color || SERIES[k % SERIES.length], false), borderRadius: [0, 4, 4, 0] }; s.barMaxWidth = 22; });
        delete op.dataZoom;
        return op;
      };
    } else opcion = columnas(categorias, series, { formato: fmt, apilar: v.tipo === 'columnasApiladas', color: color, corte: v.corte });
    return <FichaGrafico titulo={tit} opcion={opcion} altoPx={alto} csv={csv} archivo={arch + '-' + clave(tit)} pie={fuente} alSeleccionar={v.dim2 ? undefined : clic} />;
  }

  /* --- tabla: una o varias dimensiones y una o varias medidas --- */
  if (v.tipo === 'tabla') {
    const dims = v.dims || (v.dim ? [v.dim] : []);
    const medidas = v.medidas || (v.medida ? [v.medida] : (dims.length ? [{ agg: 'count', rotulo: 'Registros' }] : []));
    const filasTabla = useMemo(() => {
      if (!dims.length) {
        /* Sin dimensiones: se listan las columnas declaradas tal cual (tabla ancha). */
        const cols = v.columnas || [];
        return filas.map(f => { const o = {}; cols.forEach(c => { o[c.col] = d.rotulo(c.col, f[d.col(c.col)]); }); return o; });
      }
      const cis = dims.map(x => d.col(x));
      const mapa = new Map();
      filas.forEach(f => {
        const k = cis.map(ci => f[ci]).join('\u0001');
        let e = mapa.get(k);
        if (!e) { e = { claves: cis.map(ci => f[ci]), filas: [] }; mapa.set(k, e); }
        e.filas.push(f);
      });
      return Array.from(mapa.values()).map(e => {
        const o = { k: e.claves[0] };
        dims.forEach((x, i) => { o[x] = String(d.rotulo(x, e.claves[i])); });
        medidas.forEach(m => { o[m.rotulo || m.col || 'Registros'] = agregar(d, e.filas, m); });
        return o;
      });
    }, [d, filas, v]);
    let columnasT;
    if (!dims.length) columnasT = (v.columnas || []).map(c => ({ clave: c.col, rotulo: c.rotulo || c.col, tipo: d.esCat(c.col) ? 'texto' : 'num', formato: c.formato || fmt, total: c.total }));
    else columnasT = dims.map(x => ({ clave: x, rotulo: x, tipo: 'texto' })).concat(medidas.map(m => ({ clave: m.rotulo || m.col || 'Registros', rotulo: m.rotulo || m.col || 'Registros', tipo: 'num', formato: m.formato || fmt, total: (m.agg || 'count') === 'count' || m.agg === 'sum' ? 'suma' : undefined })));
    const csv = () => ({ encabezados: columnasT.map(c => c.rotulo), filas: filasTabla.map(f => columnasT.map(c => f[c.clave])) });
    const seleccionar = sel && dims.length === 1 ? f => sel(dims[0], f[dims[0]]) : undefined;
    return (
      <Ficha titulo={tit} pie={fuente} accion={<Descargas csv={csv} nombre={arch + '-' + clave(tit)} titulo={tit} />}>
        <Tabla columnas={columnasT} filas={filasTabla} altura={alto} orden={v.ordenPor || (dims.length ? (columnasT[dims.length] && columnasT[dims.length].clave) : columnasT[0].clave)} alSeleccionar={seleccionar} sinTotal={v.sinTotal} />
      </Ficha>
    );
  }

  /* --- texto --- */
  if (v.tipo === 'texto') {
    return (
      <Ficha titulo={tit} pie={fuente} sinPie={!fuente}>
        {(v.parrafos || []).map((p, i) => <p key={i} className={'mb-2' + (p.titulo ? ' fw-semibold' : '')}>{p.titulo ? <b>{p.titulo}: </b> : null}{p.texto || p}</p>)}
      </Ficha>
    );
  }
  return <Ficha titulo={tit} pie={fuente}><SinDatos texto={'Tipo de visualización no reconocido: ' + v.tipo} /></Ficha>;
}

/* =================================================================== */
/*  Carga de datos bajo demanda                                         */
/* =================================================================== */

function cargarDatos(id) {
  if (datosVista(id)) return Promise.resolve(datosVista(id));
  return cargarScript(URL_DATOS_BATERIA + '/v/' + id + '.js?v=' + (NAV.version || '1')).then(
    () => { const d = datosVista(id); if (d) return d; throw new Error('El módulo datos/v/' + id + '.js no declaró sus datos.'); },
    () => { throw new Error('No se pudo cargar datos/v/' + id + '.js'); }
  );
}

function useDatos(id) {
  const [estado, setEstado] = useState(() => (id && datosVista(id) ? { d: prepararDatos(datosVista(id)), error: null } : { d: null, error: null }));
  useEffect(() => {
    if (!id) return undefined;
    let vivo = true;
    if (datosVista(id)) { setEstado({ d: prepararDatos(datosVista(id)), error: null }); return undefined; }
    setEstado({ d: null, error: null });
    cargarDatos(id).then(d => { if (vivo) setEstado({ d: prepararDatos(d), error: null }); }).catch(e => { if (vivo) setEstado({ d: null, error: e.message }); });
    return () => { vivo = false; };
  }, [id]);
  return estado;
}

/* =================================================================== */
/*  Filtros de una variante                                             */
/* =================================================================== */

function Filtros({ d, defs, filtros, cambiar, limpiar }) {
  if (!defs.length) return null;
  const campo = f => {
    const filasOtras = aplicarFiltros(d, filtros, f.col);
    const opciones = opcionesFiltro(d, filasOtras, f.col);
    (filtros[f.col] || []).forEach(k => { if (opciones.indexOf(k) < 0) opciones.push(k); });
    const rot = k => String(d.rotulo(f.col, k));
    const ancho = opciones.length > 40;
    return (
      <div key={f.col}>
        <label className="form-label" htmlFor={'sel-' + clave(f.rotulo || f.col)}>{f.rotulo || f.col}</label>
        <SelectorMultiple etiqueta={f.rotulo || f.col} opciones={opciones} valores={filtros[f.col] || []}
          onCambio={vv => cambiar({ [f.col]: vv })} rotulo={rot} buscador={ancho} ancho={ancho} unico={f.modo === 'uno'}
          resumenVacio={f.modo === 'uno' ? 'Todos' : undefined} />
      </div>
    );
  };
  const filasF = [];
  for (let k = 0; k < defs.length; k += 5) filasF.push(defs.slice(k, k + 5));
  return (
    <section className="card card-lg filtros" aria-labelledby="filtros-tit">
      <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <h2 className="card-title mb-0" id="filtros-tit">Filtros</h2>
          <p className="filtros-subtitulo">Se aplican a todos los gráficos y tablas de la vista.</p>
        </div>
        <div className="filtros-acciones">
          <button type="button" className="btn-filtro" onClick={limpiar} disabled={!Object.keys(filtros).some(k => filtros[k] && filtros[k].length)}>
            <Icono nombre="ink_eraser" />Limpiar
          </button>
        </div>
      </div>
      <div className="card-body">
        <div className="filtros-filas">
          {filasF.map((fila, k) => (
            <div className="filtros-rejilla" key={k} style={{ '--cols': fila.length }}>{fila.map(campo)}</div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FichasActivas({ d, defs, filtros, cambiar, limpiar }) {
  const fichas = [];
  defs.forEach(f => {
    (filtros[f.col] || []).forEach(v => fichas.push({
      etiqueta: f.rotulo || f.col, texto: String(d.rotulo(f.col, v)),
      quitar: () => cambiar({ [f.col]: filtros[f.col].filter(x => x !== v) })
    }));
  });
  if (!fichas.length) return null;
  return (
    <div className="fichas-activas">
      <span className="fichas-activas-tit">Filtros aplicados</span>
      {fichas.map((f, i) => (
        <button key={i} type="button" className="tag tag-light-primary" onClick={f.quitar} title={'Quitar ' + f.etiqueta + ': ' + f.texto} aria-label={'Quitar ' + f.etiqueta + ': ' + f.texto}>
          <span>{f.etiqueta}: {recortar(f.texto, 38)}</span>
          <span className="btn-close" aria-hidden="true" />
        </button>
      ))}
      <button type="button" className="btn-filtro ms-auto" onClick={limpiar}><Icono nombre="ink_eraser" />Borrar todos</button>
    </div>
  );
}

/* =================================================================== */
/*  Vista: variante activa, filtros, indicadores y rejilla de visuales   */
/* =================================================================== */

const ICONOS_KPI = ['groups', 'account_balance', 'menu_book', 'female', 'verified_user', 'school', 'location_city', 'diversity_3', 'accessibility_new', 'handshake', 'emoji_events', 'public'];
const FAMILIAS_KPI = ['secondary', 'info', 'primary', 'success', 'warning', 'magenta'];

function Variante({ vista, variante, arch }) {
  const { d, error } = useDatos(variante.datos);
  const [filtros, setFiltros] = useState({});
  useEffect(() => { setFiltros({}); }, [variante.datos]);
  const defs = variante.filtros || [];
  const cambiar = parcial => setFiltros(f => Object.assign({}, f, parcial));
  const limpiar = () => setFiltros({});
  const filas = useMemo(() => (d ? aplicarFiltros(d, filtros) : []), [d, filtros]);
  const sel = useCallback((col, nombre) => {
    if (!d || d.col(col) === undefined) return;
    const c = d.cols[d.col(col)];
    const k = c.vals.indexOf(nombre);
    if (k < 0) return;
    /* Solo las columnas declaradas como filtro se pueden fijar por clic; si no
       está declarada, se agrega como filtro adicional. */
    setFiltros(f => {
      const actual = f[col] || [];
      const i = actual.indexOf(k);
      const nuevo = actual.slice();
      if (i >= 0) nuevo.splice(i, 1); else nuevo.push(k);
      return Object.assign({}, f, { [col]: nuevo });
    });
  }, [d]);
  const defsTodos = useMemo(() => {
    /* Los filtros aplicados por clic sobre columnas no declaradas aparecen como fichas. */
    const extra = Object.keys(filtros).filter(k => filtros[k] && filtros[k].length && !defs.some(f => f.col === k)).map(k => ({ col: k, rotulo: k }));
    return defs.concat(extra);
  }, [defs, filtros]);

  if (error) return <div className="alert alert-danger" role="alert"><b>No se pudieron cargar los datos de esta vista.</b><br />{error}</div>;
  if (!d) return <p className="text-neutral-50 py-5 text-center">Cargando los datos de la vista…</p>;
  const fuente = variante.fuente || vista.fuente;
  const kpis = variante.kpis || [];
  const visuales = variante.visuales || [];
  const notas = variante.notas || [];
  return (
    <Fragment>
      <Filtros d={d} defs={defs} filtros={filtros} cambiar={cambiar} limpiar={limpiar} />
      <FichasActivas d={d} defs={defsTodos} filtros={filtros} cambiar={cambiar} limpiar={limpiar} />
      {filas.length === 0 ? (
        <div className="alert alert-info" role="status">La combinación de filtros no deja registros. Use «Limpiar» para volver a ver datos.</div>
      ) : (
        <Fragment>
          {kpis.length ? (
            <section className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 row-cols-xl-5 g-4 mb-5" aria-label="Indicadores de la selección">
              {kpis.map((k, i) => {
                const valor = agregar(d, filas, k);
                return (
                  <div className="col" key={i}>
                    <Kpi icono={k.icono || ICONOS_KPI[i % ICONOS_KPI.length]} familia={k.familia || FAMILIAS_KPI[i % FAMILIAS_KPI.length]}
                      etiqueta={k.rotulo} valor={formato(valor, k.formato)} pie={k.pie || (k.agg === 'count' || !k.agg ? 'Registros en la selección' : undefined)} />
                  </div>
                );
              })}
            </section>
          ) : null}
          <div className="row g-4">
            {visuales.map((v, i) => (
              <div key={i} className={ANCHO_CLASE[v.ancho || 'media'] || ANCHO_CLASE.media}>
                <Visual v={v} d={d} filas={filas} sel={sel} arch={arch} fuente={fuente} />
              </div>
            ))}
          </div>
          {notas.length ? (
            <div className="alert alert-light border mt-2 small" role="note">
              {notas.map((n, i) => <p key={i} className="mb-1"><Icono nombre="info" className="me-1 align-text-bottom" />{n}</p>)}
            </div>
          ) : null}
        </Fragment>
      )}
    </Fragment>
  );
}

/* =================================================================== */
/*  Navegación: índice de vistas, ruta por URL, menú lateral y buscador  */
/* =================================================================== */

const VISTAS = {};
const ORDEN = [];
NAV.universos.forEach(u => u.temas.forEach(t => t.vistas.forEach(v => {
  v.universo = u.id; v.tema = t.id; v.universoRotulo = u.rotulo; v.temaRotulo = t.rotulo;
  VISTAS[v.id] = v; ORDEN.push(v.id);
})));

/* La ruta (vista y variante) sale de la dirección del sitio: ver rutas-bateria.ts. */

function MenuLateral({ activa, ir, abierto, cerrar, abrirBuscador }) {
  const v = VISTAS[activa];
  const [universoAbierto, setUniversoAbierto] = useState(() => (v ? v.universo : NAV.universos[0].id));
  const [temaAbierto, setTemaAbierto] = useState(() => (v ? v.universo + '/' + v.tema : null));
  useEffect(() => { if (v) { setUniversoAbierto(v.universo); setTemaAbierto(v.universo + '/' + v.tema); } }, [activa]);
  return (
    <nav className={'menu' + (abierto ? ' menu-abierto' : '')} aria-label="Secciones del tablero">
      <div className="menu-cabecera">
        <a href={rutaVista('inicio')} className={'menu-inicio' + (activa === 'inicio' ? ' activo' : '')} onClick={e => { e.preventDefault(); ir('inicio'); }}>
          <Icono nombre="grid_view" />Inicio
        </a>
        <button type="button" className="menu-cerrar d-lg-none" aria-label="Cerrar el menú" onClick={cerrar}><Icono nombre="close" /></button>
      </div>
      <button type="button" className="menu-buscar" onClick={abrirBuscador}>
        <Icono nombre="search" /><span>Buscar indicador</span><kbd>Ctrl K</kbd>
      </button>
      <div className="menu-cuerpo">
        {NAV.universos.map(u => {
          const abiertoU = universoAbierto === u.id;
          return (
            <div className={'menu-universo' + (abiertoU ? ' abierto' : '')} key={u.id} style={{ '--color': COLOR_FAMILIA[u.familia] || AZUL }}>
              <button type="button" className="menu-universo-boton" aria-expanded={abiertoU} onClick={() => setUniversoAbierto(abiertoU ? null : u.id)}>
                <Icono nombre={u.icono} className="menu-universo-icono" />
                <span className="menu-universo-rotulo">{u.rotulo}</span>
                <Icono nombre={abiertoU ? 'remove' : 'add'} className="menu-flecha" />
              </button>
              {abiertoU ? u.temas.map(t => {
                const kt = u.id + '/' + t.id;
                const abiertoT = temaAbierto === kt;
                return (
                  <div className={'menu-tema' + (abiertoT ? ' abierto' : '')} key={t.id}>
                    <button type="button" className="menu-tema-boton" aria-expanded={abiertoT} onClick={() => setTemaAbierto(abiertoT ? null : kt)}>
                      <span>{t.rotulo}</span><Icono nombre={abiertoT ? 'expand_less' : 'expand_more'} />
                    </button>
                    {abiertoT ? (
                      <ul className="menu-lista">
                        {t.vistas.map(x => (
                          <li key={x.id}>
                            <a href={rutaVista(x.id)} className={'menu-vista' + (x.id === activa ? ' activo' : '')} aria-current={x.id === activa ? 'page' : undefined}
                              onClick={e => { e.preventDefault(); ir(x.id); }}>{x.rotulo || x.titulo}</a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              }) : null}
            </div>
          );
        })}
      </div>
      <div className="menu-pie">
        <a href={rutaVista('glosario')} className={'menu-enlace' + (activa === 'glosario' ? ' activo' : '')} onClick={e => { e.preventDefault(); ir('glosario'); }}><Icono nombre="menu_book" />Glosario</a>
        <a href={rutaVista('catalogo')} className={'menu-enlace' + (activa === 'catalogo' ? ' activo' : '')} onClick={e => { e.preventDefault(); ir('catalogo'); }}><Icono nombre="list_alt" />Catálogo de indicadores</a>
      </div>
    </nav>
  );
}

function Buscador({ ir, abierto, setAbierto }) {
  const [texto, setTexto] = useState('');
  const [cursor, setCursor] = useState(0);
  const campo = useRef(null);
  useEffect(() => {
    const tecla = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setAbierto(true); }
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, []);
  useEffect(() => { if (abierto && campo.current) { campo.current.focus(); setTexto(''); setCursor(0); } }, [abierto]);
  const resultados = useMemo(() => {
    const t = sinTilde(texto.trim());
    const lista = ORDEN.map(id => VISTAS[id]);
    const r = (t ? lista.filter(v => sinTilde(v.titulo + ' ' + (v.rotulo || '') + ' ' + v.universoRotulo + ' ' + v.temaRotulo + ' ' + (v.palabras || '')).indexOf(t) >= 0) : lista).slice(0, 12);
    return r;
  }, [texto]);
  const elegir = v => { setAbierto(false); ir(v.id); };
  return (
    <Fragment>
      {abierto ? (
        <div className="bienvenida-fondo" onClick={e => { if (e.target === e.currentTarget) setAbierto(false); }}>
          <div className="buscador" role="dialog" aria-modal="true" aria-label="Buscar una vista">
            <div className="buscador-campo">
              <Icono nombre="search" />
              <input ref={campo} type="search" className="form-control" placeholder="Escriba el nombre de un indicador, tema o programa…" value={texto}
                onChange={e => { setTexto(e.target.value); setCursor(0); }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(resultados.length - 1, c + 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
                  if (e.key === 'Enter' && resultados[cursor]) elegir(resultados[cursor]);
                }} />
            </div>
            <ul className="buscador-lista">
              {resultados.length === 0 ? <li className="buscador-vacio">Sin resultados</li> : resultados.map((v, i) => (
                <li key={v.id}>
                  <button type="button" className={'buscador-item' + (i === cursor ? ' activo' : '')} onMouseEnter={() => setCursor(i)} onClick={() => elegir(v)}>
                    <span className="buscador-ruta">{v.universoRotulo} · {v.temaRotulo}</span>
                    <span className="buscador-titulo">{v.titulo}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="buscador-pie">↑ ↓ para moverse · Enter para abrir · Esc para cerrar</div>
          </div>
        </div>
      ) : null}
    </Fragment>
  );
}

/* Inicio: mapa de indicadores. Cuatro bloques (uno por grupo) y, para el
   grupo elegido, sus temas en columnas con la lista de vistas. */
function Inicio({ ir, abrirBuscador }) {
  const [sel, setSel] = useState(NAV.universos[0].id);
  const u = NAV.universos.filter(x => x.id === sel)[0];
  const totalVistas = NAV.universos.reduce((s, x) => s + x.temas.reduce((a, t) => a + t.vistas.length, 0), 0);
  return (
    <div className="inicio-bateria">
      <div className="inicio-cabecera">
        <div>
          <h2 className="inicio-titulo">{DEF.inicio.titulo}</h2>
          <p className="inicio-sub">{totalVistas} vistas en {NAV.universos.length} grupos</p>
        </div>
        <button type="button" className="inicio-buscar" onClick={abrirBuscador}><Icono nombre="search" />Buscar un indicador<kbd>Ctrl K</kbd></button>
      </div>
      <div className="inicio-bloques" role="tablist" aria-label="Grupos de indicadores">
        {NAV.universos.map(x => (
          <button type="button" key={x.id} role="tab" aria-selected={x.id === sel} className={'inicio-bloque' + (x.id === sel ? ' activo' : '')}
            style={{ '--color': COLOR_FAMILIA[x.familia] || AZUL }} onClick={() => setSel(x.id)}>
            <span className="inicio-bloque-icono"><Icono nombre={x.icono} /></span>
            <span className="inicio-bloque-texto">
              <span className="inicio-bloque-rotulo">{x.rotulo}</span>
              <span className="inicio-bloque-n">{x.temas.reduce((a, t) => a + t.vistas.length, 0)} vistas · {x.temas.length} temas</span>
            </span>
          </button>
        ))}
      </div>
      <div className="inicio-temas" style={{ '--color': COLOR_FAMILIA[u.familia] || AZUL }}>
        {u.temas.map(t => (
          <section className="inicio-tema" key={t.id} aria-labelledby={'tema-' + t.id}>
            <h3 className="inicio-tema-rotulo" id={'tema-' + t.id}><Icono nombre={t.icono || 'label'} />{t.rotulo}<span>{t.vistas.length}</span></h3>
            <ul className="inicio-lista">
              {t.vistas.map(v => (
                <li key={v.id}>
                  <a href={rutaVista(v.id)} className="inicio-vista" onClick={e => { e.preventDefault(); ir(v.id); }}>
                    <span>{v.rotulo || v.titulo}</span>
                    {v.variantes.length > 1 ? <small>{v.variantes.length} {v.selector === 'Ámbito territorial' ? 'ámbitos' : 'secciones'}</small> : null}
                    <Icono nombre="arrow_forward" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- glosario */

function resaltar(texto, q) {
  if (!q) return texto;
  const t = String(texto);
  const i = sinTilde(t).indexOf(q);
  if (i < 0) return t;
  return <Fragment>{t.slice(0, i)}<mark>{t.slice(i, i + q.length)}</mark>{t.slice(i + q.length)}</Fragment>;
}

function Glosario() {
  const [texto, setTexto] = useState('');
  const [activa, setActiva] = useState(0);
  const q = sinTilde(texto.trim());
  const secciones = (DEF.glosario || []).map(g => ({
    titulo: g.titulo,
    terminos: g.terminos.filter(t => !q || sinTilde(t.termino + ' ' + t.definicion).indexOf(q) >= 0)
  }));
  const total = secciones.reduce((s, g) => s + g.terminos.length, 0);
  const ir = i => { setActiva(i); const el = document.getElementById('glosario-' + i); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  return (
    <Fragment>
      <div className="vista-cabecera" style={{ '--color': MAGENTA }}>
        <span className="vista-icono"><Icono nombre="menu_book" /></span>
        <div><h2 className="vista-titulo">Glosario</h2></div>
      </div>
      <div className="glosario-cuerpo">
        <aside className="glosario-indice" aria-label="Secciones del glosario">
          {secciones.map((g, i) => (
            <a key={i} href={'#glosario-' + i} className={i === activa ? 'activo' : ''} onClick={e => { e.preventDefault(); ir(i); }}>{g.titulo}<span>{g.terminos.length}</span></a>
          ))}
        </aside>
        <div>
          <input type="search" className="form-control glosario-busqueda" placeholder="Buscar un término o una palabra de su definición" value={texto} onChange={e => setTexto(e.target.value)} aria-label="Buscar en el glosario" />
          {total === 0 ? <p className="text-neutral-50 py-4 text-center">Sin resultados.</p> : null}
          {secciones.map((g, i) => (g.terminos.length ? (
            <section className="card card-lg glosario-seccion" key={i} id={'glosario-' + i} aria-labelledby={'glosario-tit-' + i}>
              <div className="card-header"><h3 className="card-title mb-0" id={'glosario-tit-' + i}>{g.titulo}</h3></div>
              <div className="card-body p-0">
                <div className="glosario-grilla">
                  {g.terminos.map((t, j) => (
                    <Fragment key={j}>
                      <div className="glosario-termino">{resaltar(t.termino, q)}</div>
                      <div>{resaltar(t.definicion, q)}</div>
                    </Fragment>
                  ))}
                </div>
              </div>
            </section>
          ) : null))}
        </div>
      </div>
    </Fragment>
  );
}

/* ------------------------------------------------------------- catálogo */

/* Convierte la fórmula de la matriz («(V0/V1)*100», «(∑ V0)/(V1)*100»,
   «(V0*V1*V2)^(1/3)*100», «PEA=V0+V1») a LaTeX. Lo que no se reconoce se
   muestra como texto. */
function formulaLatex(f) {
  if (!f || f === 'Sin dato') return null;
  let s = String(f).trim();
  if (/[:,]/.test(s) && !/^[A-Za-z]+=/.test(s)) return null;  /* es texto, no fórmula */
  s = s.replace(/Vo/g, 'V0').replace(/∑\s*/g, '\\sum ');
  s = s.replace(/V(\d|j|i|n)/g, 'V_{$1}');
  /* raíz cúbica: (...)^(1/3) */
  s = s.replace(/\(([^()]*)\)\^\(1\/3\)/g, '\\sqrt[3]{$1}');
  /* cociente: (a)/(b) o (a)/b */
  s = s.replace(/\(([^()]*)\)\/\(([^()]*)\)/g, '\\frac{$1}{$2}');
  s = s.replace(/\(([^()]*)\/([^()]*)\)/g, '\\frac{$1}{$2}');
  s = s.replace(/\*100/g, '\\times 100').replace(/\*/g, ' \\cdot ');
  s = s.replace(/=/g, ' = ').replace(/\+/g, ' + ');
  s = s.replace(/^\\frac/, '\\dfrac');
  return s;
}

/* KaTeX (y su hoja de estilos) se descarga la primera vez que hace falta. */
let katexCargado = null;
function cargarKatex() {
  katexCargado = katexCargado || Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => m.default, () => null);
  return katexCargado;
}

function Formula({ texto, bloque }) {
  const ref = useRef(null);
  const latex = formulaLatex(texto);
  useEffect(() => {
    if (!ref.current) return undefined;
    /* Mientras llega KaTeX (o si no llega), el texto. */
    ref.current.textContent = latex ? latex : (texto === 'Sin dato' || !texto ? '—' : texto);
    if (!latex) return undefined;
    let vigente = true;
    cargarKatex().then(katex => {
      if (!vigente || !katex || !ref.current) return;
      try { katex.render(latex, ref.current, { throwOnError: false, displayMode: !!bloque }); } catch { /* queda el texto */ }
    });
    return () => { vigente = false; };
  }, [latex, texto, bloque]);
  return <span ref={ref} />;
}

/* «V0: Admitidos por nivel… V1: Total de admitidos.» -> pares variable / descripción. */
function variables(texto) {
  if (!texto || texto === 'Sin dato') return [];
  const partes = String(texto).split(/(?=\bV[0-9ojin]\s*:)/i).map(x => x.trim()).filter(Boolean);
  return partes.map(x => { const m = x.match(/^(V[0-9ojin])\s*:\s*(.*)$/i); return m ? { v: m[1].replace('o', '0').replace('O', '0'), d: m[2] } : { v: '', d: x }; });
}

const COLS_CATALOGO = [
  { clave: 'Consecutivo', rotulo: 'N.º', clase: 'num' }, { clave: 'Nombre del indicador', rotulo: 'Indicador', clase: 'indicador' },
  { clave: 'Categoría', rotulo: 'Categoría', clase: 'etiqueta' }, { clave: 'Información disponible', rotulo: 'Ámbito', clase: 'etiqueta' },
  { clave: 'Periodicidad', rotulo: 'Periodicidad', clase: 'etiqueta' }, { clave: 'Unidad de medida', rotulo: 'Unidad', clase: 'etiqueta' },
  { clave: 'Fórmula de cálculo', rotulo: 'Fórmula', clase: 'formula' }, { clave: 'Fuente', rotulo: 'Fuente', clase: '' }
];

function Catalogo() {
  const { d, error } = useDatos('catalogo');
  const [texto, setTexto] = useState('');
  const [cat, setCat] = useState('');
  const [amb, setAmb] = useState('');
  const [per, setPer] = useState('');
  const [orden, setOrden] = useState({ col: 'Consecutivo', asc: true });
  const [abierta, setAbierta] = useState(null);
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!d) return <p className="text-neutral-50 py-5 text-center">Cargando el catálogo…</p>;
  const val = (f, c) => String(d.rotulo(c, f[d.col(c)]));
  const opciones = c => d.cols[d.col(c)].vals.filter(x => x !== 'Sin dato').sort(ordenNatural);
  const q = sinTilde(texto.trim());
  let filas = d.filas.filter(f => (!q || sinTilde(d.cols.map(c => val(f, c.n)).join(' ')).indexOf(q) >= 0) &&
    (!cat || val(f, 'Categoría') === cat) && (!amb || sinTilde(val(f, 'Información disponible')) === sinTilde(amb)) && (!per || val(f, 'Periodicidad') === per));
  filas = filas.slice().sort((a, b) => {
    const va = val(a, orden.col), vb = val(b, orden.col);
    /* Los registros sin dato van siempre al final. */
    const sa = va === 'Sin dato' || (orden.col === 'Consecutivo' && isNaN(parseFloat(va)));
    const sb = vb === 'Sin dato' || (orden.col === 'Consecutivo' && isNaN(parseFloat(vb)));
    if (sa !== sb) return sa ? 1 : -1;
    const r = orden.col === 'Consecutivo' ? (parseFloat(va) || 0) - (parseFloat(vb) || 0) : ordenNatural(va, vb);
    return orden.asc ? r : -r;
  });
  const ordenar = c => setOrden(o => ({ col: c, asc: o.col === c ? !o.asc : true }));
  const sel = (rotulo, valor, setear, lista) => (
    <div>
      <label className="form-label" htmlFor={'cat-' + clave(rotulo)}>{rotulo}</label>
      <select id={'cat-' + clave(rotulo)} className="form-select form-select-sm" value={valor} onChange={e => setear(e.target.value)}>
        <option value="">Todas</option>
        {lista.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
  );
  return (
    <Fragment>
      <div className="vista-cabecera" style={{ '--color': MAGENTA }}>
        <span className="vista-icono"><Icono nombre="list_alt" /></span>
        <div><h2 className="vista-titulo">Catálogo de indicadores</h2></div>
      </div>
      <section className="card card-lg filtros mb-4">
        <div className="card-body">
          <div className="catalogo-filtros">
            <div>
              <label className="form-label" htmlFor="cat-buscar">Buscar</label>
              <input id="cat-buscar" type="search" className="form-control form-control-sm" placeholder="Nombre, definición, fuente…" value={texto} onChange={e => setTexto(e.target.value)} />
            </div>
            {sel('Categoría', cat, setCat, opciones('Categoría'))}
            {sel('Ámbito', amb, setAmb, Array.from(new Set(opciones('Información disponible').map(x => x.charAt(0).toUpperCase() + x.slice(1)))))}
            {sel('Periodicidad', per, setPer, opciones('Periodicidad'))}
          </div>
        </div>
      </section>
      <section className="card card-lg">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h3 className="card-title mb-0">Fichas técnicas</h3>
          <span className="small text-neutral-50">{num(filas.length)} indicadores · clic en una fila para ver la ficha completa</span>
        </div>
        <div className="card-body p-0">
          <div className="catalogo-grilla">
            <table className="table table-hover table-sm mb-0">
              <thead>
                <tr>
                  {COLS_CATALOGO.map(c => (
                    <th key={c.clave} className={c.clase} onClick={() => ordenar(c.clave)} aria-sort={orden.col === c.clave ? (orden.asc ? 'ascending' : 'descending') : undefined}>
                      {c.rotulo}{orden.col === c.clave ? <Icono nombre={orden.asc ? 'arrow_upward' : 'arrow_downward'} className="orden activo" /> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map(f => {
                  const id = val(f, 'Consecutivo') + '-' + val(f, 'Nombre del indicador');
                  const abiertaF = abierta === id;
                  return (
                    <Fragment key={id}>
                      <tr className={'fila' + (abiertaF ? ' abierta' : '')} onClick={() => setAbierta(abiertaF ? null : id)}>
                        {COLS_CATALOGO.map(c => (
                          <td key={c.clave} className={c.clase}>
                            {c.clase === 'formula' ? <Formula texto={val(f, c.clave)} />
                              : c.clave === 'Categoría' ? <span className="tag tag-light-primary">{val(f, c.clave)}</span>
                                : c.clave === 'Consecutivo' ? (isNaN(parseFloat(val(f, c.clave))) ? <span className="tag tag-light-primary" title={val(f, c.clave)}>Eliminado</span> : num(parseFloat(val(f, c.clave))))
                                  : val(f, c.clave) === 'Sin dato' ? '—' : val(f, c.clave)}
                          </td>
                        ))}
                      </tr>
                      {abiertaF ? (
                        <tr className="catalogo-detalle">
                          <td colSpan={COLS_CATALOGO.length}>
                            <dl>
                              <dt>Definición</dt><dd>{val(f, 'Definición del indicador')}</dd>
                              <dt>Objetivo</dt><dd>{val(f, 'Objetivo')}</dd>
                              <dt>Fórmula</dt><dd><Formula texto={val(f, 'Fórmula de cálculo')} bloque /></dd>
                              <dt>Variables</dt>
                              <dd>
                                {variables(val(f, 'Variables')).length ? (
                                  <div className="variables">
                                    {variables(val(f, 'Variables')).map((x, k) => <Fragment key={k}><b>{x.v}</b><span>{x.d}</span></Fragment>)}
                                  </div>
                                ) : '—'}
                              </dd>
                              <dt>Desagregación</dt><dd>{val(f, 'Desagregación')}</dd>
                              <dt>Fuente</dt><dd>{val(f, 'Fuente')}</dd>
                            </dl>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </Fragment>
  );
}

/* =================================================================== */
/*  Aplicación                                                          */
/* =================================================================== */

function App() {
  const { pathname, search } = useLocation();
  const navegar = useNavigate();
  const ruta = useMemo(() => leerRuta(pathname, search), [pathname, search]);
  const [intro, setIntro] = useState(() => { try { return !window.sessionStorage.getItem('odes_intro_vista'); } catch { return true; } });
  const [menu, setMenu] = useState(false);
  const [buscador, setBuscador] = useState(false);
  const cerrarIntro = () => { setIntro(false); try { window.sessionStorage.setItem('odes_intro_vista', '1'); } catch { /* sin almacenamiento */ } };

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); setMenu(false); }, [ruta.vista]);

  /* Como antes con el hash, no repite en el historial la dirección en la que ya está. */
  const ir = (vista, variante) => {
    const destino = rutaVista(vista, variante);
    if (destino !== window.location.pathname + window.location.search) navegar(destino);
  };

  const vista = VISTAS[ruta.vista];
  const variantes = vista ? vista.variantes : [];
  const variante = vista ? (variantes.filter(x => x.id === ruta.variante)[0] || variantes[0]) : null;
  const pos = vista ? ORDEN.indexOf(vista.id) : -1;
  const anterior = pos > 0 ? VISTAS[ORDEN[pos - 1]] : null;
  const siguiente = pos >= 0 && pos < ORDEN.length - 1 ? VISTAS[ORDEN[pos + 1]] : null;
  const arch = vista ? 'odes-' + clave(vista.id) + (variante ? '-' + clave(variante.id) : '') : 'odes';

  useEffect(() => {
    document.title = (vista ? vista.titulo + ' · ' : ruta.vista === 'glosario' ? 'Glosario · ' : ruta.vista === 'catalogo' ? 'Catálogo de indicadores · ' : '') + 'Batería de indicadores · Observatorio de Educación de Sapiencia';
  }, [ruta.vista]);

  /* Flechas con Alt: vista anterior y siguiente. */
  useEffect(() => {
    const tecla = e => {
      if (!e.altKey) return;
      if (e.key === 'ArrowRight' && siguiente) { e.preventDefault(); ir(siguiente.id); }
      if (e.key === 'ArrowLeft' && anterior) { e.preventDefault(); ir(anterior.id); }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [anterior, siguiente]);

  const u = vista ? NAV.universos.filter(x => x.id === vista.universo)[0] : null;

  return (
    <Fragment>
      {intro ? <Intro onCerrar={cerrarIntro} /> : null}
      <div className="tablero">
        {menu ? <div className="menu-fondo d-lg-none" onClick={() => setMenu(false)} /> : null}
        <MenuLateral activa={ruta.vista} ir={ir} abierto={menu} cerrar={() => setMenu(false)} abrirBuscador={() => setBuscador(true)} />
        <Buscador ir={ir} abierto={buscador} setAbierto={setBuscador} />
        <div className="contenido">
          <div className="container-fluid p-4 p-xl-8">
            <div className="barra-superior">
              <button type="button" className="btn-filtro d-lg-none" onClick={() => setMenu(true)} aria-label="Abrir el menú"><Icono nombre="menu" />Menú</button>
              <span className="barra-contexto">{vista ? vista.universoRotulo + ' · ' + vista.temaRotulo : ''}</span>
              <div className="barra-acciones">
                <button type="button" className="btn-filtro" disabled={!anterior} onClick={() => anterior && ir(anterior.id)} title={anterior ? 'Anterior: ' + anterior.titulo : 'Sin vista anterior'}><Icono nombre="chevron_left" />Anterior</button>
                <button type="button" className="btn-filtro" disabled={!siguiente} onClick={() => siguiente && ir(siguiente.id)} title={siguiente ? 'Siguiente: ' + siguiente.titulo : 'Sin vista siguiente'}>Siguiente<Icono nombre="chevron_right" /></button>
              </div>
            </div>

            {vista ? (
              <Fragment>
                <header className="vista-cabecera" style={{ '--color': u ? (COLOR_FAMILIA[u.familia] || AZUL) : AZUL }}>
                  <span className="vista-icono"><Icono nombre={vista.icono || (u && u.icono) || 'analytics'} /></span>
                  <div>
                    <h2 className="vista-titulo">{vista.titulo}</h2>
                  </div>
                </header>
                {variantes.length > 1 ? (
                  <section className="secciones" aria-label={vista.selector || 'Variantes de la vista'}>
                    <div className="variantes-rotulo">{vista.selector || 'Ver por'}</div>
                    <div className="tabs" role="tablist" style={{ '--n': variantes.length }}>
                      {variantes.map((x, i) => (
                        <button key={x.id} type="button" className="tab" role="tab" aria-selected={x.id === variante.id} tabIndex={x.id === variante.id ? 0 : -1}
                          onClick={() => ir(vista.id, x.id)}
                          onKeyDown={e => {
                            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                            e.preventDefault();
                            const n = (i + (e.key === 'ArrowRight' ? 1 : variantes.length - 1)) % variantes.length;
                            ir(vista.id, variantes[n].id);
                          }}>
                          {x.sub ? <span className="tab-sec">{x.sub}</span> : null}
                          <span className="tab-tit">{x.rotulo}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}
                <Variante key={variante.datos} vista={vista} variante={variante} arch={arch} />
              </Fragment>
            ) : ruta.vista === 'glosario' ? <Glosario /> : ruta.vista === 'catalogo' ? <Catalogo /> : <Inicio ir={ir} abrirBuscador={() => setBuscador(true)} />}

            {vista ? (
              <div className="paginacion">
                {anterior ? <a href={rutaVista(anterior.id)} className="paginacion-enlace" onClick={e => { e.preventDefault(); ir(anterior.id); }}><Icono nombre="chevron_left" /><span><small>Anterior</small>{anterior.titulo}</span></a> : <span />}
                {siguiente ? <a href={rutaVista(siguiente.id)} className="paginacion-enlace paginacion-der" onClick={e => { e.preventDefault(); ir(siguiente.id); }}><span><small>Siguiente</small>{siguiente.titulo}</span><Icono nombre="chevron_right" /></a> : <span />}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Fragment>
  );
}

export default App;
