(function () {
  'use strict';
  /* Accesos del Observatorio (OdeS): un boton redondo abajo a la izquierda que se abre en una barra con tres
     accesos. Dos maneras de abrirse (data-odes-ac-modo en el nav):
       cursor  se abre al pasar el cursor (eso lo hace el CSS) o al tocar el boton; se cierra al tocar fuera o
               con Escape.
       pagina  esta abierto arriba de la pagina, se encoge al bajar y se vuelve a abrir al subir. Tocar el boton
               tambien lo abre o lo cierra. Mientras el foco o el cursor esten en la barra, bajar no la cierra.
     Si la pagina se desplaza dentro de un contenedor (como en la vista previa de /componentes), escucha a ese
     contenedor; si no, a la ventana. Sirve para varios botones en la misma pagina: cada uno se inicia una vez. */
  var ARRIBA = 120;
  var UMBRAL = 8;

  function contenedorDe(elemento) {
    var actual = elemento.parentElement;
    while (actual && actual !== document.body && actual !== document.documentElement) {
      var desborde = window.getComputedStyle(actual).overflowY;
      if ((desborde === 'auto' || desborde === 'scroll') && actual.scrollHeight > actual.clientHeight) { return actual; }
      actual = actual.parentElement;
    }
    return window;
  }

  function posicion(contenedor) {
    if (contenedor !== window) { return contenedor.scrollTop; }
    return window.pageYOffset || document.documentElement.scrollTop || 0;
  }

  function iniciar(nav) {
    if (nav.getAttribute('data-odes-listo') === 'si') { return; }
    var boton = nav.querySelector('.odes-ac__boton');
    if (!boton) { return; }
    nav.setAttribute('data-odes-listo', 'si');
    var modo = nav.getAttribute('data-odes-ac-modo') === 'pagina' ? 'pagina' : 'cursor';

    function abierto() { return nav.hasAttribute('data-abierto'); }
    function poner(valor) {
      if (valor) { nav.setAttribute('data-abierto', ''); } else { nav.removeAttribute('data-abierto'); }
      boton.setAttribute('aria-expanded', valor ? 'true' : 'false');
    }
    function ocupado() {
      return nav.contains(document.activeElement) || (nav.matches && nav.matches(':hover'));
    }

    boton.addEventListener('click', function () { poner(!abierto()); });

    /* Escape cierra y, si el foco estaba en la barra, lo devuelve al boton. Si el boton ya no esta en la
       pagina (la vista previa cambio de version), el oyente se quita solo. */
    var alTeclado = function (evento) {
      if (!nav.isConnected) { document.removeEventListener('keydown', alTeclado); return; }
      if (evento.key !== 'Escape' || !abierto()) { return; }
      var adentro = nav.contains(document.activeElement);
      poner(false);
      if (adentro) { boton.focus(); }
    };
    document.addEventListener('keydown', alTeclado);

    if (modo === 'cursor') {
      var alTocarFuera = function (evento) {
        if (!nav.isConnected) { document.removeEventListener('click', alTocarFuera); return; }
        if (abierto() && !nav.contains(evento.target)) { poner(false); }
      };
      document.addEventListener('click', alTocarFuera);
      poner(false);
    } else {
      var contenedor = contenedorDe(nav);
      var ultima = posicion(contenedor);
      var pendiente = false;
      var revisar = function () {
        pendiente = false;
        var actual = posicion(contenedor);
        var cambio = actual - ultima;
        if (actual < ARRIBA) {
          poner(true);
          ultima = actual;
        } else if (cambio > UMBRAL) {
          if (!ocupado()) { poner(false); }
          ultima = actual;
        } else if (cambio < -UMBRAL) {
          poner(true);
          ultima = actual;
        }
      };
      var alDesplazar = function () {
        if (!nav.isConnected) { contenedor.removeEventListener('scroll', alDesplazar); return; }
        if (pendiente) { return; }
        pendiente = true;
        window.requestAnimationFrame(revisar);
      };
      contenedor.addEventListener('scroll', alDesplazar, { passive: true });
      poner(ultima < ARRIBA);
    }

    /* Las transiciones se encienden despues del primer cuadro: al cargar, el boton aparece ya en su estado. */
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () { nav.classList.add('odes-ac--listo'); });
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-odes-accesos]'), iniciar);
})();
