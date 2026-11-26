// @ts-nocheck -- código del tablero estático, traído casi sin cambios (ver abajo).
/* oxlint-disable react-hooks/exhaustive-deps, react/immutability -- código probado del tablero estático:
   sus listas de dependencias son a propósito y cambiarlas cambiaría cuándo se redibujan los gráficos. */
/* ====================================================================== */
/*  Tablero matrícula en ciencia, tecnología e innovación                 */
/*  Observatorio de Sapiencia                                             */
/*                                                                        */
/*  Es js/dashboard.jsx de tablero_matricula_cti (versión del 26 de       */
/*  noviembre de 2026) con cambios de integración: React y ECharts se     */
/*  importan (antes eran globales y el JSX se transpilaba en el navegador */
/*  con Babel) y el módulo exporta App en vez de montarse solo. Los datos */
/*  siguen en window.ODES: PaginaCti.tsx carga datos/definiciones.js y    */
/*  datos/cti.js (los archivos del ETL, en                                */
/*  apps/web/public/tableros/matricula-cti/datos) ANTES de importar este  */
/*  módulo, porque aquí arriba se calculan constantes con ellos. Además:  */
/*  se quitó lo que no se usaba, para el lint, y Escape devuelve el foco  */
/*  al botón del selector. Como el de convocatorias, no lleva la ruta de  */
/*  navegación (migas de pan): así lo pidió el área.                      */
/* ====================================================================== */

import * as echarts from 'echarts';
import { Children, Fragment, useEffect, useMemo, useRef, useState } from 'react';


const C = window.ODES.cti;
const DEF = window.ODES.definiciones;
const DIM = C.dim;

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

/* Gráficos de barras: rótulos de 12 px con los nombres completos (en dos
   líneas si no caben en una), la cifra de cada barra en 15 px y el porcentaje
   en 13 px. Todas las barras horizontales comparten márgenes: la columna de
   nombres ocupa el 34 % del gráfico, entre 100 y 300 px, y a la derecha quedan
   150 px para la cifra y el control lateral (118 px en pantallas angostas).
   Así, dos gráficos de una misma fila dibujan sus barras con el mismo ancho.
   Los anillos, la dispersión, la matriz y el árbol conservan TAM. */
const TAM_BARRAS = 12;
const TAM_CIFRA = 15;
const TAM_PARTE = 13;
const columnaNombres = ancho => Math.round(Math.min(300, Math.max(100, ancho * 0.34)));
const margenDerecho = ancho => (ancho < 520 ? 118 : 150);
const opcionesBarras = (ancho, extra) => Object.assign({
  ancho: columnaNombres(ancho), derecha: margenDerecho(ancho),
  letra: TAM_BARRAS, letraCifra: TAM_CIFRA, letraParte: TAM_PARTE,
  nombresCompletos: true, grosor: 15, paso: 28
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
   se reconoce por su color antes de leer el título. Las tarjetas vecinas
   quedan con colores distintos. */
/* Magenta de Sapiencia: asteriscos de los totales que llevan nota. */
const MAGENTA = '#921C8D';

const COLOR = {
  cti: BASE,
  medellin: MORADO,
  colombia: AZUL,
  area: VERDE,
  variacion: BASE,
  mujeres: NARANJA,
  peso: VERDE,
  nivel: NARANJA,
  institucion: BASE
};

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

/* Años de la serie. El tablero abre en el más reciente. */
const ANIOS = DIM.anio;
const ULTIMO = ANIOS.length - 1;
const PRIMERO = 0;
const I_MUJER = DIM.sexo.indexOf('Mujer');
const I_OFICIAL = DIM.sector.indexOf('Oficial');

/* Matrícula de Medellín en CTi: una fila por año, programa, área, nivel,
   modalidad y sexo. La institución y su sector salen del programa. */
const FILAS = C.filas.map(f => {
  const ies = DIM.programa[f[1]].ies;
  return {
    anio: f[0], prog: f[1], area: f[2], nivel: f[3], modalidad: f[4], sexo: f[5],
    n: f[6], ies: ies, sector: DIM.ies[ies].sector
  };
});

/* Matrícula y programas de Medellín fuera de CTi, que completan el total de
   la ciudad. No traen programa: un filtro de programa los deja por fuera. */
const RESTO = C.resto.map(f => ({
  anio: f[0], ies: f[1], nivel: f[2], modalidad: f[3], sexo: f[4], n: f[5],
  sector: DIM.ies[f[1]].sector
}));
const RESTO_PROG = C.restoProg.map(f => ({
  anio: f[0], ies: f[1], nivel: f[2], modalidad: f[3], programas: f[4],
  sector: DIM.ies[f[1]].sector
}));

/* Matrícula de Colombia (con Medellín). El área -1 es fuera de CTi. */
const PAIS = C.pais.map(f => ({
  anio: f[0], area: f[1], nivel: f[2], modalidad: f[3], sector: f[4], sexo: f[5], n: f[6]
}));

const nombrePrograma = i => DIM.programa[i].nombre;
const nombreIes = i => DIM.ies[i].nombre;
const nombreAnio = i => String(ANIOS[i]);
const nombreArea = i => DIM.area[i];
const nombreNivel = i => DIM.nivel[i];
const nombreModalidad = i => DIM.modalidad[i];
const nombreSector = i => DIM.sector[i];

/* Porcentajes a una cifra de una distribución. Si los valores suman el total,
   se reparten por el método del mayor residuo para que sumen 100,0%; si no,
   cada uno se calcula por separado. */
function participaciones(valores, total) {
  if (!total) return valores.map(() => null);
  const suma = valores.reduce((a, b) => a + b, 0);
  if (suma !== total) return valores.map(v => parte(v, total));
  const exactos = valores.map(v => v * 1000 / total);
  const pisos = exactos.map(e => Math.floor(e + 1e-9));
  const falta = 1000 - pisos.reduce((a, b) => a + b, 0);
  const orden = exactos.map((e, i) => i)
    .sort((a, b) => (exactos[b] - pisos[b]) - (exactos[a] - pisos[a]));
  for (let k = 0; k < falta; k++) pisos[orden[k]] += 1;
  return pisos.map(x => x / 10);
}

/* Lo que la imagen descargada toma de la selección vigente: la línea con el
   territorio y el año. App la actualiza en cada cambio de filtros; los
   gráficos de la serie pasan su propia línea. */
const EXPORTAR = { periodo: '' };

/* Variación porcentual con signo: +3,4%, -15,9%. */
const variacion = (a, b) => (!b ? null : ((a - b) * 100) / b);
const pctSigno = v => (vacio(v) ? '—' : (v > 0.05 ? '+' : '') + pct(v));

/* =================================================================== */
/*  Filtros                                                             */
/* =================================================================== */

/* El año es de selección única: fija el corte de las tarjetas, las
   distribuciones y las tablas. Los gráficos de la serie muestran todos los
   años con los demás filtros. */
const FILTROS_BASE = {
  anio: [ULTIMO], area: [], nivel: [], ies: [], programa: [], sector: [], modalidad: []
};

const CAMPOS_MULTIPLES = Object.keys(FILTROS_BASE);
const CAMPOS_SERIE = CAMPOS_MULTIPLES.filter(c => c !== 'anio');

/* Campos que admite cada conjunto de filas: la matrícula fuera de CTi no
   tiene área ni programa, y la de Colombia no tiene institución ni
   programa. */
const CAMPOS_RESTO = ['ies', 'nivel', 'modalidad', 'sector'];
const CAMPOS_PAIS = ['area', 'nivel', 'modalidad', 'sector'];

/* Filtros cuyas opciones siguen el orden del diccionario y no el alfabético. */
const ORDINALES = ['anio', 'nivel', 'modalidad', 'sector'];

const campoFila = c => (c === 'programa' ? 'prog' : c);

function pasa(f, filtros, campos, excepto) {
  for (let i = 0; i < campos.length; i++) {
    const c = campos[i];
    if (c === excepto) continue;
    const sel = filtros[c];
    if (sel && sel.length && sel.indexOf(f[campoFila(c)]) < 0) return false;
  }
  return true;
}

/** Filas de CTi en Medellín con los filtros, en todos los años. `excepto`
    deja fuera un campo, para calcular las opciones de ese mismo filtro. */
const filasSerie = (filtros, excepto) =>
  FILAS.filter(f => pasa(f, filtros, CAMPOS_SERIE, excepto));

/**
 * Opciones que le quedan a un filtro, dadas las demás selecciones, y la
 * matrícula de cada una en el año elegido. Las instituciones y los programas
 * con estudiantes en CTi en cualquier año de la serie siguen en la lista,
 * para poder ver su evolución.
 */
function disponibles(filtros, campo, rotulo) {
  const a = filtros.anio[0];
  const filas = filasSerie(filtros, campo);
  const suma = new Map();
  filas.forEach(f => {
    const k = campo === 'anio' ? f.anio : f[campoFila(campo)];
    if (!suma.has(k)) suma.set(k, 0);
    if (campo === 'anio' || f.anio === a) suma.set(k, suma.get(k) + f.n);
  });
  const claves = campo === 'anio' ? ANIOS.map((x, i) => i) : Array.from(suma.keys());
  if (ORDINALES.indexOf(campo) >= 0) {
    claves.sort((x, y) => x - y);
  } else if (rotulo) {
    claves.sort((x, y) =>
      String(rotulo(x)).localeCompare(String(rotulo(y)), 'es', { numeric: true }));
  }
  /* Lo ya seleccionado permanece en la lista para que se pueda desmarcar. */
  (filtros[campo] || []).forEach(k => {
    if (claves.indexOf(k) < 0) claves.push(k);
  });
  return { claves: claves, conteo: k => suma.get(k) || 0 };
}

/* =================================================================== */
/*  Resumen de la selección                                             */
/* =================================================================== */

const porAnio = () => ANIOS.map(() => 0);

/**
 * Cifras de la selección en cada año de la serie:
 *   cti, mujeres, oficial y programas en CTi de Medellín;
 *   total y programasTotal de Medellín, con todas las áreas;
 *   paisCti, paisTotal y paisMujeres de Colombia.
 * El total de Medellín y el de Colombia no toman el filtro de área, de modo
 * que la participación de un área es sobre toda la matrícula. Colombia no
 * toma los filtros de institución ni de programa.
 */
function resumir(filtros) {
  const r = {
    cti: porAnio(), mujeres: porAnio(), oficial: porAnio(), programas: porAnio(),
    total: porAnio(), programasTotal: porAnio(),
    paisCti: porAnio(), paisTotal: porAnio(), paisMujeres: porAnio()
  };
  const progs = ANIOS.map(() => new Set());
  const progsTodas = ANIOS.map(() => new Set());
  const filas = [];
  FILAS.forEach(f => {
    if (!pasa(f, filtros, CAMPOS_SERIE, 'area')) return;
    r.total[f.anio] += f.n;
    progsTodas[f.anio].add(f.prog);
    if (filtros.area.length && filtros.area.indexOf(f.area) < 0) return;
    filas.push(f);
    r.cti[f.anio] += f.n;
    if (f.sexo === I_MUJER) r.mujeres[f.anio] += f.n;
    if (f.sector === I_OFICIAL) r.oficial[f.anio] += f.n;
    progs[f.anio].add(f.prog);
  });
  ANIOS.forEach((x, i) => {
    r.programas[i] = progs[i].size;
    r.programasTotal[i] = progsTodas[i].size;
  });
  if (!filtros.programa.length) {
    RESTO.forEach(f => { if (pasa(f, filtros, CAMPOS_RESTO)) r.total[f.anio] += f.n; });
    RESTO_PROG.forEach(f => {
      if (pasa(f, filtros, CAMPOS_RESTO)) r.programasTotal[f.anio] += f.programas;
    });
  }
  PAIS.forEach(f => {
    if (!pasa(f, filtros, CAMPOS_PAIS, 'area')) return;
    r.paisTotal[f.anio] += f.n;
    if (f.area < 0 || (filtros.area.length && filtros.area.indexOf(f.area) < 0)) return;
    r.paisCti[f.anio] += f.n;
    if (f.sexo === I_MUJER) r.paisMujeres[f.anio] += f.n;
  });
  r.filas = filas;
  r.anio = filtros.anio[0];
  r.filasAnio = filas.filter(f => f.anio === r.anio);
  return r;
}

/** Suma de la matrícula por una llave, con mujeres y oficiales. */
function agrupar(filas, llave, nombre) {
  const mapa = new Map();
  filas.forEach(f => {
    const k = llave(f);
    if (k === undefined || k === null) return;
    let e = mapa.get(k);
    if (!e) {
      e = { k: k, nombre: nombre(k), n: 0, mujeres: 0, oficial: 0, prog: new Set() };
      mapa.set(k, e);
    }
    e.n += f.n;
    if (f.sexo === I_MUJER) e.mujeres += f.n;
    if (f.sector === I_OFICIAL) e.oficial += f.n;
    e.prog.add(f.prog);
  });
  return Array.from(mapa.values())
    .map(e => Object.assign({}, e, { prog: e.prog.size }))
    .sort((a, b) => b.n - a.n || String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

/** Matrícula de Colombia en el año `a` por una llave (área o nivel), con los
    filtros que admite y solo en CTi. */
function paisPor(filtros, a, campo) {
  const m = new Map();
  PAIS.forEach(f => {
    if (f.anio !== a || f.area < 0 || !pasa(f, filtros, CAMPOS_PAIS)) return;
    m.set(f[campo], (m.get(f[campo]) || 0) + f.n);
  });
  return m;
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

/** Parte un texto en líneas que no pasen de `ancho` píxeles con la letra dada. */
function partirTexto(texto, letra, ancho) {
  if (!texto) return [];
  const c = document.createElement('canvas').getContext('2d');
  c.font = letra;
  const lineas = [];
  let linea = '';
  texto.split(' ').forEach(p => {
    const prueba = linea ? linea + ' ' + p : p;
    if (linea && c.measureText(prueba).width > ancho) {
      lineas.push(linea);
      linea = p;
    } else {
      linea = prueba;
    }
  });
  if (linea) lineas.push(linea);
  return lineas;
}

function descargarPng(ec, nombreSalida, titulo, nota, periodo) {
  const pr = 3;
  const base = ec.getDataURL({ type: 'png', pixelRatio: pr, backgroundColor: '#fff' });
  const img = new Image();
  img.onload = function () {
    const cabecera = 116 * pr;
    const margen = 22 * pr;
    const lineasNota = partirTexto(nota ? '* ' + nota : '', 10 * pr + 'px ' + TIPO,
      img.width - 2 * margen);
    const pie = (38 + 15 * lineasNota.length) * pr;
    const lienzo = document.createElement('canvas');
    lienzo.width = img.width;
    lienzo.height = img.height + cabecera + pie;
    const c = lienzo.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, lienzo.width, lienzo.height);

    /* Encabezado en cuatro niveles: el título de la visualización (18 px,
       seminegrita, azul), el nombre del tablero (13 px, medio), la
       convocatoria elegida (12 px) y el Observatorio (11 px, gris). */
    c.textBaseline = 'middle';
    c.fillStyle = BASE;
    c.font = '600 ' + 18 * pr + 'px ' + TIPO;
    c.fillText(titulo, margen, 30 * pr);
    if (nota) {
      c.fillStyle = MAGENTA;
      c.fillText('*', margen + c.measureText(titulo).width + 2 * pr, 30 * pr);
    }

    c.fillStyle = TINTA;
    c.font = '500 ' + 13 * pr + 'px ' + TIPO;
    c.fillText(DEF.tablero || '', margen, 57 * pr);

    c.fillStyle = TINTA2;
    c.font = 12 * pr + 'px ' + TIPO;
    c.fillText(periodo || EXPORTAR.periodo, margen, 75 * pr);

    c.fillStyle = GRIS;
    c.font = 11 * pr + 'px ' + TIPO;
    c.fillText(DEF.observatorio, margen, 95 * pr);

    c.strokeStyle = LINEA;
    c.lineWidth = 1 * pr;
    c.beginPath();
    c.moveTo(margen, cabecera - 8 * pr);
    c.lineTo(lienzo.width - margen, cabecera - 8 * pr);
    c.stroke();

    c.drawImage(img, 0, cabecera);

    c.fillStyle = GRIS;
    c.font = 10 * pr + 'px ' + TIPO;
    lineasNota.forEach((l, i) => {
      const y = img.height + cabecera + (14 + 15 * i) * pr;
      if (i === 0) {
        c.fillStyle = MAGENTA;
        c.fillText('*', margen, y);
        c.fillStyle = GRIS;
        c.fillText(l.slice(1), margen + c.measureText('*').width, y);
      } else {
        c.fillText(l, margen, y);
      }
    });
    c.fillText(DEF.nota, margen, img.height + cabecera + pie - 19 * pr);

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

function Descargas({ csv, instancia, titulo, nota, periodo }) {
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
            if (ec) descargarPng(ec, 'grafico_odes', titulo, nota, periodo);
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
  secundario, buscador, resumenVacio, ancho, unico }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const caja = useRef(null);
  const id = 'sel-' + clave(etiqueta);

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = e => {
      if (caja.current && !caja.current.contains(e.target)) setAbierto(false);
    };
    /* El kit de la plantilla atiende en la fase de captura del documento las
       teclas de todo dropdown-menu y falla con este, que no usa su botón.
       Escuchar en la ventana permite resolver aquí Escape y las flechas del
       selector antes de que la tecla llegue al kit. */
    const esc = e => {
      if (e.key !== 'Escape' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const adentro = caja.current && caja.current.contains(e.target);
      if (adentro) e.stopImmediatePropagation();
      if (e.key !== 'Escape') return;
      setAbierto(false);
      /* Integración: la lista se desmonta con el foco adentro; vuelve al botón
         del selector en vez de perderse en la página. */
      if (adentro) caja.current.querySelector('button').focus();
    };
    document.addEventListener('mousedown', fuera);
    window.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', fuera);
      window.removeEventListener('keydown', esc, true);
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
    /* Con `unico` la lista funciona como un grupo de opciones: elegir una
       reemplaza la anterior y cierra la lista. */
    if (unico) {
      onCambio([v]);
      setAbierto(false);
      return;
    }
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
                  <input className="form-check-input" type={unico ? 'radio' : 'checkbox'}
                    name={unico ? id : undefined} id={id + '-' + i}
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
          {unico ? null : (
            <div className="border-top mt-2 pt-2">
              <button type="button" className="btn btn-outline-neutral btn-sm"
                onClick={() => onCambio([])}>Quitar selección</button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Tarjeta de la plantilla (card) con título y acciones en el encabezado. La
 * clase card-lg del kit le permite ocupar todo el ancho de su columna.
 * `claro` la mantiene en el tema claro aunque el visitante active el modo
 * oscuro: los gráficos están pensados para fondo blanco.
 */
function Ficha({ titulo, accion, pie, claro, marca, children }) {
  return (
    <section className="card card-lg h-100" data-bs-theme={claro ? 'light' : undefined}>
      <div className="card-header d-flex justify-content-between align-items-center gap-3">
        <h3 className="card-title mb-0">
          {titulo}{marca ? <span className="marca-nota">*</span> : null}
        </h3>
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
    if (!caja.current) return undefined;
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

  return <div ref={caja} className="grafico"
    style={altoPx ? { height: altoPx } : null} />;
}

function FichaGrafico({ titulo, altoPx, opcion, csv, archivo, pie, extra,
  alSeleccionar, vacio, nota, periodo }) {
  const instancia = useRef(null);
  return (
    <Ficha titulo={titulo} pie={pie} claro marca={!!nota}
      accion={<Descargas csv={csv} instancia={instancia} nombre={archivo}
        titulo={titulo} nota={nota} periodo={periodo} />}>
      {opcion
        ? <Grafico opcion={opcion} altoPx={altoPx} instancia={instancia}
            alSeleccionar={alSeleccionar} />
        : <SinDatos texto={vacio} />}
      {opcion ? extra || null : null}
      {opcion && nota
        ? <p className="nota-total"><span className="marca-nota">*</span> {nota}</p>
        : null}
    </Ficha>
  );
}

/**
 * Tabla ordenable con el estilo de tabla de la plantilla. Las columnas de
 * categoría (las que traen `ancho`) ocupan el doble que las demás, que quedan
 * todas del mismo ancho; en pantallas angostas la tabla conserva un ancho
 * mínimo y se recorre de lado, con la primera columna fija. Un clic (o Enter)
 * en el título de una columna ordena por ella. `rotuloTotal` cambia el rótulo
 * de la fila de total, por ejemplo para remitir a una nota.
 */
function Tabla({ columnas, filas, altura, orden, alSeleccionar, seleccion,
  rotuloTotal, unidad }) {
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
  const pesos = columnas.map(c => (c.ancho ? 2 : 1));
  const suma = pesos.reduce((s, p) => s + p, 0);

  return (
    <Fragment>
      <div className="tabla-caja" style={altura ? { maxHeight: altura } : null}>
        <table className="table table-hover table-sm align-middle"
          style={{ tableLayout: 'fixed', minWidth: suma * (unidad || 92) }}>
          <colgroup>
            {pesos.map((p, i) => <col key={i} style={{ width: (100 * p / suma) + '%' }} />)}
          </colgroup>
          <thead>
            <tr>
              {columnas.map((c, i) => {
                const ordenar = () => {
                  if (col === c.clave) setAsc(a => !a);
                  else { setCol(c.clave); setAsc(c.tipo === 'texto'); }
                };
                return (
                  <th key={c.clave} className={i === 0 ? 'fija' : ''}
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
                    {i === 0 ? rotuloTotal || 'Total'
                      : c.total === 'suma' ? num(totales[c.clave]) : ''}
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
  /* Participación de cada barra: si las barras suman el total, se cierra en
     100,0 % por el método del mayor residuo (ver participaciones). */
  const partes = participaciones(valores, total);
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
  /* Con `derecha` el margen es fijo y ya incluye el control lateral. */
  op.grid = {
    left: anchoCol,
    right: o.derecha !== undefined ? o.derecha
      : Math.max(Math.round((o.conParte ? 132 : 92) * letra / TAM),
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
    '</b><br/>' + num(p.value) + ' ' + (o.unidad || 'estudiantes') +
    (total ? '<br/>' + pct(partes[p.dataIndex]) + ' del total' : '');
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
        ? '{v|' + num(p.value) + '}  {p|' + pct(partes[p.dataIndex]) + '}'
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

/** Anillo con el total en el centro. */
function anillo(datos, opciones) {
  const o = Object.assign({}, opciones);
  const total = datos.reduce((s, d) => s + d.value, 0);
  const op = base();
  op.tooltip.formatter = p =>
    '<b>' + p.name + '</b><br/>' + num(p.value) + ' ' + (o.unidad || 'estudiantes') + '<br/>' +
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
      /* Los nombres largos se parten en líneas en lugar de recortarse. */
      formatter: p => '{n|' + envolver(p.name, 24).replace(/\n/g, '}\n{n|') + '}\n{v|' +
        pct(parte(p.value, total)) + '}',
      rich: {
        n: { color: TINTA2, fontSize: TAM, fontFamily: TIPO },
        v: { color: TINTA, fontSize: 12, fontWeight: 500, fontFamily: TIPO }
      }
    },
    labelLine: { length: 10, length2: 12, lineStyle: { color: LINEA } },
    /* `colores` fija el color de cada porción por categoría; sin él, el
       color sigue el orden de los datos. */
    /* Las porciones de menos de medio punto no llevan rótulo: se leen en el
       tooltip. */
    data: datos.map((d, i) => Object.assign({}, d, {
      itemStyle: { color: (o.colores && o.colores[i]) || SERIES[i % SERIES.length] }
    }, parte(d.value, total) < 0.5
      ? { label: { show: false }, labelLine: { show: false } } : {}))
  }];
  op.graphic = [{
    type: 'text', left: 'center', top: '41%',
    style: {
      text: num(total) + (o.marca || ''), fontSize: 22, fontWeight: 500, fill: TINTA,
      fontFamily: TIPO, textAlign: 'center'
    }
  }, {
    type: 'text', left: 'center', top: '51%',
    style: {
      text: o.rotuloCentro || 'estudiantes', fontSize: TAM, fill: GRIS,
      fontFamily: TIPO, textAlign: 'center'
    }
  }];
  return op;
}

/** Barras de porcentaje: la longitud es la tasa de cada categoría y el
    rótulo, el porcentaje. Sin `max`, la escala llega a 100; con `max: null`
    se ajusta al mayor valor. */
function barrasPct(categorias, tasas, detalle, opciones) {
  const o = Object.assign({}, opciones);
  const op = barrasH(categorias, tasas, o);
  op.series[0].label.formatter = p => '{v|' + pct(p.value) + '}';
  if (o.max !== null) op.xAxis.max = o.max || 100;
  op.tooltip.formatter = p =>
    '<b>' + categorias[p.dataIndex] + '</b><br/>' + detalle(p.dataIndex);
  return op;
}

/** Límites y paso del eje de valores de una serie de tiempo. El eje parte de
    cero, para no exagerar las variaciones, y deja aire arriba para la cifra
    de cada punto. */
function limitesEje(valores) {
  const v = valores.filter(x => !vacio(x));
  if (!v.length) return {};
  const alto = Math.max.apply(null, [1].concat(v)) * 1.15;
  const pot = Math.pow(10, Math.floor(Math.log10(alto / 5)));
  const paso = [1, 2, 2.5, 5, 10].map(m => m * pot).filter(p => Math.ceil(alto / p) <= 6)[0];
  return { min: 0, max: Math.ceil(alto / paso) * paso, interval: paso };
}

/**
 * Líneas suavizadas de una serie de tiempo, con la cifra en cada punto. Con
 * dos series, la de valores más altos lleva la cifra arriba y la otra abajo.
 * `marcado` resalta el año elegido en el eje y en el punto.
 */
function lineas(categorias, series, opciones) {
  const o = Object.assign({}, opciones);
  /* En pantallas angostas la letra baja un punto para que quepan las cifras. */
  const letra = o.letra || (o.ancho && o.ancho < 520 ? TAM : TAM_BARRAS);
  const formato = o.formato || num;
  const eje = o.eje || formato;
  const varias = series.length > 1;
  const media = s => {
    const v = s.datos.filter(x => !vacio(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const arriba = varias ? media(series[0]) >= media(series[1]) : true;
  const op = base();
  if (varias) {
    op.legend = Object.assign(leyenda(letra), { data: series.map(s => s.nombre) });
  }
  op.grid = { left: 10, right: 26, top: varias ? 56 : 30, bottom: 6, containLabel: true };
  op.tooltip.trigger = 'axis';
  op.tooltip.axisPointer = { type: 'line', lineStyle: { color: LINEA, width: 1 } };
  op.tooltip.formatter = ps => {
    if (!ps.length) return '';
    const i = ps[0].dataIndex;
    return '<b>' + categorias[i] + '</b><br/>' + ps.map(p =>
      p.marker + ' ' + (varias ? p.seriesName + ': ' : '') + formato(p.value) +
      (o.detalle ? o.detalle(p.seriesIndex, i) : '')).join('<br/>');
  };
  op.xAxis = {
    type: 'category', data: categorias, boundaryGap: true,
    axisLine: { show: true, lineStyle: { color: LINEA } },
    axisTick: { show: true, alignWithLabel: true, lineStyle: { color: LINEA } },
    axisLabel: {
      color: TINTA2, fontSize: letra, margin: 10, interval: 0,
      formatter: (v, i) => (i === o.marcado ? '{m|' + v + '}' : v),
      rich: { m: { color: TINTA, fontSize: letra, fontWeight: 600, fontFamily: TIPO } }
    }
  };
  op.yAxis = Object.assign({
    type: 'value',
    axisLine: { show: true, lineStyle: { color: LINEA } },
    axisTick: { show: true, lineStyle: { color: LINEA } },
    axisLabel: { color: GRIS, fontSize: letra - 1, formatter: v => eje(v) },
    splitLine: { show: false }
  }, limitesEje([].concat.apply([], series.map(s => s.datos))));
  op.series = series.map((s, k) => ({
    name: s.nombre,
    type: 'line',
    smooth: 0.35,
    smoothMonotone: 'x',
    symbol: 'circle',
    symbolSize: (v, p) => (p.dataIndex === o.marcado ? 11 : 8),
    lineStyle: { width: 2.5, color: s.color },
    itemStyle: { color: s.color, borderColor: '#ffffff', borderWidth: 2 },
    emphasis: { focus: 'none', scale: 1.2 },
    /* Con una serie, la cifra va debajo de los puntos más bajos que sus
       vecinos, para que no la cruce la línea. */
    data: varias ? s.datos : s.datos.map((v, i) => {
      const antes = i > 0 ? s.datos[i - 1] : null;
      const despues = i < s.datos.length - 1 ? s.datos[i + 1] : null;
      const valle = !vacio(v) && (antes === null || v < antes) && (despues === null || v < despues) &&
        (antes !== null || despues !== null);
      return valle ? { value: v, label: { position: 'bottom' } } : v;
    }),
    label: {
      show: true, position: (k === 0) === arriba ? 'top' : 'bottom', distance: 8,
      fontSize: letra, fontFamily: TIPO, color: TINTA, fontWeight: 500,
      formatter: p => formato(p.value)
    },
    labelLayout: { hideOverlap: true },
    z: 3 - k
  }));
  return op;
}

/**
 * Barras de variación porcentual de una sola serie y un solo color: las
 * positivas crecen a la derecha del cero y las negativas a la izquierda, con
 * la cifra con signo en el extremo. Los márgenes son los de opcionesBarras.
 */
function barrasVariacion(categorias, valores, opciones) {
  const o = Object.assign({}, opciones);
  const letra = o.letra || TAM_BARRAS;
  const letraCifra = o.letraCifra || letra;
  const color = o.color || BASE;
  const op = base();
  const anchoCol = o.ancho || 180;
  const anchoRotulo = anchoCol - 14;
  const derecha = o.derecha !== undefined ? o.derecha : 60;
  const altoLinea = Math.round(letra * 1.2);
  const nLineas = Math.max.apply(null, [1].concat(categorias.map(c => lineasDe(c, anchoRotulo, letra))));
  const paso = Math.max(o.paso || 28, nLineas * altoLinea + 10);
  const caben = Math.max(3, Math.floor(((o.alto || ALTO) - 34) / paso));
  const recorre = categorias.length > caben;
  /* La cifra de las barras positivas cabe en el margen derecho; la de las
     negativas necesita espacio dentro del gráfico, a la izquierda. */
  const minimo = Math.min.apply(null, [0].concat(valores));
  const maximo = Math.max.apply(null, [0].concat(valores));
  const trazo = Math.max(80, (o.anchoGrafico || 600) - anchoCol - derecha);
  const cifra = (medirTexto('+888,8%', letraCifra, 500) + 14) / trazo;
  const tramo = ((maximo - minimo) || 1) / Math.max(0.2, 1 - (minimo < 0 ? cifra : 0));
  op.grid = { left: anchoCol, right: derecha, top: 14, bottom: 20, containLabel: false };
  if (recorre) {
    op.dataZoom = [{
      type: 'inside', yAxisIndex: 0, startValue: 0, endValue: caben - 1,
      zoomOnMouseWheel: false, moveOnMouseWheel: true, moveOnMouseMove: true
    }];
  }
  op.xAxis = {
    type: 'value',
    min: minimo < 0 ? minimo - cifra * tramo : 0,
    max: maximo > 0 ? maximo : (minimo < 0 ? 0 : 1),
    axisLine: { show: true, lineStyle: { color: LINEA } },
    axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false }
  };
  op.yAxis = {
    type: 'category', data: categorias, inverse: true,
    axisLine: { show: false, onZero: false }, axisTick: { show: false },
    axisLabel: {
      color: TINTA2, fontSize: letra, margin: 12, lineHeight: altoLinea,
      width: anchoRotulo, overflow: 'break'
    }
  };
  op.tooltip.formatter = p => '<b>' + categorias[p.dataIndex] + '</b><br/>' +
    pctSigno(p.value) + (o.detalle ? o.detalle(p.dataIndex) : '');
  op.series = [{
    type: 'bar',
    barMaxWidth: o.grosor || 15,
    data: valores.map(v => ({
      value: v,
      label: { position: v < 0 ? 'left' : 'right' }
    })),
    itemStyle: { color: color, borderRadius: 4 },
    emphasis: { itemStyle: { color: aclarar(color, 0.2) } },
    label: {
      show: true, distance: 8, fontSize: letraCifra, fontFamily: TIPO,
      color: TINTA, fontWeight: 500, formatter: p => pctSigno(p.value)
    },
    /* Línea del cero, para leer de qué lado queda cada barra. */
    markLine: {
      silent: true, symbol: 'none', label: { show: false },
      lineStyle: { color: '#BDBDBD', width: 1, type: 'solid' },
      data: [{ xAxis: 0 }]
    }
  }];
  return op;
}

/**
 * Barras horizontales en pares: dos series por categoría (por ejemplo, dos
 * años), cada una con su porcentaje al final. La leyenda va arriba.
 */
function barrasPares(categorias, series, opciones) {
  const o = Object.assign({}, opciones);
  const letra = o.letra || TAM_BARRAS;
  const letraCifra = o.letraParte || letra;
  const anchoCol = o.ancho || 180;
  const anchoRotulo = anchoCol - 14;
  const altoLinea = Math.round(letra * 1.2);
  const nLineas = Math.max.apply(null, [1].concat(categorias.map(c => lineasDe(c, anchoRotulo, letra))));
  const grosor = o.grosor || 11;
  const paso = Math.max(series.length * (grosor + 4) + 16, nLineas * altoLinea + 12);
  const caben = Math.max(3, Math.floor(((o.alto || ALTO) - 64) / paso));
  const recorre = categorias.length > caben;
  const valores = [].concat.apply([], series.map(s => s.datos)).filter(v => !vacio(v));
  const maximo = Math.max.apply(null, [1].concat(valores));
  const op = base();
  op.legend = Object.assign(leyenda(letra), { data: series.map(s => s.nombre) });
  op.grid = {
    left: anchoCol, right: o.derecha !== undefined ? o.derecha : 60,
    top: 40, bottom: 20, containLabel: false
  };
  if (recorre) {
    op.dataZoom = [{
      type: 'inside', yAxisIndex: 0, startValue: 0, endValue: caben - 1,
      zoomOnMouseWheel: false, moveOnMouseWheel: true, moveOnMouseMove: true
    }];
  }
  op.xAxis = {
    type: 'value', min: 0, max: o.max || maximo * 1.02,
    axisLine: { show: true, lineStyle: { color: LINEA } },
    axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false }
  };
  op.yAxis = {
    type: 'category', data: categorias, inverse: true,
    axisLine: { show: true, lineStyle: { color: LINEA } }, axisTick: { show: false },
    axisLabel: {
      color: TINTA2, fontSize: letra, margin: 12, lineHeight: altoLinea,
      width: anchoRotulo, overflow: 'break'
    }
  };
  op.tooltip.trigger = 'axis';
  op.tooltip.axisPointer = { type: 'shadow', shadowStyle: { color: 'rgba(11,58,86,.05)' } };
  op.tooltip.formatter = ps => {
    if (!ps.length) return '';
    const i = ps[0].dataIndex;
    return '<b>' + categorias[i] + '</b><br/>' + ps.map(p =>
      p.marker + ' ' + p.seriesName + ': ' + (o.formato || pct)(p.value) +
      (o.detalle ? o.detalle(p.seriesIndex, i) : '')).join('<br/>');
  };
  op.series = series.map(s => ({
    name: s.nombre,
    type: 'bar',
    data: s.datos,
    barMaxWidth: grosor,
    barGap: '30%',
    itemStyle: { color: s.color, borderRadius: 4 },
    emphasis: { itemStyle: { color: aclarar(s.color, 0.2) } },
    label: {
      show: true, position: 'right', distance: 6, fontSize: letraCifra,
      fontFamily: TIPO, color: TINTA, formatter: p => (o.formato || pct)(p.value)
    }
  }));
  return op;
}

const nombreArchivo = partes => partes.filter(Boolean).map(clave).join('_');

/* =================================================================== */
/*  Secciones                                                           */
/* =================================================================== */

/* Anchos de las tarjetas en la rejilla de 12 columnas de la plantilla. */
const UNA = ['col-12'];
const DOS = ['col-12 col-lg-6'];

/** Fila de tarjetas con la rejilla (row y col) de la plantilla. */
function Fila({ cols, children }) {
  const hijos = Children.toArray(children);
  return (
    <div className="row g-4 mb-4">
      {hijos.map((h, i) => <div key={i} className={cols[i % cols.length]}>{h}</div>)}
    </div>
  );
}


/* Barras de una sola serie con la cifra y su participación en `total`. Si
   las barras suman el total, los porcentajes cierran en 100,0%. */
const barras = (datos, total, color, extra) => ancho => barrasH(
  datos.map(d => d.nombre), datos.map(d => d.n),
  opcionesBarras(ancho, Object.assign({ total: total, conParte: true, color: color,
    unidad: 'estudiantes' }, extra)));

/* Datos de un gráfico de una sola serie para la descarga en CSV, con los
   mismos porcentajes del gráfico. */
const csvDe = (datos, rotulo, total) => () => {
  const partes = participaciones(datos.map(d => d.n), total);
  return {
    encabezados: [rotulo, 'Estudiantes', 'Participación (%)'],
    filas: datos.map((d, i) => [d.nombre, d.n, Number((partes[i] || 0).toFixed(1))])
  };
};

const csvTabla = (columnas, tabla) => () => ({
  encabezados: columnas.map(c => c.rotulo),
  filas: tabla.map(f => columnas.map(c =>
    c.tipo === 'pct' ? (vacio(f[c.clave]) ? '' : Number(f[c.clave].toFixed(1))) : f[c.clave]))
});

const redondo = v => (vacio(v) ? '' : Number(v.toFixed(1)));

/* Colores fijos de las categorías de los anillos: cada una conserva el suyo
   aunque los filtros cambien cuál es la mayor. */
const COLORES_SECTOR = [BASE, AZUL];
const COLORES_MODALIDAD = [MORADO, NARANJA, AZUL];

/** Evolución de la matrícula en CTi y comparación con el país. */
function PanoramaGeneral({ res, arch, sel, selAnio, filtros }) {
  const a = res.anio;
  const anio = nombreAnio(a);
  const inicio = nombreAnio(PRIMERO);
  const anios = ANIOS.map(String);
  const conSerie = res.filas.length > 0;
  const lineaSerie = 'Medellín, ' + inicio + ' a ' + nombreAnio(ULTIMO);
  const lineaAnio = 'Medellín, ' + anio;
  const clicAnio = p => selAnio(p.dataIndex);

  /* Serie de la matrícula y de la participación. */
  const partMed = ANIOS.map((x, i) => parte(res.cti[i], res.total[i]));
  const partPais = ANIOS.map((x, i) => parte(res.paisCti[i], res.paisTotal[i]));
  const mujMed = ANIOS.map((x, i) => parte(res.mujeres[i], res.cti[i]));
  const mujPais = ANIOS.map((x, i) => parte(res.paisMujeres[i], res.paisCti[i]));

  /* Distribución del año elegido por nivel de formación. */
  const porNivel = useMemo(() =>
    agrupar(res.filasAnio, f => f.nivel, nombreNivel).sort((x, y) => x.k - y.k), [res]);

  /* Peso de Medellín en la matrícula del país por nivel. */
  const pesoNivel = useMemo(() => {
    const pais = paisPor(filtros, a, 'nivel');
    return porNivel.map(d => Object.assign({}, d, {
      pais: pais.get(d.k) || 0, tasa: parte(d.n, pais.get(d.k)) || 0
    }));
  }, [porNivel, filtros, a]);

  const hayAnio = res.filasAnio.length > 0;
  const sinAnio = 'Sin estudiantes en ' + anio + ' para la selección activa.';

  return (
    <Fragment>
      <Fila cols={DOS}>
        <FichaGrafico titulo="Estudiantes en CTi por año" altoPx={ALTO} periodo={lineaSerie}
          opcion={conSerie ? (ancho => lineas(anios, [{ nombre: 'Estudiantes en CTi', datos: res.cti, color: COLOR.cti }], {
            marcado: a, ancho: ancho,
            eje: v => num(v),
            detalle: (s, i) => (i > PRIMERO && res.cti[i - 1]
              ? '<br/>' + pctSigno(variacion(res.cti[i], res.cti[i - 1])) + ' frente a ' + ANIOS[i - 1] : '')
          })) : null}
          csv={() => ({
            encabezados: ['Año', 'Estudiantes en CTi', 'Variación anual (%)'],
            filas: ANIOS.map((x, i) => [x, res.cti[i],
              i > PRIMERO ? redondo(variacion(res.cti[i], res.cti[i - 1])) : ''])
          })}
          alSeleccionar={clicAnio}
          archivo={nombreArchivo([arch, 'estudiantes-cti-por-anio'])} />

        <FichaGrafico titulo="Participación de CTi en la matrícula" altoPx={ALTO} periodo={lineaSerie}
          opcion={conSerie ? (ancho => lineas(anios, [
            { nombre: 'Medellín', datos: partMed, color: COLOR.medellin },
            { nombre: 'Colombia', datos: partPais, color: COLOR.colombia }
          ], {
            marcado: a, ancho: ancho, formato: v => pct(v), eje: v => pct(v, 0),
            detalle: (s, i) => (s === 0
              ? ' (' + num(res.cti[i]) + ' de ' + num(res.total[i]) + ')'
              : ' (' + num(res.paisCti[i]) + ' de ' + num(res.paisTotal[i]) + ')')
          })) : null}
          csv={() => ({
            encabezados: ['Año', 'Estudiantes en CTi en Medellín', 'Matrícula de Medellín',
              'Participación en Medellín (%)', 'Estudiantes en CTi en Colombia',
              'Matrícula de Colombia', 'Participación en Colombia (%)'],
            filas: ANIOS.map((x, i) => [x, res.cti[i], res.total[i], redondo(partMed[i]),
              res.paisCti[i], res.paisTotal[i], redondo(partPais[i])])
          })}
          alSeleccionar={clicAnio}
          archivo={nombreArchivo([arch, 'participacion-cti'])} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Participación de las mujeres en CTi por año" altoPx={ALTO}
          periodo={lineaSerie}
          opcion={conSerie ? (ancho => lineas(anios, [
            { nombre: 'Medellín', datos: mujMed, color: COLOR.medellin },
            { nombre: 'Colombia', datos: mujPais, color: COLOR.colombia }
          ], {
            marcado: a, ancho: ancho, formato: v => pct(v), eje: v => pct(v, 0),
            detalle: (s, i) => (s === 0
              ? ' (' + num(res.mujeres[i]) + ' de ' + num(res.cti[i]) + ')'
              : ' (' + num(res.paisMujeres[i]) + ' de ' + num(res.paisCti[i]) + ')')
          })) : null}
          csv={() => ({
            encabezados: ['Año', 'Mujeres en CTi en Medellín', 'Estudiantes en CTi en Medellín',
              'Participación en Medellín (%)', 'Mujeres en CTi en Colombia',
              'Estudiantes en CTi en Colombia', 'Participación en Colombia (%)'],
            filas: ANIOS.map((x, i) => [x, res.mujeres[i], res.cti[i], redondo(mujMed[i]),
              res.paisMujeres[i], res.paisCti[i], redondo(mujPais[i])])
          })}
          alSeleccionar={clicAnio}
          archivo={nombreArchivo([arch, 'mujeres-por-anio'])} />

        <FichaGrafico titulo="Peso de Medellín en el país por nivel de formación" altoPx={ALTO}
          periodo={lineaAnio}
          opcion={hayAnio ? (ancho => barrasPct(pesoNivel.map(d => d.nombre),
            pesoNivel.map(d => d.tasa), i => pct(pesoNivel[i].tasa) + ' de la matrícula del país en CTi<br/>' +
              num(pesoNivel[i].n) + ' de ' + num(pesoNivel[i].pais) + ' estudiantes',
            opcionesBarras(ancho, { color: COLOR.nivel, max: null }))) : null}
          vacio={sinAnio}
          csv={() => ({
            encabezados: ['Nivel de formación', 'Estudiantes en Medellín', 'Estudiantes en Colombia',
              'Peso de Medellín (%)'],
            filas: pesoNivel.map(d => [d.nombre, d.n, d.pais, redondo(d.tasa)])
          })}
          alSeleccionar={p => sel('nivel', pesoNivel[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'peso-por-nivel'])} />
      </Fila>
    </Fragment>
  );
}

/** Matrícula en CTi por área de conocimiento. */
function AreasConocimiento({ res, arch, sel, filtros }) {
  const a = res.anio;
  const anio = nombreAnio(a);
  const inicio = nombreAnio(PRIMERO);
  const lineaAnio = 'Medellín, ' + anio;
  const lineaPar = 'Medellín, ' + inicio + ' y ' + anio;

  /* Distribución del año elegido por área. */
  const porArea = useMemo(() => agrupar(res.filasAnio, f => f.area, nombreArea), [res]);
  const porAreaInicio = useMemo(() => {
    const m = new Map();
    agrupar(res.filas.filter(f => f.anio === PRIMERO), f => f.area, nombreArea)
      .forEach(d => m.set(d.k, d));
    return m;
  }, [res]);
  /* Variación de cada área entre el primer año de la serie y el elegido. */
  const varArea = useMemo(() => {
    if (a === PRIMERO) return [];
    const m = new Map(porArea.map(d => [d.k, d]));
    const claves = Array.from(new Set(porArea.map(d => d.k).concat(Array.from(porAreaInicio.keys()))));
    return claves
      .map(k => {
        const n0 = porAreaInicio.has(k) ? porAreaInicio.get(k).n : 0;
        const n1 = m.has(k) ? m.get(k).n : 0;
        return { k: k, nombre: nombreArea(k), n0: n0, n1: n1, v: variacion(n1, n0) };
      })
      .filter(d => !vacio(d.v))
      .sort((x, y) => y.v - x.v);
  }, [porArea, porAreaInicio, a]);

  /* Peso de Medellín en la matrícula del país por área. */
  /* Peso de Medellín en la matrícula del país, por área y por nivel. */
  const pesoArea = useMemo(() => {
    const pais = paisPor(filtros, a, 'area');
    return porArea.map(d => Object.assign({}, d, {
      pais: pais.get(d.k) || 0, tasa: parte(d.n, pais.get(d.k)) || 0
    })).sort((x, y) => y.tasa - x.tasa);
  }, [porArea, filtros, a]);
  /* Participación de las mujeres por área, en el primer año y en el elegido. */
  const mujArea = useMemo(() => porArea.map(d => {
    const d0 = porAreaInicio.get(d.k);
    return {
      k: d.k, nombre: d.nombre, n: d.n, mujeres: d.mujeres, t1: parte(d.mujeres, d.n),
      n0: d0 ? d0.n : 0, mujeres0: d0 ? d0.mujeres : 0, t0: d0 ? parte(d0.mujeres, d0.n) : null
    };
  }).sort((x, y) => y.t1 - x.t1), [porArea, porAreaInicio]);

  /* Cuadro de áreas por año. */
  const tablaAreas = useMemo(() => {
    const m = new Map();
    res.filas.forEach(f => {
      let e = m.get(f.area);
      if (!e) {
        e = { k: f.area, area: nombreArea(f.area) };
        ANIOS.forEach((x, i) => { e['a' + i] = 0; });
        m.set(f.area, e);
      }
      e['a' + f.anio] += f.n;
    });
    return Array.from(m.values()).map(e => Object.assign(e, {
      variacion: variacion(e['a' + a], e['a' + PRIMERO])
    }));
  }, [res]);
  const columnasAreas = [{ clave: 'area', rotulo: 'Área de conocimiento', tipo: 'texto', ancho: 1 }]
    .concat(ANIOS.map((x, i) => ({ clave: 'a' + i, rotulo: String(x), tipo: 'num', total: 'suma' })))
    .concat(a === PRIMERO ? [] : [{
      clave: 'variacion', rotulo: 'Variación ' + inicio + ' a ' + anio, tipo: 'pct'
    }]);

  const hayAnio = res.filasAnio.length > 0;
  const sinAnio = 'Sin estudiantes en ' + anio + ' para la selección activa.';

  return (
    <Fragment>
      <Fila cols={DOS}>
        <FichaGrafico titulo="Estudiantes en CTi por área" altoPx={ALTO} periodo={lineaAnio}
          opcion={hayAnio ? barras(porArea, res.cti[a], COLOR.area) : null} vacio={sinAnio}
          csv={csvDe(porArea, 'Área de conocimiento', res.cti[a])}
          alSeleccionar={p => sel('area', porArea[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'estudiantes-por-area'])} />

        <FichaGrafico titulo={a === PRIMERO ? 'Variación por área'
          : 'Variación por área entre ' + inicio + ' y ' + anio}
          altoPx={ALTO} periodo={lineaPar}
          opcion={varArea.length ? (ancho => barrasVariacion(varArea.map(d => d.nombre),
            varArea.map(d => d.v), opcionesBarras(ancho, {
              color: COLOR.variacion, anchoGrafico: ancho,
              detalle: i => '<br/>' + num(varArea[i].n0) + ' estudiantes en ' + inicio +
                ' y ' + num(varArea[i].n1) + ' en ' + anio
            }))) : null}
          vacio={a === PRIMERO
            ? 'Elija un año posterior a ' + inicio + ' para comparar con el inicio de la serie.'
            : sinAnio}
          csv={() => ({
            encabezados: ['Área de conocimiento', 'Estudiantes ' + inicio, 'Estudiantes ' + anio, 'Variación (%)'],
            filas: varArea.map(d => [d.nombre, d.n0, d.n1, redondo(d.v)])
          })}
          alSeleccionar={p => sel('area', varArea[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'variacion-por-area'])} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Participación de las mujeres por área" altoPx={ALTO}
          periodo={a === PRIMERO ? lineaAnio : lineaPar}
          opcion={hayAnio ? (ancho => barrasPares(mujArea.map(d => d.nombre),
            (a === PRIMERO ? [] : [{
              nombre: inicio, datos: mujArea.map(d => d.t0), color: aclararTono(COLOR.mujeres, 0.55)
            }]).concat([{ nombre: anio, datos: mujArea.map(d => d.t1), color: COLOR.mujeres }]),
            opcionesBarras(ancho, {
              max: 100, grosor: 11,
              detalle: (s, i) => {
                const d = mujArea[i];
                const ultima = a === PRIMERO || s === 1;
                return ' (' + num(ultima ? d.mujeres : d.mujeres0) + ' de ' + num(ultima ? d.n : d.n0) + ')';
              }
            }))) : null}
          vacio={sinAnio}
          csv={() => ({
            encabezados: ['Área de conocimiento'].concat(a === PRIMERO ? [] : [
              'Mujeres ' + inicio, 'Estudiantes ' + inicio, 'Participación ' + inicio + ' (%)'
            ]).concat(['Mujeres ' + anio, 'Estudiantes ' + anio, 'Participación ' + anio + ' (%)']),
            filas: mujArea.map(d => [d.nombre].concat(a === PRIMERO ? [] : [d.mujeres0, d.n0, redondo(d.t0)])
              .concat([d.mujeres, d.n, redondo(d.t1)]))
          })}
          alSeleccionar={p => sel('area', mujArea[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'mujeres-por-area'])} />

        <FichaGrafico titulo="Peso de Medellín en el país por área" altoPx={ALTO}
          periodo={lineaAnio}
          opcion={hayAnio ? (ancho => barrasPct(pesoArea.map(d => d.nombre),
            pesoArea.map(d => d.tasa), i => pct(pesoArea[i].tasa) + ' de la matrícula del país en el área<br/>' +
              num(pesoArea[i].n) + ' de ' + num(pesoArea[i].pais) + ' estudiantes',
            opcionesBarras(ancho, { color: COLOR.peso, max: null }))) : null}
          vacio={sinAnio}
          csv={() => ({
            encabezados: ['Área de conocimiento', 'Estudiantes en Medellín', 'Estudiantes en Colombia',
              'Peso de Medellín (%)'],
            filas: pesoArea.map(d => [d.nombre, d.n, d.pais, redondo(d.tasa)])
          })}
          alSeleccionar={p => sel('area', pesoArea[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'peso-por-area'])} />
      </Fila>

      <Fila cols={UNA}>
        <Ficha titulo="Estudiantes en CTi por área y año"
          accion={<Descargas csv={csvTabla(columnasAreas, tablaAreas)}
            nombre={nombreArchivo([arch, 'estudiantes-por-area-y-anio'])} />}>
          <Tabla key={'areas-' + a} columnas={columnasAreas} filas={tablaAreas} orden={'a' + a}
            alSeleccionar={f => sel('area', f.k)} seleccion={filtros.area}
            rotuloTotal="Total CTi" />
        </Ficha>
      </Fila>
    </Fragment>
  );
}

/** Matrícula en CTi por institución, sector, modalidad y programa. */
function InstitucionesProgramas({ res, arch, sel, filtros }) {
  const a = res.anio;
  const anio = nombreAnio(a);
  const lineaAnio = 'Medellín, ' + anio;

  /* Distribuciones del año elegido. */
  const porIes = useMemo(() => agrupar(res.filasAnio, f => f.ies, nombreIes), [res]);
  const porSector = useMemo(() =>
    agrupar(res.filasAnio, f => f.sector, nombreSector).sort((x, y) => x.k - y.k), [res]);
  const porModalidad = useMemo(() =>
    agrupar(res.filasAnio, f => f.modalidad, nombreModalidad).sort((x, y) => x.k - y.k), [res]);
  /* Detalle por programa: área, nivel y modalidad del año elegido o, si el
     programa no tuvo estudiantes ese año, del más reciente. */
  const tablaProgramas = useMemo(() => {
    const m = new Map();
    res.filas.forEach(f => {
      let e = m.get(f.prog);
      if (!e) {
        const p = DIM.programa[f.prog];
        e = { k: f.prog, programa: p.nombre, codigo: String(p.codigo), ies: nombreIes(p.ies), ref: -1 };
        ANIOS.forEach((x, i) => { e['a' + i] = 0; });
        m.set(f.prog, e);
      }
      e['a' + f.anio] += f.n;
      const prioridad = f.anio === a ? ANIOS.length : f.anio;
      if (prioridad > e.ref) {
        e.ref = prioridad;
        e.area = nombreArea(f.area);
        e.nivel = nombreNivel(f.nivel);
        e.modalidad = nombreModalidad(f.modalidad);
      }
    });
    return Array.from(m.values());
  }, [res]);
  /* El código SNIES va en la descarga; en pantalla, las columnas de
     categoría con nombres largos ocupan el doble y los años caben sin
     recorrer la tabla. */
  const columnasProgramas = [
    { clave: 'programa', rotulo: 'Programa', tipo: 'texto', ancho: 1 },
    { clave: 'ies', rotulo: 'Institución', tipo: 'texto', ancho: 1 },
    { clave: 'area', rotulo: 'Área de conocimiento', tipo: 'texto', ancho: 1 },
    { clave: 'nivel', rotulo: 'Nivel de formación', tipo: 'texto', ancho: 1 },
    { clave: 'modalidad', rotulo: 'Modalidad', tipo: 'texto' }
  ].concat(ANIOS.map((x, i) => ({ clave: 'a' + i, rotulo: String(x), tipo: 'num', total: 'suma' })));
  const columnasDescarga = columnasProgramas.slice(0, 1)
    .concat([{ clave: 'codigo', rotulo: 'Código SNIES', tipo: 'texto' }])
    .concat(columnasProgramas.slice(1));

  const hayAnio = res.filasAnio.length > 0;
  const sinAnio = 'Sin estudiantes en ' + anio + ' para la selección activa.';

  return (
    <Fragment>
      <Fila cols={DOS}>
        <FichaGrafico titulo="Estudiantes en CTi por sector" altoPx={ALTO} periodo={lineaAnio}
          opcion={hayAnio ? anillo(porSector.map(d => ({ name: d.nombre, value: d.n })), {
            colores: porSector.map(d => COLORES_SECTOR[d.k % COLORES_SECTOR.length]),
            unidad: 'estudiantes', rotuloCentro: 'estudiantes'
          }) : null}
          vacio={sinAnio}
          csv={csvDe(porSector, 'Sector de la institución', res.cti[a])}
          alSeleccionar={p => sel('sector', porSector[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'estudiantes-por-sector'])} />

        <FichaGrafico titulo="Estudiantes en CTi por modalidad" altoPx={ALTO} periodo={lineaAnio}
          opcion={hayAnio ? anillo(porModalidad.map(d => ({ name: d.nombre, value: d.n })), {
            colores: porModalidad.map(d => COLORES_MODALIDAD[d.k % COLORES_MODALIDAD.length]),
            unidad: 'estudiantes', rotuloCentro: 'estudiantes'
          }) : null}
          vacio={sinAnio}
          csv={csvDe(porModalidad, 'Modalidad', res.cti[a])}
          alSeleccionar={p => sel('modalidad', porModalidad[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'estudiantes-por-modalidad'])} />
      </Fila>

      <Fila cols={UNA}>
        <FichaGrafico titulo="Instituciones con más estudiantes en CTi" altoPx={ALTO}
          periodo={lineaAnio}
          opcion={hayAnio ? barras(porIes, res.cti[a], COLOR.institucion) : null}
          vacio={sinAnio}
          csv={csvDe(porIes, 'Institución', res.cti[a])}
          alSeleccionar={p => sel('ies', porIes[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'estudiantes-por-institucion'])} />
      </Fila>

      <Fila cols={UNA}>
        <Ficha titulo="Detalle por institución y programa"
          accion={<Descargas csv={csvTabla(columnasDescarga, tablaProgramas)}
            nombre={nombreArchivo([arch, 'detalle-programas'])} />}>
          <Tabla key={'programas-' + a} columnas={columnasProgramas} filas={tablaProgramas} altura={640}
            unidad={76}
            orden={'a' + a} alSeleccionar={f => sel('programa', f.k)}
            seleccion={filtros.programa} />
        </Ficha>
      </Fila>
    </Fragment>
  );
}

const SECCIONES = [
  { id: 'panorama', rotulo: 'Panorama general', panel: PanoramaGeneral },
  { id: 'areas', rotulo: 'Áreas de conocimiento', panel: AreasConocimiento },
  { id: 'instituciones', rotulo: 'Instituciones y programas', panel: InstitucionesProgramas }
];

/* =================================================================== */
/*  Barra de filtros                                                    */
/* =================================================================== */

/* Todos los campos que se pueden filtrar, con su rótulo. La barra muestra las
   listas de FILTROS_BARRA; el sector y la modalidad se filtran con un clic
   sobre sus gráficos y quedan como etiquetas debajo de la barra. */
const FILTROS_ORDEN = [
  ['anio', 'Año'], ['area', 'Área de conocimiento'], ['nivel', 'Nivel de formación'],
  ['ies', 'Institución'], ['programa', 'Programa académico'],
  ['sector', 'Sector de la institución'], ['modalidad', 'Modalidad']
];
const FILTROS_BARRA = ['anio', 'area', 'nivel', 'ies', 'programa'];

/* Rótulo de cada opción en los filtros y en las etiquetas de lo aplicado. */
const ROTULOS = {
  anio: nombreAnio,
  area: nombreArea,
  nivel: nombreNivel,
  ies: nombreIes,
  programa: nombrePrograma,
  sector: nombreSector,
  modalidad: nombreModalidad
};

function Filtros({ filtros, cambiar }) {
  const R = ROTULOS;

  const campo = (id, etiqueta) => {
    const d = disponibles(filtros, id, R[id]);
    const ancho = id === 'ies' || id === 'programa';
    const extra = id === 'programa' ? {
      secundario: i => 'SNIES ' + DIM.programa[i].codigo + ' · ' + DIM.ies[DIM.programa[i].ies].nombre,
      resumenVacio: 'Todos los programas'
    } : id === 'anio' ? { unico: true } : {};
    /* El año es de selección única: elegir otro reemplaza al anterior. */
    const alCambiar = id === 'anio'
      ? v => cambiar({ anio: v.length ? [v[v.length - 1]] : filtros.anio })
      : v => cambiar({ [id]: v });
    return (
      <div key={id}>
        <label className="form-label" htmlFor={'sel-' + clave(etiqueta)}>{etiqueta}</label>
        <SelectorMultiple etiqueta={etiqueta} opciones={d.claves} valores={filtros[id]}
          onCambio={alCambiar} rotulo={R[id]}
          conteo={ancho ? undefined : d.conteo} buscador={ancho} ancho={ancho} {...extra} />
      </div>
    );
  };

  const mostrados = FILTROS_ORDEN.filter(f => FILTROS_BARRA.indexOf(f[0]) >= 0);

  return (
    <section className="card card-lg filtros" aria-labelledby="filtros-tit">
      <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <h2 className="card-title mb-0" id="filtros-tit">Filtros</h2>
          <p className="filtros-subtitulo">
            Segmente las visualizaciones con los filtros disponibles o con un clic sobre
            los gráficos.
          </p>
        </div>
      </div>
      <div className="card-body" id="filtros-cuerpo">
        <div className="filtros-filas">
          <div className="filtros-rejilla" style={{ '--cols': mostrados.length }}>
            {mostrados.map(f => campo(f[0], f[1]))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Fichas con los filtros activos; cada una se retira con un clic. El año
    solo aparece cuando difiere del que abre el tablero, porque su lista ya lo
    muestra. */
function FichasActivas({ filtros, cambiar, limpiar }) {
  const fichas = [];
  FILTROS_ORDEN.forEach(f => {
    const c = f[0];
    if (c === 'anio') {
      if (filtros.anio[0] !== ULTIMO) {
        fichas.push({
          etiqueta: f[1], texto: nombreAnio(filtros.anio[0]),
          quitar: () => cambiar({ anio: [ULTIMO] })
        });
      }
      return;
    }
    filtros[c].forEach(v => fichas.push({
      etiqueta: f[1], texto: c === 'ies' ? DIM.ies[v].corto : ROTULOS[c](v),
      quitar: () => cambiar({ [c]: filtros[c].filter(x => x !== v) })
    }));
  });

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

/** Comparación con el año anterior, para el pie de la primera tarjeta. */
function frenteAnterior(res) {
  const a = res.anio;
  if (a === PRIMERO) return 'Primer año de la serie';
  const v = variacion(res.cti[a], res.cti[a - 1]);
  if (vacio(v)) return 'Sin estudiantes en ' + ANIOS[a - 1];
  if (Math.abs(v) < 0.05) return 'Igual que en ' + ANIOS[a - 1];
  return pct(Math.abs(v)) + (v > 0 ? ' más' : ' menos') + ' que en ' + ANIOS[a - 1];
}

function App() {
  const [tab, setTab] = useState(0);
  const refsTab = useRef([]);
  const [filtros, setFiltros] = useState(FILTROS_BASE);
  const res = useMemo(() => resumir(filtros), [filtros]);
  const sec = SECCIONES[tab];

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

  /* Un clic sobre un punto de la serie elige ese año. */
  const selAnio = i => {
    if (i === undefined || i === null || i < 0 || i >= ANIOS.length) return;
    setFiltros(f => Object.assign({}, f, { anio: [i] }));
  };

  const a = res.anio;
  const anio = nombreAnio(a);
  EXPORTAR.periodo = 'Medellín, ' + anio;
  const arch = 'cti-' + anio;

  /* Las flechas izquierda y derecha recorren los botones de sección. */
  const teclas = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (i + (e.key === 'ArrowRight' ? 1 : SECCIONES.length - 1)) % SECCIONES.length;
    setTab(n);
    if (refsTab.current[n]) refsTab.current[n].focus();
  };

  const cti = res.cti[a];
  const Panel = sec.panel;

  return (
    <Fragment>
      <div className="body container-fluid p-4 p-xl-8">
        <h2 className="visually-hidden">{sec.rotulo}</h2>

        {/* Botones de sección, los mismos del tablero de convocatorias. */}
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

        <Filtros filtros={filtros} cambiar={cambiar} />

        <FichasActivas filtros={filtros} cambiar={cambiar} limpiar={limpiar} />

        {res.filas.length === 0 ? (
          <div className="alert alert-info" role="status">
            La combinación de filtros no deja registros. Use «Borrar todos» para
            volver a ver datos.
          </div>
        ) : (
          <Fragment>
            <section className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 row-cols-xxl-6 g-4 mb-5"
              aria-label="Indicadores de la selección">
              <div className="col">
                <Kpi icono="science" familia="secondary" etiqueta="Estudiantes en CTi"
                  valor={num(cti)} pie={frenteAnterior(res)} />
              </div>
              <div className="col">
                <Kpi icono="pie_chart" familia="info" etiqueta="Participación en la matrícula"
                  valor={pct(parte(cti, res.total[a]))}
                  pie={'Colombia: ' + pct(parte(res.paisCti[a], res.paisTotal[a]))} />
              </div>
              <div className="col">
                <Kpi icono="menu_book" familia="primary" etiqueta="Programas de CTi"
                  valor={num(res.programas[a])}
                  pie={pct(parte(res.programas[a], res.programasTotal[a])) + ' de los programas'} />
              </div>
              <div className="col">
                <Kpi icono="public" familia="tertiary-pink" etiqueta="Peso de Medellín en el país"
                  valor={pct(parte(cti, res.paisCti[a]))}
                  pie={num(res.paisCti[a]) + ' estudiantes en Colombia'} />
              </div>
              <div className="col">
                <Kpi icono="female" familia="success" etiqueta="Mujeres"
                  valor={pct(parte(res.mujeres[a], cti))}
                  pie={num(res.mujeres[a]) + ' estudiantes'} />
              </div>
              <div className="col">
                <Kpi icono="account_balance" familia="warning" etiqueta="Instituciones oficiales"
                  valor={pct(parte(res.oficial[a], cti))}
                  pie={num(res.oficial[a]) + ' estudiantes'} />
              </div>
            </section>

            <div id={'panel-' + sec.id} role="tabpanel" aria-labelledby={'tab-' + sec.id}>
              <Panel key={sec.id} res={res} arch={arch} sel={sel} selAnio={selAnio}
                filtros={filtros} />
            </div>
          </Fragment>
        )}
      </div>
    </Fragment>
  );
}

export default App;
