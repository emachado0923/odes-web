// @ts-nocheck -- código del tablero estático, traído casi sin cambios (ver abajo).
/* oxlint-disable react-hooks/exhaustive-deps, react/immutability -- código probado del tablero estático:
   sus listas de dependencias son a propósito y cambiarlas cambiaría cuándo se redibujan los gráficos. */
/* ====================================================================== */
/*  Tablero matrícula en educación superior en Medellín (2025)            */
/*  Observatorio de Educación de Sapiencia                                */
/*                                                                        */
/*  Es js/dashboard.jsx de Octubre/tablero_educ_sup_2025 (versión del 11  */
/*  de octubre de 2026) con cambios de integración: React y ECharts se    */
/*  importan (antes eran globales y el JSX se transpilaba en el navegador */
/*  con Babel), el logo de la bienvenida se importa y el módulo exporta   */
/*  App en vez de montarse solo. Los datos siguen en window.ODES: los     */
/*  pone PaginaMatricula.tsx con lo que entrega                           */
/*  /api/sivu/tableros/matricula-2025 (desde la base) ANTES de importar   */
/*  este módulo, porque aquí arriba se calculan constantes con ellos.     */
/*  Además: se quitaron las ayudas que nadie usaba, para el lint, y se    */
/*  conserva la ruta de navegación del sitio, que pasa por SIVU, desde    */
/*  donde se abre el tablero.                                             */
/* ====================================================================== */

import * as echarts from 'echarts';
import { Children, Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { LOGO_OBSERVATORIO } from '../recursos/recursos';

const M = window.ODES.matricula;
const DEF = window.ODES.definiciones;
const DIM = M.dim;
const ANIO = String(M.meta.anio);

/* ---------------------------------------------------------------- color */

/* Rubik, la letra de la plantilla de Sapiencia (plantilla/fonts/). index.html
   espera a que cargue antes de arrancar, porque el lienzo pinta con la letra
   que haya en ese momento. */
const TIPO = '"Rubik", system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/* Todo el texto de los gráficos comparte tamaño y queda por debajo del de la
   interfaz, para que las cifras no compitan con los títulos. */
const TAM = 10.5;

/* Alto único de las tarjetas de gráfico. Las categorías que no caben se
   recorren con el control lateral del propio gráfico. */
const ALTO = 380;

/* Gráficos de barras: rótulos de 13 px con los nombres completos (en dos
   líneas si no caben en una), la cifra de cada barra en 17 px seminegrita y el
   porcentaje en 15 px, aunque sobresalgan del alto de la barra. La columna de
   nombres toma el ancho del nombre más largo, sin pasar del 40 % del gráfico
   ni de 400 px. Los anillos, la dispersión, la matriz y el árbol conservan
   TAM. */
const TAM_BARRAS = 12;
const TAM_CIFRA = 15;
const TAM_PARTE = 13;
const opcionesBarras = (ancho, extra) => Object.assign({
  anchoMax: Math.round(Math.min(400, Math.max(120, ancho * 0.4))),
  letra: TAM_BARRAS, letraCifra: TAM_CIFRA, letraParte: TAM_PARTE,
  nombresCompletos: true, grosor: 15, paso: 28
}, extra);

/* Barras apiladas al 100 %: los mismos rótulos de 13 px y, dentro de cada
   segmento, el porcentaje en 13 px solo cuando cabe. */
const opcionesApiladas = (ancho, extra) => Object.assign({
  anchoMax: Math.round(Math.min(320, Math.max(120, ancho * 0.35))),
  letra: TAM_BARRAS, anchoGrafico: ancho
}, extra);

/* Colores de la plantilla de Sapiencia: el azul oscuro (secondary-40), el
   celeste (info-70), el morado (primary-40) y el verde (success-60) del kit,
   y el naranja del Observatorio, que el kit no trae y que es el del filete de
   la cabecera y el pie. El orden es fijo: una categoría conserva su color
   aunque cambie el número de series. Los cuatro de las series se distinguen
   entre sí en cualquier combinación, también en protanopia, deuteranopia y
   tritanopia (diferencia mínima ΔE 16,6 en OKLab). */
const BASE = '#0B3A56';
const AZUL = '#3AB6E6';
const MORADO = '#9B48A4';
const NARANJA = '#ED7203';
const VERDE = '#2EA14E';

const SERIES = [BASE, AZUL, MORADO, NARANJA];

/* Cada dimensión conserva su color en todo el tablero, de modo que un gráfico
   se reconoce por su color antes de leer el título. */
const COLOR = {
  institucion: BASE,
  programa: MORADO,
  nivel: AZUL,
  modalidad: NARANJA,
  area: VERDE,
  nucleo: NARANJA,
  caracter: AZUL,
  conteo: MORADO,
  genero: MORADO
};

/* Paleta de la composición por campos de conocimiento: los cinco colores y sus
   tonos claros, de mayor a menor tamaño del campo. */
const CAMPOS = [BASE, MORADO, AZUL, NARANJA, VERDE,
                aclararTono(BASE, .45), aclararTono(MORADO, .45),
                aclararTono(AZUL, .45), aclararTono(NARANJA, .45),
                aclararTono(VERDE, .45)];

/* Tintas y líneas: los grises (neutral) del kit. */
const TINTA = '#151717';   /* neutral-10: cifras */
const TINTA2 = '#3D4041';  /* neutral-40: rótulos */
const GRIS = '#4E5254';    /* neutral-50: porcentajes y notas */
const LINEA = '#DCDCDC';   /* neutral-90: ejes y guías */
const PISTA = '#F4F4F4';   /* neutral-95: pista de las barras */

/* -------------------------------------------------------------- formatos */

const fNum = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const vacio = v => v === null || v === undefined || (typeof v === 'number' && isNaN(v));
const num = v => (vacio(v) ? '—' : fNum.format(Math.round(v)));
const pct = (v, d) => (vacio(v) ? '—' : v.toFixed(d === undefined ? 1 : d).replace('.', ',') + '%');
const parte = (v, total) => (!total ? null : (v * 100) / total);

const clave = t =>
  String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const sinTilde = t =>
  String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const recortar = (t, n) => (String(t).length > n ? String(t).slice(0, n - 1) + '…' : String(t));

/** Ancho en píxeles de un texto con la letra de los gráficos. */
const medirTexto = (function () {
  const ctx = document.createElement('canvas').getContext('2d');
  return (texto, tam, peso) => {
    ctx.font = (peso ? peso + ' ' : '') + tam + 'px ' + TIPO;
    return ctx.measureText(String(texto)).width;
  };
})();

/** Cuántas líneas ocupa un rótulo partido por palabras en un ancho dado. */
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

/** Parte un rótulo en varias líneas sin cortar palabras. */
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


/** Mezcla un color con blanco. */
function aclararTono(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const m = (c, k) => Math.round(c + (255 - c) * k);
  return '#' + [m(n >> 16 & 255, t), m(n >> 8 & 255, t), m(n & 255, t)]
    .map(v => ('0' + v.toString(16)).slice(-2)).join('');
}

function aclarar(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const m = (c, k) => Math.round(c + (255 - c) * k);
  return '#' + [m(n >> 16 & 255, t), m(n >> 8 & 255, t), m(n & 255, t)]
    .map(v => ('0' + v.toString(16)).slice(-2)).join('');
}

/* =================================================================== */
/*  Preparación de los datos                                            */
/* =================================================================== */

const FILAS = M.filas.map(f => {
  const p = DIM.programa[f[0]];
  const ies = DIM.ies[p.ies];
  const nf = DIM.nivelForm[p.nivelForm];
  const nbc = DIM.nbc[p.nbc];
  const cd = DIM.cineDetallado[p.cine];
  const ce = DIM.cineEspecifico[cd.especifico];
  return {
    prog: f[0], sexo: f[1], mat: f[3],
    ies: p.ies, nivelForm: p.nivelForm, nivelAcad: nf.acad,
    modalidad: p.modalidad, nbc: p.nbc, area: nbc.area,
    cineDet: p.cine, cineEsp: cd.especifico, cineAmp: ce.amplio,
    sector: ies.sector, caracter: ies.caracter,
    acrIes: ies.acreditada, acrProg: p.acreditado
  };
});

const nombrePrograma = i => DIM.programa[i].nombre;
const nombreIes = i => DIM.ies[i].nombre;
const cortoIes = i => DIM.ies[i].corto;

function opcionesDe(campo, lista) {
  const suma = new Map();
  (lista || FILAS).forEach(f => suma.set(f[campo], (suma.get(f[campo]) || 0) + f.mat));
  return Array.from(suma.keys()).sort((a, b) => suma.get(b) - suma.get(a));
}

const SECTORES = Array.from(new Set(DIM.ies.map(i => i.sector))).sort();

const I_FEM = DIM.sexo.indexOf('Femenino');

const ORDEN_SEXO = (function () {
  const orden = ['Femenino', 'Masculino', 'No binario', 'Trans'];
  return DIM.sexo.map((s, i) => i).sort((a, b) => {
    const ia = orden.indexOf(DIM.sexo[a]), ib = orden.indexOf(DIM.sexo[b]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
})();


/* =================================================================== */
/*  Filtros                                                             */
/* =================================================================== */

const FILTROS_BASE = {
  programa: [], nivelAcad: [], sector: [], nivelForm: [], modalidad: [],
  area: [], nbc: [], cineAmp: [], sexo: [], ies: [], caracter: [],
  acrIes: [], acrProg: []
};

const CAMPOS_MULTIPLES = ['programa', 'nivelAcad', 'sector', 'nivelForm', 'modalidad',
  'area', 'nbc', 'cineAmp', 'sexo', 'ies', 'caracter', 'acrIes', 'acrProg'];

const rotuloSiNo = v => (v ? 'Sí' : 'No');

const campoFila = c => (c === 'programa' ? 'prog' : c);

/**
 * Aplica los filtros. `excepto` deja fuera un campo, lo que sirve para
 * calcular las opciones que le quedan disponibles a ese mismo filtro: cada
 * lista se recorta con lo seleccionado en las demás.
 */
function aplicar(filtros, excepto) {
  return FILAS.filter(f => {
    for (let i = 0; i < CAMPOS_MULTIPLES.length; i++) {
      const c = CAMPOS_MULTIPLES[i];
      if (c === excepto) continue;
      const sel = filtros[c];
      if (sel.length && sel.indexOf(f[campoFila(c)]) < 0) return false;
    }
    return true;
  });
}

/**
 * Opciones y conteo que le quedan a un filtro, dadas las demás selecciones.
 * Las listas se presentan en orden alfabético por el rótulo que se muestra.
 */
function disponibles(filtros, campo, rotulo) {
  const filas = aplicar(filtros, campo);
  const suma = new Map();
  filas.forEach(f => {
    const k = f[campoFila(campo)];
    suma.set(k, (suma.get(k) || 0) + f.mat);
  });
  const claves = Array.from(suma.keys());
  if (rotulo) {
    claves.sort((a, b) =>
      String(rotulo(a)).localeCompare(String(rotulo(b)), 'es', { numeric: true }));
  } else {
    claves.sort((a, b) => suma.get(b) - suma.get(a));
  }
  /* Lo ya seleccionado permanece en la lista aunque otro filtro lo deje sin
     matrícula, para que se pueda desmarcar. */
  (filtros[campo] || []).forEach(k => {
    if (claves.indexOf(k) < 0) claves.push(k);
  });
  return { claves: claves, conteo: k => suma.get(k) || 0 };
}

function resumir(filas) {
  const ies = new Set(), prog = new Set();
  let mat = 0, fem = 0, oficial = 0, posgrado = 0;
  const iPos = DIM.nivelAcad.indexOf('Posgrado');
  filas.forEach(f => {
    mat += f.mat;
    ies.add(f.ies);
    prog.add(f.prog);
    if (f.sexo === I_FEM) fem += f.mat;
    if (f.sector === 'Oficial') oficial += f.mat;
    if (f.nivelAcad === iPos) posgrado += f.mat;
  });
  return { mat: mat, ies: ies.size, prog: prog.size,
           fem: fem, oficial: oficial, posgrado: posgrado };
}

function agrupar(filas, llave, nombre) {
  const mapa = new Map();
  filas.forEach(f => {
    const k = llave(f);
    if (k === undefined || k === null) return;
    let e = mapa.get(k);
    if (!e) {
      e = { k: k, nombre: nombre(k), mat: 0, prog: new Set(), ies: new Set(), fem: 0 };
      mapa.set(k, e);
    }
    e.mat += f.mat;
    e.prog.add(f.prog);
    e.ies.add(f.ies);
    if (f.sexo === I_FEM) e.fem += f.mat;
  });
  return Array.from(mapa.values())
    .map(e => ({ k: e.k, nombre: e.nombre, mat: e.mat, fem: e.fem,
                 prog: e.prog.size, ies: e.ies.size }))
    .sort((a, b) => b.mat - a.mat);
}

function cruzar(filas, filaK, colK) {
  const mapa = new Map();
  filas.forEach(f => {
    const k = filaK(f) + '|' + colK(f);
    mapa.set(k, (mapa.get(k) || 0) + f.mat);
  });
  return mapa;
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
  const texto = [encabezados].concat(filas)
    .map(f => f.map(celda).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function descargarPng(ec, nombreSalida, titulo) {
  const pr = 3;
  const base = ec.getDataURL({ type: 'png', pixelRatio: pr, backgroundColor: '#fff' });
  const img = new Image();
  img.onload = function () {
    const cabecera = 76 * pr;
    const pie = 38 * pr;
    const margen = 22 * pr;
    const lienzo = document.createElement('canvas');
    lienzo.width = img.width;
    lienzo.height = img.height + cabecera + pie;
    const c = lienzo.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, lienzo.width, lienzo.height);

    c.textBaseline = 'middle';
    c.fillStyle = BASE;
    c.font = '600 ' + 16 * pr + 'px ' + TIPO;
    c.fillText(titulo, margen, 30 * pr);

    c.fillStyle = GRIS;
    c.font = 11 * pr + 'px ' + TIPO;
    c.fillText(DEF.observatorio, margen, 54 * pr);

    c.strokeStyle = LINEA;
    c.lineWidth = 1 * pr;
    c.beginPath();
    c.moveTo(margen, cabecera - 8 * pr);
    c.lineTo(lienzo.width - margen, cabecera - 8 * pr);
    c.stroke();

    c.drawImage(img, 0, cabecera);

    c.fillStyle = GRIS;
    c.font = 10 * pr + 'px ' + TIPO;
    c.fillText(DEF.nota, margen, img.height + cabecera + pie / 2);

    const a = document.createElement('a');
    a.href = lienzo.toDataURL('image/png');
    a.download = nombreSalida + '.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  img.src = base;
}

/** Ícono de la fuente Material Symbols de la plantilla. */
const Icono = ({ nombre, className }) => (
  <span className={'material-symbols-outlined' + (className ? ' ' + className : '')}
    aria-hidden="true">{nombre}</span>
);

/** Botón de ícono de la plantilla (btn-icon), pequeño y con contorno neutro. */
const BotonIcono = ({ icono, rotulo, onClick }) => (
  <button type="button" className="btn btn-icon btn-outline-neutral btn-mn"
    title={rotulo} aria-label={rotulo} onClick={onClick}>
    <Icono nombre={icono} />
  </button>
);

function Descargas({ csv, instancia, titulo }) {
  return (
    <span className="acciones-grafico">
      {csv ? (
        <BotonIcono icono="download" rotulo="Descargar los datos en CSV"
          onClick={() => {
            const d = csv();
            if (d) descargarCsv('datos_odes', d.encabezados, d.filas);
          }} />
      ) : null}
      {instancia ? (
        <BotonIcono icono="image" rotulo="Descargar el gráfico en PNG"
          onClick={() => {
            const ec = instancia.current;
            if (ec) descargarPng(ec, 'grafico_odes', titulo);
          }} />
      ) : null}
    </span>
  );
}

/* =================================================================== */
/*  Piezas de interfaz                                                  */
/* =================================================================== */

/**
 * Selector de varias categorías con buscador, con las piezas de la plantilla:
 * un botón con el aspecto de form-select y, al abrirlo, un dropdown-menu con
 * un form-control para buscar y una casilla (form-check) por opción.
 */
function SelectorMultiple({ etiqueta, opciones, valores, onCambio, rotulo,
  secundario, buscador, resumenVacio, ancho }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const caja = useRef(null);
  const id = 'sel-' + clave(etiqueta);

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = e => {
      if (caja.current && !caja.current.contains(e.target)) setAbierto(false);
    };
    const esc = e => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);

  const visibles = useMemo(() => {
    if (!texto) return opciones.slice(0, 400);
    const t = sinTilde(texto);
    return opciones.filter(o =>
      sinTilde(rotulo(o)).indexOf(t) >= 0 ||
      (secundario ? sinTilde(secundario(o)).indexOf(t) >= 0 : false)).slice(0, 400);
  }, [opciones, texto]);

  const resumen = valores.length === 0
    ? (resumenVacio || 'Todos')
    : valores.length === 1
      ? rotulo(valores[0])
      : valores.length + ' seleccionados';

  const alternar = v => {
    const s = valores.slice();
    const i = s.indexOf(v);
    if (i >= 0) s.splice(i, 1); else s.push(v);
    onCambio(s);
  };

  return (
    <div className={'selector' + (ancho ? ' selector-ancho' : '')} ref={caja}>
      <button type="button" className="form-select" id={id}
        aria-haspopup="true" aria-expanded={abierto} aria-controls={id + '-lista'}
        aria-label={etiqueta + ': ' + resumen} title={resumen}
        data-activo={valores.length ? '1' : '0'}
        onClick={() => setAbierto(a => !a)}>
        {resumen}
      </button>
      {abierto ? (
        <div className="dropdown-menu show" id={id + '-lista'} role="group"
          aria-label={etiqueta}>
          {buscador || opciones.length > 10 ? (
            <input className="form-control form-control-sm mb-2" type="search"
              value={texto} autoFocus
              placeholder={'Buscar en ' + etiqueta.toLowerCase()}
              aria-label={'Buscar en ' + etiqueta.toLowerCase()}
              onChange={e => setTexto(e.target.value)} />
          ) : null}
          <div className="selector-lista">
            {visibles.length === 0
              ? <p className="small text-neutral-50 text-center my-3">Sin resultados</p>
              : visibles.map((o, i) => (
                <div className="form-check" key={String(o)}>
                  <input className="form-check-input" type="checkbox" id={id + '-' + i}
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
            <button type="button" className="btn btn-outline-neutral btn-sm"
              onClick={() => onCambio([])}>Quitar selección</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Dibujo de cada convención, con las mismas piezas que usa el tablero. */
const COLORES_PASOS = ['#163854', '#51ADE5', '#9F339E', '#2E9E49', '#F8DB1B', '#F36522'];

/** Ventana de bienvenida: encabezado del Observatorio, seis pasos con círculo
    de color y el botón de ingreso. */
function Intro({ onCerrar }) {
  const t = DEF.intro || {};
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', esc);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = antes;
    };
  }, []);
  return (
    <div className="bienvenida-fondo"
      onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="bienvenida" role="dialog" aria-modal="true" aria-labelledby="intro-tit">
        <div className="bienvenida-cabecera">
          <img src={LOGO_OBSERVATORIO.src} alt="Observatorio de Sapiencia"
            width={LOGO_OBSERVATORIO.ancho} height={LOGO_OBSERVATORIO.alto} />
          <button type="button" className="bienvenida-cerrar" aria-label="Cerrar"
            onClick={onCerrar}>
            <Icono nombre="close" />
          </button>
        </div>
        <div className="bienvenida-cuerpo">
          <div className="bienvenida-etiqueta">{t.etiqueta}</div>
          <h2 className="bienvenida-titulo" id="intro-tit">{t.titulo}</h2>
          <p className="bienvenida-texto">{t.texto}</p>
          <h3 className="bienvenida-sub">{t.subtitulo}</h3>
          <ul className="bienvenida-pasos">
            {(t.pasos || []).map((p, i) => (
              <li key={p.titulo}>
                <span className="bienvenida-circulo"
                  style={{ background: COLORES_PASOS[i % COLORES_PASOS.length] }}>
                  <Icono nombre={p.icono} />
                </span>
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
          <button type="button" className="bienvenida-boton" onClick={onCerrar} autoFocus>
            {t.boton || 'Entendido'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Tarjeta de la plantilla (card) con título y acciones en el encabezado. La
 * clase card-lg del kit le permite ocupar todo el ancho de su columna.
 * `claro` la mantiene en el tema claro aunque el visitante active el modo
 * oscuro: los gráficos están pensados para fondo blanco.
 */
function Ficha({ titulo, accion, pie, claro, children }) {
  return (
    <section className="card card-lg h-100" data-bs-theme={claro ? 'light' : undefined}>
      <div className="card-header d-flex justify-content-between align-items-center gap-3">
        <h3 className="card-title mb-0">{titulo}</h3>
        {accion || null}
      </div>
      <div className="card-body">{children}</div>
      <div className="card-footer small ficha-fuente">{pie || DEF.fuente}</div>
    </section>
  );
}

const SinDatos = ({ texto }) => (
  <p className="text-neutral-50 text-center py-5 mb-0">
    {texto || 'Sin datos para la selección activa.'}
  </p>
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
    const redimensionar = () => {
      if (inst.current) inst.current.resize();
      medir();
    };
    medir();
    let obs = null;
    if (window.ResizeObserver) {
      obs = new ResizeObserver(redimensionar);
      obs.observe(caja.current);
    }
    window.addEventListener('resize', redimensionar);
    /* Al terminar de cargar Rubik hay que volver a dibujar: el lienzo se pinta
       con la tipografía disponible en ese momento. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (inst.current) inst.current.resize();
      });
    }
    return () => {
      window.removeEventListener('resize', redimensionar);
      if (obs) obs.disconnect();
      if (inst.current) inst.current.dispose();
      inst.current = null;
      if (instancia) instancia.current = null;
    };
  }, []);

  /* La opción puede ser una función del ancho del gráfico, para los que
     acomodan sus rótulos al espacio disponible. */
  const op = typeof opcion === 'function' ? (ancho ? opcion(ancho) : null) : opcion;

  useEffect(() => {
    if (inst.current && op) inst.current.setOption(op, true);
  }, [op]);

  /* Un clic sobre una barra, una porción o un bloque aplica ese filtro. */
  useEffect(() => {
    const ec = inst.current;
    if (!ec) return undefined;
    ec.off('click');
    if (alSeleccionar) ec.on('click', alSeleccionar);
    return () => { if (ec) ec.off('click'); };
  });

  if (!echarts) {
    return <SinDatos texto="Los gráficos no están disponibles en esta sesión." />;
  }
  return <div ref={caja} className="grafico"
    style={altoPx ? { height: altoPx } : null} />;
}

function FichaGrafico({ titulo, altoPx, opcion, csv, archivo, pie, extra,
  alSeleccionar }) {
  const instancia = useRef(null);
  return (
    <Ficha titulo={titulo} pie={pie} claro
      accion={<Descargas csv={csv} instancia={instancia} nombre={archivo}
        titulo={titulo} />}>
      {opcion
        ? <Grafico opcion={opcion} altoPx={altoPx} instancia={instancia}
            alSeleccionar={alSeleccionar} />
        : <SinDatos />}
      {opcion ? extra || null : null}
    </Ficha>
  );
}

/** Leyenda en dos columnas para los gráficos sin leyenda propia. */
function Leyenda({ entradas, total }) {
  return (
    <ul className="leyenda">
      {entradas.map(e => (
        <li key={e.nombre} title={e.nombre}>
          <i style={{ background: e.color }} />
          <span>{e.nombre}</span>
          <span className="leyenda-valor">{num(e.valor)}</span>
          <em>{pct(parte(e.valor, total))}</em>
        </li>
      ))}
    </ul>
  );
}

/**
 * Tabla ordenable con el estilo de tabla de la plantilla. La primera columna
 * queda alineada a la izquierda y fija; las demás van centradas. Un clic (o
 * Enter) en el título de una columna ordena por ella.
 */
function Tabla({ columnas, filas, altura, orden, alSeleccionar, seleccion }) {
  const [col, setCol] = useState(orden || (columnas[1] && columnas[1].clave));
  const [asc, setAsc] = useState(false);

  const def = columnas.filter(c => c.clave === col)[0] || columnas[0];
  const ordenadas = useMemo(() => {
    const c = def.clave;
    const s = filas.slice().sort((a, b) => {
      const va = a[c], vb = b[c];
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb), 'es');
      }
      return (va || 0) - (vb || 0);
    });
    return asc ? s : s.reverse();
  }, [filas, col, asc]);

  const totales = useMemo(() => {
    const t = {};
    columnas.forEach(c => {
      if (c.total === 'suma') t[c.clave] = filas.reduce((s, f) => s + (f[c.clave] || 0), 0);
    });
    return t;
  }, [filas]);

  if (!filas.length) {
    return <SinDatos texto="Sin registros para la selección activa." />;
  }

  const visibles = ordenadas;
  const hayTotal = columnas.some(c => c.total === 'suma');

  return (
    <Fragment>
      <div className="tabla-caja" style={altura ? { maxHeight: altura } : null}>
        <table className="table table-hover table-sm align-middle">
          <thead>
            <tr>
              {columnas.map((c, i) => {
                const ordenar = () => {
                  if (col === c.clave) setAsc(a => !a);
                  else { setCol(c.clave); setAsc(c.tipo === 'texto'); }
                };
                return (
                  <th key={c.clave} className={i === 0 ? 'fija' : ''}
                    style={c.ancho ? { minWidth: c.ancho } : null}
                    tabIndex={0} onClick={ordenar}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ordenar(); }
                    }}
                    aria-sort={col === c.clave ? (asc ? 'ascending' : 'descending') : undefined}>
                    <span className="th-texto">
                      {c.rotulo}
                      {col === c.clave
                        ? <Icono nombre={asc ? 'arrow_upward' : 'arrow_downward'} className="orden activo" />
                        : null}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f, j) => (
              <tr key={j}
                className={(alSeleccionar ? 'clicable' : '') +
                  (seleccion && f.k !== undefined && seleccion.indexOf(f.k) >= 0
                    ? ' table-active' : '')}
                onClick={alSeleccionar ? () => alSeleccionar(f) : undefined}>
                {columnas.map((c, i) => (
                  <td key={c.clave} className={i === 0 ? 'izq fija' : ''}>
                    {c.tipo === 'texto' ? f[c.clave]
                      : c.tipo === 'pct' ? pct(f[c.clave])
                        : num(f[c.clave])}
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
                    {i === 0 ? 'Total' : c.total === 'suma' ? num(totales[c.clave]) : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </Fragment>
  );
}

/**
 * Indicador en una tarjeta de la plantilla. El recuadro del ícono toma el
 * tono 95 de una familia de color del kit y el ícono, su tono 40.
 */
const COLOR_SAPIENCIA = {
  secondary: '#163854', info: '#51ADE5', primary: '#9F339E',
  'tertiary-pink': '#2E9E49', success: '#F8DB1B', warning: '#F36522'
};

function Kpi({ icono, familia, etiqueta, valor, pie }) {
  return (
    <div className={'card card-lg h-100 kpi kpi-' + familia}>
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-start gap-2">
          <div className="kpi-etiqueta text-neutral-40">{etiqueta}</div>
          <span className="kpi-icono" style={{ background: COLOR_SAPIENCIA[familia] }}>
            <Icono nombre={icono} />
          </span>
        </div>
        <div className={'kpi-valor text-' + familia + '-40'}>{valor}</div>
        {pie ? <div className="kpi-pie small text-neutral-50 text-truncate">{pie}</div> : null}
      </div>
    </div>
  );
}

/* =================================================================== */
/*  Configuración de los gráficos                                       */
/* =================================================================== */

const base = () => ({
  textStyle: { fontFamily: TIPO, fontSize: TAM, color: TINTA2 },
  animationDuration: 240,
  tooltip: {
    trigger: 'item',
    /* Dentro del área del gráfico: la tarjeta del kit recorta lo que sobresale. */
    confine: true,
    backgroundColor: '#ffffff',
    borderColor: LINEA,
    borderWidth: 1,
    padding: [8, 11],
    textStyle: { color: TINTA, fontSize: TAM, fontFamily: TIPO }
  }
});

const leyenda = tam => ({
  top: 0, left: 0, icon: 'rect', itemWidth: 11, itemHeight: 11, itemGap: 16,
  textStyle: { color: TINTA2, fontSize: tam || TAM, fontFamily: TIPO }
});

/** Barras horizontales de una sola serie, en color plano y con pista. */
function barrasH(categorias, valores, opciones) {
  const o = Object.assign({}, opciones);
  const color = o.color || BASE;
  const total = o.total || valores.reduce((a, b) => a + b, 0);
  const maximo = Math.max.apply(null, [1].concat(valores));
  const op = base();
  const letra = o.letra || TAM;
  const letraCifra = o.letraCifra || letra;
  const letraParte = o.letraParte || letra;
  /* Con anchoMax, la columna de nombres se ajusta al nombre más largo. */
  let anchoCol = o.ancho || 180;
  if (o.nombresCompletos && o.anchoMax && !o.etiquetaRica) {
    const masLargo = Math.max.apply(null, [0].concat(categorias.map(c => medirTexto(c, letra))));
    anchoCol = Math.round(Math.min(o.anchoMax, masLargo + 18));
  }
  const anchoRotulo = anchoCol - 14;
  /* Con nombresCompletos el rótulo no se recorta: se parte en líneas y cada
     categoría reserva el alto de la más larga. */
  const altoLinea = Math.round(letra * 1.2);
  const lineas = o.nombresCompletos && !o.etiquetaRica
    ? Math.max.apply(null, [1].concat(categorias.map(c => lineasDe(c, anchoRotulo, letra))))
    : 1;
  const paso = Math.max(o.paso || 26, lineas * altoLinea + 10);
  const alto = o.alto || ALTO;
  /* Cuántas categorías caben en la tarjeta. El resto queda disponible con el
     control lateral, de modo que se grafican todas sin estirar la página. */
  const caben = Math.max(3, Math.floor((alto - 34) / paso));
  const recorre = categorias.length > caben;
  /* A la derecha cabe la etiqueta de la barra más larga: la cifra y, si se
     pide, el porcentaje. */
  const anchoEtiqueta = medirTexto(num(maximo), letraCifra, 600) + (o.conParte && total
    ? medirTexto('  ', letra) + medirTexto(pct(parte(maximo, total)), letraParte, 500) : 0);
  op.grid = {
    left: anchoCol,
    right: Math.max(Math.round((o.conParte ? 132 : 92) * letra / TAM),
      Math.ceil(anchoEtiqueta) + 24) + (recorre ? 30 : 0),
    top: 14, bottom: 20, containLabel: false
  };
  if (recorre) {
    op.dataZoom = [
      {
        type: 'inside', yAxisIndex: 0, startValue: 0, endValue: caben - 1,
        zoomOnMouseWheel: false, moveOnMouseWheel: true, moveOnMouseMove: true
      },
      {
        type: 'slider', yAxisIndex: 0, startValue: 0, endValue: caben - 1,
        right: 4, width: 14, top: 14, bottom: 20,
        showDetail: false, brushSelect: false, zoomLock: true,
        borderColor: LINEA, backgroundColor: '#FAFAFA',
        fillerColor: 'rgba(11,58,86,.14)',
        handleStyle: { color: '#fff', borderColor: '#CCCCCC' },
        moveHandleStyle: { color: LINEA },
        dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
        selectedDataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } }
      }
    ];
  }
  op.xAxis = {
    type: 'value', max: maximo * 1.02,
    axisLine: { show: true, lineStyle: { color: LINEA } },
    axisTick: { show: false },
    axisLabel: { show: false },
    splitLine: { show: false }
  };
  op.yAxis = {
    type: 'category',
    data: categorias,
    inverse: true,
    axisLine: { show: true, lineStyle: { color: LINEA } },
    axisTick: { show: false },
    axisLabel: Object.assign({
      color: TINTA2, fontSize: letra, margin: 12,
      lineHeight: o.nombresCompletos ? altoLinea : 15
    }, o.etiquetaRica ? { rich: o.etiquetaRica } : {
      width: anchoRotulo, overflow: o.nombresCompletos ? 'break' : 'truncate'
    })
  };
  op.tooltip.formatter = p =>
    '<b>' + String(p.name).replace(/\{[^|]*\|/g, '').replace(/\}/g, '').replace(/\n/g, ' ') +
    '</b><br/>' + num(p.value) + ' ' + (o.unidad || 'matriculados') +
    (total ? '<br/>' + pct(parte(p.value, total)) + ' del total' : '');
  const grosor = o.grosor || 16;
  const curva = o.curva === undefined ? 4 : o.curva;
  op.series = [{
    type: 'bar',
    data: valores,
    barMaxWidth: grosor,
    showBackground: true,
    backgroundStyle: { color: PISTA, borderRadius: curva },
    itemStyle: { color: color, borderRadius: curva },
    emphasis: { itemStyle: { color: aclarar(color, 0.2) } },
    label: {
      show: true, position: 'right', distance: 9,
      fontSize: letra, fontFamily: TIPO,
      formatter: p => (o.conParte && total
        ? '{v|' + num(p.value) + '}  {p|' + pct(parte(p.value, total)) + '}'
        : '{v|' + num(p.value) + '}'),
      rich: {
        v: { color: TINTA, fontSize: letraCifra, fontWeight: 500, fontFamily: TIPO },
        p: {
          color: GRIS, fontSize: letraParte, fontFamily: TIPO,
          fontWeight: letraParte > letra ? 500 : 'normal'
        }
      }
    }
  }];
  return op;
}

/** Barras verticales de una sola serie. */
function barrasV(categorias, valores, opciones) {
  const o = Object.assign({}, opciones);
  const letra = o.letra || TAM;
  const letraCifra = o.letraCifra || letra;
  const op = base();
  op.grid = {
    left: 12, right: 12, top: Math.max(36, Math.round(letraCifra * 2.2)), bottom: 46,
    containLabel: true
  };
  op.xAxis = {
    type: 'category', data: categorias,
    axisLine: { lineStyle: { color: LINEA } },
    axisTick: { show: false },
    axisLabel: {
      color: TINTA2, fontSize: letra, interval: 0, lineHeight: Math.round(letra * 1.3),
      formatter: v => envolver(v, o.corte || 14)
    }
  };
  op.yAxis = {
    type: 'value',
    axisLine: { show: true, lineStyle: { color: LINEA } },
    axisTick: { show: false },
    axisLabel: { show: false },
    splitLine: { show: false }
  };
  op.tooltip.formatter = p =>
    '<b>' + p.name + '</b><br/>' + num(p.value) + ' ' + (o.unidad || 'matriculados');
  op.series = [{
    type: 'bar', data: valores, barMaxWidth: 56,
    itemStyle: { color: o.color || BASE, borderRadius: [4, 4, 0, 0] },
    label: {
      show: true, position: 'top', fontSize: letraCifra, fontFamily: TIPO,
      color: TINTA, fontWeight: 500, formatter: p => num(p.value)
    }
  }];
  return op;
}

/** Barras horizontales apiladas al cien por ciento. */
function apiladas100(categorias, series, opciones) {
  const o = Object.assign({}, opciones);
  const letra = o.letra || TAM;
  const totales = categorias.map((c, i) =>
    series.reduce((s, e) => s + (e.datos[i] || 0), 0));
  const op = base();
  op.tooltip.trigger = 'axis';
  op.tooltip.axisPointer = { type: 'shadow', shadowStyle: { color: 'rgba(11,58,86,.05)' } };
  op.tooltip.formatter = ps => {
    if (!ps.length) return '';
    const i = ps[0].dataIndex;
    const t = totales[i];
    return '<b>' + categorias[i] + '</b><br/>' +
      ps.map(p => p.marker + ' ' + p.seriesName + ': ' +
        num(series[p.seriesIndex].datos[i]) + '  (' +
        pct(parte(series[p.seriesIndex].datos[i], t)) + ')').join('<br/>') +
      '<br/>Total: ' + num(t);
  };
  op.legend = Object.assign(leyenda(letra), { data: series.map(s => s.nombre) });
  /* Con anchoMax, la columna de nombres se ajusta al más largo y los que no
     caben se parten en líneas. */
  let anchoCol = o.ancho || 200;
  if (o.anchoMax) {
    const masLargo = Math.max.apply(null, [0].concat(categorias.map(c => medirTexto(c, letra))));
    anchoCol = Math.round(Math.min(o.anchoMax, masLargo + 18));
  }
  op.grid = {
    left: anchoCol, right: 60, top: Math.max(34, Math.round(letra * 2.6)), bottom: 8,
    containLabel: false
  };
  op.xAxis = {
    type: 'value', max: 100,
    axisLine: { show: true, lineStyle: { color: LINEA } },
    axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false }
  };
  op.yAxis = {
    type: 'category', data: categorias, inverse: true,
    axisLine: { show: true, lineStyle: { color: LINEA } }, axisTick: { show: false },
    axisLabel: {
      color: TINTA2, fontSize: letra, width: anchoCol - 14, margin: 12,
      overflow: o.anchoMax ? 'break' : 'truncate', lineHeight: Math.round(letra * 1.2)
    }
  };
  /* El porcentaje va dentro del segmento solo si cabe con holgura: con el
     ancho del gráfico se mide en píxeles; sin él, desde el 11 %. */
  const anchoTrazo = o.anchoGrafico ? o.anchoGrafico - anchoCol - 60 : 0;
  const cabe = v => (anchoTrazo
    ? (v / 100) * anchoTrazo >= medirTexto(pct(v), letra, 600) + 12
    : v >= 11);
  const grosor = 18;
  op.series = series.map((s, k) => ({
    name: s.nombre,
    type: 'bar',
    stack: 'total',
    barMaxWidth: grosor,
    data: categorias.map((c, i) => (totales[i] ? (s.datos[i] * 100) / totales[i] : 0)),
    itemStyle: { color: SERIES[k % SERIES.length], borderColor: '#fff', borderWidth: 2, borderRadius: 9 },
    label: {
      show: true, fontSize: letra, fontFamily: TIPO, color: '#fff', fontWeight: 500,
      formatter: p => (cabe(p.value) ? pct(p.value) : '')
    }
  }));
  return op;
}

/** Matriz de burbujas: el área de cada círculo es la matrícula del cruce. */
function burbujas(filas, columnas, celdas, maximo, colores, ancho) {
  const op = base();
  const izq = Math.min(230, Math.round(ancho * 0.26));
  op.grid = { left: izq, right: 30, top: 44, bottom: 14, containLabel: false };
  op.tooltip.formatter = p =>
    '<b>' + filas[p.value[1]] + '</b><br/>' + columnas[p.value[0]] + '<br/>' +
    num(p.value[2]) + ' matriculados';
  op.xAxis = {
    type: 'category', data: columnas, position: 'top', boundaryGap: true,
    axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
    axisLabel: { color: TINTA2, fontSize: TAM, interval: 0, margin: 14, fontWeight: 500 }
  };
  op.yAxis = {
    type: 'category', data: filas, inverse: true, boundaryGap: true,
    axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
    axisLabel: { color: TINTA2, fontSize: TAM, width: izq - 14, overflow: 'break' }
  };
  const tope = Math.max(20, Math.min(40, Math.floor(300 / Math.max(1, filas.length))));
  op.series = [{
    type: 'scatter',
    symbolSize: v => 8 + (tope - 8) * Math.sqrt(Math.max(0, v[2]) / (maximo || 1)),
    data: celdas.map(c => ({
      value: c,
      itemStyle: { color: colores[c[0] % colores.length], opacity: 0.9 }
    })),
    label: {
      show: true, position: 'right', distance: 8, fontSize: TAM, fontFamily: TIPO,
      color: TINTA, fontWeight: 500, formatter: p => num(p.value[2])
    },
    emphasis: { scale: 1.12, itemStyle: { opacity: 1 } }
  }];
  return op;
}

/** Anillo con el total en el centro. */
function anillo(datos, opciones) {
  const o = Object.assign({}, opciones);
  const total = datos.reduce((s, d) => s + d.value, 0);
  const op = base();
  op.tooltip.formatter = p =>
    '<b>' + p.name + '</b><br/>' + num(p.value) + ' matriculados<br/>' +
    pct(parte(p.value, total)) + ' del total';
  op.series = [{
    type: 'pie',
    radius: ['56%', '78%'],
    center: ['50%', '48%'],
    avoidLabelOverlap: true,
    padAngle: 1.5,
    itemStyle: { borderColor: '#fff', borderWidth: 2 },
    label: {
      show: true, position: 'outside', fontSize: TAM, fontFamily: TIPO, lineHeight: 15,
      formatter: p => '{n|' + p.name + '}\n{v|' + pct(parte(p.value, total)) + '}',
      rich: {
        n: { color: TINTA2, fontSize: TAM, fontFamily: TIPO },
        v: { color: TINTA, fontSize: 12, fontWeight: 500, fontFamily: TIPO }
      }
    },
    labelLine: { length: 10, length2: 12, lineStyle: { color: LINEA } },
    /* `colores` fija el color de cada porción por categoría; sin él, el
       color sigue el orden de los datos. */
    data: datos.map((d, i) => Object.assign({}, d, {
      itemStyle: { color: (o.colores && o.colores[i]) || SERIES[i % SERIES.length] }
    }))
  }];
  op.graphic = [{
    type: 'text', left: 'center', top: '41%',
    style: {
      text: num(total), fontSize: 22, fontWeight: 500, fill: TINTA,
      fontFamily: TIPO, textAlign: 'center'
    }
  }, {
    type: 'text', left: 'center', top: '51%',
    style: {
      text: o.rotuloCentro || 'matriculados', fontSize: TAM, fill: GRIS,
      fontFamily: TIPO, textAlign: 'center'
    }
  }];
  return op;
}

/** Dispersión de instituciones: programas contra matrícula. */
function dispersion(puntos, series) {
  const op = base();
  op.grid = { left: 70, right: 40, top: 44, bottom: 48, containLabel: false };
  op.legend = Object.assign(leyenda(), { left: 'auto', right: 0 });
  op.xAxis = {
    type: 'value', name: 'Programas con matrícula', nameLocation: 'middle',
    nameGap: 30, nameTextStyle: { color: TINTA2, fontSize: TAM, fontFamily: TIPO },
    axisLine: { lineStyle: { color: LINEA } }, axisTick: { show: false },
    splitLine: { show: false }, axisLabel: { color: TINTA2, fontSize: TAM }
  };
  op.yAxis = {
    type: 'value', name: 'Matriculados',
    nameTextStyle: { color: TINTA2, fontSize: TAM, fontFamily: TIPO, align: 'left' },
    nameGap: 16,
    axisLine: { show: true, lineStyle: { color: LINEA } },
    axisTick: { show: false }, splitLine: { show: false },
    axisLabel: { color: TINTA2, fontSize: TAM, formatter: v => num(v) }
  };
  op.tooltip.formatter = p =>
    '<b>' + p.data.nombre + '</b><br/>' + num(p.data.value[1]) + ' matriculados<br/>' +
    num(p.data.value[0]) + ' programas<br/>' + p.data.sector;
  op.series = series.map((s, k) => ({
    name: s.nombre,
    type: 'scatter',
    symbolSize: 12,
    data: puntos.filter(p => p.serie === k),
    /* Cada sector lleva el mismo color que en el anillo de sectores. */
    itemStyle: { color: SERIES[k % SERIES.length] },
    labelLayout: { hideOverlap: true },
    label: {
      show: true, position: 'right', fontSize: TAM, fontFamily: TIPO, color: TINTA2,
      formatter: p => (p.data.destacar ? p.data.corto : '')
    }
  }));
  return op;
}

/** Árbol de bloques para la jerarquía de campos de conocimiento. */
function arbol(datos, total) {
  const op = base();
  op.tooltip.formatter = p => {
    const ruta = (p.treePathInfo || []).filter(x => x.name).map(x => x.name);
    const padre = ruta.length > 1 ? ruta[ruta.length - 2] : '';
    return '<b>' + p.name + '</b>' +
      (padre && padre !== p.name ? '<br/>' + padre : '') +
      '<br/>' + num(p.value) + ' matriculados<br/>' +
      pct(parte(p.value, total)) + ' del total';
  };
  op.series = [{
    type: 'treemap',
    data: datos,
    top: 2, left: 0, right: 0, bottom: 2,
    roam: false,
    nodeClick: false,
    breadcrumb: { show: false },
    itemStyle: { borderColor: '#fff', borderWidth: 2, gapWidth: 2 },
    label: {
      fontSize: TAM, fontFamily: TIPO, overflow: 'truncate', lineHeight: 14,
      formatter: p => (p.value >= total * 0.012
        ? envolver(p.name, 22, 3) + '\n' + num(p.value) : '')
    },
    levels: [
      { itemStyle: { gapWidth: 5, borderWidth: 0 } },
      { itemStyle: { gapWidth: 2, borderWidth: 3, borderColor: '#fff' } },
      { itemStyle: { gapWidth: 1, borderWidth: 1, borderColor: '#fff' } }
    ]
  }];
  return op;
}

const nombreArchivo = partes => partes.filter(Boolean).map(clave).join('_');

/* =================================================================== */
/*  Secciones                                                           */
/* =================================================================== */

/* Anchos de las tarjetas en la rejilla de 12 columnas de la plantilla. */
const UNA = ['col-12'];
const DOS = ['col-12 col-lg-6'];
const TRES_DOS = DOS;
const DOS_TRES = DOS;

/** Fila de tarjetas con la rejilla (row y col) de la plantilla. */
function Fila({ cols, children }) {
  const hijos = Children.toArray(children);
  return (
    <div className="row g-4 mb-4">
      {hijos.map((h, i) => <div key={i} className={cols[i % cols.length]}>{h}</div>)}
    </div>
  );
}

function PanoramaGeneral({ filas, res, sub, arch, sel }) {
  const porIes = useMemo(() => agrupar(filas, f => f.ies, nombreIes), [filas]);
  const porNivel = useMemo(() =>
    agrupar(filas, f => f.nivelForm, i => DIM.nivelForm[i].nombre), [filas]);
  const porSector = useMemo(() => agrupar(filas, f => f.sector, k => k), [filas]);
  const porModalidad = useMemo(() =>
    agrupar(filas, f => f.modalidad, i => DIM.modalidad[i]), [filas]);
  const porArea = useMemo(() => agrupar(filas, f => f.area, i => DIM.area[i]), [filas]);

  const csvDe = (datos, rot) => () => ({
    encabezados: [rot, 'Matriculados', 'Participación (%)', 'Programas'],
    filas: datos.map(d => [d.nombre, d.mat,
      Number(parte(d.mat, res.mat).toFixed(1)), d.prog])
  });

  return (
    <Fragment>
      <Fila cols={UNA}>
        <FichaGrafico titulo="Matrícula por institución"
          altoPx={ALTO} subtitulo={sub}
          opcion={porIes.length ? (ancho => barrasH(porIes.map(d => d.nombre),
            porIes.map(d => d.mat), opcionesBarras(ancho,
              { total: res.mat, conParte: true, color: COLOR.institucion }))) : null}
          csv={csvDe(porIes, 'Institución')}
          alSeleccionar={p => sel('ies', porIes[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'matricula-por-institucion'])} />
      </Fila>

      <Fila cols={DOS_TRES}>
        <FichaGrafico titulo="Sector de la institución"
          altoPx={ALTO} subtitulo={sub}
          opcion={porSector.length
            ? anillo(porSector.map(d => ({ name: d.nombre, value: d.mat })), {
              /* Cada sector conserva su color aunque los filtros cambien cuál
                 tiene más matrícula; es el mismo de la dispersión. */
              colores: porSector.map(d => SERIES[SECTORES.indexOf(d.k) % SERIES.length])
            })
            : null}
          csv={csvDe(porSector, 'Sector')}
          alSeleccionar={p => sel('sector', porSector[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'matricula-por-sector'])} />

        <FichaGrafico titulo="Matrícula por nivel de formación"
          altoPx={ALTO} subtitulo={sub}
          opcion={porNivel.length ? (ancho => barrasH(porNivel.map(d => d.nombre),
            porNivel.map(d => d.mat), opcionesBarras(ancho,
              { total: res.mat, conParte: true, color: COLOR.nivel }))) : null}
          csv={csvDe(porNivel, 'Nivel de formación')}
          alSeleccionar={p => sel('nivelForm', porNivel[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'matricula-por-nivel'])} />
      </Fila>

      <Fila cols={DOS_TRES}>
        <FichaGrafico titulo="Matrícula por modalidad"
          altoPx={ALTO} subtitulo={sub}
          opcion={porModalidad.length ? (ancho => barrasH(porModalidad.map(d => d.nombre),
            porModalidad.map(d => d.mat), opcionesBarras(ancho,
              { total: res.mat, conParte: true, color: COLOR.modalidad }))) : null}
          csv={csvDe(porModalidad, 'Modalidad')}
          alSeleccionar={p => sel('modalidad', porModalidad[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'matricula-por-modalidad'])} />

        <FichaGrafico titulo="Matrícula por área de conocimiento"
          altoPx={ALTO} subtitulo={sub}
          opcion={porArea.length ? (ancho => barrasH(porArea.map(d => d.nombre),
            porArea.map(d => d.mat), opcionesBarras(ancho,
              { total: res.mat, conParte: true, color: COLOR.area }))) : null}
          csv={csvDe(porArea, 'Área de conocimiento')}
          alSeleccionar={p => sel('area', porArea[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'matricula-por-area'])} />
      </Fila>
    </Fragment>
  );
}

function Instituciones({ filas, res, sub, arch, sel, filtrosIes }) {
  const porIes = useMemo(() => agrupar(filas, f => f.ies, nombreIes), [filas]);
  const porCaracter = useMemo(() => agrupar(filas, f => f.caracter, k => k), [filas]);

  const puntos = useMemo(() => {
    const orden = porIes.slice(0, 4).map(d => d.k);
    const maxProg = Math.max.apply(null, [1].concat(porIes.map(d => d.prog)));
    return porIes.map(d => ({
      value: [d.prog, d.mat],
      nombre: d.nombre,
      k: d.k,
      corto: cortoIes(d.k),
      sector: DIM.ies[d.k].sector,
      serie: SECTORES.indexOf(DIM.ies[d.k].sector),
      destacar: orden.indexOf(d.k) >= 0,
      /* El rótulo se pasa al lado izquierdo cuando el punto está cerca del
         borde derecho, para que no quede cortado. */
      label: { position: d.prog > maxProg * 0.6 ? 'left' : 'right' }
    }));
  }, [porIes]);

  const tabla = useMemo(() => porIes.map(d => ({
    k: d.k,
    ies: d.nombre,
    sector: DIM.ies[d.k].sector,
    caracter: DIM.ies[d.k].caracter,
    acreditada: DIM.ies[d.k].acreditada ? 'Sí' : 'No',
    programas: d.prog,
    mat: d.mat,
    participacion: parte(d.mat, res.mat),
    mujeres: parte(d.fem, d.mat)
  })), [porIes, res.mat]);

  const columnas = [
    { clave: 'ies', rotulo: 'Institución', tipo: 'texto', ancho: 250 },
    { clave: 'sector', rotulo: 'Sector', tipo: 'texto' },
    { clave: 'caracter', rotulo: 'Carácter académico', tipo: 'texto' },
    { clave: 'acreditada', rotulo: 'Acreditada', tipo: 'texto' },
    { clave: 'programas', rotulo: 'Programas', tipo: 'num', total: 'suma' },
    { clave: 'mat', rotulo: 'Matriculados', tipo: 'num', total: 'suma' },
    { clave: 'participacion', rotulo: 'Participación', tipo: 'pct' },
    { clave: 'mujeres', rotulo: 'Mujeres', tipo: 'pct' }
  ];

  const csvTabla = () => ({
    encabezados: columnas.map(c => c.rotulo),
    filas: tabla.map(f => columnas.map(c =>
      c.tipo === 'pct' ? Number((f[c.clave] || 0).toFixed(1)) : f[c.clave]))
  });

  return (
    <Fragment>
      <Fila cols={UNA}>
        <FichaGrafico titulo="Instituciones ordenadas por matrícula"
          altoPx={ALTO} subtitulo={sub}
          opcion={porIes.length ? (ancho => barrasH(porIes.map(d => d.nombre),
            porIes.map(d => d.mat), opcionesBarras(ancho,
              { total: res.mat, conParte: true, color: COLOR.institucion }))) : null}
          csv={csvTabla} alSeleccionar={p => sel('ies', porIes[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'instituciones'])} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Tamaño y amplitud de la oferta"
          altoPx={ALTO} subtitulo={sub}
          opcion={puntos.length ? dispersion(puntos, SECTORES.map(s => ({ nombre: s }))) : null}
          csv={() => ({
            encabezados: ['Institución', 'Sector', 'Programas', 'Matriculados'],
            filas: porIes.map(d => [d.nombre, DIM.ies[d.k].sector, d.prog, d.mat])
          })}
          alSeleccionar={p => (p.data && p.data.k !== undefined
            ? sel('ies', p.data.k) : null)}
          archivo={nombreArchivo([arch, 'oferta-por-institucion'])} />

        <FichaGrafico titulo="Matrícula por carácter académico"
          altoPx={ALTO} subtitulo={sub}
          opcion={porCaracter.length ? (ancho => barrasH(porCaracter.map(d => d.nombre),
            porCaracter.map(d => d.mat), opcionesBarras(ancho,
              { total: res.mat, conParte: true, color: COLOR.caracter }))) : null}
          csv={() => ({
            encabezados: ['Carácter académico', 'Matriculados', 'Instituciones'],
            filas: porCaracter.map(d => [d.nombre, d.mat, d.ies])
          })}
          alSeleccionar={p => sel('caracter', porCaracter[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'caracter-academico'])} />
      </Fila>

      <Fila cols={UNA}>
        <Ficha titulo="Detalle por institución"
          accion={<Descargas csv={csvTabla}
            nombre={nombreArchivo([arch, 'detalle-instituciones'])} />}>
          <Tabla columnas={columnas} filas={tabla} altura={520} orden="mat"
            alSeleccionar={f => sel('ies', f.k)} seleccion={filtrosIes} />
        </Ficha>
      </Fila>
    </Fragment>
  );
}

function Programas({ filas, res, sub, arch, sel, filtrosPrograma }) {
  const porPrograma = useMemo(() => agrupar(filas, f => f.prog, nombrePrograma), [filas]);
  const top = porPrograma;


  const conteoNivel = useMemo(() => {
    const g = agrupar(filas, f => f.nivelForm, i => DIM.nivelForm[i].nombre);
    return g.slice().sort((a, b) => b.prog - a.prog);
  }, [filas]);

  const tamanos = useMemo(() => {
    const cortes = [
      { r: 'Hasta 50', min: 0, max: 50 },
      { r: '51 a 150', min: 51, max: 150 },
      { r: '151 a 400', min: 151, max: 400 },
      { r: '401 a 1.000', min: 401, max: 1000 },
      { r: 'Más de 1.000', min: 1001, max: Infinity }
    ];
    return cortes.map(c => ({
      nombre: c.r,
      programas: porPrograma.filter(p => p.mat >= c.min && p.mat <= c.max).length,
      mat: porPrograma.filter(p => p.mat >= c.min && p.mat <= c.max)
        .reduce((s, p) => s + p.mat, 0)
    }));
  }, [porPrograma]);

  const tabla = useMemo(() => porPrograma.map(d => {
    const p = DIM.programa[d.k];
    return {
      k: d.k,
      programa: d.nombre,
      codigo: p.codigo,
      ies: nombreIes(p.ies),
      nivel: DIM.nivelForm[p.nivelForm].nombre,
      modalidad: DIM.modalidad[p.modalidad],
      acreditado: p.acreditado ? 'Sí' : 'No',
      mat: d.mat,
      mujeres: parte(d.fem, d.mat)
    };
  }), [porPrograma]);

  const columnas = [
    { clave: 'programa', rotulo: 'Programa', tipo: 'texto', ancho: 290 },
    { clave: 'ies', rotulo: 'Institución', tipo: 'texto', ancho: 210 },
    { clave: 'nivel', rotulo: 'Nivel de formación', tipo: 'texto' },
    { clave: 'modalidad', rotulo: 'Modalidad', tipo: 'texto' },
    { clave: 'acreditado', rotulo: 'Acreditado', tipo: 'texto' },
    { clave: 'codigo', rotulo: 'Código SNIES', tipo: 'texto' },
    { clave: 'mat', rotulo: 'Matriculados', tipo: 'num', total: 'suma' },
    { clave: 'mujeres', rotulo: 'Mujeres', tipo: 'pct' }
  ];

  const csvTabla = () => ({
    encabezados: columnas.map(c => c.rotulo),
    filas: tabla.map(f => columnas.map(c =>
      c.tipo === 'pct' ? Number((f[c.clave] || 0).toFixed(1)) : f[c.clave]))
  });

  return (
    <Fragment>
      <Fila cols={UNA}>
        <FichaGrafico titulo="Matrícula por programa"
          altoPx={ALTO} subtitulo={sub}
          opcion={top.length ? (ancho => {
            /* El rótulo lleva el nombre del programa (hasta dos líneas) y la
               institución debajo (una línea), partidos según el ancho. */
            const col = Math.round(Math.min(400, Math.max(160, ancho * 0.42)));
            const porLinea = Math.max(18, Math.floor((col - 14) / 7.4));
            const rotulos = top.map(d =>
              '{p|' + envolver(d.nombre, porLinea, 2).replace(/\n/g, '}\n{p|') + '}\n{i|' +
              envolver(DIM.ies[DIM.programa[d.k].ies].nombre + ' · SNIES\u00a0' + DIM.programa[d.k].codigo, porLinea + 6)
                .replace(/\n/g, '}\n{i|') + '}');
            const lineas = Math.max.apply(null, rotulos.map(r => r.split('\n').length));
            return barrasH(rotulos, top.map(d => d.mat), opcionesBarras(ancho, {
              ancho: col, total: res.mat, conParte: true, color: COLOR.programa,
              paso: lineas * 17 + 10,
              etiquetaRica: {
                p: { color: TINTA, fontSize: TAM_BARRAS, fontFamily: TIPO, lineHeight: 17 },
                i: { color: GRIS, fontSize: TAM_BARRAS, fontFamily: TIPO, lineHeight: 17 }
              }
            }));
          }) : null}
          csv={csvTabla}
          alSeleccionar={p => sel('programa', top[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'programas-mayor-matricula'])} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Programas por nivel de formación"
          altoPx={ALTO} subtitulo={sub}
          opcion={conteoNivel.length
            ? (ancho => barrasH(conteoNivel.map(d => d.nombre), conteoNivel.map(d => d.prog),
              opcionesBarras(ancho, { color: COLOR.nivel, unidad: 'programas' })))
            : null}
          csv={() => ({
            encabezados: ['Nivel de formación', 'Programas', 'Matriculados'],
            filas: conteoNivel.map(d => [d.nombre, d.prog, d.mat])
          })}
          alSeleccionar={p => sel('nivelForm', conteoNivel[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'programas-por-nivel'])} />

        <FichaGrafico titulo="Programas según su tamaño"
          altoPx={ALTO} subtitulo={sub}
          opcion={barrasV(tamanos.map(t => t.nombre), tamanos.map(t => t.programas),
            { color: COLOR.institucion, unidad: 'programas', corte: 12,
              letra: TAM_BARRAS, letraCifra: TAM_CIFRA })}
          csv={() => ({
            encabezados: ['Rango de matrícula', 'Programas', 'Matriculados'],
            filas: tamanos.map(t => [t.nombre, t.programas, t.mat])
          })}
          archivo={nombreArchivo([arch, 'programas-por-tamano'])} />
      </Fila>

      <Fila cols={UNA}>
        <Ficha titulo="Detalle por programa"
          accion={<Descargas csv={csvTabla}
            nombre={nombreArchivo([arch, 'detalle-programas'])} />}>
          <Tabla columnas={columnas} filas={tabla} altura={560} orden="mat" limite={400}
            alSeleccionar={f => sel('programa', f.k)} seleccion={filtrosPrograma} />
        </Ficha>
      </Fila>
    </Fragment>
  );
}

function AreasConocimiento({ filas, res, sub, arch, sel, filtrosNbc }) {
  const porArea = useMemo(() => agrupar(filas, f => f.area, i => DIM.area[i]), [filas]);
  const porNbc = useMemo(() => agrupar(filas, f => f.nbc, i => DIM.nbc[i].nombre), [filas]);

  const jerarquia = useMemo(() => {
    const amplios = agrupar(filas, f => f.cineAmp, i => DIM.cineAmplio[i]);
    return amplios.map((a, i) => {
      const color = CAMPOS[i % CAMPOS.length];
      const hijos = agrupar(filas.filter(f => f.cineAmp === a.k),
        f => f.cineEsp, k => DIM.cineEspecifico[k].nombre);
      return {
        name: a.nombre,
        k: a.k,
        value: a.mat,
        itemStyle: { color: color },
        children: hijos.map((h, j) => ({
          name: h.nombre,
          value: h.mat,
          itemStyle: { color: aclarar(color, Math.min(0.45, j * 0.12)) },
          label: { color: j <= 1 ? '#ffffff' : BASE }
        }))
      };
    });
  }, [filas]);

  const tabla = useMemo(() => porNbc.map(d => ({
    k: d.k,
    nbc: d.nombre,
    area: DIM.area[DIM.nbc[d.k].area],
    programas: d.prog,
    mat: d.mat,
    participacion: parte(d.mat, res.mat),
    mujeres: parte(d.fem, d.mat)
  })), [porNbc, res.mat]);

  const columnas = [
    { clave: 'nbc', rotulo: 'Núcleo básico del conocimiento', tipo: 'texto', ancho: 290 },
    { clave: 'area', rotulo: 'Área de conocimiento', tipo: 'texto', ancho: 230 },
    { clave: 'programas', rotulo: 'Programas', tipo: 'num', total: 'suma' },
    { clave: 'mat', rotulo: 'Matriculados', tipo: 'num', total: 'suma' },
    { clave: 'participacion', rotulo: 'Participación', tipo: 'pct' },
    { clave: 'mujeres', rotulo: 'Mujeres', tipo: 'pct' }
  ];

  const csvTabla = () => ({
    encabezados: columnas.map(c => c.rotulo),
    filas: tabla.map(f => columnas.map(c =>
      c.tipo === 'pct' ? Number((f[c.clave] || 0).toFixed(1)) : f[c.clave]))
  });



  return (
    <Fragment>
      <Fila cols={UNA}>
        <FichaGrafico titulo="Composición por campos de conocimiento (CINE)"
          altoPx={ALTO} subtitulo={sub}
          opcion={jerarquia.length ? arbol(jerarquia, res.mat) : null}
          extra={<Leyenda total={res.mat}
            entradas={jerarquia.map(a => ({
              nombre: a.name, valor: a.value, color: a.itemStyle.color
            }))} />}
          csv={() => ({
            encabezados: ['Campo amplio', 'Campo específico', 'Matriculados'],
            filas: jerarquia.reduce((acc, a) =>
              acc.concat(a.children.map(h => [a.name, h.name, h.value])), [])
          })}
          alSeleccionar={p => {
            const ruta = (p.treePathInfo || []).filter(x => x.name);
            const raiz = ruta.length ? ruta[0].name : p.name;
            const campo = jerarquia.filter(a => a.name === raiz)[0];
            if (campo) sel('cineAmp', campo.k);
          }}
          archivo={nombreArchivo([arch, 'campos-cine'])} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Matrícula por área de conocimiento"
          altoPx={ALTO} subtitulo={sub}
          opcion={porArea.length ? (ancho => barrasH(porArea.map(d => d.nombre),
            porArea.map(d => d.mat), opcionesBarras(ancho,
              { total: res.mat, conParte: true, color: COLOR.area }))) : null}
          csv={() => ({
            encabezados: ['Área de conocimiento', 'Matriculados', 'Programas'],
            filas: porArea.map(d => [d.nombre, d.mat, d.prog])
          })}
          alSeleccionar={p => sel('area', porArea[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'areas-conocimiento'])} />

        <FichaGrafico titulo="Matrícula por núcleo básico"
          altoPx={ALTO} subtitulo={sub}
          opcion={porNbc.length ? (ancho => barrasH(porNbc.map(d => d.nombre),
            porNbc.map(d => d.mat), opcionesBarras(ancho,
              { total: res.mat, color: COLOR.nucleo }))) : null}
          csv={csvTabla} alSeleccionar={p => sel('nbc', porNbc[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'nucleos-basicos'])} />
      </Fila>

      <Fila cols={UNA}>
        <Ficha titulo="Detalle por núcleo básico"
          accion={<Descargas csv={csvTabla}
            nombre={nombreArchivo([arch, 'detalle-nucleos'])} />}>
          <Tabla columnas={columnas} filas={tabla} altura={480} orden="mat"
            alSeleccionar={f => sel('nbc', f.k)} seleccion={filtrosNbc} />
        </Ficha>
      </Fila>
    </Fragment>
  );
}

function NivelModalidad({ filas, res, sub, arch, sel, filtrosNivel }) {
  const niveles = useMemo(() => opcionesDe('nivelForm', filas), [filas]);
  const modalidades = useMemo(() => opcionesDe('modalidad', filas), [filas]);

  const matriz = useMemo(() => cruzar(filas, f => f.nivelForm, f => f.modalidad), [filas]);

  const celdas = [];
  let maximo = 0;
  niveles.forEach((n, i) => modalidades.forEach((m, j) => {
    const v = matriz.get(n + '|' + m) || 0;
    if (v > 0) {
      celdas.push([j, i, v]);
      if (v > maximo) maximo = v;
    }
  }));

  const porModalidad = useMemo(() =>
    agrupar(filas, f => f.modalidad, i => DIM.modalidad[i]), [filas]);

  const seriesModalidad = modalidades.map(m => ({
    nombre: DIM.modalidad[m],
    datos: niveles.map(n => matriz.get(n + '|' + m) || 0)
  }));

  const tabla = niveles.map(n => {
    const fila = { k: n, nivel: DIM.nivelForm[n].nombre };
    modalidades.forEach(m => { fila['m' + m] = matriz.get(n + '|' + m) || 0; });
    fila.total = modalidades.reduce((s, m) => s + (matriz.get(n + '|' + m) || 0), 0);
    return fila;
  });

  const columnas = [{ clave: 'nivel', rotulo: 'Nivel de formación', tipo: 'texto', ancho: 230 }]
    .concat(modalidades.map(m => ({
      clave: 'm' + m, rotulo: DIM.modalidad[m], tipo: 'num', total: 'suma'
    })))
    .concat([{ clave: 'total', rotulo: 'Total', tipo: 'num', total: 'suma' }]);

  const csvTabla = () => ({
    encabezados: columnas.map(c => c.rotulo),
    filas: tabla.map(f => columnas.map(c => f[c.clave]))
  });

  return (
    <Fragment>
      <Fila cols={UNA}>
        <FichaGrafico titulo="Matrícula por nivel de formación y modalidad"
          altoPx={ALTO} subtitulo={sub}
          opcion={celdas.length
            ? (ancho => burbujas(niveles.map(n => DIM.nivelForm[n].nombre),
              modalidades.map(m => DIM.modalidad[m]), celdas, maximo,
              modalidades.map((m, j) => SERIES[j % SERIES.length]), ancho))
            : null}
          csv={csvTabla} archivo={nombreArchivo([arch, 'nivel-modalidad'])}
          pie={<Fragment>Nota: El tamaño de cada círculo es proporcional a la matrícula del nivel de formación en esa modalidad.<br />{DEF.fuente}</Fragment>}
          alSeleccionar={p => {
            sel('nivelForm', niveles[p.value[1]]);
            sel('modalidad', modalidades[p.value[0]]);
          }} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Composición de cada nivel por modalidad"
          altoPx={ALTO} subtitulo={sub}
          opcion={niveles.length
            ? (ancho => apiladas100(niveles.map(n => DIM.nivelForm[n].nombre),
              seriesModalidad, opcionesApiladas(ancho)))
            : null}
          csv={csvTabla}
          alSeleccionar={p => sel('nivelForm', niveles[p.dataIndex])}
          archivo={nombreArchivo([arch, 'composicion-nivel-modalidad'])} />

        <FichaGrafico titulo="Matrícula por modalidad"
          altoPx={ALTO} subtitulo={sub}
          opcion={porModalidad.length ? (ancho => barrasH(porModalidad.map(d => d.nombre),
            porModalidad.map(d => d.mat), opcionesBarras(ancho,
              { total: res.mat, conParte: true, color: COLOR.modalidad }))) : null}
          csv={() => ({
            encabezados: ['Modalidad', 'Matriculados', 'Programas'],
            filas: porModalidad.map(d => [d.nombre, d.mat, d.prog])
          })}
          alSeleccionar={p => sel('modalidad', porModalidad[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'modalidad'])} />
      </Fila>

      <Fila cols={UNA}>
        <Ficha titulo="Detalle de nivel por modalidad"
          accion={<Descargas csv={csvTabla}
            nombre={nombreArchivo([arch, 'detalle-nivel-modalidad'])} />}>
          <Tabla columnas={columnas} filas={tabla} altura={420} orden="total"
            alSeleccionar={f => sel('nivelForm', f.k)} seleccion={filtrosNivel} />
        </Ficha>
      </Fila>
    </Fragment>
  );
}

function Genero({ filas, sub, arch, sel, filtrosArea }) {
  /* Las categorías presentes en la selección definen las series. Se agrupan
     las de menor volumen solo cuando existen las dos principales, para que la
     composición porcentual conserve su lectura. */
  const usadosSexo = useMemo(() =>
    ORDEN_SEXO.filter(s => filas.some(f => f.sexo === s)), [filas]);

  const gruposSexo = useMemo(() => {
    const principales = usadosSexo.filter(s =>
      ['Femenino', 'Masculino'].indexOf(DIM.sexo[s]) >= 0);
    const otras = usadosSexo.filter(s => principales.indexOf(s) < 0);
    const g = principales.map(s => ({ nombre: DIM.sexo[s], claves: [s] }));
    if (otras.length === 1) g.push({ nombre: DIM.sexo[otras[0]], claves: otras });
    else if (otras.length > 1) g.push({ nombre: 'Otras categorías', claves: otras });
    return g;
  }, [usadosSexo]);

  const serieSobre = (categorias, campo) => gruposSexo.map(g => ({
    nombre: g.nombre,
    datos: categorias.map(c =>
      filas.filter(f => f[campo] === c && g.claves.indexOf(f.sexo) >= 0)
        .reduce((s, f) => s + f.mat, 0))
  }));

  const areas = useMemo(() => opcionesDe('area', filas), [filas]);
  const niveles = useMemo(() => opcionesDe('nivelForm', filas), [filas]);

  const porSexo = useMemo(() =>
    usadosSexo.map(s => ({
      nombre: DIM.sexo[s],
      mat: filas.filter(f => f.sexo === s).reduce((a, f) => a + f.mat, 0)
    })), [filas, usadosSexo]);

  /* Se listan todos los núcleos con matrícula, ordenados por participación
     femenina. El umbral solo separa los que tienen poca matrícula, donde el
     porcentaje es inestable. */
  const porNbc = useMemo(() => {
    const g = agrupar(filas, f => f.nbc, i => DIM.nbc[i].nombre);
    return g.map(d => ({ nombre: d.nombre, kNbc: d.k, mat: d.mat,
      pctFem: parte(d.fem, d.mat) }))
      .filter(d => d.pctFem !== null)
      .sort((a, b) => b.pctFem - a.pctFem);
  }, [filas]);



  const tabla = useMemo(() => areas.map(a => {
    const fila = { k: a, area: DIM.area[a] };
    let t = 0;
    usadosSexo.forEach(s => {
      const v = filas.filter(f => f.area === a && f.sexo === s)
        .reduce((sum, f) => sum + f.mat, 0);
      fila['s' + s] = v;
      t += v;
    });
    fila.total = t;
    fila.pctFem = parte(fila['s' + I_FEM] || 0, t);
    return fila;
  }), [filas, areas, usadosSexo]);

  const columnas = [{ clave: 'area', rotulo: 'Área de conocimiento', tipo: 'texto', ancho: 250 }]
    .concat(usadosSexo.map(s => ({
      clave: 's' + s, rotulo: DIM.sexo[s], tipo: 'num', total: 'suma'
    })))
    .concat([
      { clave: 'total', rotulo: 'Total', tipo: 'num', total: 'suma' },
      { clave: 'pctFem', rotulo: 'Participación femenina', tipo: 'pct' }
    ]);

  const csvTabla = () => ({
    encabezados: columnas.map(c => c.rotulo),
    filas: tabla.map(f => columnas.map(c =>
      c.tipo === 'pct' ? Number((f[c.clave] || 0).toFixed(1)) : f[c.clave]))
  });

  return (
    <Fragment>
      <Fila cols={TRES_DOS}>
        <FichaGrafico titulo="Composición por género en cada área de conocimiento"
          altoPx={ALTO} subtitulo={sub}
          opcion={areas.length
            ? (ancho => apiladas100(areas.map(a => DIM.area[a]), serieSobre(areas, 'area'),
              opcionesApiladas(ancho)))
            : null}
          csv={csvTabla} alSeleccionar={p => sel('area', areas[p.dataIndex])}
          archivo={nombreArchivo([arch, 'genero-por-area'])} />

        <FichaGrafico titulo="Matrícula por género"
          altoPx={ALTO} subtitulo={sub}
          opcion={porSexo.length
            ? anillo(porSexo.map(d => ({ name: d.nombre, value: d.mat })))
            : null}
          csv={() => ({
            encabezados: ['Género', 'Matriculados'],
            filas: porSexo.map(d => [d.nombre, d.mat])
          })}
          alSeleccionar={p => sel('sexo', usadosSexo[p.dataIndex])}
          archivo={nombreArchivo([arch, 'matricula-por-genero'])} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Composición por género en cada nivel de formación"
          altoPx={ALTO} subtitulo={sub}
          opcion={niveles.length
            ? (ancho => apiladas100(niveles.map(n => DIM.nivelForm[n].nombre),
              serieSobre(niveles, 'nivelForm'), opcionesApiladas(ancho)))
            : null}
          csv={() => {
            const s = serieSobre(niveles, 'nivelForm');
            return {
              encabezados: ['Nivel de formación'].concat(s.map(x => x.nombre)),
              filas: niveles.map((n, i) =>
                [DIM.nivelForm[n].nombre].concat(s.map(x => x.datos[i])))
            };
          }}
          alSeleccionar={p => sel('nivelForm', niveles[p.dataIndex])}
          archivo={nombreArchivo([arch, 'genero-por-nivel'])} />

        <FichaGrafico titulo="Núcleos básicos por participación femenina"
          altoPx={ALTO} subtitulo={sub}
          opcion={porNbc.length ? (ancho => {
            const lista = porNbc;
            const op = barrasH(lista.map(d => d.nombre), lista.map(d => d.pctFem),
              opcionesBarras(ancho, { color: COLOR.genero }));
            op.series[0].label.formatter = p => '{v|' + pct(p.value) + '}';
            op.xAxis.max = 100;
            op.tooltip.formatter = p => {
              const d = lista[p.dataIndex];
              return '<b>' + d.nombre + '</b><br/>' + pct(d.pctFem) +
                ' de participación femenina<br/>' + num(d.mat) + ' matriculados';
            };
            return op;
          }) : null}
          csv={() => ({
            encabezados: ['Núcleo básico', 'Matriculados', 'Participación femenina (%)'],
            filas: porNbc.map(d => [d.nombre, d.mat, Number(d.pctFem.toFixed(1))])
          })}
          alSeleccionar={p => sel('nbc', porNbc[p.dataIndex].kNbc)}
          archivo={nombreArchivo([arch, 'participacion-femenina-nbc'])} />
      </Fila>

      <Fila cols={UNA}>
        <Ficha titulo="Detalle por área y género"
          accion={<Descargas csv={csvTabla}
            nombre={nombreArchivo([arch, 'detalle-genero'])} />}>
          <Tabla columnas={columnas} filas={tabla} altura={440} orden="total"
            alSeleccionar={f => sel('area', f.k)} seleccion={filtrosArea} />
        </Ficha>
      </Fila>
    </Fragment>
  );
}

function InformacionDetallada({ filas, arch, sel, filtrosPrograma }) {
  const usadosSexo = ORDEN_SEXO.filter(s => filas.some(f => f.sexo === s));

  const tabla = useMemo(() => {
    const mapa = new Map();
    filas.forEach(f => {
      let e = mapa.get(f.prog);
      if (!e) {
        const p = DIM.programa[f.prog];
        e = {
          k: f.prog,
          programa: p.nombre,
          codigo: p.codigo,
          ies: nombreIes(p.ies),
          sector: DIM.ies[p.ies].sector,
          nivel: DIM.nivelForm[p.nivelForm].nombre,
          modalidad: DIM.modalidad[p.modalidad],
          nbc: DIM.nbc[p.nbc].nombre,
          area: DIM.area[DIM.nbc[p.nbc].area],
          total: 0
        };
        usadosSexo.forEach(s => { e['s' + s] = 0; });
        mapa.set(f.prog, e);
      }
      e['s' + f.sexo] = (e['s' + f.sexo] || 0) + f.mat;
      e.total += f.mat;
    });
    return Array.from(mapa.values());
  }, [filas]);

  const columnas = [
    { clave: 'programa', rotulo: 'Programa', tipo: 'texto', ancho: 150 },
    { clave: 'codigo', rotulo: 'Código SNIES', tipo: 'texto' },
    { clave: 'ies', rotulo: 'Institución', tipo: 'texto', ancho: 120 },
    { clave: 'sector', rotulo: 'Sector', tipo: 'texto' },
    { clave: 'nivel', rotulo: 'Nivel de formación', tipo: 'texto' },
    { clave: 'modalidad', rotulo: 'Modalidad', tipo: 'texto' },
    { clave: 'area', rotulo: 'Área de conocimiento', tipo: 'texto', ancho: 120 },
    { clave: 'nbc', rotulo: 'Núcleo básico', tipo: 'texto', ancho: 120 }
  ].concat(usadosSexo.map(s => ({
    clave: 's' + s, rotulo: DIM.sexo[s], tipo: 'num', total: 'suma'
  }))).concat([
    { clave: 'total', rotulo: 'Total', tipo: 'num', total: 'suma' }
  ]);

  const csvTabla = () => ({
    encabezados: columnas.map(c => c.rotulo),
    filas: tabla.map(f => columnas.map(c => f[c.clave]))
  });

  return (
    <Fila cols={UNA}>
      <Ficha titulo="Detalle por programa e institución"
        accion={<Descargas csv={csvTabla}
          nombre={nombreArchivo([arch, 'informacion-detallada'])} />}>
        <Tabla columnas={columnas} filas={tabla} altura={640} orden="total" limite={400}
          alSeleccionar={f => sel('programa', f.k)} seleccion={filtrosPrograma} />
      </Ficha>
    </Fila>
  );
}

const SECCIONES = [
  { id: 'panorama', rotulo: 'Panorama general', panel: PanoramaGeneral },
  { id: 'instituciones', rotulo: 'Instituciones', panel: Instituciones },
  { id: 'programas', rotulo: 'Programas', panel: Programas },
  { id: 'areas', rotulo: 'Áreas de conocimiento', panel: AreasConocimiento },
  { id: 'nivelModalidad', rotulo: 'Nivel y modalidad', panel: NivelModalidad },
  { id: 'genero', rotulo: 'Género', panel: Genero },
  { id: 'detalle', rotulo: 'Información detallada', panel: InformacionDetallada }
];

/* =================================================================== */
/*  Barra de filtros                                                    */
/* =================================================================== */

/* Institución y programa son fijos: van siempre en la segunda línea. Los demás
   se eligen en «Personalizar», hasta cinco por fila. */
const FILTROS_ORDEN = [
  ['ies', 'Institución'], ['programa', 'Programa académico'],
  ['sector', 'Sector'], ['nivelAcad', 'Nivel académico'],
  ['nivelForm', 'Nivel de formación'], ['modalidad', 'Modalidad'],
  ['area', 'Área de conocimiento'], ['nbc', 'Núcleo básico'],
  ['cineAmp', 'Campo amplio CINE'], ['caracter', 'Carácter académico'],
  ['sexo', 'Género'], ['acrIes', 'Institución acreditada'],
  ['acrProg', 'Programa acreditado']
];
const FILTROS_FIJOS = ['ies', 'programa'];
const FILTROS_INICIALES = ['ies', 'programa', 'sector', 'nivelAcad', 'nivelForm'];
const LLAVE_VISIBLES = 'odes_filtros_visibles_matricula_v3';

function leerVisibles() {
  try {
    const v = JSON.parse(window.localStorage.getItem(LLAVE_VISIBLES) || 'null');
    const ok = FILTROS_ORDEN.map(f => f[0]);
    if (Array.isArray(v)) return FILTROS_FIJOS.concat(v.filter(x => ok.indexOf(x) >= 0 && FILTROS_FIJOS.indexOf(x) < 0));
  } catch { /* sin almacenamiento: se usan los iniciales */ }
  return FILTROS_INICIALES.slice();
}

function Filtros({ filtros, cambiar }) {
  const [config, setConfig] = useState(false);
  const [visibles, setVisibles] = useState(leerVisibles);

  const fijar = lista => {
    setVisibles(lista);
    try { window.localStorage.setItem(LLAVE_VISIBLES, JSON.stringify(lista)); } catch { /* ok */ }
  };
  const alternarVisible = id => fijar(visibles.indexOf(id) >= 0
    ? visibles.filter(x => x !== id) : visibles.concat(id));

  const R = {
    nivelAcad: i => DIM.nivelAcad[i],
    sector: k => k,
    nivelForm: i => DIM.nivelForm[i].nombre,
    modalidad: i => DIM.modalidad[i],
    area: i => DIM.area[i],
    ies: i => DIM.ies[i].nombre,
    programa: i => DIM.programa[i].nombre,
    nbc: i => DIM.nbc[i].nombre,
    cineAmp: i => DIM.cineAmplio[i],
    caracter: k => k,
    sexo: i => DIM.sexo[i],
    acrIes: rotuloSiNo,
    acrProg: rotuloSiNo
  };

  const campo = (id, etiqueta) => {
    const d = disponibles(filtros, id, R[id]);
    const ancho = id === 'ies' || id === 'programa';
    const extra = id === 'programa' ? {
      secundario: i => DIM.programa[i].codigo + ' · ' + DIM.ies[DIM.programa[i].ies].nombre,
      resumenVacio: 'Todos los programas'
    } : {};
    return (
      <div key={id}>
        <label className="form-label" htmlFor={'sel-' + clave(etiqueta)}>{etiqueta}</label>
        <SelectorMultiple etiqueta={etiqueta} opciones={d.claves} valores={filtros[id]}
          onCambio={v => cambiar({ [id]: v })} rotulo={R[id]}
          conteo={ancho ? undefined : d.conteo} buscador={ancho} ancho={ancho} {...extra} />
      </div>
    );
  };

  const mostrados = FILTROS_ORDEN.filter(f => visibles.indexOf(f[0]) >= 0);

  return (
    <section className="card card-lg filtros" aria-labelledby="filtros-tit">
      <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <h2 className="card-title mb-0" id="filtros-tit">Filtros</h2>
          <p className="filtros-subtitulo">
            Segmente las visualizaciones con los filtros disponibles. El botón
            personalizar, a la derecha, permite elegir cuáles se muestran.
          </p>
        </div>
        <div className="filtros-acciones">
          <button type="button" className="btn-filtro" data-activo={config ? '1' : '0'}
            aria-expanded={config} aria-controls="filtros-config"
            onClick={() => setConfig(v => !v)}>
            <Icono nombre="tune" />
            Personalizar
          </button>
        </div>
      </div>
      <div className="card-body" id="filtros-cuerpo">
        {config ? (
          <div className="filtros-config" id="filtros-config" role="group"
            aria-label="Filtros que se muestran en la barra">
            <div className="filtros-config-tit mb-2">
              Personalice los filtros para segmentar las visualizaciones
            </div>
            <div className="filtros-config-lista">
              {FILTROS_ORDEN.filter(f => FILTROS_FIJOS.indexOf(f[0]) < 0).map(f => (
                <div className="form-check" key={f[0]}>
                  <input className="form-check-input" type="checkbox" id={'cfg-' + f[0]}
                    checked={visibles.indexOf(f[0]) >= 0}
                    onChange={() => alternarVisible(f[0])} />
                  <label className="form-check-label" htmlFor={'cfg-' + f[0]}>{f[1]}</label>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {mostrados.length ? (
          <div className="filtros-filas">
            {Array.from({ length: Math.ceil(mostrados.length / 5) }, (_, k) => mostrados.slice(k * 5, k * 5 + 5)).map((fila, k) => (
              <div className="filtros-rejilla" key={k} style={{ '--cols': fila.length }}>
                {fila.map(f => campo(f[0], f[1]))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Fichas con los filtros activos; cada una se retira con un clic. */
function FichasActivas({ filtros, cambiar, limpiar }) {
  const fichas = [];
  const agregar = (campo, etiqueta, valores, rotulo) => {
    valores.forEach(v => fichas.push({
      etiqueta: etiqueta, texto: rotulo(v),
      quitar: () => cambiar({ [campo]: filtros[campo].filter(x => x !== v) })
    }));
  };

  agregar('nivelAcad', 'Nivel académico', filtros.nivelAcad, i => DIM.nivelAcad[i]);
  agregar('sector', 'Sector', filtros.sector, s => s);
  agregar('nivelForm', 'Nivel de formación', filtros.nivelForm,
    i => DIM.nivelForm[i].nombre);
  agregar('modalidad', 'Modalidad', filtros.modalidad, i => DIM.modalidad[i]);
  agregar('area', 'Área de conocimiento', filtros.area, i => DIM.area[i]);
  agregar('nbc', 'Núcleo básico', filtros.nbc, i => DIM.nbc[i].nombre);
  agregar('cineAmp', 'Campo amplio CINE', filtros.cineAmp, i => DIM.cineAmplio[i]);
  agregar('ies', 'Institución', filtros.ies, i => DIM.ies[i].corto);
  agregar('caracter', 'Carácter académico', filtros.caracter, k => k);
  agregar('sexo', 'Género', filtros.sexo, i => DIM.sexo[i]);
  agregar('programa', 'Programa', filtros.programa, i => DIM.programa[i].nombre);

  agregar('acrIes', 'Institución acreditada', filtros.acrIes, rotuloSiNo);
  agregar('acrProg', 'Programa acreditado', filtros.acrProg, rotuloSiNo);

  if (!fichas.length) return null;

  /* Etiquetas (tag) de la plantilla. Cada una es un botón: un clic la retira. */
  return (
    <div className="fichas-activas">
      <span className="fichas-activas-tit">Filtros aplicados</span>
      {fichas.map((f, i) => (
        <button key={i} type="button" className="tag tag-light-primary" onClick={f.quitar}
          title={'Quitar ' + f.etiqueta + ': ' + f.texto}
          aria-label={'Quitar ' + f.etiqueta + ': ' + f.texto}>
          <span>{f.etiqueta}: {recortar(f.texto, 38)}</span>
          <span className="btn-close" aria-hidden="true" />
        </button>
      ))}
      <button type="button" className="btn-filtro ms-auto" onClick={limpiar}>
        <Icono nombre="ink_eraser" />
        Borrar todos
      </button>
    </div>
  );
}

/* =================================================================== */
/*  Aplicación                                                          */
/* =================================================================== */

function App() {
  const [tab, setTab] = useState(0);
  const [intro, setIntro] = useState(true);
  const refsTab = useRef([]);
  const [filtros, setFiltros] = useState(FILTROS_BASE);
  const sec = SECCIONES[tab];

  const filas = useMemo(() => aplicar(filtros), [filtros]);
  const res = useMemo(() => resumir(filas), [filas]);

  const cambiar = parcial => setFiltros(f => Object.assign({}, f, parcial));
  const limpiar = () => setFiltros(Object.assign({}, FILTROS_BASE));

  /* Un clic sobre una categoría de cualquier gráfico agrega o quita ese filtro. */
  const sel = (campo, valor) => {
    if (valor === undefined || valor === null) return;
    setFiltros(f => {
      const actual = f[campo] || [];
      const i = actual.indexOf(valor);
      const nuevo = actual.slice();
      if (i >= 0) nuevo.splice(i, 1); else nuevo.push(valor);
      return Object.assign({}, f, { [campo]: nuevo });
    });
  };

  const sub = useMemo(() => {
    const p = [];
    if (filtros.nivelAcad.length) p.push(filtros.nivelAcad.map(i => DIM.nivelAcad[i]).join(', '));
    if (filtros.sector.length) p.push('sector ' + filtros.sector.join(', ').toLowerCase());
    if (filtros.nivelForm.length) p.push(filtros.nivelForm.map(i => DIM.nivelForm[i].nombre).join(', '));
    if (filtros.modalidad.length) p.push(filtros.modalidad.map(i => DIM.modalidad[i]).join(', '));
    if (filtros.area.length) p.push(filtros.area.map(i => DIM.area[i]).join(', '));
    if (filtros.ies.length) p.push(filtros.ies.map(i => DIM.ies[i].corto).join(', '));
    if (filtros.sexo.length) p.push(filtros.sexo.map(i => DIM.sexo[i]).join(', '));
    if (filtros.programa.length) p.push(num(filtros.programa.length) + ' programas');
    return 'Medellín · ' + ANIO + (p.length ? ' · ' + recortar(p.join(' · '), 110) : '') +
      ' · ' + num(res.mat) + ' matriculados';
  }, [filtros, res.mat]);

  const arch = 'matricula-medellin-' + ANIO;

  /* Las flechas izquierda y derecha recorren los botones de sección. */
  const teclas = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (i + (e.key === 'ArrowRight' ? 1 : SECCIONES.length - 1)) % SECCIONES.length;
    setTab(n);
    if (refsTab.current[n]) refsTab.current[n].focus();
  };

  useEffect(() => {
    const raiz = document.getElementById('root');
    if (raiz) raiz.dataset.montado = '1';
  }, []);

  const Panel = sec.panel;

  return (
    <Fragment>
      {intro ? <Intro onCerrar={() => setIntro(false)} /> : null}

      <div className="body container-fluid p-4 p-xl-8">
        <nav aria-label="Ruta de navegación">
          <ol className="breadcrumb">
            <li className="breadcrumb-item">
              <a href="https://sapiencia.gov.co/observatorio/">Observatorio</a>
            </li>
            <li className="breadcrumb-item">
              <a href="/sivu#tableros">SIVU</a>
            </li>
            <li className="breadcrumb-item">Matrícula en educación superior {ANIO}</li>
            <li className="breadcrumb-item active" aria-current="page">{sec.rotulo}</li>
          </ol>
        </nav>
        <h2 className="visually-hidden">{sec.rotulo}</h2>

        {/* Botones de sección, los originales del tablero. */}
        <section className="secciones">
          <div className="tabs" role="tablist" aria-label="Secciones del tablero">
            {SECCIONES.map((p, i) => (
              <button key={p.id} ref={el => (refsTab.current[i] = el)}
                type="button" className="tab" role="tab" id={'tab-' + p.id}
                aria-controls={'panel-' + p.id} aria-selected={i === tab}
                tabIndex={i === tab ? 0 : -1}
                onClick={() => setTab(i)} onKeyDown={e => teclas(e, i)}>
                <span className="tab-sec">Sección {i + 1}</span>
                <span className="tab-tit">{p.rotulo}</span>
              </button>
            ))}
          </div>
        </section>

        <Filtros filtros={filtros} cambiar={cambiar} limpiar={limpiar} />

        <FichasActivas filtros={filtros} cambiar={cambiar} limpiar={limpiar} />

        {res.mat === 0 ? (
          <div className="alert alert-info" role="status">
            La combinación de filtros no deja registros. Use «Limpiar filtros» para
            volver a ver datos.
          </div>
        ) : (
          <Fragment>
            <section className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 row-cols-xxl-6 g-4 mb-5"
              aria-label="Indicadores de la selección">
              <div className="col">
                <Kpi icono="groups" familia="secondary" etiqueta="Matriculados"
                  valor={num(res.mat)} pie="Medellín" />
              </div>
              <div className="col">
                <Kpi icono="account_balance" familia="info" etiqueta="Instituciones de educación superior (IES)"
                  valor={num(res.ies)} pie="Con matrícula reportada" />
              </div>
              <div className="col">
                <Kpi icono="menu_book" familia="primary" etiqueta="Programas"
                  valor={num(res.prog)} pie="Con matrícula reportada" />
              </div>
              <div className="col">
                <Kpi icono="female" familia="tertiary-pink" etiqueta="Mujeres"
                  valor={pct(parte(res.fem, res.mat))} pie={num(res.fem) + ' matriculadas'} />
              </div>
              <div className="col">
                <Kpi icono="verified_user" familia="success" etiqueta="Matrícula oficial"
                  valor={pct(parte(res.oficial, res.mat))}
                  pie={num(res.oficial) + ' matriculados'} />
              </div>
              <div className="col">
                <Kpi icono="school" familia="warning" etiqueta="Posgrado"
                  valor={pct(parte(res.posgrado, res.mat))}
                  pie={num(res.posgrado) + ' matriculados'} />
              </div>
            </section>

            <div id={'panel-' + sec.id} role="tabpanel" aria-labelledby={'tab-' + sec.id}>
              <Panel key={sec.id} filas={filas} res={res} sub={sub} arch={arch}
                sel={sel} filtrosIes={filtros.ies} filtrosPrograma={filtros.programa}
                filtrosNbc={filtros.nbc} filtrosNivel={filtros.nivelForm}
                filtrosArea={filtros.area} />
            </div>
          </Fragment>
        )}
      </div>
    </Fragment>
  );
}

export default App;
