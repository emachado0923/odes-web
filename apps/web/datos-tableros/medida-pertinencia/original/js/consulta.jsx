/* ====================================================================== */
/*  Tablero pertinencia programas de formación                            */
/*  Observatorio de Sapiencia                                             */
/*                                                                        */
/*  Este archivo se transpila en el navegador con Babel standalone.       */
/*  Los datos provienen de datos/pertinencia.js y datos/definiciones.js   */
/*  y se consultan a través del objeto global window.ODES.                */
/* ====================================================================== */

const { useState, useMemo, useRef, useEffect, Fragment } = React;

const P = window.ODES.pertinencia;
const DEF = window.ODES.definiciones;

/* ---------------------------------------------------------------- color */

const TIPO = '"Rubik", system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const TAM = 10.5;
const ALTO = 380;
const TAM_BARRAS = 12;
const TAM_CIFRA = 15;

/* Colores de la plantilla de Sapiencia, los mismos del tablero de matrícula:
   azul oscuro, celeste, morado, verde y el naranja del Observatorio. */
const BASE = '#0B3A56';
const AZUL = '#3AB6E6';
const MORADO = '#9B48A4';
const NARANJA = '#ED7203';
const VERDE = '#2EA14E';
const MAGENTA = '#921C8D';

const TINTA = '#151717';
const TINTA2 = '#3D4041';
const GRIS = '#4E5254';
const LINEA = '#DCDCDC';
const PISTA = '#F4F4F4';

/* Cada noción conserva su color en todo el tablero: la habilitación directa
   en azul oscuro, la complementaria en celeste, la relación con los
   referentes en verde, los clústeres en azul oscuro y los proyectos en
   naranja; el campo consultado se marca en magenta. */
const COLOR = { directa: BASE, complementaria: AZUL, relacionada: VERDE,
  cluster: BASE, proyecto: NARANJA, seleccion: MAGENTA };

const COLORES_PASOS = ['#163854', '#51ADE5', '#9F339E', '#2E9E49', '#F8DB1B', '#F36522'];
const COLOR_SAPIENCIA = {
  secondary: '#163854', info: '#51ADE5', primary: '#9F339E',
  'tertiary-pink': '#2E9E49', success: '#F8DB1B', warning: '#F36522'
};

/* Los seis colores primarios de Sapiencia, por nombre, para los íconos. */
const PRIMARIOS = {
  azul: '#163854', celeste: '#51ADE5', magenta: '#9F339E',
  verde: '#2E9E49', amarillo: '#F8DB1B', naranja: '#F36522'
};
const PRIMARIOS_ORDEN = ['azul', 'celeste', 'magenta', 'verde', 'amarillo', 'naranja'];

/* -------------------------------------------------------------- formatos */

const fNum = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const vacio = v => v === null || v === undefined || (typeof v === 'number' && isNaN(v));
const num = v => (vacio(v) ? '' : fNum.format(Math.round(v)));
const dec = (v, d) => (vacio(v) ? '' : v.toFixed(d === undefined ? 1 : d).replace('.', ','));
const pct = (v, d) => (vacio(v) ? '' : dec(v, d) + '%');
const parte = (v, total) => (!total ? null : (v * 100) / total);

const clave = t =>
  String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const sinTilde = t =>
  String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const plural = (n, uno, varios) => num(n) + ' ' + (n === 1 ? uno : varios);
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

function aclarar(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const m = (c, k) => Math.round(c + (255 - c) * k);
  return '#' + [m(n >> 16 & 255, t), m(n >> 8 & 255, t), m(n & 255, t)]
    .map(v => ('0' + v.toString(16)).slice(-2)).join('');
}

/* =================================================================== */
/*  Preparación de los datos                                            */
/* =================================================================== */

const CAMPOS = P.campos;
const REFERENTES = P.referentes;
const OCUP = {};
P.ocupaciones.forEach(o => { OCUP[o.codigo] = o; });

/* Programas con oferta en Medellín que comparten cada campo detallado. */
const PROGRAMAS_CAMPO = CAMPOS.map(() => []);
P.programas.forEach((p, i) => PROGRAMAS_CAMPO[p.campo].push(i));

/** Ocupaciones habilitadas por un campo, con su nivel y su ficha. */
function habilitadas(k) {
  const c = CAMPOS[k];
  return (P.habilitaciones[c.codigo] || []).map(h => {
    const o = OCUP[h[0]];
    return {
      codigo: o.codigo, nombre: o.nombre, descripcion: o.descripcion,
      directa: h[1] === 1, peso: h[1] === 1 ? 1 : 0.5,
      relacionada: o.relacionada,
      referentes: o.referentes.map(r => REFERENTES[r].nombre)
    };
  });
}

/** Rango [mínimo, máximo] de índice que cubre una fila de la tabla 6. */
function rango(texto) {
  const n = String(texto).match(/\d+/g) || [];
  const t = sinTilde(texto);
  if (t.indexOf('mayor') >= 0) return [Number(n[0]) + 1, 100];
  if (t.indexOf('menor') >= 0) return [0, Number(n[0])];
  if (n.length >= 2) return [Number(n[0]), Number(n[1])];
  return [Number(n[0]), Number(n[0])];
}

const LINEAS = ['pregrado', 'efe', 'em'];
const nivelDe = p => P.niveles[p.nivel];
const lineaDe = p => (p ? (nivelDe(p).acad === 'Pregrado' ? 'pregrado' : 'efe') : null);

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

const Icono = ({ nombre, className }) => (
  <span className={'material-symbols-outlined' + (className ? ' ' + className : '')}
    aria-hidden="true">{nombre}</span>
);

const BotonIcono = ({ icono, rotulo, onClick }) => (
  <button type="button" className="btn btn-icon btn-outline-neutral btn-mn"
    title={rotulo} aria-label={rotulo} onClick={onClick}>
    <Icono nombre={icono} />
  </button>
);

function Descargas({ csv, instancia, nombre, titulo }) {
  return (
    <span className="acciones-grafico">
      {csv ? (
        <BotonIcono icono="download" rotulo="Descargar los datos en CSV"
          onClick={() => {
            const d = csv();
            if (d) descargarCsv(nombre || 'datos_odes', d.encabezados, d.filas);
          }} />
      ) : null}
      {instancia ? (
        <BotonIcono icono="image" rotulo="Descargar el gráfico en PNG"
          onClick={() => {
            const ec = instancia.current;
            if (ec) descargarPng(ec, nombre || 'grafico_odes', titulo);
          }} />
      ) : null}
    </span>
  );
}

/* =================================================================== */
/*  Piezas de interfaz                                                  */
/* =================================================================== */

/**
 * Selector de una sola opción con buscador, con las piezas de la plantilla:
 * un botón con el aspecto de form-select y, al abrirlo, un dropdown-menu con
 * un form-control para buscar y una casilla (form-check) por opción.
 */
function Selector({ etiqueta, opciones, valor, onCambio, rotulo, secundario,
  resumenVacio, ancho, buscador, vaciar }) {
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

  useEffect(() => { if (!abierto) setTexto(''); }, [abierto]);

  const visibles = useMemo(() => {
    if (!texto) return opciones.slice(0, 300);
    const t = sinTilde(texto).trim();
    return opciones.filter(o =>
      sinTilde(rotulo(o)).indexOf(t) >= 0 ||
      (secundario ? sinTilde(secundario(o)).indexOf(t) >= 0 : false)).slice(0, 300);
  }, [opciones, texto]);

  const activo = valor !== null && valor !== undefined;
  const resumen = activo ? rotulo(valor) : (resumenVacio || 'Todos');

  return (
    <div className={'selector' + (ancho ? ' selector-ancho' : '')} ref={caja}>
      <button type="button" className="form-select" id={id}
        aria-haspopup="true" aria-expanded={abierto} aria-controls={id + '-lista'}
        aria-label={etiqueta + ': ' + resumen} title={resumen}
        data-activo={activo ? '1' : '0'}
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
                  <input className="form-check-input" type="radio" name={id} id={id + '-' + i}
                    checked={valor === o}
                    onChange={() => { onCambio(o); setAbierto(false); }} />
                  <label className="form-check-label" htmlFor={id + '-' + i}>
                    {rotulo(o)}
                    {secundario ? <span className="secundario">{secundario(o)}</span> : null}
                  </label>
                </div>
              ))}
          </div>
          <div className="border-top mt-2 pt-2">
            <button type="button" className="btn btn-outline-neutral btn-sm"
              onClick={() => { onCambio(null); setAbierto(false); }}>
              {vaciar || 'Quitar selección'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Ventana de bienvenida: encabezado del Observatorio, pasos con círculo de
    color y el botón de ingreso. */
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
          <img src="img/logo-observatorio.png" alt="Observatorio de Sapiencia"
            width="1200" height="354" />
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

const Numero = ({ n }) => (n ? <span className="num-titulo" aria-hidden="true">{n}</span> : null);

function Ficha({ titulo, subtitulo, accion, pie, claro, children, id, numero }) {
  return (
    <section className="card card-lg h-100" data-bs-theme={claro ? 'light' : undefined} id={id}>
      <div className="card-header d-flex justify-content-between align-items-center gap-3">
        <div className="d-flex align-items-center gap-2">
          <Numero n={numero} />
          <div>
            <h3 className="card-title mb-0">{titulo}</h3>
            {subtitulo ? <p className="filtros-subtitulo">{subtitulo}</p> : null}
          </div>
        </div>
        {accion || null}
      </div>
      <div className="card-body">{children}</div>
      <div className="card-footer small ficha-fuente">{pie || DEF.fuente}</div>
    </section>
  );
}

const SinDatos = ({ texto }) => (
  <p className="text-neutral-50 text-center py-5 mb-0">
    {texto || 'Sin datos para la selección.'}
  </p>
);

function Grafico({ opcion, altoPx, instancia, alSeleccionar }) {
  const caja = useRef(null);
  const inst = useRef(null);
  const [ancho, setAncho] = useState(0);

  useEffect(() => {
    if (!window.echarts || !caja.current) return undefined;
    inst.current = window.echarts.init(caja.current, null, { renderer: 'canvas' });
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
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (inst.current) inst.current.resize(); });
    }
    return () => {
      window.removeEventListener('resize', redimensionar);
      if (obs) obs.disconnect();
      if (inst.current) inst.current.dispose();
      inst.current = null;
      if (instancia) instancia.current = null;
    };
  }, []);

  const op = typeof opcion === 'function' ? (ancho ? opcion(ancho) : null) : opcion;

  useEffect(() => {
    if (inst.current && op) inst.current.setOption(op, true);
  }, [op]);

  useEffect(() => {
    const ec = inst.current;
    if (!ec) return undefined;
    ec.off('click');
    if (alSeleccionar) ec.on('click', alSeleccionar);
    return () => { if (ec) ec.off('click'); };
  });

  if (!window.echarts) {
    return <SinDatos texto="Los gráficos no están disponibles en esta sesión." />;
  }
  return <div ref={caja} className="grafico" style={altoPx ? { height: altoPx } : null} />;
}

function FichaGrafico({ titulo, subtitulo, altoPx, opcion, csv, archivo, pie, extra,
  alSeleccionar }) {
  const instancia = useRef(null);
  return (
    <Ficha titulo={titulo} subtitulo={subtitulo} pie={pie} claro
      accion={<Descargas csv={csv} instancia={instancia} nombre={archivo} titulo={titulo} />}>
      {opcion
        ? <Grafico opcion={opcion} altoPx={altoPx} instancia={instancia}
            alSeleccionar={alSeleccionar} />
        : <SinDatos />}
      {opcion ? extra || null : null}
    </Ficha>
  );
}

function Kpi({ icono, familia, etiqueta, valor, pie, texto, aplica }) {
  return (
    <div className={'card card-lg h-100 kpi kpi-' + familia}>
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-start gap-2">
          <div className="kpi-etiqueta text-neutral-40">{etiqueta}</div>
          <span className="kpi-icono" style={{ background: COLOR_SAPIENCIA[familia] }}>
            <Icono nombre={icono} />
          </span>
        </div>
        <div className={'kpi-valor text-' + familia + '-40' + (texto ? ' kpi-texto' : '')}>{valor}</div>
        {aplica
          ? <div className="linea-aplica"><Icono nombre="check_circle" />Línea del programa consultado</div>
          : pie ? <div className="kpi-pie small text-neutral-50 text-truncate">{pie}</div> : null}
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
    trigger: 'item', confine: true,
    backgroundColor: '#ffffff', borderColor: LINEA, borderWidth: 1, padding: [8, 11],
    textStyle: { color: TINTA, fontSize: TAM, fontFamily: TIPO }
  }
});

/** Barras horizontales de una sola serie, en color plano y con pista. */
function barrasH(categorias, valores, opciones) {
  const o = Object.assign({}, opciones);
  const color = o.color || BASE;
  const maximo = Math.max.apply(null, [1].concat(valores));
  const op = base();
  const letra = o.letra || TAM_BARRAS;
  const letraCifra = o.letraCifra || TAM_CIFRA;
  let anchoCol = 180;
  if (o.anchoMax) {
    const masLargo = Math.max.apply(null, [0].concat(categorias.map(c => medirTexto(c, letra))));
    anchoCol = Math.round(Math.min(o.anchoMax, masLargo + 18));
  }
  const anchoRotulo = anchoCol - 14;
  const altoLinea = Math.round(letra * 1.2);
  const lineas = Math.max.apply(null, [1].concat(categorias.map(c => lineasDe(c, anchoRotulo, letra))));
  const paso = Math.max(o.paso || 28, lineas * altoLinea + 10);
  const alto = o.alto || ALTO;
  const caben = Math.max(3, Math.floor((alto - 34) / paso));
  const recorre = categorias.length > caben;
  const anchoEtiqueta = medirTexto(o.formato ? o.formato(maximo) : num(maximo), letraCifra, 600);
  op.grid = {
    left: anchoCol,
    right: Math.max(72, Math.ceil(anchoEtiqueta) + 24) + (recorre ? 30 : 0),
    top: 14, bottom: 20, containLabel: false
  };
  if (recorre) {
    const inicio = Math.max(0, Math.min(categorias.length - caben,
      (o.inicio || 0) - Math.floor(caben / 2)));
    op.dataZoom = [
      { type: 'inside', yAxisIndex: 0, startValue: inicio, endValue: inicio + caben - 1,
        zoomOnMouseWheel: false, moveOnMouseWheel: true, moveOnMouseMove: true },
      { type: 'slider', yAxisIndex: 0, startValue: inicio, endValue: inicio + caben - 1,
        right: 4, width: 14, top: 14, bottom: 20,
        showDetail: false, brushSelect: false, zoomLock: true,
        borderColor: LINEA, backgroundColor: '#FAFAFA', fillerColor: 'rgba(11,58,86,.14)',
        handleStyle: { color: '#fff', borderColor: '#CCCCCC' },
        moveHandleStyle: { color: LINEA },
        dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
        selectedDataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } } }
    ];
  }
  op.xAxis = {
    type: 'value', max: (o.maximo || maximo) * 1.02,
    axisLine: { show: true, lineStyle: { color: LINEA } },
    axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false }
  };
  op.yAxis = {
    type: 'category', data: categorias, inverse: true,
    axisLine: { show: true, lineStyle: { color: LINEA } }, axisTick: { show: false },
    axisLabel: { color: TINTA2, fontSize: letra, margin: 12, lineHeight: altoLinea,
      width: anchoRotulo, overflow: 'break' }
  };
  op.tooltip.formatter = p => '<b>' + String(p.name).replace(/\n/g, ' ') + '</b><br/>' +
    (o.formato ? o.formato(p.value) : num(p.value)) + ' ' + (o.unidad || '') +
    (o.detalle ? '<br/>' + o.detalle(p.dataIndex) : '');
  const grosor = o.grosor || 15;
  op.series = [{
    type: 'bar',
    data: valores.map((v, i) => ({
      value: v,
      itemStyle: { color: (o.colores && o.colores[i]) || color, borderRadius: 4 }
    })),
    barMaxWidth: grosor,
    showBackground: true,
    backgroundStyle: { color: PISTA, borderRadius: 4 },
    emphasis: { itemStyle: { color: aclarar(color, 0.2) } },
    label: {
      show: true, position: 'right', distance: 9, fontSize: letraCifra, fontFamily: TIPO,
      color: TINTA, fontWeight: 500,
      formatter: p => (o.formato ? o.formato(p.value) : num(p.value))
    }
  }];
  return op;
}

/** Anillo con la cifra total en el centro. */
function anillo(datos, opciones) {
  const o = Object.assign({}, opciones);
  const total = datos.reduce((s, d) => s + d.value, 0);
  const op = base();
  op.tooltip.formatter = p =>
    '<b>' + String(p.name).replace(/\n/g, ' ') + '</b><br/>' + num(p.value) + ' ' + (o.unidad || 'ocupaciones') + '<br/>' +
    pct(parte(p.value, total)) + ' del total';
  op.series = [{
    type: 'pie',
    radius: ['50%', '70%'],
    center: ['50%', '50%'],
    avoidLabelOverlap: true,
    padAngle: 1.5,
    itemStyle: { borderColor: '#fff', borderWidth: 2 },
    label: {
      show: true, position: 'outside', fontSize: TAM, fontFamily: TIPO, lineHeight: 15,
      formatter: p => '{n|' + p.name + '}\n{v|' + num(p.value) + '  ' + pct(parte(p.value, total)) + '}',
      rich: {
        n: { color: TINTA2, fontSize: TAM, fontFamily: TIPO },
        v: { color: TINTA, fontSize: 12, fontWeight: 500, fontFamily: TIPO }
      }
    },
    labelLine: { length: 10, length2: 12, lineStyle: { color: LINEA } },
    data: datos.filter(d => d.value > 0).map(d => Object.assign({}, d, { itemStyle: { color: d.color } }))
  }];
  op.graphic = [{
    type: 'text', left: 'center', top: '43%',
    style: { text: num(total), fontSize: 22, fontWeight: 500, fill: TINTA, fontFamily: TIPO, textAlign: 'center' }
  }, {
    type: 'text', left: 'center', top: '53%',
    style: { text: o.rotuloCentro || 'ocupaciones', fontSize: TAM, fill: GRIS, fontFamily: TIPO, textAlign: 'center' }
  }];
  return op;
}

/* =================================================================== */
/*  Parte superior: paso a paso de la metodología                       */
/* =================================================================== */

/** Reemplaza {clave} por la cifra correspondiente, en negrita. */
function conCifras(texto, cifras) {
  const partes = String(texto).split(/(\{[a-z]+\})/i);
  return partes.map((p, i) => {
    const m = p.match(/^\{([a-z]+)\}$/i);
    return m ? <Fragment key={i}>{num(cifras[m[1]])}</Fragment> : <Fragment key={i}>{p}</Fragment>;
  });
}

function Metodologia({ numero }) {
  const m = DEF.metodologia || {};
  const r = P.meta.resumen;
  const cifras = { denominaciones: r.denominaciones, ocupaciones: r.ocupaciones,
    relacionadas: r.relacionadas, campos: r.campos, habilitaciones: r.habilitaciones };
  const pasos = m.pasos || [];
  return (
    <Ficha titulo={m.titulo} id="metodologia" numero={numero}>
      {m.texto ? <p className="intro-texto">{m.texto}</p> : null}
      <ol className="flujo">
        {pasos.map((p, i) => (
          <Fragment key={p.titulo}>
            <li className="flujo-paso">
              <div className="ficha-cabeza">
                <span className="kpi-icono" style={{ background: PRIMARIOS[PRIMARIOS_ORDEN[i % 6]] }}>
                  <Icono nombre={p.icono} />
                </span>
                <div>
                  <div className="flujo-num">Paso {i + 1}</div>
                  <div className="flujo-tit">{p.titulo}</div>
                </div>
              </div>
              <p className="flujo-txt">{conCifras(p.texto, cifras)}</p>
            </li>
          </Fragment>
        ))}
      </ol>
    </Ficha>
  );
}

/** Tarjeta con los ocho clústeres y los tres proyectos estratégicos, en dos
    cuadrículas de fichas con ícono, nombre y alcance. */
function Referentes({ numero }) {
  const t = DEF.referentes || {};
  const iconos = t.iconos || {};
  const colores = t.colores || {};
  const grupo = (titulo, tipo, clase) => (
    <div className="ref-grupo">
      <ul className={'ref-cuadricula ' + clase}>
        {REFERENTES.filter(r => r.tipo === tipo).map((r, i) => (
          <li className="ref-ficha" key={r.nombre}>
            <div className="ficha-cabeza">
              <span className="kpi-icono" style={{ background: PRIMARIOS[colores[r.nombre]] || PRIMARIOS[PRIMARIOS_ORDEN[i % 6]] }}>
                <Icono nombre={iconos[r.nombre] || 'star'} />
              </span>
              <div>
                <div className="flujo-num">{r.tipo === 'Clúster' ? 'Clúster estratégico' : 'Proyecto estratégico'}</div>
                <div className="ref-nombre">{r.nombre}</div>
              </div>
            </div>
            <div className="ref-alcance">{r.alcance}</div>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <Ficha titulo={t.titulo} numero={numero}>
      {grupo(t.clusteres, 'Clúster', 'cuatro')}
      {grupo(t.proyectos, 'Proyecto', 'tres')}
    </Ficha>
  );
}

/* =================================================================== */
/*  Consulta: selectores y fichas de la selección                       */
/* =================================================================== */

function Consulta({ sel, cambiar, limpiar }) {
  const programas = useMemo(() => {
    const todos = P.programas.map((p, i) => i);
    return sel.ies === null ? todos : todos.filter(i => P.programas[i].ies === sel.ies);
  }, [sel.ies]);

  const instituciones = useMemo(() => {
    const con = {};
    P.programas.forEach(p => { con[p.ies] = (con[p.ies] || 0) + 1; });
    return Object.keys(con).map(Number).sort((a, b) =>
      P.ies[a].nombre.localeCompare(P.ies[b].nombre, 'es'));
  }, []);

  const hay = sel.ies !== null || sel.programa !== null;

  return (
    <section className="card card-lg filtros" aria-labelledby="consulta-tit">
      <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <h2 className="card-title mb-0" id="consulta-tit">Consulte su programa</h2>
        </div>
        <div className="filtros-acciones">
          <button type="button" className="btn-filtro" onClick={limpiar} disabled={!hay}>
            <Icono nombre="ink_eraser" />
            Limpiar
          </button>
        </div>
      </div>
      <div className="card-body">
        <div className="filtros-filas">
          <div className="filtros-rejilla" style={{ '--cols': 2 }}>
            <div>
              <label className="form-label rotulo-campo" htmlFor="sel-institucion">Institución</label>
              <Selector etiqueta="Institución" opciones={instituciones} valor={sel.ies}
                onCambio={v => cambiar({ ies: v })} rotulo={i => P.ies[i].nombre}
                resumenVacio="Todas las instituciones" ancho buscador />
            </div>
            <div>
              <label className="form-label rotulo-campo" htmlFor="sel-programa-academico">Programa académico</label>
              <Selector etiqueta="Programa académico" opciones={programas} valor={sel.programa}
                onCambio={v => cambiar({ programa: v })} rotulo={i => P.programas[i].nombre}
                secundario={i => 'SNIES: ' + P.programas[i].codigo + '. ' + P.ies[P.programas[i].ies].nombre}
                resumenVacio="Seleccione un programa" ancho buscador />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FichasActivas({ sel, cambiar, limpiar }) {
  const fichas = [];
  if (sel.ies !== null) fichas.push({ etiqueta: 'Institución', texto: P.ies[sel.ies].nombre,
    quitar: () => cambiar({ ies: null }) });
  if (sel.programa !== null) fichas.push({ etiqueta: 'Programa', texto: P.programas[sel.programa].nombre,
    quitar: () => cambiar({ programa: null }) });
  if (!fichas.length) return null;
  return (
    <div className="fichas-activas">
      <span className="fichas-activas-tit">Selección</span>
      {fichas.map((f, i) => (
        <button key={i} type="button" className="tag tag-light-primary" onClick={f.quitar}
          title={'Quitar ' + f.etiqueta + ': ' + f.texto}
          aria-label={'Quitar ' + f.etiqueta + ': ' + f.texto}>
          <span>{f.etiqueta}: {f.texto}</span>
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
/*  Resultado de la consulta                                            */
/* =================================================================== */

function FichaPrograma({ programa, campo }) {
  const c = CAMPOS[campo];
  const p = P.programas[programa];
  return (
    <section className="card card-lg mb-4" aria-label="Programa consultado">
      <div className="card-body">
        <div className="ficha-programa">
          <div>
            <div className="ficha-rotulo">Programa consultado</div>
            <h3 className="ficha-nombre">{p.nombre}</h3>
            <ul className="ficha-datos">
              <li><Icono nombre="tag" />SNIES {p.codigo}</li>
              <li><Icono nombre="account_balance" />{P.ies[p.ies].nombre}</li>
              <li><Icono nombre="school" />{nivelDe(p).nombre}</li>
              <li><Icono nombre="co_present" />{p.modalidad}</li>
            </ul>
          </div>
          <div className="ficha-campo">
            <div className="ficha-campo-codigo">Campo de formación</div>
            <p className="ficha-campo-nombre">{c.nombre}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Indicadores({ campo, linea }) {
  const c = CAMPOS[campo];
  const L = DEF.lineas[linea];
  return (
    <section className="row row-cols-1 row-cols-sm-2 row-cols-xl-4 g-4"
      aria-label="Indicadores del programa" style={{ marginBottom: '1.5rem' }}>
      <div className="col">
        <Kpi icono="speed" familia="secondary" etiqueta="Índice de pertinencia"
          valor={num(c.ip)} pie="Escala de 0 a 100" />
      </div>
      <div className="col">
        <Kpi icono="work" familia="info" etiqueta="Ocupaciones habilitadas"
          valor={num(c.dir + c.comp)} pie={plural(c.dir, 'directa', 'directas') + ' y ' + plural(c.comp, 'complementaria', 'complementarias')} />
      </div>
      <div className="col">
        <Kpi icono="hub" familia="tertiary-pink" etiqueta="Ocupaciones relacionadas con la ciudad"
          valor={num(c.relDir + c.relComp)} pie={plural(c.relDir, 'directa', 'directas') + ' y ' + plural(c.relComp, 'complementaria', 'complementarias')} />
      </div>
      <div className="col">
        <Kpi icono="military_tech" familia="primary" etiqueta={'Puntaje PUAP en ' + (linea === 'pregrado' ? 'pregrado' : L.nombre)}
          valor={num(c.puntaje[linea]) + ' puntos'} pie={L.corto} />
      </div>
    </section>
  );
}

/** Tabla de las ocupaciones que habilita el campo, agrupadas en directas y
    complementarias; dentro de cada grupo van primero las relacionadas, en
    orden alfabético. Un clic en la fila despliega la descripción de la CUOC. */
function TablaOcupaciones({ campo, numero }) {
  const [soloRel, setSoloRel] = useState(false);
  const [abierta, setAbierta] = useState(null);
  const [todas, setTodas] = useState(false);
  const LIMITE = 20;

  const filas = useMemo(() => habilitadas(campo), [campo]);
  const visibles = useMemo(() => {
    const f = soloRel ? filas.filter(x => x.relacionada) : filas.slice();
    f.sort((a, b) => (b.directa ? 1 : 0) - (a.directa ? 1 : 0) ||
      (b.relacionada ? 1 : 0) - (a.relacionada ? 1 : 0) ||
      a.nombre.localeCompare(b.nombre, 'es'));
    return f;
  }, [filas, soloRel]);

  useEffect(() => { setAbierta(null); setTodas(false); }, [campo, soloRel]);

  const csv = () => ({
    encabezados: ['Campo', 'Campo detallado', 'Código CUOC', 'Ocupación', 'Habilitación', 'Peso', 'Relacionada', 'Referentes', 'Descripción'],
    filas: visibles.map(f => [CAMPOS[campo].codigo, CAMPOS[campo].nombre, f.codigo, f.nombre,
      f.directa ? 'Directa' : 'Complementaria', f.peso, f.relacionada ? 'Sí' : 'No',
      f.referentes.join(' | '), f.descripcion])
  });

  const c = CAMPOS[campo];
  const mostradas = todas ? visibles : visibles.slice(0, LIMITE);
  const nDir = visibles.filter(f => f.directa).length;
  const nRel = visibles.filter(f => f.relacionada).length;

  return (
    <Ficha titulo="Ocupaciones a las que da acceso el programa" numero={numero}
      accion={<Descargas csv={csv} nombre={'ocupaciones_' + c.codigo} />}>
      <div className="tabla-resumen">
        <span>{plural(filas.length, 'ocupación', 'ocupaciones')}, {num(c.relDir + c.relComp)} relacionadas con los clústeres y proyectos de ciudad.</span>
        <div className="form-check ms-auto">
          <input className="form-check-input" type="checkbox" id="solo-rel" checked={soloRel}
            onChange={e => setSoloRel(e.target.checked)} />
          <label className="form-check-label" htmlFor="solo-rel">Solo las relacionadas</label>
        </div>
      </div>
      {visibles.length === 0 ? <SinDatos texto="El campo no habilita ocupaciones relacionadas." /> : (
        <div className="tabla-marco">
          <table className="tabla-ocup">
            <thead>
              <tr>
                <th className="izq">Código</th>
                <th className="izq">Ocupación</th>
                <th>Relacionada</th>
                <th className="izq">Clústeres y proyectos</th>
                <th aria-label="Detalle" />
              </tr>
            </thead>
            <tbody>
              {mostradas.map((f, i) => {
                const grupo = i === 0 || mostradas[i - 1].directa !== f.directa;
                const abierto = abierta === f.codigo;
                const nGrupo = f.directa ? nDir : visibles.length - nDir;
                return (
                  <Fragment key={f.codigo}>
                    {grupo ? (
                      <tr className="grupo">
                        <td colSpan={5}>
                          <b>{f.directa ? 'Habilitación directa' : 'Habilitación complementaria'}</b>
                          <span>{plural(nGrupo, 'ocupación', 'ocupaciones')} con peso {f.directa ? '1,0' : '0,5'}</span>
                        </td>
                      </tr>
                    ) : null}
                    <tr className={'fila' + (abierto ? ' abierta' : '') + (f.relacionada ? '' : ' tenue')}
                      onClick={() => setAbierta(a => (a === f.codigo ? null : f.codigo))}
                      aria-expanded={abierto}>
                      <td className="izq codigo">{f.codigo}</td>
                      <td className="izq nombre">{f.nombre}</td>
                      <td className="marca">
                        {f.relacionada
                          ? <Icono nombre="check_circle" className="marca-si" />
                          : <span className="marca-no" />}
                      </td>
                      <td className="izq">
                        {f.referentes.length
                          ? <span className="etiquetas">{f.referentes.map(r => <span className="etiqueta" key={r}>{r}</span>)}</span>
                          : null}
                      </td>
                      <td className="flecha"><Icono nombre="expand_more" /></td>
                    </tr>
                    {abierto ? (
                      <tr className="detalle">
                        <td colSpan={5}>{f.descripcion || 'Sin descripción disponible.'}</td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="tabla-pie">
        <span className="nota-grafico">
          {todas || visibles.length <= LIMITE
            ? 'Un clic en una fila muestra la descripción de la ocupación.'
            : 'Se muestran ' + num(LIMITE) + ' de ' + plural(visibles.length, 'ocupación', 'ocupaciones') + '. Un clic en una fila muestra su descripción.'}
        </span>
        {visibles.length > LIMITE ? (
          <button type="button" className="btn-filtro" onClick={() => setTodas(v => !v)}>
            <Icono nombre={todas ? 'expand_less' : 'expand_more'} />
            {todas ? 'Ver menos' : 'Ver las ' + num(visibles.length - LIMITE) + ' restantes'}
          </button>
        ) : null}
      </div>
    </Ficha>
  );
}

/** Cierre en tres paneles: las ocupaciones del campo, el índice y el puntaje. */
function Calculo({ campo, linea }) {
  const c = CAMPOS[campo];
  const L = DEF.lineas[linea];
  const filas = P.puntajes[linea];
  const numerador = c.relDir * 1 + c.relComp * 0.5;
  const denominador = c.dir * 1 + c.comp * 0.5;
  const pop = denominador ? numerador / denominador : 0;
  const ip = Math.ceil(pop * 100 - 1e-9);
  const celda = (valor, rotulo, clase) => (
    <div className={'conteo ' + clase}>
      <div className="conteo-valor">{num(valor)}</div>
      <div className="conteo-rotulo">{rotulo}</div>
    </div>
  );
  return (
    <Ficha titulo="¿Cómo se calculan el índice y el puntaje?">
      <div className="cierre">
        <section className="panel">
          <div className="panel-tit">Ocupaciones del campo</div>
          <div className="conteos">
            {celda(c.relDir, 'directas relacionadas', 'dir rel')}
            {celda(c.dir - c.relDir, 'directas no relacionadas', 'dir')}
            {celda(c.relComp, 'complementarias relacionadas', 'comp rel')}
            {celda(c.comp - c.relComp, 'complementarias no relacionadas', 'comp')}
          </div>
        </section>

        <section className="panel">
          <div className="panel-tit">Índice de pertinencia</div>
          <div className="formula">
            <div className="formula-fila">
              <span className="formula-sigla">POP</span>
              <span>=</span>
              <span className="fraccion">
                <span>1,0 × <span className="rel">{num(c.relDir)}</span> + 0,5 × <span className="rel">{num(c.relComp)}</span></span>
                <span>1,0 × <span className="dir">{num(c.dir)}</span> + 0,5 × <span className="comp">{num(c.comp)}</span></span>
              </span>
              <span>=</span>
              <span className="fraccion">
                <span>{dec(numerador, 1)}</span>
                <span>{dec(denominador, 1)}</span>
              </span>
              <span>=</span>
              <span className="formula-resultado">{denominador ? dec(pop, 4) : '0'}</span>
            </div>
            <div className="formula-fila">
              <span className="formula-sigla">IP</span>
              <span>=</span>
              <span>⌈100 × {denominador ? dec(pop, 4) : '0'}⌉</span>
              <span>=</span>
              <span className="formula-resultado">{num(ip)}</span>
              {ip !== c.ip ? <span className="small text-danger">Difiere del anexo 4 ({num(c.ip)}); revise la tabla.</span> : null}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-tit">Puntaje en {linea === 'pregrado' ? 'la línea de pregrado' : L.nombre}</div>
          <div className="puntaje-caja">
            <div>
              <div className="linea-nombre">{L.nombre}</div>
              <span className="linea-corto">{L.corto}</span>
            </div>
            <div className="linea-puntos">{num(c.puntaje[linea])}</div>
          </div>
          <ul className="escala">
            {filas.map(f => {
              const r = rango(f.indice);
              const activa = c.ip >= r[0] && c.ip <= r[1];
              return (
                <li key={f.indice} className={activa ? 'activa' : ''}>
                  <span>{f.indice}</span>
                  <b>{num(f.puntaje)}</b>
                </li>
              );
            })}
          </ul>
          <p className="panel-nota">{L.regla}</p>
        </section>
      </div>
      <p className="nota-grafico mt-3">{DEF.aviso}</p>
    </Ficha>
  );
}

function Vacio() {
  return (
    <section className="card card-lg mb-4" aria-label="Sin selección">
      <div className="card-body">
        <div className="vacio">
          <Icono nombre="manage_search" />
          <div className="vacio-tit">Elija la institución y el programa</div>
          <p className="vacio-txt">
            Verá las ocupaciones a las que da acceso, su índice de pertinencia y su puntaje en el PUAP.
          </p>
        </div>
      </div>
    </section>
  );
}

/* =================================================================== */
/*  Aplicación                                                          */
/* =================================================================== */

const SEL_BASE = { ies: null, programa: null };

function App() {
  const [sel, setSel] = useState(SEL_BASE);
  const resultado = useRef(null);
  const primera = useRef(true);

  /* Cambiar la institución suelta un programa que no sea suyo; elegir un
     programa de otra institución ajusta la institución. */
  const cambiar = parcial => setSel(s => {
    const n = Object.assign({}, s, parcial);
    if ('programa' in parcial && parcial.programa !== null) n.ies = P.programas[parcial.programa].ies;
    if ('ies' in parcial && s.programa !== null &&
        (parcial.ies === null || P.programas[s.programa].ies !== parcial.ies)) n.programa = null;
    return n;
  });
  const limpiar = () => setSel(SEL_BASE);

  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    if (sel.programa !== null && resultado.current) {
      resultado.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [sel.programa]);

  useEffect(() => {
    const raiz = document.getElementById('root');
    if (raiz) raiz.dataset.montado = '1';
  }, []);

  const programa = sel.programa;
  const campo = programa !== null ? P.programas[programa].campo : null;
  const linea = programa !== null ? lineaDe(P.programas[programa]) : null;

  return (
    <Fragment>
      <div className="body container-fluid p-4 p-xl-8">
        <div className="row g-4">
          <div className="col-12"><Metodologia /></div>
        </div>

        <Consulta sel={sel} cambiar={cambiar} limpiar={limpiar} />
        <FichasActivas sel={sel} cambiar={cambiar} limpiar={limpiar} />

        <div ref={resultado} style={{ scrollMarginTop: '1rem' }}>
          {campo === null ? <Vacio /> : (
            <Fragment>
              <FichaPrograma programa={programa} campo={campo} />
              <Indicadores campo={campo} linea={linea} />
              <div className="row g-4">
                <div className="col-12"><TablaOcupaciones campo={campo} /></div>
              </div>
              <div className="row g-4">
                <div className="col-12"><Calculo campo={campo} linea={linea} /></div>
              </div>
            </Fragment>
          )}
        </div>
      </div>
    </Fragment>
  );
}

/* =================================================================== */
/*  Versión resumida para incrustar en la página web (resumen.html)     */
/* =================================================================== */

/** Franja de título: banda azul oscuro con motas y los tres triángulos. */
const MOTAS = [[33.4,19.3,2.6],[6.7,78.3,1],[37.5,11.1,2.2],[22.8,13.6,1.8],[8.8,14.0,1.8],[7.7,55.8,1.2],[63.2,57.3,1],[58.0,40.9,1.2],[6.5,81.5,1.4],[42.7,53.6,2.2],[31.9,77.8,1.2],[12.0,56.3,1.2],[38.1,54.2,1],[56.7,60.5,1.8],[68.0,43.6,1.4],[47.2,87.3,1.4],[31.1,75.9,2.6],[77.6,13.2,1.4],[52.9,83.0,2.6],[45.5,59.6,1],[13.5,42.8,1.4],[16.7,49.0,1],[95.3,12.8,2.2],[57.6,83.0,1.4],[35.0,36.8,1.8],[58.2,46.1,1],[93.6,47.7,2.6],[8.3,70.3,1.4],[64.8,93.4,1.8],[29.6,39.9,2.6],[35.7,88.8,1.4],[18.3,16.3,1],[23.2,31.3,2.6],[26.0,40.4,1.8],[9.8,45.5,2.2],[29.0,18.0,1.8],[85.8,30.5,1.8],[97.7,66.1,1.8],[94.9,19.3,1.2],[16.7,63.9,1],[49.0,57.8,1.4],[29.3,18.8,2.2],[37.8,55.8,1.2],[69.0,51.4,2.2],[65.5,71.1,1.8],[89.3,74.6,2.6],[79.4,40.5,1.8],[40.2,48.4,1.8],[8.0,11.9,1.2],[44.7,15.7,2.2],[7.1,6.0,1.2],[54.1,89.5,2.2],[4.5,82.9,2.2],[38.5,61.8,1.4],[60.4,47.7,1],[84.3,93.4,1.8],[48.6,33.4,1.2],[11.9,36.2,1.4],[48.4,66.9,2.2],[4.2,89.7,2.2],[37.1,66.7,1],[75.5,32.2,2.6],[85.7,67.3,1.4],[52.3,85.9,1.4],[76.9,52.9,2.2],[34.0,25.6,1.2],[80.2,78.0,2.6],[79.9,23.6,1.8],[36.5,8.6,1],[78.6,47.6,1.2]];
const ESTRELLAS = [[22,52],[48,24],[66,72],[88,38],[94,66]];

function Franja() {
  const t = (DEF.encabezado || {}).titulo || 'Medida de pertinencia';
  return (
    <div className="franja">
      <div className="franja-banda" role="heading" aria-level="1">
        <svg className="franja-motas" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {MOTAS.map((m, i) => <circle key={i} cx={m[0]} cy={m[1]} r={m[2] * .28} fill="#fff" opacity={.55 + (m[2] % 1)} />)}
        </svg>
        <svg className="franja-estrellas" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          {ESTRELLAS.map((e, i) => (
            <path key={i} d={'M' + (e[0] * 10) + ' ' + (e[1] - 7) + ' l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z'} fill="#fff" opacity=".9" />
          ))}
        </svg>
        <span className="franja-circulo" aria-hidden="true" />
        <span className="franja-titulo">{t}</span>
      </div>
      <svg className="franja-triangulos" viewBox="0 0 200 110" aria-hidden="true">
        <polygon points="4,40 62,24 34,92" fill="#F36522" />
        <polygon points="70,18 150,100 56,98" fill="#9F339E" />
        <polygon points="152,20 198,30 174,78" fill="#F8DB1B" />
      </svg>
    </div>
  );
}

function Resumen({ completo }) {
  const [sel, setSel] = useState(SEL_BASE);
  const [girada, setGirada] = useState(false);

  const cambiar = parcial => setSel(s => {
    const n = Object.assign({}, s, parcial);
    if ('programa' in parcial && parcial.programa !== null) n.ies = P.programas[parcial.programa].ies;
    if ('ies' in parcial && s.programa !== null &&
        (parcial.ies === null || P.programas[s.programa].ies !== parcial.ies)) n.programa = null;
    return n;
  });

  useEffect(() => {
    const raiz = document.getElementById('root');
    if (raiz) raiz.dataset.montado = '1';
  }, []);

  const programas = useMemo(() => {
    const todos = P.programas.map((p, i) => i);
    return sel.ies === null ? todos : todos.filter(i => P.programas[i].ies === sel.ies);
  }, [sel.ies]);
  const instituciones = useMemo(() => {
    const con = {};
    P.programas.forEach(p => { con[p.ies] = 1; });
    return Object.keys(con).map(Number).sort((a, b) => P.ies[a].nombre.localeCompare(P.ies[b].nombre, 'es'));
  }, []);

  const i = sel.programa;
  const p = i !== null ? P.programas[i] : null;
  const campo = p ? p.campo : null;
  const c = campo !== null ? CAMPOS[campo] : null;
  const linea = p ? lineaDe(p) : null;
  const L = linea ? DEF.lineas[linea] : null;

  const numerador = c ? c.relDir + c.relComp * 0.5 : 0;
  const denominador = c ? c.dir + c.comp * 0.5 : 0;
  const pop = denominador ? numerador / denominador : 0;

  return (
    <div className="resumen">
      {completo ? <Metodologia numero={1} /> : null}
      {completo ? <Referentes numero={2} /> : null}
      {completo ? (
        <div className="titulo-seccion"><Numero n={3} /><h3 className="card-title mb-0">Consulte su programa</h3></div>
      ) : null}
      <div className="resumen-consulta filtros">
        <div>
          <label className="form-label rotulo-campo" htmlFor="sel-institucion">Institución</label>
          <Selector etiqueta="Institución" opciones={instituciones} valor={sel.ies}
            onCambio={v => cambiar({ ies: v })} rotulo={k => P.ies[k].nombre}
            resumenVacio="Todas las instituciones" ancho buscador />
        </div>
        <div>
          <label className="form-label rotulo-campo" htmlFor="sel-programa-academico">Programa académico</label>
          <Selector etiqueta="Programa académico" opciones={programas} valor={sel.programa}
            onCambio={v => cambiar({ programa: v })} rotulo={k => P.programas[k].nombre}
            secundario={k => 'SNIES: ' + P.programas[k].codigo + '. ' + P.ies[P.programas[k].ies].nombre}
            resumenVacio="Seleccione un programa" ancho buscador />
        </div>
        {completo ? (
          <button type="button" className="btn-filtro" onClick={() => setSel(SEL_BASE)}
            disabled={sel.ies === null && sel.programa === null}>
            <Icono nombre="ink_eraser" />Limpiar
          </button>
        ) : null}
      </div>
      {completo ? <FichasActivas sel={sel} cambiar={cambiar} limpiar={() => setSel(SEL_BASE)} /> : null}

      {!p ? (
        <div className="card card-lg resumen-vacio">
          <div className="vacio">
            <Icono nombre="manage_search" />
            <div className="vacio-tit">Elija la institución y el programa</div>
            <p className="vacio-txt">Verá las ocupaciones a las que da acceso, su índice de pertinencia y su puntaje en el PUAP.</p>
          </div>
        </div>
      ) : (
        <Fragment>
          <div className="card card-lg resumen-ficha">
            <div>
              <div className="ficha-rotulo">Programa consultado</div>
              <div className="ficha-nombre">{p.nombre}</div>
              {completo ? (
                <ul className="ficha-datos">
                  <li><Icono nombre="tag" />SNIES {p.codigo}</li>
                  <li><Icono nombre="account_balance" />{P.ies[p.ies].nombre}</li>
                  <li><Icono nombre="school" />{nivelDe(p).nombre}</li>
                  <li><Icono nombre="co_present" />{p.modalidad}</li>
                </ul>
              ) : null}
            </div>
            <div className="ficha-campo">
              <div className="ficha-campo-codigo">Campo de formación</div>
              <p className="ficha-campo-nombre">{c.nombre}</p>
            </div>
          </div>

          <div className="resumen-kpis">
            <Kpi icono="speed" familia="warning" etiqueta="Índice de pertinencia" valor={num(c.ip)} pie="Escala de 0 a 100" />
            <Kpi icono="work" familia="secondary" etiqueta="Ocupaciones habilitadas" valor={num(c.dir + c.comp)}
              pie={<Fragment><em className="n hd">{num(c.dir)}</em> {c.dir === 1 ? 'directa' : 'directas'} y <em className="n hc">{num(c.comp)}</em> {c.comp === 1 ? 'complementaria' : 'complementarias'}</Fragment>} />
            <Kpi icono="hub" familia="tertiary-pink" etiqueta="Ocupaciones relacionadas con la ciudad" valor={num(c.relDir + c.relComp)}
              pie={<Fragment><em className="n rd">{num(c.relDir)}</em> {c.relDir === 1 ? 'directa' : 'directas'} y <em className="n rc">{num(c.relComp)}</em> {c.relComp === 1 ? 'complementaria' : 'complementarias'}</Fragment>} />
            <Kpi icono="military_tech" familia="primary" etiqueta={'Puntaje PUAP en ' + (linea === 'pregrado' ? 'pregrado' : L.nombre)}
              valor={num(c.puntaje[linea]) + ' puntos'} pie={L.corto} />
          </div>

          <section className="card card-lg resumen-calculo">
            <div className="card-header d-flex align-items-center gap-2"><Numero n={completo ? 4 : null} /><h3 className="card-title mb-0">¿Cómo se calculan el índice y el puntaje?</h3></div>
            <div className="card-body resumen-cuerpo">
              <div className="resumen-nivel">
                <div className="calculo-tit">Índice de pertinencia del campo</div>
                <div className="formula">
                  <div className="formula-fila">
                    <span className="formula-sigla">POP</span><span>=</span>
                    <span className="fraccion">
                      <span>1,0 × <em className="valor n rd">{num(c.relDir)}</em> relacionadas directas + 0,5 × <em className="valor n rc">{num(c.relComp)}</em> relacionadas complementarias</span>
                      <span>1,0 × <em className="valor n hd">{num(c.dir)}</em> habilitadas directas + 0,5 × <em className="valor n hc">{num(c.comp)}</em> habilitadas complementarias</span>
                    </span>
                    <span>=</span>
                    <span className="fraccion"><span>{dec(numerador, 1)}</span><span>{dec(denominador, 1)}</span></span>
                    <span>=</span><span className="formula-resultado resultado-pop">{denominador ? dec(pop, 4) : '0'}</span>
                  </div>
                  <div className="formula-fila">
                    <span className="formula-sigla">IP</span><span>=</span>
                    <span>⌈100 × <em className="valor pop">{denominador ? dec(pop, 4) : '0'}</em>⌉</span><span>=</span>
                    <span className="formula-resultado resultado-ip">{num(c.ip)}</span>
                  </div>
                </div>
              </div>
              <div className="resumen-nivel">
                <div className="resumen-puntaje">
                  <div className="mitad">
                    <div className="calculo-tit">Relación entre el índice de pertinencia y el puntaje</div>
                    <table className="tabla-escala">
                      <thead><tr><th>Índice de pertinencia</th><th>Puntaje</th></tr></thead>
                      <tbody>
                        {P.puntajes[linea].map(f => {
                          const r = rango(f.indice);
                          return (
                            <tr key={f.indice} className={c.ip >= r[0] && c.ip <= r[1] ? 'activa' : ''}>
                              <td>{String(f.indice).split(',')[0] === '0' ? '0' : String(f.indice)}</td>
                              <td>{num(f.puntaje)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mitad">
                  <div className="calculo-tit">Puntaje en {linea === 'pregrado' ? 'la línea de pregrado' : L.nombre}</div>
                  <div className="puntaje-caja">
                    <div>
                      <div className="linea-nombre">{L.nombre}</div>
                      <span className="linea-corto">{L.corto}</span>
                    </div>
                    <div className="linea-puntos">{num(c.puntaje[linea])}</div>
                  </div>
                  <table className="tabla-resumen-final">
                    <tbody>
                      <tr><td>Ocupaciones habilitadas</td><td className="hab">{num(c.dir + c.comp)}</td></tr>
                      <tr><td>Ocupaciones relacionadas con la ciudad</td><td className="rel">{num(c.relDir + c.relComp)}</td></tr>
                      <tr><td>Proporción ponderada, POP</td><td className="pop">{denominador ? dec(pop, 4) : '0'}</td></tr>
                      <tr><td>Índice de pertinencia</td><td className="ip">{num(c.ip)}</td></tr>
                      <tr><td>Puntaje en {linea === 'pregrado' ? 'pregrado' : L.nombre}</td><td className="pts">{num(c.puntaje[linea])}</td></tr>
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {completo ? <p className="nota-grafico text-start resumen-aviso">{DEF.aviso}</p> : null}
          {completo ? <TablaOcupaciones campo={campo} numero={5} /> : null}

          <div className={'giro' + (girada ? ' girada' : '')}>
            <div className="giro-interior">
              <button type="button" className="giro-cara giro-frente" onClick={() => setGirada(true)} aria-expanded={girada}>
                {completo ? <Numero n={6} /> : <Icono nombre="help" />}
                <span className="giro-tit">{(DEF.significados || {}).titulo}</span>
                <span className="giro-pista">{(DEF.significados || {}).pista}</span>
              </button>
              <div className="giro-cara giro-dorso" aria-hidden={!girada}>
                <div className="giro-dorso-cabeza">
                  <span className="d-inline-flex align-items-center gap-2">{completo ? <Numero n={6} /> : null}<span className="giro-tit">{(DEF.significados || {}).titulo}</span></span>
                  <button type="button" className="btn-filtro" onClick={() => setGirada(false)}>
                    <Icono nombre="undo" />{(DEF.significados || {}).volver}
                  </button>
                </div>
                <dl className="significados">
                  {((DEF.significados || {}).items || []).map(d => (
                    <div key={d.clave} className={'significado ' + d.clave}>
                      <dt>{d.nombre}</dt>
                      <dd>{d.texto}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </Fragment>
      )}
    </div>
  );
}

const RAIZ = document.getElementById('root');
ReactDOM.createRoot(RAIZ).render(RAIZ.dataset.modo === 'completo' ? <Resumen completo /> : RAIZ.dataset.modo === 'resumen' ? <Resumen /> : <App />);
