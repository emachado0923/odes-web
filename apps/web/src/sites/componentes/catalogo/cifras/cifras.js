(function () {
  'use strict';
  /* Fichas de cifras (OdeS). Con mouse giran al pasar el cursor y con teclado al llegar a ellas (eso lo hace el
     CSS). En pantallas tactiles no hay cursor: un toque gira la ficha y otro la devuelve; al girar una, las demas
     vuelven al frente, y un toque fuera de las fichas las devuelve todas.
     En el reverso, la fuente y la fecha de corte van cada una en una sola linea: se mide la mas larga de cada
     ficha y se baja la letra de las dos lo justo para que quepa, sin bajar de LETRA_MINIMA_DATOS (si no cabe ni
     asi, se queda en ese tamano y pasa a la linea siguiente). Se vuelve a medir cuando cambia el ancho y cuando
     termina de cargar la letra. */
  var raiz = document.getElementById('odes-cifras');
  if (!raiz || raiz.getAttribute('data-odes-listo') === 'si') { return; }
  raiz.setAttribute('data-odes-listo', 'si');

  var LETRA_MINIMA_DATOS = 7;
  var fichas = Array.prototype.slice.call(raiz.querySelectorAll('.odes-cifra'));
  var lista = raiz.querySelector('.odes-ci__lista');
  if (!fichas.length || !lista) { return; }

  function ajustarDatos() {
    Array.prototype.forEach.call(raiz.querySelectorAll('.odes-cifra__datos'), function (datos) {
      datos.style.fontSize = '';
      datos.classList.add('odes-cifra__datos--linea');
      var disponible = datos.clientWidth;
      var mayor = 0;
      Array.prototype.forEach.call(datos.children, function (linea) { mayor = Math.max(mayor, linea.offsetWidth); });
      if (!disponible || mayor <= disponible) { return; }
      var base = parseFloat(window.getComputedStyle(datos).fontSize);
      var letra = Math.floor(base * disponible / mayor * 10) / 10;
      if (letra < LETRA_MINIMA_DATOS) {
        letra = LETRA_MINIMA_DATOS;
        datos.classList.remove('odes-cifra__datos--linea');
      }
      datos.style.fontSize = letra + 'px';
    });
  }

  ajustarDatos();
  if (window.ResizeObserver) {
    var ancho = lista.clientWidth;
    new ResizeObserver(function () {
      if (lista.clientWidth === ancho) { return; }
      ancho = lista.clientWidth;
      ajustarDatos();
    }).observe(lista);
  } else {
    window.addEventListener('resize', ajustarDatos);
  }
  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(ajustarDatos); }

  if (!window.matchMedia) { return; }
  var conMouse = window.matchMedia('(hover: hover)');
  function devolver(excepto) {
    fichas.forEach(function (ficha) { if (ficha !== excepto) { ficha.classList.remove('odes-cifra--girada'); } });
  }
  fichas.forEach(function (ficha) {
    ficha.addEventListener('click', function () {
      if (conMouse.matches) { return; }
      devolver(ficha);
      ficha.classList.toggle('odes-cifra--girada');
    });
  });
  document.addEventListener('click', function (evento) {
    if (!evento.target.closest || !evento.target.closest('#odes-cifras .odes-cifra')) { devolver(null); }
  });
})();
