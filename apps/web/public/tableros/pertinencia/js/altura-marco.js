/*
 * Altura del tablero para la página que lo incrusta en un marco.
 *
 * Cuando el tablero va dentro de un <iframe> de otro sitio (el bloque de
 * WordPress de la medida de pertinencia en sapiencia.gov.co), esa página no
 * puede medir su contenido. Este script le avisa el alto con postMessage:
 * { tipo: 'pe-tablero-alto', alto: N }. El bloque solo acepta el mensaje de su
 * propio marco y de este sitio (ver apps/web/pertinencia/LEEME.md).
 *
 * No cambia nada de la apariencia ni del funcionamiento del tablero. Si el
 * tablero no está dentro de un marco, no hace nada.
 *
 * Se mide igual que en el bloque: <body>, <main> y #root se estiran al alto
 * del marco (min-height: 100%), así que cuenta el borde inferior de los bloques
 * de #root y el de las listas desplegables abiertas (position: absolute), que
 * si no quedarían recortadas por el borde del marco.
 */
(function () {
  'use strict';
  if (window.parent === window) return;
  var raiz = document.getElementById('root');
  if (!raiz || typeof window.ResizeObserver !== 'function') return;

  var TIPO = 'pe-tablero-alto';
  var AIRE = 16;
  var ultimo = 0;
  var pendiente = false;

  function medir() {
    pendiente = false;
    var piezas = Array.prototype.slice.call(raiz.children)
      .concat(Array.prototype.slice.call(raiz.querySelectorAll('.dropdown-menu.show')));
    if (piezas.length === 0) return;
    var fondo = 0;
    piezas.forEach(function (p) { fondo = Math.max(fondo, p.getBoundingClientRect().bottom); });
    var alto = Math.ceil(fondo + (window.scrollY || 0) + AIRE);
    if (alto === ultimo || alto < 1) return;
    ultimo = alto;
    // El dato es solo un número, así que se envía a cualquier página que lo incruste
    // (sapiencia.gov.co con o sin www, o una de pruebas).
    window.parent.postMessage({ tipo: TIPO, alto: alto }, '*');
  }

  // Con un temporizador y no con requestAnimationFrame: Chrome no anima los
  // marcos de otro sitio que están fuera de la pantalla, y el aviso llegaría
  // solo cuando el usuario baja hasta el tablero (el espacio saltaría ahí).
  function programar() {
    if (pendiente) return;
    pendiente = true;
    window.setTimeout(medir, 50);
  }

  var tamano = new ResizeObserver(programar);
  function observarHijos() {
    tamano.disconnect();
    Array.prototype.forEach.call(raiz.children, function (h) { tamano.observe(h); });
    programar();
  }
  new MutationObserver(observarHijos).observe(raiz, { childList: true, subtree: true });
  window.addEventListener('resize', programar);
  observarHijos();
})();
