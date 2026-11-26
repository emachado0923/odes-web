// @ts-nocheck -- código del tablero estático, traído casi sin cambios (ver abajo).
/* oxlint-disable react-hooks/exhaustive-deps, react/immutability -- código probado del tablero estático:
   sus listas de dependencias son a propósito y cambiarlas cambiaría cuándo se redibujan los gráficos. */
/* ====================================================================== */
/*  Tablero caracterización inscritos convocatorias                       */
/*  Observatorio de Sapiencia                                             */
/*                                                                        */
/*  Es js/dashboard.jsx de tablero_convocatoria_pregrado (versión del 26  */
/*  de noviembre de 2026) con cambios de integración: React y ECharts se  */
/*  importan (antes eran globales y el JSX se transpilaba en el navegador */
/*  con Babel) y el módulo exporta App en vez de montarse solo. Los datos */
/*  siguen en window.ODES: PaginaConvocatoria.tsx carga datos/*.js        */
/*  (definiciones, convocatoria y comunas, los archivos del ETL, en       */
/*  apps/web/public/tableros/convocatoria-pregrado/datos) ANTES de        */
/*  importar este módulo, porque aquí arriba se calculan constantes con   */
/*  ellos y se registra el mapa. A diferencia de los demás tableros, no   */
/*  lleva la ruta de navegación (migas de pan): así lo pidió el área.     */
/* ====================================================================== */

import * as echarts from 'echarts';
import { Children, Fragment, useEffect, useMemo, useRef, useState } from 'react';


const C = window.ODES.convocatoria;
const DEF = window.ODES.definiciones;
const DIM = C.dim;
const GEO = window.ODES.comunas;

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

/* Barras apiladas al 100 %: los mismos márgenes y rótulos y, dentro de cada
   segmento, el porcentaje solo cuando cabe. */
const opcionesApiladas = (ancho, extra) => Object.assign({
  ancho: columnaNombres(ancho), derecha: margenDerecho(ancho),
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
   se reconoce por su color antes de leer el título. Las tarjetas vecinas
   quedan con colores distintos. */
/* Magenta de Sapiencia: asteriscos de los totales que llevan nota. */
const MAGENTA = '#921C8D';

const COLOR = {
  institucion: BASE,
  programa: MORADO,
  nivel: AZUL,
  modalidad: NARANJA,
  comuna: MORADO,
  estrato: NARANJA,
  edad: AZUL,
  medio: VERDE,
  completo: AZUL,
  territorio: VERDE,
  postulados: BASE,
  sisben: MORADO,
  enfoque: NARANJA,
  colegio: BASE,
  grado: VERDE,
  icfes: AZUL,
  titulo: MORADO,
  semestre: NARANJA
};

/* Escala de un solo tono para magnitudes: los tonos 80, 70, 60, 50, 40 y 20
   de la familia secondary del kit. Se saltan los tonos que quedan demasiado
   cerca entre sí, de modo que cada paso se distingue del siguiente. */
const ESCALA = ['#A9B9C3', '#7F98A7', '#57788B', '#315870', '#0B3A56', '#062130'];

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


function aclarar(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const m = (c, k) => Math.round(c + (255 - c) * k);
  return '#' + [m(n >> 16 & 255, t), m(n >> 8 & 255, t), m(n & 255, t)]
    .map(v => ('0' + v.toString(16)).slice(-2)).join('');
}

/* =================================================================== */
/*  Preparación de los datos                                            */
/* =================================================================== */

/* Índices de las categorías que usan los cálculos. */
const I_COMPLETO = DIM.estado.indexOf('Completo');
const I_INCOMPLETO = DIM.estado.indexOf('Incompleto');
const FUENTES_PP = ['Solo presupuesto participativo', 'Ambas fuentes'].map(f => DIM.fuente.indexOf(f));
const FUENTES_RO = ['Ambas fuentes', 'Solo recursos ordinarios'].map(f => DIM.fuente.indexOf(f));
const TITULOS_SIN_DATO = 8;
const I_MUJER = DIM.sexo.indexOf('Mujer');
const ESTRATOS_BAJOS = ['Estrato 1', 'Estrato 2', 'Estrato 3'].map(e => DIM.estrato.indexOf(e));
const SIN_PROG = DIM.programa.findIndex(p => !p.codigo);
const COD_OTROS = '00';

/* Cada fila de datos/convocatoria.js trae los índices en el orden de
   C.meta.columnas. Los atributos del programa y de la comuna se leen de sus
   diccionarios. */
const FILAS = C.filas.map(f => {
  const p = DIM.programa[f[7]];
  return {
    periodo: f[0], estado: f[1], fuente: f[2],
    pp: FUENTES_PP.indexOf(f[2]) >= 0, ro: FUENTES_RO.indexOf(f[2]) >= 0,
    sexo: f[3], edad: f[4], estrato: f[5], comuna: f[6], zona: DIM.comuna[f[6]].zona,
    prog: f[7], ies: p.ies, nivel: p.nivel, modalidad: p.modalidad,
    sector: DIM.ies[p.ies].sector,
    semestre: f[8], medio: f[9], dia: f[10], colegio: f[11], ubicacion: f[12],
    grado: f[13], titulos: f[14], ins: f[15]
  };
});

const nombrePrograma = i => DIM.programa[i].nombre;
const nombreIes = i => DIM.ies[i].nombre;
const nombreComuna = i => DIM.comuna[i].nombre;
const nombrePeriodo = i => DIM.periodo[i].nombre;
const conPrograma = f => f.prog !== SIN_PROG;
/* Quienes registraron la información de formación previa: los demás no
   tienen año de graduación, colegio ni títulos. */
const I_GRADO_SIN = DIM.grado.indexOf('Sin información');
const I_EDAD_SIN = DIM.edad.indexOf('Sin información');
const conFormacion = f => f.grado !== I_GRADO_SIN;

/* Porcentajes a una cifra de una distribución. Si los valores suman el total,
   se reparten por el método del mayor residuo para que sumen 100,0 %, como en
   el carrusel y la infografía de la convocatoria; si no, cada uno se calcula
   por separado. */
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

function opcionesDe(campo, lista) {
  const suma = new Map();
  (lista || FILAS).forEach(f => suma.set(f[campo], (suma.get(f[campo]) || 0) + f.ins));
  return Array.from(suma.keys()).sort((a, b) => suma.get(b) - suma.get(a));
}

/* Categorías con orden propio (rangos, grupos y escalas): se presentan en
   ese orden y no por tamaño. */
const enOrden = lista => lista.slice().sort((a, b) => a.k - b.k);

const SECTORES = Array.from(new Set(DIM.ies.map(i => i.sector))).sort();

/* La convocatoria más reciente queda elegida al abrir el tablero. */
const ULTIMA = DIM.periodo.length - 1;

/* Lo que la imagen descargada toma de la selección vigente: la línea con la
   convocatoria. App la actualiza en cada cambio de filtros. */
const EXPORTAR = { periodo: '' };

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Rótulo corto de un día de inscripción (29 oct) y su forma larga. */
const diaCorto = i => {
  const t = DIM.dia[i];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const p = t.split('-');
  return Number(p[2]) + ' ' + MESES[Number(p[1]) - 1].slice(0, 3);
};
const diaLargo = i => {
  const t = DIM.dia[i];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const p = t.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return SEMANA[d.getUTCDay()] + ' ' + p[2] + ' de ' + MESES[p[1] - 1] + ' de ' + p[0];
};

const listaY = l => (l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1]);

/* =================================================================== */
/*  Filtros                                                             */
/* =================================================================== */

const FILTROS_BASE = {
  periodo: [ULTIMA], ies: [], programa: [], fuente: [], estado: [],
  sexo: [], edad: [], estrato: [], comuna: [], zona: [], sector: [], nivel: [],
  modalidad: [], semestre: [], medio: [], colegio: [], ubicacion: [], grado: []
};

const CAMPOS_MULTIPLES = Object.keys(FILTROS_BASE);

/* Filtros cuyas opciones siguen el orden del diccionario y no el alfabético. */
const ORDINALES = ['periodo', 'fuente', 'estado', 'edad', 'estrato', 'zona',
  'semestre', 'ubicacion', 'grado'];

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
 * Las listas se presentan en orden alfabético por el rótulo que se muestra,
 * salvo las que tienen un orden propio.
 */
function disponibles(filtros, campo, rotulo) {
  const filas = aplicar(filtros, campo);
  const suma = new Map();
  filas.forEach(f => {
    const k = f[campoFila(campo)];
    suma.set(k, (suma.get(k) || 0) + f.ins);
  });
  const claves = Array.from(suma.keys());
  if (ORDINALES.indexOf(campo) >= 0) {
    claves.sort((a, b) => a - b);
  } else if (rotulo) {
    claves.sort((a, b) =>
      String(rotulo(a)).localeCompare(String(rotulo(b)), 'es', { numeric: true }));
  } else {
    claves.sort((a, b) => suma.get(b) - suma.get(a));
  }
  /* Lo ya seleccionado permanece en la lista aunque otro filtro lo deje sin
     inscritos, para que se pueda desmarcar. */
  (filtros[campo] || []).forEach(k => {
    if (claves.indexOf(k) < 0) claves.push(k);
  });
  return { claves: claves, conteo: k => suma.get(k) || 0 };
}

function resumir(filas) {
  const ies = new Set(), prog = new Set();
  const r = { ins: 0, comp: 0, postPP: 0, postRO: 0, fem: 0, bajos: 0, conProg: 0 };
  filas.forEach(f => {
    r.ins += f.ins;
    if (f.estado === I_COMPLETO) r.comp += f.ins;
    if (f.pp) r.postPP += f.ins;
    if (f.ro) r.postRO += f.ins;
    if (f.sexo === I_MUJER) r.fem += f.ins;
    if (ESTRATOS_BAJOS.indexOf(f.estrato) >= 0) r.bajos += f.ins;
    if (conPrograma(f)) {
      r.conProg += f.ins;
      prog.add(f.prog);
      ies.add(f.ies);
    }
  });
  r.ies = ies.size;
  r.prog = prog.size;
  return r;
}

function agrupar(filas, llave, nombre) {
  const mapa = new Map();
  filas.forEach(f => {
    const k = llave(f);
    if (k === undefined || k === null) return;
    let e = mapa.get(k);
    if (!e) {
      e = { k: k, nombre: nombre(k), ins: 0, comp: 0, fem: 0, bajos: 0,
            postPP: 0, postRO: 0, prog: new Set(), ies: new Set() };
      mapa.set(k, e);
    }
    e.ins += f.ins;
    if (f.estado === I_COMPLETO) e.comp += f.ins;
    if (f.sexo === I_MUJER) e.fem += f.ins;
    if (ESTRATOS_BAJOS.indexOf(f.estrato) >= 0) e.bajos += f.ins;
    if (f.pp) e.postPP += f.ins;
    if (f.ro) e.postRO += f.ins;
    if (conPrograma(f)) {
      e.prog.add(f.prog);
      e.ies.add(f.ies);
    }
  });
  return Array.from(mapa.values())
    .map(e => Object.assign({}, e, { prog: e.prog.size, ies: e.ies.size }))
    .sort((a, b) => b.ins - a.ins);
}

function cruzar(filas, filaK, colK) {
  const mapa = new Map();
  filas.forEach(f => {
    const k = filaK(f) + '|' + colK(f);
    mapa.set(k, (mapa.get(k) || 0) + f.ins);
  });
  return mapa;
}

/* =================================================================== */
/*  Perfil protegido                                                    */
/* =================================================================== */

/* Las características protegidas (Sisbén, víctimas, grupo étnico,
   discapacidad y prueba Saber 11) llegan aparte, agregadas por los campos de
   P.campos (convocatoria, fuente de financiación, estado del formulario, sexo
   y grupo de edad). Solo responden a esos filtros, y los grupos de menos de
   P.reserva inscritos llegan como reservados (categoría -1). */
const P = C.perfil;
const FILAS_PERFIL = P.filas.map(f => {
  const fila = { variable: f[5], cat: f[6], n: f[7] };
  P.campos.forEach((c, i) => { fila[c] = f[i]; });
  return fila;
});
const VARIABLE = {};
P.variables.forEach((v, i) => { VARIABLE[v.clave] = i; });

/** Filtros activos que el perfil protegido no admite. */
const fueraDePerfil = filtros =>
  CAMPOS_MULTIPLES.filter(c => P.campos.indexOf(c) < 0 && filtros[c].length);

/** Distribución de una característica protegida en la selección. */
function perfilDe(filtros, clave) {
  const v = VARIABLE[clave];
  const cats = P.variables[v].categorias.map((nombre, k) => ({ k: k, nombre: nombre, n: 0 }));
  let reservados = 0;
  FILAS_PERFIL.forEach(f => {
    if (f.variable !== v) return;
    for (let i = 0; i < P.campos.length; i++) {
      const sel = filtros[P.campos[i]];
      if (sel.length && sel.indexOf(f[P.campos[i]]) < 0) return;
    }
    if (f.cat < 0) reservados += f.n;
    else cats[f.cat].n += f.n;
  });
  const base = cats.reduce((s, c) => s + c.n, 0);
  return { cats: cats, base: base, reservados: reservados };
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

function descargarPng(ec, nombreSalida, titulo, nota) {
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
    c.fillText(EXPORTAR.periodo, margen, 75 * pr);

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

function Descargas({ csv, instancia, titulo, nota }) {
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
            if (ec) descargarPng(ec, 'grafico_odes', titulo, nota);
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
  alSeleccionar, vacio, nota }) {
  const instancia = useRef(null);
  return (
    <Ficha titulo={titulo} pie={pie} claro marca={!!nota}
      accion={<Descargas csv={csv} instancia={instancia} nombre={archivo}
        titulo={titulo} nota={nota} />}>
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
  rotuloTotal }) {
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
          style={{ tableLayout: 'fixed', minWidth: suma * 92 }}>
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
    '</b><br/>' + num(p.value) + ' ' + (o.unidad || 'inscritos') +
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
    '<b>' + p.name + '</b><br/>' + num(p.value) + ' ' + (o.unidad || 'inscritos');
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
  const derecha = o.derecha !== undefined ? o.derecha : 60;
  op.grid = {
    left: anchoCol, right: derecha, top: Math.max(34, Math.round(letra * 2.6)), bottom: 8,
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
      overflow: 'break', lineHeight: Math.round(letra * 1.2)
    }
  };
  /* El porcentaje va dentro del segmento solo si cabe con holgura: con el
     ancho del gráfico se mide en píxeles; sin él, desde el 11 %. */
  const anchoTrazo = o.anchoGrafico ? o.anchoGrafico - anchoCol - derecha : 0;
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
    itemStyle: { color: s.color || SERIES[k % SERIES.length], borderColor: '#fff', borderWidth: 2, borderRadius: 9 },
    label: {
      show: true, fontSize: letra, fontFamily: TIPO, color: '#fff', fontWeight: 500,
      formatter: p => (cabe(p.value) ? pct(p.value) : '')
    }
  }));
  return op;
}

/** Anillo con el total en el centro. */
function anillo(datos, opciones) {
  const o = Object.assign({}, opciones);
  const total = datos.reduce((s, d) => s + d.value, 0);
  const op = base();
  op.tooltip.formatter = p =>
    '<b>' + p.name + '</b><br/>' + num(p.value) + ' ' + (o.unidad || 'inscritos') + '<br/>' +
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
      text: o.rotuloCentro || 'inscritos', fontSize: TAM, fill: GRIS,
      fontFamily: TIPO, textAlign: 'center'
    }
  }];
  return op;
}

/** Barras de porcentaje: la longitud es la tasa de cada categoría y el
    rótulo, el porcentaje. Sin `max`, la escala llega a 100. */
function barrasPct(categorias, tasas, detalle, opciones) {
  const o = Object.assign({}, opciones);
  const op = barrasH(categorias, tasas, o);
  op.series[0].label.formatter = p => '{v|' + pct(p.value) + '}';
  if (o.max !== null) op.xAxis.max = o.max || 100;
  op.tooltip.formatter = p =>
    '<b>' + categorias[p.dataIndex] + '</b><br/>' + detalle(p.dataIndex);
  return op;
}

/** Columnas apiladas: el alto de cada columna es el total, cada tramo es una
    serie y el total va encima. */
function columnasApiladas(categorias, series, opciones) {
  const o = Object.assign({}, opciones);
  const letra = o.letra || TAM;
  const letraCifra = o.letraCifra || letra;
  const totales = categorias.map((c, i) =>
    series.reduce((s, e) => s + (e.datos[i] || 0), 0));
  const op = base();
  op.legend = Object.assign(leyenda(letra), { data: series.map(s => s.nombre) });
  op.grid = {
    left: 12, right: 12, top: Math.max(58, Math.round(letraCifra * 3.8)), bottom: 8,
    containLabel: true
  };
  op.tooltip.trigger = 'axis';
  op.tooltip.axisPointer = { type: 'shadow', shadowStyle: { color: 'rgba(11,58,86,.05)' } };
  op.tooltip.formatter = ps => {
    if (!ps.length) return '';
    const i = ps[0].dataIndex;
    return '<b>' + (o.titulos ? o.titulos[i] : categorias[i]) + '</b><br/>' +
      ps.map(p => p.marker + ' ' + p.seriesName + ': ' +
        num(series[p.seriesIndex].datos[i]) + '  (' +
        pct(parte(series[p.seriesIndex].datos[i], totales[i])) + ')').join('<br/>') +
      '<br/>Total: ' + num(totales[i]) + ' ' + (o.unidad || 'inscritos');
  };
  op.xAxis = {
    type: 'category', data: categorias,
    axisLine: { lineStyle: { color: LINEA } },
    axisTick: { show: false },
    axisLabel: { color: TINTA2, fontSize: letra, hideOverlap: true, margin: 10 }
  };
  op.yAxis = {
    type: 'value',
    axisLine: { show: true, lineStyle: { color: LINEA } },
    axisTick: { show: false },
    axisLabel: { show: false },
    splitLine: { show: false }
  };
  const ultima = series.length - 1;
  op.series = series.map((s, k) => ({
    name: s.nombre,
    type: 'bar',
    stack: 'total',
    barMaxWidth: 34,
    data: s.datos,
    itemStyle: {
      color: SERIES[k % SERIES.length],
      borderRadius: k === ultima ? [4, 4, 0, 0] : 0
    },
    label: k === ultima ? {
      show: true, position: 'top', fontSize: letraCifra, fontFamily: TIPO,
      color: TINTA, fontWeight: 500, formatter: p => num(totales[p.dataIndex])
    } : { show: false }
  }));
  return op;
}

/* El mapa se registra una sola vez con los límites de datos/comunas.js. */
const MAPA = 'medellin';
if (GEO) echarts.registerMap(MAPA, GEO);

/** Clases de un mapa: cinco rangos por quintiles, con los tonos de ESCALA. */
function clasesMapa(valores) {
  const v = valores.filter(x => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  const cortes = [];
  for (let q = 1; q < 5; q++) {
    const c = v[Math.min(v.length - 1, Math.floor((q * v.length) / 5))];
    if (cortes.indexOf(c) < 0 && c > v[0] && c <= v[v.length - 1]) cortes.push(c);
  }
  const limites = [v[0]].concat(cortes).concat([v[v.length - 1] + 1]);
  const clases = [];
  for (let i = 0; i < limites.length - 1; i++) {
    const min = limites[i], max = limites[i + 1] - 1;
    clases.push({
      min: min, max: max,
      label: min === max ? num(min) : num(min) + ' a ' + num(max),
      color: ESCALA[Math.min(ESCALA.length - 2, i + (5 - (limites.length - 1)))]
    });
  }
  return clases;
}

/** Mapa de comunas y corregimientos con los inscritos de cada una. */
function mapa(datos, opciones) {
  const o = Object.assign({}, opciones);
  const op = base();
  const clases = clasesMapa(datos.map(d => d.valor));
  const total = datos.reduce((s, d) => s + d.valor, 0);
  const tono = v => {
    for (let i = 0; i < clases.length; i++) {
      if (v >= clases[i].min && v <= clases[i].max) return i;
    }
    return -1;
  };
  op.tooltip.formatter = p => {
    const d = p.data;
    if (!d) return '';
    return '<b>' + d.nombre + '</b><br/>' + num(d.value) + ' inscritos' +
      (total ? '<br/>' + pct(parte(d.value, total)) + ' de los residentes en Medellín' : '') +
      (o.detalle ? o.detalle(d) : '');
  };
  op.visualMap = {
    type: 'piecewise',
    pieces: [{ min: 0, max: 0, label: 'Sin inscritos', color: '#EFEFEF' }].concat(clases),
    left: 0, bottom: 4, orient: 'vertical',
    itemWidth: 11, itemHeight: 11, itemGap: 6, itemSymbol: 'rect',
    text: null, showLabel: true, selectedMode: false,
    textStyle: { color: TINTA2, fontSize: TAM, fontFamily: TIPO }
  };
  op.series = [{
    type: 'map',
    map: MAPA,
    nameProperty: 'codigo',
    roam: false,
    selectedMode: false,
    aspectScale: 0.994,
    layoutCenter: ['60%', '50%'],
    layoutSize: '98%',
    itemStyle: { areaColor: '#EFEFEF', borderColor: '#ffffff', borderWidth: 1 },
    emphasis: {
      itemStyle: { areaColor: MORADO, borderColor: '#ffffff' },
      label: { show: true, color: '#ffffff' }
    },
    /* Cada zona lleva su número, como en los mapas del Distrito; el nombre y
       las cifras están en el tooltip. */
    label: {
      show: true, fontSize: TAM, fontFamily: TIPO, fontWeight: 500,
      formatter: p => (p.data ? String(Number(p.data.name)) : '')
    },
    labelLayout: { hideOverlap: true },
    data: datos.map(d => ({
      name: d.codigo, value: d.valor, nombre: d.nombre, k: d.k, extra: d.extra,
      label: { color: tono(d.valor) >= 0 && tono(d.valor) + 5 - clases.length >= 2 ? '#ffffff' : TINTA }
    }))
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

/** Fila de tarjetas con la rejilla (row y col) de la plantilla. */
function Fila({ cols, children }) {
  const hijos = Children.toArray(children);
  return (
    <div className="row g-4 mb-4">
      {hijos.map((h, i) => <div key={i} className={cols[i % cols.length]}>{h}</div>)}
    </div>
  );
}


/* Datos de un gráfico de una sola serie para la descarga en CSV. */
const csvDe = (datos, rotulo, total, cierre) => () => {
  const partes = cierre ? participaciones(datos.map(d => d.ins), total) : null;
  return {
    encabezados: [rotulo, 'Inscritos', 'Participación (%)'],
    filas: datos.map((d, i) => [d.nombre, d.ins,
      Number(((partes ? partes[i] : parte(d.ins, total)) || 0).toFixed(1))])
  };
};

/* Barras de una sola serie con la cifra y el porcentaje sobre `total`. */
const barras = (datos, total, color, extra) => ancho => barrasH(
  datos.map(d => d.nombre), datos.map(d => d.ins),
  opcionesBarras(ancho, Object.assign({ total: total, conParte: true, color: color }, extra)));

/* Tasa de un conteo (formularios completos, postulados, mujeres) sobre los
   inscritos de cada grupo. */
const tasas = (datos, campo) =>
  datos.map(d => Object.assign({}, d, { tasa: parte(d[campo], d.ins) || 0 }));

const csvTasa = (datos, rotulo, campo, nombreCampo) => () => ({
  encabezados: [rotulo, 'Inscritos', nombreCampo, nombreCampo + ' (%)'],
  filas: datos.map(d => [d.nombre, d.ins, d[campo], Number(d.tasa.toFixed(1))])
});

const csvTabla = (columnas, tabla) => () => ({
  encabezados: columnas.map(c => c.rotulo),
  filas: tabla.map(f => columnas.map(c =>
    c.tipo === 'pct' ? Number((f[c.clave] || 0).toFixed(1)) : f[c.clave]))
});

/* Los cuadros y gráficos del programa elegido solo cuentan a quienes
   registraron programa, y los de formación previa, a quienes registraron esa
   información, así que su total no coincide con el de inscritos. La nota dice
   cuántos quedan por fuera y en qué estado está su formulario. */
function notaExcluidos(filas, incluido, singular, plural) {
  let n = 0, incompletos = 0;
  filas.forEach(f => {
    if (incluido(f)) return;
    n += f.ins;
    if (f.estado === I_INCOMPLETO) incompletos += f.ins;
  });
  if (!n) return '';
  const quienes = n === 1 ? 'al inscrito que no ' + singular
    : 'a los ' + num(n) + ' inscritos que no ' + plural;
  const estado = incompletos === n
    ? (n === 1 ? ', con el formulario incompleto' : ', todos con el formulario incompleto')
    : incompletos ? ', ' + num(incompletos) + ' de ellos con el formulario incompleto' : '';
  return 'El total no incluye ' + quienes + estado + '.';
}
const notaSinPrograma = filas => notaExcluidos(filas, conPrograma,
  'registró programa', 'registraron programa');
const notaSinFormacion = filas => notaExcluidos(filas, conFormacion,
  'registró la información de formación previa', 'registraron la información de formación previa');

/* La nota va debajo del cuadro, precedida por el asterisco magenta que también
   marca el título de la tarjeta y la fila de total. */
/* La distribución por edad se calcula sobre quienes registraron su edad, como
   en el carrusel y la infografía. */
const edadesValidas = porEdad => {
  const lista = porEdad.filter(d => d.k !== I_EDAD_SIN);
  return { lista: lista, base: lista.reduce((t, d) => t + d.ins, 0) };
};

const NotaTotal = ({ texto }) => (texto
  ? <p className="nota-total"><span className="marca-nota">*</span> {texto}</p>
  : null);

/* Series de una variable cruzada por la fuente de financiación, con el color
   fijo de cada fuente. */
const seriesPorFuente = (filas, llave, claves) => {
  const fuentes = opcionesDe('fuente', filas).sort((a, b) => a - b);
  const m = cruzar(filas, llave, f => f.fuente);
  return fuentes.map(fu => ({
    nombre: DIM.fuente[fu], color: SERIES[fu % SERIES.length],
    datos: claves.map(k => m.get(k + '|' + fu) || 0)
  }));
};

const csvSeries = (rotulo, nombres, series) => () => ({
  encabezados: [rotulo].concat(series.map(s => s.nombre)),
  filas: nombres.map((n, i) => [n].concat(series.map(s => s.datos[i])))
});

/* Aviso de las tarjetas con características protegidas. */
const avisoPerfil = (fuera, d) => (fuera.length
  ? 'Este gráfico no se segmenta por ' +
    listaY(fuera.map(c => rotuloFiltro(c).toLowerCase())) +
    '. Para proteger la reserva estadística, solo responde a los filtros de ' +
    listaY(P.campos.map(c => rotuloFiltro(c).toLowerCase())) + '.'
  : !d.base
    ? 'La selección reúne menos de ' + P.reserva + ' inscritos: la información se reserva.'
    : null);

function PanoramaGeneral({ filas, res, sub, arch, sel }) {
  const porFuente = useMemo(() => agrupar(filas, f => f.fuente, i => DIM.fuente[i]), [filas]);
  const porEdad = useMemo(() =>
    enOrden(agrupar(filas, f => f.edad, i => DIM.edad[i])), [filas]);
  const edades = useMemo(() => edadesValidas(porEdad), [porEdad]);
  const porIes = useMemo(() =>
    agrupar(filas.filter(conPrograma), f => f.ies, nombreIes), [filas]);
  const porComuna = useMemo(() => agrupar(filas, f => f.comuna, nombreComuna), [filas]);
  const porEstrato = useMemo(() =>
    enOrden(agrupar(filas, f => f.estrato, i => DIM.estrato[i])), [filas]);

  return (
    <Fragment>
      <Fila cols={DOS}>
        <FichaGrafico titulo="Fuente de financiación"
          altoPx={ALTO} subtitulo={sub}
          opcion={porFuente.length
            ? anillo(porFuente.map(d => ({ name: d.nombre, value: d.ins })), {
              /* Cada fuente conserva su color aunque los filtros cambien cuál
                 tiene más inscritos. */
              colores: porFuente.map(d => SERIES[d.k % SERIES.length])
            })
            : null}
          csv={csvDe(porFuente, 'Fuente de financiación', res.ins)}
          alSeleccionar={p => sel('fuente', porFuente[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'fuente-de-financiacion'])} />

        <FichaGrafico titulo="Inscritos por grupo de edad"
          altoPx={ALTO} subtitulo={sub}
          opcion={edades.lista.length ? barras(edades.lista, edades.base, COLOR.edad) : null}
          csv={csvDe(edades.lista, 'Grupo de edad', edades.base, true)}
          alSeleccionar={p => sel('edad', edades.lista[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'inscritos-por-edad'])} />
      </Fila>

      <Fila cols={UNA}>
        <FichaGrafico titulo="Inscritos por institución"
          altoPx={ALTO} subtitulo={sub}
          opcion={porIes.length ? barras(porIes, res.conProg, COLOR.institucion) : null}
          csv={csvDe(porIes, 'Institución', res.conProg, true)}
          alSeleccionar={p => sel('ies', porIes[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'inscritos-por-institucion'])} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Inscritos por comuna o corregimiento"
          altoPx={ALTO} subtitulo={sub}
          opcion={porComuna.length ? barras(porComuna, res.ins, COLOR.comuna) : null}
          csv={csvDe(porComuna, 'Comuna o corregimiento', res.ins, true)}
          alSeleccionar={p => sel('comuna', porComuna[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'inscritos-por-comuna'])} />

        <FichaGrafico titulo="Inscritos por estrato"
          altoPx={ALTO} subtitulo={sub}
          opcion={porEstrato.length ? barras(porEstrato, res.ins, COLOR.estrato) : null}
          csv={csvDe(porEstrato, 'Estrato', res.ins, true)}
          alSeleccionar={p => sel('estrato', porEstrato[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'inscritos-por-estrato'])} />
      </Fila>
    </Fragment>
  );
}

function Inscripcion({ filas, res, sub, arch, sel, filtros }) {
  const dias = useMemo(() => opcionesDe('dia', filas).sort((a, b) => a - b), [filas]);
  const estados = useMemo(() => opcionesDe('estado', filas).sort((a, b) => a - b), [filas]);
  const porDia = useMemo(() => cruzar(filas, f => f.dia, f => f.estado), [filas]);
  const seriesDia = estados.map(e => ({
    nombre: DIM.estado[e], color: SERIES[e % SERIES.length],
    datos: dias.map(d => porDia.get(d + '|' + e) || 0)
  }));

  const porMedio = useMemo(() => agrupar(filas, f => f.medio, i => DIM.medio[i]), [filas]);
  const completoMedio = useMemo(() =>
    tasas(porMedio, 'comp').sort((a, b) => b.tasa - a.tasa), [porMedio]);
  const porEstado = useMemo(() => agrupar(filas, f => f.estado, i => DIM.estado[i]), [filas]);
  const edades = useMemo(() => opcionesDe('edad', filas).sort((a, b) => a - b), [filas]);
  const porEdad = useMemo(() => cruzar(filas, f => f.edad, f => f.estado), [filas]);
  const seriesEdad = estados.map(e => ({
    nombre: DIM.estado[e], color: SERIES[e % SERIES.length],
    datos: edades.map(a => porEdad.get(a + '|' + e) || 0)
  }));

  const tabla = useMemo(() => porMedio.map(d => ({
    k: d.k,
    medio: d.nombre,
    ins: d.ins,
    participacion: parte(d.ins, res.ins),
    completo: parte(d.comp, d.ins),
    pp: parte(d.postPP, d.ins),
    mujeres: parte(d.fem, d.ins)
  })), [porMedio, res.ins]);

  const columnas = [
    { clave: 'medio', rotulo: 'Medio por el que se enteró', tipo: 'texto', ancho: 260 },
    { clave: 'ins', rotulo: 'Inscritos', tipo: 'num', total: 'suma' },
    { clave: 'participacion', rotulo: 'Participación', tipo: 'pct' },
    { clave: 'completo', rotulo: 'Formulario completo', tipo: 'pct' },
    { clave: 'pp', rotulo: 'Postulados a presupuesto participativo', tipo: 'pct' },
    { clave: 'mujeres', rotulo: 'Mujeres', tipo: 'pct' }
  ];

  return (
    <Fragment>
      <Fila cols={UNA}>
        <FichaGrafico titulo="Inscritos por día de registro"
          altoPx={ALTO} subtitulo={sub}
          opcion={dias.length ? columnasApiladas(dias.map(diaCorto), seriesDia,
            { titulos: dias.map(diaLargo), letra: TAM_BARRAS, letraCifra: TAM_BARRAS })
            : null}
          csv={() => ({
            encabezados: ['Fecha'].concat(seriesDia.map(s => s.nombre)).concat(['Total']),
            filas: dias.map((d, i) => [DIM.dia[d]].concat(seriesDia.map(s => s.datos[i]))
              .concat([seriesDia.reduce((s, x) => s + x.datos[i], 0)]))
          })}
          archivo={nombreArchivo([arch, 'inscritos-por-dia'])} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Medio por el que se enteró de la convocatoria"
          altoPx={ALTO} subtitulo={sub}
          opcion={porMedio.length ? barras(porMedio, res.ins, COLOR.medio) : null}
          csv={csvDe(porMedio, 'Medio', res.ins, true)}
          alSeleccionar={p => sel('medio', porMedio[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'medio-de-difusion'])} />

        <FichaGrafico titulo="Formulario completo según medio"
          altoPx={ALTO} subtitulo={sub}
          opcion={completoMedio.length ? (ancho => barrasPct(
            completoMedio.map(d => d.nombre), completoMedio.map(d => d.tasa),
            i => pct(completoMedio[i].tasa) + ' completó el formulario<br/>' +
              num(completoMedio[i].comp) + ' de ' + num(completoMedio[i].ins) + ' inscritos',
            opcionesBarras(ancho, { color: COLOR.completo }))) : null}
          csv={csvTasa(completoMedio, 'Medio', 'comp', 'Formulario completo')}
          alSeleccionar={p => sel('medio', completoMedio[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'formulario-completo-por-medio'])} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Estado del formulario"
          altoPx={ALTO} subtitulo={sub}
          opcion={porEstado.length
            ? anillo(porEstado.map(d => ({ name: d.nombre, value: d.ins })), {
              colores: porEstado.map(d => SERIES[d.k % SERIES.length])
            })
            : null}
          csv={csvDe(porEstado, 'Estado del formulario', res.ins)}
          alSeleccionar={p => sel('estado', porEstado[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'estado-del-formulario'])} />

        <FichaGrafico titulo="Estado del formulario según grupo de edad"
          altoPx={ALTO} subtitulo={sub}
          opcion={edades.length
            ? (ancho => apiladas100(edades.map(a => DIM.edad[a]), seriesEdad,
              opcionesApiladas(ancho)))
            : null}
          csv={csvSeries('Grupo de edad', edades.map(a => DIM.edad[a]), seriesEdad)}
          alSeleccionar={p => sel('edad', edades[p.dataIndex])}
          archivo={nombreArchivo([arch, 'formulario-por-edad'])} />
      </Fila>

      <Fila cols={UNA}>
        <Ficha titulo="Detalle por medio de difusión"
          accion={<Descargas csv={csvTabla(columnas, tabla)}
            nombre={nombreArchivo([arch, 'detalle-medios'])} />}>
          <Tabla columnas={columnas} filas={tabla} altura={460} orden="ins"
            alSeleccionar={f => sel('medio', f.k)} seleccion={filtros.medio} />
        </Ficha>
      </Fila>
    </Fragment>
  );
}

function Perfil({ filas, res, sub, arch, sel, filtros }) {
  const porSexo = useMemo(() => agrupar(filas, f => f.sexo, i => DIM.sexo[i]), [filas]);
  const porEdad = useMemo(() =>
    enOrden(agrupar(filas, f => f.edad, i => DIM.edad[i])), [filas]);
  const edades = useMemo(() => edadesValidas(porEdad), [porEdad]);
  const porEstrato = useMemo(() =>
    enOrden(agrupar(filas, f => f.estrato, i => DIM.estrato[i])), [filas]);
  const estratos = porEstrato.map(d => d.k);
  const seriesEstrato = useMemo(() =>
    seriesPorFuente(filas, f => f.estrato, estratos), [filas, estratos.join()]);

  const fuera = fueraDePerfil(filtros);
  const sisben = useMemo(() => perfilDe(filtros, 'sisben'), [filtros]);
  const enfoque = useMemo(() => {
    const lista = ['victima', 'etnico', 'discapacidad'].map(c => {
      const d = perfilDe(filtros, c);
      return { clave: c, nombre: P.variables[VARIABLE[c]].nombre, si: d.cats[0].n,
               base: d.base, tasa: parte(d.cats[0].n, d.base) || 0 };
    });
    return { lista: lista.sort((a, b) => b.tasa - a.tasa), base: lista[0].base };
  }, [filtros]);
  const sisbenCats = sisben.cats.filter(c => c.n > 0);

  const sexos = useMemo(() => opcionesDe('sexo', filas).sort((a, b) => a - b), [filas]);
  const tabla = useMemo(() => porEdad.map(d => {
    const fila = { k: d.k, edad: d.nombre };
    sexos.forEach(s => {
      fila['s' + s] = filas.reduce((t, f) => t + (f.edad === d.k && f.sexo === s ? f.ins : 0), 0);
    });
    fila.total = d.ins;
    fila.completo = parte(d.comp, d.ins);
    fila.bajos = parte(d.bajos, d.ins);
    return fila;
  }), [porEdad, filas, sexos]);

  const columnas = [{ clave: 'edad', rotulo: 'Grupo de edad', tipo: 'texto', ancho: 200 }]
    .concat(sexos.map(s => ({ clave: 's' + s, rotulo: DIM.sexo[s], tipo: 'num', total: 'suma' })))
    .concat([
      { clave: 'total', rotulo: 'Total', tipo: 'num', total: 'suma' },
      { clave: 'completo', rotulo: 'Formulario completo', tipo: 'pct' },
      { clave: 'bajos', rotulo: 'Estratos 1 a 3', tipo: 'pct' }
    ]);

  return (
    <Fragment>
      <Fila cols={DOS}>
        <FichaGrafico titulo="Inscritos por sexo"
          altoPx={ALTO} subtitulo={sub}
          opcion={porSexo.length
            ? anillo(porSexo.map(d => ({ name: d.nombre, value: d.ins })), {
              colores: porSexo.map(d => SERIES[d.k % SERIES.length])
            })
            : null}
          csv={csvDe(porSexo, 'Sexo', res.ins)}
          alSeleccionar={p => sel('sexo', porSexo[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'inscritos-por-sexo'])} />

        <FichaGrafico titulo="Inscritos por grupo de edad"
          altoPx={ALTO} subtitulo={sub}
          opcion={edades.lista.length ? barras(edades.lista, edades.base, COLOR.edad) : null}
          csv={csvDe(edades.lista, 'Grupo de edad', edades.base, true)}
          alSeleccionar={p => sel('edad', edades.lista[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'inscritos-por-edad'])} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Inscritos por estrato"
          altoPx={ALTO} subtitulo={sub}
          opcion={porEstrato.length ? barras(porEstrato, res.ins, COLOR.estrato) : null}
          csv={csvDe(porEstrato, 'Estrato', res.ins, true)}
          alSeleccionar={p => sel('estrato', porEstrato[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'inscritos-por-estrato'])} />

        <FichaGrafico titulo="Grupo de Sisbén"
          altoPx={ALTO} subtitulo={sub}
          vacio={avisoPerfil(fuera, sisben)}
          opcion={avisoPerfil(fuera, sisben) ? null : (ancho => barrasH(
            sisbenCats.map(c => c.nombre), sisbenCats.map(c => c.n), opcionesBarras(ancho,
              { total: sisben.base, conParte: true, color: COLOR.sisben })))}
          csv={() => ({
            encabezados: ['Grupo de Sisbén', 'Inscritos', 'Participación (%)'],
            filas: sisbenCats.map(c => [c.nombre, c.n, Number(parte(c.n, sisben.base).toFixed(1))])
          })}
          archivo={nombreArchivo([arch, 'grupo-de-sisben'])} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Enfoque diferencial"
          altoPx={ALTO} subtitulo={sub}
          vacio={avisoPerfil(fuera, enfoque)}
          opcion={avisoPerfil(fuera, enfoque) ? null : (ancho => barrasPct(
            enfoque.lista.map(d => d.nombre), enfoque.lista.map(d => d.tasa),
            i => pct(enfoque.lista[i].tasa) + ' de los inscritos<br/>' +
              num(enfoque.lista[i].si) + ' de ' + num(enfoque.lista[i].base),
            opcionesBarras(ancho, { color: COLOR.enfoque, max: null })))}
          csv={() => ({
            encabezados: ['Característica', 'Inscritos', 'Base', 'Porcentaje'],
            filas: enfoque.lista.map(d => [d.nombre, d.si, d.base, Number(d.tasa.toFixed(1))])
          })}
          archivo={nombreArchivo([arch, 'enfoque-diferencial'])} />

        <FichaGrafico titulo="Fuente de financiación según estrato"
          altoPx={ALTO} subtitulo={sub}
          opcion={estratos.length
            ? (ancho => apiladas100(estratos.map(e => DIM.estrato[e]), seriesEstrato,
              opcionesApiladas(ancho)))
            : null}
          csv={csvSeries('Estrato', estratos.map(e => DIM.estrato[e]), seriesEstrato)}
          alSeleccionar={p => sel('estrato', estratos[p.dataIndex])}
          archivo={nombreArchivo([arch, 'fuente-por-estrato'])} />
      </Fila>

      <Fila cols={UNA}>
        <Ficha titulo="Detalle por grupo de edad y sexo"
          accion={<Descargas csv={csvTabla(columnas, tabla)}
            nombre={nombreArchivo([arch, 'detalle-edad-sexo'])} />}>
          <Tabla columnas={columnas} filas={tabla} altura={420} orden="total"
            alSeleccionar={f => sel('edad', f.k)} seleccion={filtros.edad} />
        </Ficha>
      </Fila>
    </Fragment>
  );
}

function FormacionPrevia({ filas, res, sub, arch, sel, filtros }) {
  /* Colegio, ubicación, año de graduación y títulos se cuentan sobre quienes
     registraron la información de formación previa, y el semestre, sobre
     quienes registraron programa, como el nivel y la modalidad. */
  const conForm = useMemo(() => filas.filter(conFormacion), [filas]);
  const baseForm = useMemo(() => conForm.reduce((t, f) => t + f.ins, 0), [conForm]);
  const notaForm = useMemo(() => notaSinFormacion(filas), [filas]);
  const porColegio = useMemo(() =>
    agrupar(conForm, f => f.colegio, i => DIM.colegio[i]), [conForm]);
  const porUbicacion = useMemo(() =>
    agrupar(conForm, f => f.ubicacion, i => DIM.ubicacion[i]), [conForm]);
  const porGrado = useMemo(() =>
    enOrden(agrupar(conForm, f => f.grado, i => DIM.grado[i])), [conForm]);
  const porSemestre = useMemo(() =>
    enOrden(agrupar(filas.filter(conPrograma), f => f.semestre, i => DIM.semestre[i])), [filas]);

  const fuera = fueraDePerfil(filtros);
  const icfes = useMemo(() => perfilDe(filtros, 'icfes'), [filtros]);
  const icfesCats = icfes.cats.filter(c => c.n > 0);

  /* Títulos: una persona puede tener más de uno. La base es quien respondió
     las preguntas de títulos. */
  const titulos = useMemo(() => {
    let base = 0;
    const c = DIM.titulo.map((nombre, b) => ({ k: b, nombre: nombre, si: 0 }));
    filas.forEach(f => {
      if (f.titulos === TITULOS_SIN_DATO) return;
      base += f.ins;
      c.forEach(t => { if ((f.titulos >> t.k) & 1) t.si += f.ins; });
    });
    return c.map(t => Object.assign(t, { base: base, tasa: parte(t.si, base) || 0 }))
      .sort((a, b) => b.tasa - a.tasa);
  }, [filas]);

  const colegios = useMemo(() => opcionesDe('colegio', conForm).sort((a, b) => a - b), [conForm]);
  const tabla = useMemo(() => porGrado.map(d => {
    const fila = { k: d.k, grado: d.nombre };
    colegios.forEach(c => {
      fila['c' + c] = conForm.reduce((t, f) => t + (f.grado === d.k && f.colegio === c ? f.ins : 0), 0);
    });
    fila.total = d.ins;
    fila.participacion = parte(d.ins, baseForm);
    return fila;
  }), [porGrado, conForm, colegios, baseForm]);

  const columnas = [{ clave: 'grado', rotulo: 'Año de graduación', tipo: 'texto', ancho: 180 }]
    .concat(colegios.map(c => ({ clave: 'c' + c, rotulo: DIM.colegio[c], tipo: 'num', total: 'suma' })))
    .concat([
      { clave: 'total', rotulo: 'Total', tipo: 'num', total: 'suma' },
      { clave: 'participacion', rotulo: 'Participación', tipo: 'pct' }
    ]);

  return (
    <Fragment>
      <Fila cols={DOS}>
        <FichaGrafico titulo="Tipo de colegio de egreso"
          altoPx={ALTO} subtitulo={sub}
          opcion={porColegio.length ? barras(porColegio, baseForm, COLOR.colegio) : null}
          csv={csvDe(porColegio, 'Tipo de colegio', baseForm, true)}
          alSeleccionar={p => sel('colegio', porColegio[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'tipo-de-colegio'])} />

        <FichaGrafico titulo="Ubicación del colegio"
          altoPx={ALTO} subtitulo={sub}
          opcion={porUbicacion.length
            ? anillo(porUbicacion.map(d => ({ name: d.nombre, value: d.ins })), {
              colores: porUbicacion.map(d => SERIES[d.k % SERIES.length]),
              marca: notaForm ? '*' : ''
            })
            : null}
          nota={notaForm}
          csv={csvDe(porUbicacion, 'Ubicación del colegio', baseForm)}
          alSeleccionar={p => sel('ubicacion', porUbicacion[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'ubicacion-del-colegio'])} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Año de graduación del bachillerato"
          altoPx={ALTO} subtitulo={sub}
          opcion={porGrado.length ? barrasV(porGrado.map(d => d.nombre), porGrado.map(d => d.ins),
            { color: COLOR.grado, unidad: 'inscritos', corte: 10,
              letra: TAM_BARRAS, letraCifra: TAM_BARRAS }) : null}
          csv={csvDe(porGrado, 'Año de graduación', baseForm)}
          alSeleccionar={p => sel('grado', porGrado[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'anio-de-graduacion'])} />

        <FichaGrafico titulo="Percentil en la prueba Saber 11"
          altoPx={ALTO} subtitulo={sub}
          vacio={avisoPerfil(fuera, icfes)}
          opcion={avisoPerfil(fuera, icfes) ? null : (ancho => barrasH(
            icfesCats.map(c => c.nombre), icfesCats.map(c => c.n), opcionesBarras(ancho,
              { total: icfes.base, conParte: true, color: COLOR.icfes })))}
          csv={() => ({
            encabezados: ['Percentil', 'Inscritos', 'Participación (%)'],
            filas: icfesCats.map(c => [c.nombre, c.n, Number(parte(c.n, icfes.base).toFixed(1))])
          })}
          archivo={nombreArchivo([arch, 'percentil-saber-11'])} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Títulos de educación superior"
          altoPx={ALTO} subtitulo={sub}
          opcion={titulos[0].base ? (ancho => barrasPct(titulos.map(t => t.nombre),
            titulos.map(t => t.tasa), i => pct(titulos[i].tasa) + ' de los inscritos<br/>' +
              num(titulos[i].si) + ' de ' + num(titulos[i].base),
            opcionesBarras(ancho, { color: COLOR.titulo, max: null }))) : null}
          csv={() => ({
            encabezados: ['Título', 'Inscritos con el título', 'Base', 'Porcentaje'],
            filas: titulos.map(t => [t.nombre, t.si, t.base, Number(t.tasa.toFixed(1))])
          })}
          archivo={nombreArchivo([arch, 'titulos-de-educacion-superior'])} />

        <FichaGrafico titulo="Semestre que cursará"
          altoPx={ALTO} subtitulo={sub}
          opcion={porSemestre.length ? barras(porSemestre, res.conProg, COLOR.semestre) : null}
          csv={csvDe(porSemestre, 'Semestre', res.conProg, true)}
          alSeleccionar={p => sel('semestre', porSemestre[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'semestre-que-cursara'])} />
      </Fila>

      <Fila cols={UNA}>
        <Ficha titulo="Detalle por año de graduación y tipo de colegio" marca={!!notaForm}
          accion={<Descargas csv={csvTabla(columnas, tabla)}
            nombre={nombreArchivo([arch, 'detalle-graduacion-colegio'])} />}>
          <Tabla columnas={columnas} filas={tabla} altura={460} orden="total"
            alSeleccionar={f => sel('grado', f.k)} seleccion={filtros.grado}
            rotuloTotal={notaForm ? 'Total*' : 'Total'} />
          <NotaTotal texto={notaForm} />
        </Ficha>
      </Fila>
    </Fragment>
  );
}

function Territorio({ filas, res, sub, arch, sel, filtros }) {
  const porComuna = useMemo(() => agrupar(filas, f => f.comuna, nombreComuna), [filas]);
  const datosMapa = useMemo(() => DIM.comuna
    .map((c, k) => ({ c: c, k: k }))
    .filter(x => x.c.codigo !== COD_OTROS)
    .map(x => {
      const d = porComuna.filter(y => y.k === x.k)[0];
      return { k: x.k, codigo: x.c.codigo, nombre: x.c.nombre, valor: d ? d.ins : 0, extra: d };
    }), [porComuna]);
  const postPP = useMemo(() => porComuna.filter(d => d.postPP > 0).slice()
    .sort((a, b) => b.postPP - a.postPP), [porComuna]);
  const completoComuna = useMemo(() =>
    tasas(porComuna, 'comp').sort((a, b) => b.tasa - a.tasa), [porComuna]);

  const zonas = useMemo(() => opcionesDe('zona', filas).sort((a, b) => a - b), [filas]);
  const seriesZona = useMemo(() =>
    seriesPorFuente(filas, f => f.zona, zonas), [filas, zonas.join()]);

  const tabla = useMemo(() => porComuna.map(d => ({
    k: d.k,
    comuna: d.nombre,
    zona: DIM.zona[DIM.comuna[d.k].zona],
    ins: d.ins,
    participacion: parte(d.ins, res.ins),
    postPP: d.postPP,
    postRO: d.postRO,
    completo: parte(d.comp, d.ins),
    mujeres: parte(d.fem, d.ins),
    bajos: parte(d.bajos, d.ins)
  })), [porComuna, res.ins]);

  const columnas = [
    { clave: 'comuna', rotulo: 'Comuna o corregimiento', tipo: 'texto', ancho: 220 },
    { clave: 'zona', rotulo: 'Zona', tipo: 'texto' },
    { clave: 'ins', rotulo: 'Inscritos', tipo: 'num', total: 'suma' },
    { clave: 'participacion', rotulo: 'Participación', tipo: 'pct' },
    { clave: 'postPP', rotulo: 'Postulados a presupuesto participativo', tipo: 'num', total: 'suma' },
    { clave: 'postRO', rotulo: 'Postulados a recursos ordinarios', tipo: 'num', total: 'suma' },
    { clave: 'completo', rotulo: 'Formulario completo', tipo: 'pct' },
    { clave: 'mujeres', rotulo: 'Mujeres', tipo: 'pct' },
    { clave: 'bajos', rotulo: 'Estratos 1 a 3', tipo: 'pct' }
  ];

  return (
    <Fragment>
      <Fila cols={DOS}>
        <FichaGrafico titulo="Inscritos por comuna y corregimiento"
          altoPx={ALTO} subtitulo={sub}
          opcion={GEO && datosMapa.some(d => d.valor > 0) ? mapa(datosMapa, {
            detalle: d => (d.extra ? '<br/>' + num(d.extra.postPP) +
              ' postulados a presupuesto participativo' : '')
          }) : null}
          csv={() => ({
            encabezados: ['Código', 'Comuna o corregimiento', 'Inscritos'],
            filas: datosMapa.map(d => [d.codigo, d.nombre, d.valor])
          })}
          alSeleccionar={p => (p.data && p.data.k !== undefined ? sel('comuna', p.data.k) : null)}
          archivo={nombreArchivo([arch, 'mapa-comunas'])} />

        <FichaGrafico titulo="Postulados a presupuesto participativo por comuna o corregimiento"
          altoPx={ALTO} subtitulo={sub}
          opcion={postPP.length ? (ancho => {
            const op = barrasH(postPP.map(d => d.nombre), postPP.map(d => d.postPP),
              opcionesBarras(ancho, { color: COLOR.postulados, unidad: 'postulados' }));
            op.tooltip.formatter = p => {
              const d = postPP[p.dataIndex];
              return '<b>' + d.nombre + '</b><br/>' + num(d.postPP) + ' postulados de ' +
                num(d.ins) + ' inscritos<br/>' + pct(parte(d.postPP, d.ins)) +
                ' de los inscritos de la zona';
            };
            return op;
          }) : null}
          csv={() => ({
            encabezados: ['Comuna o corregimiento', 'Inscritos', 'Postulados a presupuesto participativo',
              'Postulados (%)'],
            filas: postPP.map(d => [d.nombre, d.ins, d.postPP,
              Number(parte(d.postPP, d.ins).toFixed(1))])
          })}
          alSeleccionar={p => sel('comuna', postPP[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'postulados-presupuesto-participativo'])} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Formulario completo por comuna o corregimiento"
          altoPx={ALTO} subtitulo={sub}
          opcion={completoComuna.length ? (ancho => barrasPct(
            completoComuna.map(d => d.nombre), completoComuna.map(d => d.tasa),
            i => pct(completoComuna[i].tasa) + ' completó el formulario<br/>' +
              num(completoComuna[i].comp) + ' de ' + num(completoComuna[i].ins) + ' inscritos',
            opcionesBarras(ancho, { color: COLOR.territorio }))) : null}
          csv={csvTasa(completoComuna, 'Comuna o corregimiento', 'comp', 'Formulario completo')}
          alSeleccionar={p => sel('comuna', completoComuna[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'formulario-completo-por-comuna'])} />

        <FichaGrafico titulo="Fuente de financiación según zona de residencia"
          altoPx={ALTO} subtitulo={sub}
          opcion={zonas.length
            ? (ancho => apiladas100(zonas.map(z => DIM.zona[z]), seriesZona,
              opcionesApiladas(ancho)))
            : null}
          csv={csvSeries('Zona de residencia', zonas.map(z => DIM.zona[z]), seriesZona)}
          alSeleccionar={p => sel('zona', zonas[p.dataIndex])}
          archivo={nombreArchivo([arch, 'fuente-por-zona'])} />
      </Fila>

      <Fila cols={UNA}>
        <Ficha titulo="Detalle por comuna o corregimiento"
          accion={<Descargas csv={csvTabla(columnas, tabla)}
            nombre={nombreArchivo([arch, 'detalle-comunas'])} />}>
          <Tabla columnas={columnas} filas={tabla} altura={520} orden="ins"
            alSeleccionar={f => sel('comuna', f.k)} seleccion={filtros.comuna} />
        </Ficha>
      </Fila>
    </Fragment>
  );
}

function InstitucionesProgramas({ filas, res, sub, arch, sel, selGrupo, filtros }) {
  const conProg = useMemo(() => filas.filter(conPrograma), [filas]);
  const nota = useMemo(() => notaSinPrograma(filas), [filas]);
  /* Programas por nombre: suma las ofertas de todas las instituciones, como en
     el carrusel y la infografía. Guarda las ofertas (para filtrar con un clic)
     y los inscritos de cada institución (para la ventana emergente). */
  const porNombre = useMemo(() => {
    const m = new Map();
    conProg.forEach(f => {
      const p = DIM.programa[f.prog];
      let x = m.get(p.nombre);
      if (!x) { x = { nombre: p.nombre, ins: 0, progs: [], ies: new Map() }; m.set(p.nombre, x); }
      x.ins += f.ins;
      if (x.progs.indexOf(f.prog) < 0) x.progs.push(f.prog);
      x.ies.set(p.ies, (x.ies.get(p.ies) || 0) + f.ins);
    });
    return Array.from(m.values())
      .sort((a, b) => b.ins - a.ins || a.nombre.localeCompare(b.nombre, 'es'));
  }, [conProg]);
  const porPrograma = useMemo(() => agrupar(conProg, f => f.prog, nombrePrograma), [conProg]);
  const porIes = useMemo(() => agrupar(conProg, f => f.ies, nombreIes), [conProg]);
  const mujeresIes = useMemo(() =>
    tasas(porIes, 'fem').sort((a, b) => b.tasa - a.tasa), [porIes]);
  const porSector = useMemo(() => agrupar(conProg, f => f.sector, k => k), [conProg]);
  const sectores = porSector.map(d => d.k).sort((a, b) => SECTORES.indexOf(a) - SECTORES.indexOf(b));
  const seriesSector = useMemo(() =>
    seriesPorFuente(conProg, f => f.sector, sectores), [conProg, sectores.join()]);
  const porNivel = useMemo(() => agrupar(conProg, f => f.nivel, i => DIM.nivel[i]), [conProg]);
  const porModalidad = useMemo(() =>
    agrupar(conProg, f => f.modalidad, i => DIM.modalidad[i]), [conProg]);

  const tamanos = useMemo(() => {
    const cortes = [
      { r: '1 inscrito', min: 1, max: 1 },
      { r: '2 a 5', min: 2, max: 5 },
      { r: '6 a 20', min: 6, max: 20 },
      { r: '21 a 50', min: 21, max: 50 },
      { r: 'Más de 50', min: 51, max: Infinity }
    ];
    return cortes.map(c => {
      const sel = porPrograma.filter(p => p.ins >= c.min && p.ins <= c.max);
      return { nombre: c.r, programas: sel.length, ins: sel.reduce((s, p) => s + p.ins, 0) };
    });
  }, [porPrograma]);

  const tabla = useMemo(() => porIes.map(d => ({
    k: d.k,
    ies: d.nombre,
    sector: DIM.ies[d.k].sector,
    programas: d.prog,
    ins: d.ins,
    participacion: parte(d.ins, res.conProg),
    pp: parte(d.postPP, d.ins),
    ro: parte(d.postRO, d.ins),
    mujeres: parte(d.fem, d.ins),
    bajos: parte(d.bajos, d.ins)
  })), [porIes, res.conProg]);

  const columnas = [
    { clave: 'ies', rotulo: 'Institución', tipo: 'texto', ancho: 250 },
    { clave: 'sector', rotulo: 'Sector', tipo: 'texto' },
    { clave: 'programas', rotulo: 'Programas', tipo: 'num', total: 'suma' },
    { clave: 'ins', rotulo: 'Inscritos', tipo: 'num', total: 'suma' },
    { clave: 'participacion', rotulo: 'Participación', tipo: 'pct' },
    { clave: 'pp', rotulo: 'Postulados a presupuesto participativo', tipo: 'pct' },
    { clave: 'ro', rotulo: 'Postulados a recursos ordinarios', tipo: 'pct' },
    { clave: 'mujeres', rotulo: 'Mujeres', tipo: 'pct' },
    { clave: 'bajos', rotulo: 'Estratos 1 a 3', tipo: 'pct' }
  ];

  return (
    <Fragment>
      <Fila cols={UNA}>
        <FichaGrafico titulo="Programas con más inscritos"
          altoPx={ALTO} subtitulo={sub}
          opcion={porNombre.length ? (ancho => {
            const op = barrasH(porNombre.map(d => d.nombre), porNombre.map(d => d.ins),
              opcionesBarras(ancho, { color: COLOR.programa }));
            /* La ventana emergente dice en cuántas instituciones se ofrece el
               programa y cuántos inscritos tiene cada una. */
            op.tooltip.formatter = p => {
              const d = porNombre[p.dataIndex];
              const ies = Array.from(d.ies.entries()).sort((a, b) => b[1] - a[1]);
              return '<b>' + d.nombre + '</b><br/>' + num(d.ins) + ' inscritos en ' +
                ies.length + (ies.length === 1 ? ' institución' : ' instituciones') + '<br/>' +
                ies.slice(0, 6).map(e => nombreIes(e[0]) + ': ' + num(e[1])).join('<br/>') +
                (ies.length > 6 ? '<br/>y ' + (ies.length - 6) + ' más' : '');
            };
            return op;
          }) : null}
          csv={() => ({
            encabezados: ['Programa', 'Inscritos', 'Instituciones que lo ofrecen'],
            filas: porNombre.map(d => [d.nombre, d.ins, d.ies.size])
          })}
          alSeleccionar={p => selGrupo('programa', porNombre[p.dataIndex].progs)}
          archivo={nombreArchivo([arch, 'programas-con-mas-inscritos'])} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Inscritos por nivel de formación"
          altoPx={ALTO} subtitulo={sub}
          opcion={porNivel.length ? barras(porNivel, res.conProg, COLOR.nivel) : null}
          csv={csvDe(porNivel, 'Nivel de formación', res.conProg, true)}
          alSeleccionar={p => sel('nivel', porNivel[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'nivel-de-formacion'])} />

        <FichaGrafico titulo="Inscritos por modalidad"
          altoPx={ALTO} subtitulo={sub}
          opcion={porModalidad.length ? barras(porModalidad, res.conProg, COLOR.modalidad) : null}
          csv={csvDe(porModalidad, 'Modalidad', res.conProg, true)}
          alSeleccionar={p => sel('modalidad', porModalidad[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'modalidad'])} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Sector de la institución"
          altoPx={ALTO} subtitulo={sub}
          opcion={porSector.length
            ? anillo(porSector.map(d => ({ name: d.nombre, value: d.ins })), {
              colores: porSector.map(d => SERIES[SECTORES.indexOf(d.k) % SERIES.length]),
              marca: nota ? '*' : ''
            })
            : null}
          nota={nota}
          csv={csvDe(porSector, 'Sector', res.conProg)}
          alSeleccionar={p => sel('sector', porSector[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'sector-de-la-institucion'])} />

        <FichaGrafico titulo="Fuente de financiación según sector"
          altoPx={ALTO} subtitulo={sub}
          opcion={sectores.length
            ? (ancho => apiladas100(sectores, seriesSector, opcionesApiladas(ancho)))
            : null}
          csv={csvSeries('Sector', sectores, seriesSector)}
          alSeleccionar={p => sel('sector', sectores[p.dataIndex])}
          archivo={nombreArchivo([arch, 'fuente-por-sector'])} />
      </Fila>

      <Fila cols={DOS}>
        <FichaGrafico titulo="Programas según su número de inscritos"
          altoPx={ALTO} subtitulo={sub}
          opcion={porPrograma.length ? barrasV(tamanos.map(t => t.nombre),
            tamanos.map(t => t.programas), { color: COLOR.institucion, unidad: 'programas',
              corte: 12, letra: TAM_BARRAS, letraCifra: TAM_CIFRA }) : null}
          csv={() => ({
            encabezados: ['Inscritos por programa', 'Programas', 'Inscritos'],
            filas: tamanos.map(t => [t.nombre, t.programas, t.ins])
          })}
          archivo={nombreArchivo([arch, 'programas-por-tamano'])} />

        <FichaGrafico titulo="Participación de mujeres por institución"
          altoPx={ALTO} subtitulo={sub}
          opcion={mujeresIes.length ? (ancho => barrasPct(mujeresIes.map(d => d.nombre),
            mujeresIes.map(d => d.tasa), i => pct(mujeresIes[i].tasa) + ' mujeres<br/>' +
              num(mujeresIes[i].fem) + ' de ' + num(mujeresIes[i].ins) + ' inscritos',
            opcionesBarras(ancho, { color: COLOR.programa }))) : null}
          csv={csvTasa(mujeresIes, 'Institución', 'fem', 'Mujeres')}
          alSeleccionar={p => sel('ies', mujeresIes[p.dataIndex].k)}
          archivo={nombreArchivo([arch, 'mujeres-por-institucion'])} />
      </Fila>

      <Fila cols={UNA}>
        <Ficha titulo="Detalle por institución" marca={!!nota}
          accion={<Descargas csv={csvTabla(columnas, tabla)}
            nombre={nombreArchivo([arch, 'detalle-instituciones'])} />}>
          <Tabla columnas={columnas} filas={tabla} altura={520} orden="ins"
            alSeleccionar={f => sel('ies', f.k)} seleccion={filtros.ies}
            rotuloTotal={nota ? 'Total*' : 'Total'} />
          <NotaTotal texto={nota} />
        </Ficha>
      </Fila>
    </Fragment>
  );
}

function InformacionDetallada({ filas, arch, sel, filtros }) {
  const sexos = useMemo(() => opcionesDe('sexo', filas).sort((a, b) => a - b), [filas]);

  const tabla = useMemo(() => {
    const mapa = new Map();
    filas.forEach(f => {
      if (!conPrograma(f)) return;
      let e = mapa.get(f.prog);
      if (!e) {
        const p = DIM.programa[f.prog];
        e = {
          k: f.prog,
          programa: p.nombre,
          codigo: p.codigo,
          ies: nombreIes(p.ies),
          sector: DIM.ies[p.ies].sector,
          nivel: DIM.nivel[p.nivel],
          modalidad: DIM.modalidad[p.modalidad],
          total: 0
        };
        sexos.forEach(s => { e['s' + s] = 0; });
        mapa.set(f.prog, e);
      }
      e['s' + f.sexo] = (e['s' + f.sexo] || 0) + f.ins;
      e.total += f.ins;
    });
    return Array.from(mapa.values());
  }, [filas, sexos]);

  const columnas = [
    { clave: 'programa', rotulo: 'Programa', tipo: 'texto', ancho: 150 },
    { clave: 'codigo', rotulo: 'Código SNIES', tipo: 'texto' },
    { clave: 'ies', rotulo: 'Institución', tipo: 'texto', ancho: 120 },
    { clave: 'sector', rotulo: 'Sector', tipo: 'texto' },
    { clave: 'nivel', rotulo: 'Nivel de formación', tipo: 'texto' },
    { clave: 'modalidad', rotulo: 'Modalidad', tipo: 'texto' }
  ].concat(sexos.map(s => ({
    clave: 's' + s, rotulo: DIM.sexo[s], tipo: 'num', total: 'suma'
  }))).concat([
    { clave: 'total', rotulo: 'Total', tipo: 'num', total: 'suma' }
  ]);

  const nota = useMemo(() => notaSinPrograma(filas), [filas]);

  return (
    <Fila cols={UNA}>
      <Ficha titulo="Detalle por programa e institución" marca={!!nota}
        accion={<Descargas csv={csvTabla(columnas, tabla)}
          nombre={nombreArchivo([arch, 'informacion-detallada'])} />}>
        <Tabla columnas={columnas} filas={tabla} altura={640} orden="total" limite={400}
          alSeleccionar={f => sel('programa', f.k)} seleccion={filtros.programa}
          rotuloTotal={nota ? 'Total*' : 'Total'} />
        <NotaTotal texto={nota} />
      </Ficha>
    </Fila>
  );
}

const SECCIONES = [
  { id: 'panorama', rotulo: 'Panorama general', panel: PanoramaGeneral },
  { id: 'inscripcion', rotulo: 'Inscripción', panel: Inscripcion },
  { id: 'perfil', rotulo: 'Perfil de los inscritos', panel: Perfil },
  { id: 'formacion', rotulo: 'Formación previa', panel: FormacionPrevia },
  { id: 'territorio', rotulo: 'Territorio', panel: Territorio },
  { id: 'programas', rotulo: 'Instituciones y programas', panel: InstitucionesProgramas },
  { id: 'detalle', rotulo: 'Información detallada', panel: InformacionDetallada }
];

/* =================================================================== */
/*  Barra de filtros                                                    */
/* =================================================================== */

/* Todos los campos que se pueden filtrar, con su rótulo. La barra muestra las
   listas de FILTROS_BARRA; los demás campos se filtran con un clic sobre los
   gráficos y las tablas, y quedan como etiquetas debajo de la barra. */
const FILTROS_ORDEN = [
  ['periodo', 'Convocatoria'], ['ies', 'Institución'], ['programa', 'Programa académico'],
  ['fuente', 'Fuente de financiación'], ['estado', 'Estado del formulario'],
  ['sexo', 'Sexo'], ['edad', 'Grupo de edad'], ['estrato', 'Estrato'],
  ['comuna', 'Comuna o corregimiento'], ['zona', 'Zona de residencia'],
  ['sector', 'Sector de la institución'], ['nivel', 'Nivel de formación'],
  ['modalidad', 'Modalidad'], ['semestre', 'Semestre que cursará'],
  ['medio', 'Medio de difusión'], ['colegio', 'Tipo de colegio'],
  ['ubicacion', 'Ubicación del colegio'], ['grado', 'Año de graduación']
];
const FILTROS_BARRA = ['periodo', 'ies', 'programa', 'fuente', 'estado'];

const rotuloFiltro = c => (FILTROS_ORDEN.filter(f => f[0] === c)[0] || [c, c])[1];

/* Rótulo de cada opción en los filtros y en las etiquetas de lo aplicado. */
const ROTULOS = {
  periodo: nombrePeriodo,
  ies: nombreIes,
  programa: nombrePrograma,
  fuente: i => DIM.fuente[i],
  estado: i => DIM.estado[i],
  sexo: i => DIM.sexo[i],
  edad: i => DIM.edad[i],
  estrato: i => DIM.estrato[i],
  comuna: nombreComuna,
  zona: i => DIM.zona[i],
  sector: k => k,
  nivel: i => DIM.nivel[i],
  modalidad: i => DIM.modalidad[i],
  semestre: i => DIM.semestre[i],
  medio: i => DIM.medio[i],
  colegio: i => DIM.colegio[i],
  ubicacion: i => DIM.ubicacion[i],
  grado: i => DIM.grado[i]
};

function Filtros({ filtros, cambiar }) {
  const R = ROTULOS;

  const campo = (id, etiqueta) => {
    const d = disponibles(filtros, id, R[id]);
    const ancho = id === 'ies' || id === 'programa';
    const extra = id === 'programa' ? {
      secundario: i => (DIM.programa[i].codigo ? 'SNIES ' + DIM.programa[i].codigo + ' · ' : '') +
        DIM.ies[DIM.programa[i].ies].nombre,
      resumenVacio: 'Todos los programas'
    } : id === 'periodo' ? { resumenVacio: 'Todas' } : {};
    return (
      <div key={id}>
        <label className="form-label" htmlFor={'sel-' + clave(etiqueta)}>{etiqueta}</label>
        <SelectorMultiple etiqueta={etiqueta} opciones={d.claves} valores={filtros[id]}
          onCambio={v => cambiar({ [id]: v })} rotulo={R[id]}
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

const mismaSeleccion = (a, b) =>
  a.length === b.length && a.every(x => b.indexOf(x) >= 0);

/** Fichas con los filtros activos; cada una se retira con un clic. La
    convocatoria solo aparece cuando difiere de la que abre el tablero, porque
    su botón ya la muestra. */
function FichasActivas({ filtros, cambiar, limpiar }) {
  const fichas = [];
  const agregar = (campo, etiqueta, valores, rotulo) => {
    /* Las opciones con el mismo nombre, como un programa que ofrecen varias
       instituciones, van en una sola ficha que las retira todas. */
    const grupos = new Map();
    valores.forEach(v => {
      const t = rotulo(v);
      if (!grupos.has(t)) grupos.set(t, []);
      grupos.get(t).push(v);
    });
    grupos.forEach((vs, t) => fichas.push({
      etiqueta: etiqueta, texto: vs.length > 1 ? t + ' (' + vs.length + ' ofertas)' : t,
      quitar: () => cambiar({ [campo]: filtros[campo].filter(x => vs.indexOf(x) < 0) })
    }));
  };

  FILTROS_ORDEN.forEach(f => {
    const c = f[0];
    if (c === 'periodo' && mismaSeleccion(filtros.periodo, FILTROS_BASE.periodo)) return;
    agregar(c, f[1], filtros[c], c === 'ies' ? (i => DIM.ies[i].corto) : ROTULOS[c]);
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

function App() {
  const [tab, setTab] = useState(0);
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

  /* Clic sobre un grupo de opciones, como un programa que ofrecen varias
     instituciones: si ya están todas elegidas se quitan; si no, se agregan. */
  const selGrupo = (campo, valores) => {
    if (!valores || !valores.length) return;
    setFiltros(f => {
      const actual = f[campo] || [];
      const todas = valores.every(v => actual.indexOf(v) >= 0);
      const nuevo = todas ? actual.filter(v => valores.indexOf(v) < 0)
        : actual.concat(valores.filter(v => actual.indexOf(v) < 0));
      return Object.assign({}, f, { [campo]: nuevo });
    });
  };

  const periodos = (filtros.periodo.length ? filtros.periodo.slice().sort((a, b) => a - b)
    : DIM.periodo.map((p, i) => i)).map(nombrePeriodo);
  const convocatoria = (periodos.length > 1 ? 'Convocatorias ' : 'Convocatoria ') +
    listaY(periodos);
  EXPORTAR.periodo = convocatoria;

  const sub = useMemo(() => {
    const p = [];
    FILTROS_ORDEN.forEach(f => {
      const c = f[0];
      if (c === 'periodo' || !filtros[c].length) return;
      p.push(c === 'programa' ? num(filtros.programa.length) + ' programas'
        : filtros[c].map(c === 'ies' ? (i => DIM.ies[i].corto) : ROTULOS[c]).join(', '));
    });
    return convocatoria + (p.length ? ' · ' + recortar(p.join(' · '), 110) : '') +
      ' · ' + num(res.ins) + ' inscritos';
  }, [filtros, res.ins]);

  const arch = 'convocatoria-' + periodos.join('-');

  /* Las flechas izquierda y derecha recorren los botones de sección. */
  const teclas = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (i + (e.key === 'ArrowRight' ? 1 : SECCIONES.length - 1)) % SECCIONES.length;
    setTab(n);
    if (refsTab.current[n]) refsTab.current[n].focus();
  };

  const Panel = sec.panel;

  return (
    <Fragment>
      <div className="body container-fluid p-4 p-xl-8">
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

        <Filtros filtros={filtros} cambiar={cambiar} />

        <FichasActivas filtros={filtros} cambiar={cambiar} limpiar={limpiar} />

        {res.ins === 0 ? (
          <div className="alert alert-info" role="status">
            La combinación de filtros no deja registros. Use «Borrar todos» para
            volver a ver datos.
          </div>
        ) : (
          <Fragment>
            <section className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 row-cols-xxl-6 g-4 mb-5"
              aria-label="Indicadores de la selección">
              <div className="col">
                <Kpi icono="groups" familia="secondary" etiqueta="Inscritos"
                  valor={num(res.ins)} pie={convocatoria} />
              </div>
              <div className="col">
                <Kpi icono="assignment_turned_in" familia="info" etiqueta="Formulario completo"
                  valor={pct(parte(res.comp, res.ins))} pie={num(res.comp) + ' inscritos'} />
              </div>
              <div className="col">
                <Kpi icono="diversity_3" familia="primary"
                  etiqueta="Postulados a presupuesto participativo"
                  valor={pct(parte(res.postPP, res.ins))}
                  pie={num(res.postPP) + ' inscritos'} />
              </div>
              <div className="col">
                <Kpi icono="account_balance" familia="tertiary-pink"
                  etiqueta="Postulados a recursos ordinarios"
                  valor={pct(parte(res.postRO, res.ins))}
                  pie={num(res.postRO) + ' inscritos'} />
              </div>
              <div className="col">
                <Kpi icono="female" familia="success" etiqueta="Mujeres"
                  valor={pct(parte(res.fem, res.ins))}
                  pie={num(res.fem) + ' inscritas'} />
              </div>
              <div className="col">
                <Kpi icono="home" familia="warning" etiqueta="Estratos 1 a 3"
                  valor={pct(parte(res.bajos, res.ins))}
                  pie={num(res.bajos) + ' inscritos'} />
              </div>
            </section>

            <div id={'panel-' + sec.id} role="tabpanel" aria-labelledby={'tab-' + sec.id}>
              <Panel key={sec.id} filas={filas} res={res} sub={sub} arch={arch}
                sel={sel} selGrupo={selGrupo} filtros={filtros} />
            </div>
          </Fragment>
        )}
      </div>
    </Fragment>
  );
}

export default App;
