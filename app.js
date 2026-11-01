// Manitu v0.1: las pantallas, el ayudante (el "bot" dentro de la app) y el Deshacer.
// Los datos se guardan en este móvil (localStorage). En la v0.2 irán también a Google.

(function () {
  const C = window.Cuentas;
  const CLAVE = 'manitu-v1';

  // ---------- Los datos ----------

  function datosVacios() { return { version: 1, perfil: null, trabajos: [], siguiente_id: 1 }; }

  function cargar() {
    try {
      const texto = localStorage.getItem(CLAVE);
      return texto ? JSON.parse(texto) : datosVacios();
    } catch (e) { return datosVacios(); }
  }

  let datos = cargar();
  const pilaDeshacer = []; // fotos de cómo estaban los datos antes de cada cambio

  function escribir() {
    try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch (e) { /* sin almacén: sigue en memoria */ }
  }

  // Todo cambio pasa por aquí: guarda una foto para poder deshacerlo.
  function cambiar(texto, fn) {
    pilaDeshacer.push(JSON.stringify(datos));
    if (pilaDeshacer.length > 30) pilaDeshacer.shift();
    fn();
    escribir();
    avisar(texto, true);
  }

  function deshacer() {
    const antes = pilaDeshacer.pop();
    if (!antes) return;
    datos = JSON.parse(antes);
    escribir();
    // Si la pantalla mostraba algo que ya no existe, volvemos al inicio.
    if (vista.id && !buscarTrabajo(vista.id)) vista = { pantalla: datos.perfil ? 'inicio' : 'alta' };
    if (!datos.perfil) vista = { pantalla: 'alta' };
    else if (vista.pantalla === 'alta') vista = { pantalla: 'inicio' };
    if (chat && vista.pantalla === 'ayudante') { decir('Deshecho: lo último ya no está apuntado. ¿Qué quieres apuntar?'); alMenu(); }
    avisar('Deshecho', false);
    pintar();
  }

  function nuevoId() { return datos.siguiente_id++; }
  function buscarTrabajo(id) { return datos.trabajos.find((t) => t.id === Number(id)); }
  function abiertos() { return datos.trabajos.filter((t) => t.estado === 'abierto'); }
  function mismoCliente(a, b) { return a.trim().toLowerCase() === b.trim().toLowerCase(); }

  // Cuántos trabajos terminados tiene ya ese cliente (sin contar este).
  function trabajosAntes(trabajo) {
    return datos.trabajos.filter((t) => t.id !== trabajo.id && t.estado === 'cerrado' && mismoCliente(t.cliente, trabajo.cliente)).length;
  }

  function clientes() {
    const vistos = [];
    datos.trabajos.forEach((t) => { if (!vistos.some((c) => mismoCliente(c, t.cliente))) vistos.push(t.cliente); });
    return vistos;
  }

  function crearTrabajo(cliente, que) {
    const t = { id: nuevoId(), cliente: cliente.trim(), que: que.trim(), creado: new Date().toISOString(), estado: 'abierto', apuntes: [], cierre: null };
    datos.trabajos.unshift(t);
    return t;
  }

  function apuntar(trabajo, tipo, cantidad, cosa) {
    trabajo.apuntes.push({ id: nuevoId(), tipo: tipo, cantidad: cantidad, cosa: cosa || '', fecha: new Date().toISOString() });
  }

  function apuntarViaje(trabajo, km) {
    cambiar('Viaje apuntado', () => {
      apuntar(trabajo, 'viaje', 1);
      trabajo.apuntes[trabajo.apuntes.length - 1].km = km;
    });
  }

  function textoApunte(a) {
    if (a.tipo === 'ticket') return 'Ticket' + (a.cosa ? ': ' + a.cosa : '') + ' · ' + C.euros(a.cantidad);
    if (a.tipo === 'horas') return String(a.cantidad).replace('.', ',') + ' h de trabajo';
    return 'Viaje' + (a.km != null ? ' · ' + String(a.km).replace('.', ',') + ' km' : '');
  }

  // Lo cobrado este mes y lo que de verdad le ha quedado por hora.
  function resumenMes() {
    const hoy = new Date();
    const delMes = datos.trabajos.filter((t) => {
      if (t.estado !== 'cerrado') return false;
      const f = new Date(t.cierre.fecha);
      return f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear();
    });
    let cobrado = 0, gastos = 0, horas = 0;
    delMes.forEach((t) => {
      const c = C.calcular(t, t.cierre.ajustes, t.cierre.con_descuento);
      cobrado += Number(t.cierre.cobrado); gastos += c.gastos_reales; horas += c.horas;
    });
    return { trabajos: delMes.length, cobrado: C.redondear(cobrado), horas: horas, por_hora: horas ? C.redondear((cobrado - gastos) / horas) : null };
  }

  // ---------- Pequeñas ayudas para pintar ----------

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fecha(iso) { const d = new Date(iso); return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); }
  function porciento(n) { return Math.round(Number(n) * 100) + ' %'; }
  function boton(texto, accion, valor, clase) {
    return '<button class="boton ' + (clase || '') + '" data-accion="' + accion + '"' + (valor != null ? ' data-valor="' + esc(valor) + '"' : '') + '>' + esc(texto) + '</button>';
  }
  function referencia(oficio) {
    const r = C.REFERENCIAS[oficio];
    if (!r || r.min == null) return '';
    const rango = r.min === r.max ? 'unos ' + r.min + ' €' : 'entre ' + r.min + ' y ' + r.max + ' €';
    return r.nombre + 's: ' + rango + ' la hora (' + r.zona + '). Es orientativo: las webs no coinciden entre sí.';
  }
  function referenciaLitro(combustible) {
    const r = C.COMBUSTIBLES[combustible];
    if (!r) return '';
    const n = (x) => String(x.toFixed(2)).replace('.', ',');
    return 'En gasolineras de Gran Canaria se ha visto entre ' + n(r.min) + ' y ' + n(r.max) + ' € el litro (verano de 2026). Mira el de tu gasolinera.';
  }

  // Los km del último viaje a casa de ese cliente, para no tener que escribirlos otra vez.
  function kmDeCliente(cliente) {
    for (const t of datos.trabajos) {
      if (!mismoCliente(t.cliente, cliente)) continue;
      const viajes = t.apuntes.filter((a) => a.tipo === 'viaje' && a.km != null);
      if (viajes.length) return viajes[viajes.length - 1].km;
    }
    return null;
  }

  let temporizador = null;
  // Al cambiar de sección se quita el aviso: si no, tapa la pantalla nueva.
  function quitarAviso() { clearTimeout(temporizador); document.getElementById('aviso').hidden = true; }
  function avisar(texto, conDeshacer) {
    const caja = document.getElementById('aviso');
    caja.innerHTML = '<span>' + esc(texto) + '</span>' + (conDeshacer && pilaDeshacer.length ? '<button data-accion="deshacer">Deshacer</button>' : '');
    caja.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { caja.hidden = true; }, 6000);
  }

  // ---------- Las pantallas ----------

  let vista = { pantalla: datos.perfil ? 'inicio' : 'alta' };

  const pantallas = {
    alta: function () {
      return '<div class="cabecera"><img src="iconos/manitu-icono.svg" alt=""><span class="nombre">Manitu</span></div>' +
        '<h1>Empecemos</h1><p class="suave">Solo hace falta una vez. Luego lo puedes cambiar en Ajustes.</p>' +
        formularioPerfil({ nombre: '', oficio: 'fontanero', precio_hora: '', precio_viaje: C.POR_DEFECTO.precio_viaje, margen: C.POR_DEFECTO.margen, descuento_fiel: 0.05 }, 'Empezar');
    },

    inicio: function () {
      const p = datos.perfil;
      const mes = resumenMes();
      let html = '<div class="cabecera"><img src="iconos/manitu-icono.svg" alt=""><span class="nombre">' + esc(p.nombre) + '</span></div>';
      html += '<div class="caja"><p class="suave">Este mes has cobrado</p><p class="cifra">' + C.euros(mes.cobrado) + '</p>' +
        '<p class="suave">' + mes.trabajos + (mes.trabajos === 1 ? ' trabajo terminado' : ' trabajos terminados') + '</p>';
      if (mes.por_hora != null) {
        html += '<p>Te ha quedado de verdad <strong>' + C.euros(mes.por_hora) + ' por hora</strong>, ya quitado el material y la gasolina.</p>';
        if (mes.por_hora < p.precio_hora) html += '<div class="ojo">Está por debajo de los ' + C.euros(p.precio_hora) + ' por hora que quieres ganar.</div>';
      }
      html += '</div>';
      html += boton('Nuevo trabajo', 'ir', 'nuevo', 'principal');
      const enMarcha = abiertos();
      html += '<h2>En marcha</h2>';
      html += enMarcha.length ? listaTrabajos(enMarcha) : '<p class="suave">No tienes trabajos en marcha.</p>';
      if (!datos.trabajos.length) {
        html += '<h2>Cómo funciona</h2><ol class="pasos">' +
          '<li>Cuando te encarguen algo, pulsa <strong>Nuevo trabajo</strong>.</li>' +
          '<li>Mientras trabajas, apunta los <strong>tickets</strong>, las <strong>horas</strong> y los <strong>viajes</strong>. También te lo puede ir preguntando el <strong>Ayudante</strong>.</li>' +
          '<li>Al terminar, Manitu te dice el <strong>precio justo</strong> y te prepara el papel para mandárselo al cliente por WhatsApp.</li>' +
          '</ol><p class="suave">¿Tienes los tickets de un trabajo que ya hiciste? Apúntalo y verás si cobraste lo justo.</p>';
      }
      return html;
    },

    trabajos: function () {
      if (!datos.trabajos.length) return '<h1>Trabajos</h1><p class="suave">Todavía no hay ninguno.</p>' + boton('Nuevo trabajo', 'ir', 'nuevo', 'principal');
      const cerrados = datos.trabajos.filter((t) => t.estado === 'cerrado')
        .sort((a, b) => b.cierre.fecha.localeCompare(a.cierre.fecha));
      let html = '<h1>Trabajos</h1>' + boton('Nuevo trabajo', 'ir', 'nuevo', 'principal');
      if (abiertos().length) html += '<h2>En marcha</h2>' + listaTrabajos(abiertos());
      if (cerrados.length) html += '<h2>Terminados</h2>' + listaTrabajos(cerrados);
      return html;
    },

    nuevo: function () {
      const lista = clientes().map((c) => '<option value="' + esc(c) + '">').join('');
      return '<h1>Nuevo trabajo</h1>' +
        '<form data-form="nuevo">' +
        '<label for="cliente">¿Para quién es?</label><input id="cliente" name="cliente" list="clientes" required autocomplete="off" placeholder="Ana Pérez">' +
        '<datalist id="clientes">' + lista + '</datalist>' +
        '<label for="que">¿Qué vas a hacer?</label><input id="que" name="que" required autocomplete="off" placeholder="Cambiar el grifo de la cocina">' +
        '<button class="boton principal" type="submit">Empezar el trabajo</button></form>' +
        boton('Volver', 'ir', 'inicio');
    },

    trabajo: function () {
      const t = buscarTrabajo(vista.id);
      const antes = trabajosAntes(t);
      let html = '<h1>' + esc(t.cliente) + '</h1><p class="suave">' + esc(t.que) + ' · desde el ' + fecha(t.creado) + '</p>';
      if (antes) html += '<div class="bien">Cliente de siempre: ' + antes + (antes === 1 ? ' trabajo' : ' trabajos') + ' antes de este.</div>';

      if (t.estado === 'cerrado') {
        const c = C.calcular(t, t.cierre.ajustes, t.cierre.con_descuento);
        html += '<div class="caja"><p class="suave">Terminado el ' + fecha(t.cierre.fecha) + '. Cobraste</p><p class="cifra">' + C.euros(t.cierre.cobrado) + '</p>';
        const ph = C.porHora(c, t.cierre.cobrado);
        if (ph != null) html += '<p>Te quedaron <strong>' + C.euros(ph) + ' por hora</strong>.</p>';
        html += '</div>' + boton('Ver el papel para el cliente', 'papel', t.id, 'principal') + boton('Reabrir el trabajo', 'reabrir', t.id);
        html += '<h2>Lo apuntado</h2>' + listaApuntes(t, false);
        return html;
      }

      const marcar = (f) => (vista.formulario === f ? 'abierto' : '');
      html += '<div class="fila">' + boton('Ticket', 'formulario', 'ticket', marcar('ticket')) + boton('Horas', 'formulario', 'horas', marcar('horas')) + boton('Viaje', 'formulario', 'viaje', marcar('viaje')) + '</div>';
      if (vista.formulario === 'ticket') {
        html += '<form data-form="ticket" class="caja"><label for="importe">¿Cuánto pone el ticket?</label>' +
          '<input id="importe" name="importe" inputmode="decimal" required placeholder="30,50">' +
          '<label for="cosa">¿Qué es? <span class="suave">(si quieres)</span></label><input id="cosa" name="cosa" autocomplete="off" placeholder="Grifo y latiguillos">' +
          '<button class="boton principal" type="submit">Apuntar el ticket</button></form>';
      }
      if (vista.formulario === 'horas') {
        html += '<div class="caja"><p><strong>¿Cuántas horas has trabajado?</strong></p><div class="opciones">' +
          [0.5, 1, 2, 4, 8].map((h) => boton(String(h).replace('.', ',') + ' h', 'horas', h)).join('') + '</div>' +
          '<form data-form="horas"><label for="otras">Otra cantidad</label><div class="fila"><input id="otras" name="horas" inputmode="decimal" required placeholder="3,5">' +
          '<button class="boton principal" type="submit" style="margin:0">Apuntar</button></div></form></div>';
      }

      if (vista.formulario === 'viaje') {
        const ultima = kmDeCliente(t.cliente);
        html += '<div class="caja">' +
          (ultima != null ? '<p><strong>¿Los mismos km que la última vez?</strong></p>' + boton('Sí, ' + String(ultima).replace('.', ',') + ' km', 'viaje-km', ultima, 'principal') : '') +
          '<form data-form="viaje"><label for="km">' + (ultima != null ? 'O escribe otros' : '¿Cuántos km son, ida y vuelta?') + '</label>' +
          '<div class="fila"><input id="km" name="km" inputmode="decimal" required placeholder="20">' +
          '<button class="boton principal" type="submit" style="margin:0">Apuntar</button></div></form>' +
          '<p class="suave">Solo lo ves tú: con esto la app sabe lo que gastas en gasolina.</p></div>';
      }

      const c = C.calcular(t, datos.perfil, false);
      html += '<div class="caja"><p class="suave">Precio justo hasta ahora</p><p class="cifra">' + C.euros(c.justo) + '</p></div>';
      html += '<h2>Lo apuntado</h2>' + listaApuntes(t, true);
      html += boton('Terminar el trabajo', 'ir', 'cerrar', 'principal');
      html += '<button class="enlace rojo" data-accion="borrar-trabajo" data-valor="' + t.id + '">Borrar este trabajo</button>';
      return html;
    },

    cerrar: function () {
      const t = buscarTrabajo(vista.id);
      const p = datos.perfil;
      const fiel = trabajosAntes(t) > 0 && p.descuento_fiel > 0;
      if (vista.con_descuento == null) vista.con_descuento = fiel;
      const c = C.calcular(t, p, vista.con_descuento);
      let html = '<h1>Terminar el trabajo</h1><p class="suave">' + esc(t.cliente) + ' · ' + esc(t.que) + '</p>';
      html += '<div class="caja">' + tablaCuentas(c, p, true) + '</div>';
      if (fiel) {
        html += '<label class="check"><input type="checkbox" data-accion="descuento"' + (vista.con_descuento ? ' checked' : '') + '>' +
          '<span>Descuento de cliente de siempre (' + porciento(p.descuento_fiel) + '). En el papel le saldrá que lo cuidas.</span></label>';
      }
      if (c.viajes) html += '<p class="suave">Tu gasolina en este trabajo: ' + C.euros(c.gasolina) + (c.km ? ' (' + String(c.km).replace('.', ',') + ' km)' : '') + '. Esto no sale en el papel del cliente.</p>';
      html += '<div id="resultado">' + textoPorHora(c, c.total, 'Con el precio justo') + '</div>';
      html += '<form data-form="cerrar"><label for="pensaba">¿Cuánto pensabas cobrar? <span class="suave">(si quieres comparar)</span></label>' +
        '<input id="pensaba" name="pensaba" inputmode="decimal" autocomplete="off" placeholder="50">' +
        '<div id="comparar"></div>' +
        '<button class="boton principal" type="submit" name="cobrar" value="justo">Cobrar el precio justo: ' + C.euros(c.total) + '</button>' +
        '<button class="boton" type="submit" name="cobrar" value="pensaba" id="cobrar-pensaba" hidden>Cobrar lo que pensaba</button>' +
        '</form>' + boton('Volver', 'abrir', t.id);
      return html;
    },

    papel: function () {
      const t = buscarTrabajo(vista.id);
      const filas = lineasPapel(t).map((l) =>
        '<tr' + (l.total ? ' class="total"' : '') + '><td>' + esc(l.texto) + '</td><td>' + (l.resta ? '−' : '') + C.euros(l.importe) + '</td></tr>').join('');
      const whatsapp = 'https://wa.me/?text=' + encodeURIComponent(textoPapel(t));
      return '<div class="papel"><div class="membrete"><div><h1>' + esc(datos.perfil.nombre) + '</h1>' +
        '<p class="suave">' + esc(nombreOficio()) + '</p></div><img src="iconos/manitu-icono.svg" alt=""></div>' +
        '<p><strong>Para:</strong> ' + esc(t.cliente) + '</p><p><strong>Trabajo:</strong> ' + esc(t.que) + '</p><p><strong>Fecha:</strong> ' + fecha(t.cierre.fecha) + '</p>' +
        '<table class="cuentas" style="margin-top:16px">' + filas + '</table>' +
        '<p class="pie">Esto no es una factura. Hecho con Manitu.</p></div>' +
        '<div class="no-imprimir">' +
        '<a class="boton principal" id="enviar-whatsapp" href="' + whatsapp + '" target="_blank" rel="noopener">Enviar por WhatsApp</a>' +
        (navigator.share ? boton('Compartir de otra forma', 'compartir', t.id) : '') +
        boton('Imprimir o guardar en PDF', 'imprimir') + boton('Volver', 'abrir', t.id) + '</div>';
    },

    ayudante: function () {
      const ch = chat;
      let html = '<h1>Ayudante</h1><div class="chat">' +
        ch.mensajes.map((m) => '<div class="burbuja ' + m.de + '">' + esc(m.texto) + '</div>').join('') + '</div>';
      const paso = PASOS[ch.paso];
      const opciones = paso.opciones ? paso.opciones(ch.datos) : [];
      if (opciones.length) {
        html += '<div class="opciones">' + opciones.map((o) => '<button class="boton" data-accion="chat-opcion" data-valor="' + esc(o.valor) + '">' + esc(o.texto) + '</button>').join('') + '</div>';
      }
      // Siempre se puede escribir, también al principio.
      html += '<form data-form="chat" class="fila" style="margin-top:12px"><input name="texto" autocomplete="off" required aria-label="Escribe aquí" ' +
        (paso.numero ? 'inputmode="decimal" ' : '') + 'placeholder="' + esc(paso.escribir || 'Escribe aquí') + '">' +
        '<button class="boton principal" type="submit" style="margin:0;flex:0 0 auto;width:auto">Enviar</button></form>';
      return html;
    },

    ajustes: function () {
      return '<h1>Ajustes</h1>' + formularioPerfil(datos.perfil, 'Guardar los cambios') +
        '<h2>Tus datos</h2><p class="suave">Se guardan solo en este móvil. Haz una copia de vez en cuando por si lo pierdes o lo cambias.</p>' +
        boton('Descargar una copia', 'copia') +
        '<label for="restaurar">Recuperar una copia</label><input id="restaurar" type="file" accept="application/json" data-accion="restaurar">' +
        '<h2>Empezar de cero</h2>' +
        (vista.confirmar_borrar
          ? '<div class="ojo">Se borra todo lo de este móvil: trabajos, clientes y ajustes.</div><div class="fila">' + boton('Sí, borrar todo', 'borrar-todo', null, 'peligro') + boton('No', 'no-borrar') + '</div>'
          : boton('Borrar todo', 'pedir-borrar', null, 'peligro'));
    }
  };

  function formularioPerfil(p, textoBoton) {
    const oficios = Object.keys(C.REFERENCIAS).map((k) => '<option value="' + k + '"' + (p.oficio === k ? ' selected' : '') + '>' + C.REFERENCIAS[k].nombre + '</option>').join('');
    const descuentos = [0, 0.05, 0.1, 0.15].map((d) => '<option value="' + d + '"' + (Number(p.descuento_fiel) === d ? ' selected' : '') + '>' + (d ? porciento(d) : 'Sin descuento') + '</option>').join('');
    const num = (x) => (x === '' || x == null ? '' : String(x).replace('.', ','));
    // Quien se dio de alta antes de que existiera el vehículo recibe los valores normales.
    const v = Object.assign({}, C.POR_DEFECTO, p);
    const vehiculos = Object.keys(C.VEHICULOS).map((k) => '<option value="' + k + '"' + (v.vehiculo === k ? ' selected' : '') + '>' + C.VEHICULOS[k].nombre + '</option>').join('');
    const combustibles = Object.keys(C.COMBUSTIBLES).map((k) => '<option value="' + k + '"' + (v.combustible === k ? ' selected' : '') + '>' + C.COMBUSTIBLES[k].nombre + '</option>').join('');
    return '<form data-form="perfil">' +
      '<label for="nombre">Tu nombre</label><input id="nombre" name="nombre" required autocomplete="off" value="' + esc(p.nombre) + '" placeholder="Juan">' +
      '<label for="oficio">Tu oficio</label><select id="oficio" name="oficio" data-accion="oficio">' + oficios + '</select>' +
      '<h2>Tus precios</h2>' +
      '<label for="precio_hora">¿Cuánto quieres ganar por hora?</label><input id="precio_hora" name="precio_hora" inputmode="decimal" required value="' + num(p.precio_hora) + '" placeholder="25">' +
      '<p class="suave" id="referencia">' + esc(referencia(p.oficio)) + '</p>' +
      '<label for="precio_viaje">¿Cuánto cobras por cada viaje a la casa?</label><input id="precio_viaje" name="precio_viaje" inputmode="decimal" required value="' + num(p.precio_viaje) + '">' +
      '<label for="margen">Gestión del material (por ir a comprarlo y adelantar el dinero)</label><input id="margen" name="margen" inputmode="decimal" required value="' + num(Math.round(Number(p.margen) * 100)) + '">' +
      '<p class="suave">En %. Normalmente un 10.</p>' +
      '<label for="descuento_fiel">Descuento para tus clientes de siempre</label><select id="descuento_fiel" name="descuento_fiel">' + descuentos + '</select>' +
      '<p class="suave">Se aplica desde el segundo trabajo con el mismo cliente. Tú decides cada vez si lo usas.</p>' +
      '<h2>Tu vehículo</h2><p class="suave">Solo lo ves tú: sirve para saber cuánto gastas de verdad en gasolina en cada viaje.</p>' +
      '<label for="vehiculo">¿Con qué vas a los trabajos?</label><select id="vehiculo" name="vehiculo" data-accion="vehiculo">' + vehiculos + '</select>' +
      '<label for="consumo">¿Cuánto gasta? <span class="suave">(litros cada 100 km)</span></label><input id="consumo" name="consumo" inputmode="decimal" required value="' + num(v.consumo) + '">' +
      '<p class="suave">Si no lo sabes, deja el que viene puesto: es lo normal en ese tipo de vehículo.</p>' +
      '<label for="combustible">¿Gasolina o diésel?</label><select id="combustible" name="combustible" data-accion="combustible">' + combustibles + '</select>' +
      '<label for="precio_litro">¿Cuánto te cuesta el litro donde echas?</label><input id="precio_litro" name="precio_litro" inputmode="decimal" required value="' + num(v.precio_litro) + '">' +
      '<p class="suave" id="ref-litro">' + esc(referenciaLitro(v.combustible)) + '</p>' +
      '<button class="boton principal" type="submit">' + textoBoton + '</button></form>';
  }

  function nombreOficio() { return (C.REFERENCIAS[datos.perfil.oficio] || {}).nombre || ''; }

  // Las líneas del papel para el cliente. Las horas, los km y la gasolina NO salen:
  // el cliente paga el trabajo, no lo que se tardó.
  function lineasPapel(t) {
    const c = C.calcular(t, t.cierre.ajustes, t.cierre.con_descuento);
    const ajuste = C.redondear(Number(t.cierre.cobrado) - c.total);
    const l = [];
    c.tickets.forEach((a) => l.push({ texto: 'Material' + (a.cosa ? ': ' + a.cosa : ''), importe: a.cantidad }));
    if (c.gestion) l.push({ texto: 'Gestión del material (compra y transporte)', importe: c.gestion });
    if (c.mano_obra) l.push({ texto: 'Mano de obra', importe: c.mano_obra });
    if (c.desplazamiento) l.push({ texto: 'Desplazamiento', importe: c.desplazamiento });
    if (c.descuento) l.push({ texto: 'Descuento por ser cliente de siempre', importe: c.descuento, resta: true });
    if (ajuste) l.push({ texto: ajuste < 0 ? 'Rebaja' : 'Suplemento', importe: Math.abs(ajuste), resta: ajuste < 0 });
    l.push({ texto: 'Total', importe: t.cierre.cobrado, total: true });
    return l;
  }

  // El mismo papel en texto, para mandarlo por WhatsApp.
  function textoPapel(t) {
    const lineas = lineasPapel(t).map((l) => (l.total ? '*' : '') + l.texto + ': ' + (l.resta ? '−' : '') + C.euros(l.importe) + (l.total ? '*' : ''));
    return datos.perfil.nombre + (nombreOficio() ? ' · ' + nombreOficio() : '') + '\n' +
      'Para: ' + t.cliente + '\nTrabajo: ' + t.que + '\nFecha: ' + fecha(t.cierre.fecha) + '\n\n' +
      lineas.join('\n') + '\n\nEsto no es una factura. Hecho con Manitu.';
  }

  function listaTrabajos(lista) {
    return '<ul class="lista">' + lista.map((t) => {
      const derecha = t.estado === 'cerrado' ? C.euros(t.cierre.cobrado) : 'Hasta ahora ' + C.euros(C.calcular(t, datos.perfil, false).justo);
      return '<li><button class="trabajo" data-accion="abrir" data-valor="' + t.id + '"><strong>' + esc(t.cliente) + '</strong><br><span class="suave">' + esc(t.que) + '</span></button>' +
        '<span class="derecha suave">' + derecha + '</span></li>';
    }).join('') + '</ul>';
  }

  function listaApuntes(t, conQuitar) {
    if (!t.apuntes.length) return '<p class="suave">Todavía nada. Usa los botones de arriba.</p>';
    return '<ul class="lista">' + t.apuntes.map((a) =>
      '<li><span>' + esc(textoApunte(a)) + '<br><span class="suave">' + fecha(a.fecha) + '</span></span>' +
      (conQuitar ? '<button class="enlace rojo" data-accion="quitar" data-valor="' + a.id + '">Quitar</button>' : '') + '</li>').join('') + '</ul>';
  }

  function tablaCuentas(c, p, conTotal) {
    let filas = '<tr><td>Material</td><td>' + C.euros(c.material) + '</td></tr>' +
      '<tr><td>Gestión del material (' + porciento(p.margen) + ')</td><td>' + C.euros(c.gestion) + '</td></tr>' +
      '<tr><td>Mano de obra (' + String(c.horas).replace('.', ',') + ' h × ' + C.euros(p.precio_hora) + ')</td><td>' + C.euros(c.mano_obra) + '</td></tr>' +
      '<tr><td>Desplazamiento (' + c.viajes + (c.viajes === 1 ? ' viaje' : ' viajes') + ')</td><td>' + C.euros(c.desplazamiento) + '</td></tr>';
    if (c.descuento) filas += '<tr><td>Descuento de cliente de siempre</td><td>−' + C.euros(c.descuento) + '</td></tr>';
    if (conTotal) filas += '<tr class="total"><td>Precio justo</td><td>' + C.euros(c.total) + '</td></tr>';
    return '<table class="cuentas">' + filas + '</table>';
  }

  function textoPorHora(c, cobrado, como) {
    const ph = C.porHora(c, cobrado);
    if (ph == null) return '<p class="suave">Apunta las horas para saber cuánto te queda por hora.</p>';
    const texto = como + ' (' + C.euros(cobrado) + ') te quedan <strong>' + C.euros(ph) + ' por hora</strong>, ya quitado el material y la gasolina.';
    if (ph < datos.perfil.precio_hora) return '<div class="ojo">' + texto + ' Es menos de los ' + C.euros(datos.perfil.precio_hora) + ' por hora que quieres ganar.</div>';
    return '<div class="bien">' + texto + '</div>';
  }

  // ---------- El ayudante: un chat sin IA (gratis) ----------
  // Se puede pulsar botones o escribir como se habla: «30 € de tubos», «2 horas», «viaje de 20 km»…
  // Entiende buscando números y palabras clave. La conversación se guarda mientras la app esté abierta.

  let chat = null;
  const AYUDA = 'Puedes pulsar un botón o escribirlo, por ejemplo: «30 € de tubos», «2 horas», «media hora», «viaje de 20 km» o «nuevo trabajo».';

  function chatNuevo() {
    return { mensajes: [{ de: 'bot', texto: 'Hola, ' + datos.perfil.nombre + '. ¿Qué quieres apuntar? ' + AYUDA }], paso: 'menu', datos: {} };
  }
  function decir(texto) { chat.mensajes.push({ de: 'bot', texto: texto }); }
  function yoDigo(texto) { chat.mensajes.push({ de: 'yo', texto: texto }); }
  function irPaso(paso) { chat.paso = paso; if (PASOS[paso].pregunta) decir(PASOS[paso].pregunta(chat.datos)); }
  function alMenu() { chat.paso = 'menu'; chat.datos = {}; }
  const n2t = (n) => String(n).replace('.', ',');

  // Quita mayúsculas y tildes para comparar: "Más" y "mas" son lo mismo.
  function normal(t) { return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }

  // Lee lo escrito y dice qué quiere hacer. Devuelve null si no lo entiende.
  function entender(texto) {
    const t = normal(texto);
    const NUM = '(\\d+(?:[.,]\\d+)?)';
    const num = (m) => C.leerNumero(m);
    let m;
    if (/\b(cancelar|cancela|nada|dejalo|olvidalo|salir)\b/.test(t)) return { que: 'cancelar' };
    if ((m = t.match(new RegExp(NUM + '\\s*(km|kms|kilometros?)\\b')))) return { que: 'viaje', km: num(m[1]) };
    if (/\bmedia hora\b/.test(t)) return { que: 'horas', horas: 0.5 };
    if ((m = t.match(new RegExp(NUM + '\\s*(h|hs|hora|horas)\\b')))) return { que: 'horas', horas: num(m[1]) };
    if ((m = t.match(new RegExp(NUM + '\\s*(€|e|eur|euros?)(?=\\s|$|[.,])'))) || (m = t.match(new RegExp('€\\s*' + NUM)))) {
      // Lo que no es el importe es "qué es": «30 € de tubos» → tubos
      const cosa = String(texto).replace(/\d+(?:[.,]\d+)?\s*(€|euros?|eur|e)?/i, '').replace(/€/g, '')
        .replace(/^\s*(de|del|en|ticket|un ticket|:|-)\s+/i, '').replace(/^\s*(de|del|en)\s+/i, '').trim();
      return { que: 'ticket', importe: num(m[1]), cosa: cosa };
    }
    // Primero lo que lleva número (arriba); luego las palabras sueltas, así «30 € de grifo nuevo» es un ticket.
    if (/(como voy|este mes|cuanto (he |llevo )?(ganado|cobrado|llevo))/.test(t)) return { que: 'mes' };
    if (/\b(terminar|termine|terminado|acabar|acabe|acabado|cerrar)\b/.test(t)) return { que: 'terminar' };
    if (/\b(nuevo|nueva|empezar|empiezo|otro trabajo)\b/.test(t)) return { que: 'nuevo' };
    if (/\b(viaje|viajes|fui|ida y vuelta|desplazamiento)\b/.test(t)) return { que: 'viaje' };
    if (/\b(ticket|tickets|factura|compre|compra|material)\b/.test(t)) return { que: 'ticket' };
    if (/\bhoras?\b/.test(t)) return { que: 'horas' };
    if ((m = t.match(new RegExp('^' + NUM + '$')))) return { que: 'numero', numero: num(m[1]) };
    return null;
  }

  function hacer(intencion) {
    if (!intencion) return decir('No te he entendido. ' + AYUDA);
    const q = intencion.que;
    if (q === 'cancelar') { decir('Vale, lo dejamos. ¿Qué quieres apuntar?'); return alMenu(); }
    if (q === 'mes') {
      const m = resumenMes();
      decir('Este mes has cobrado ' + C.euros(m.cobrado) + ' en ' + m.trabajos + (m.trabajos === 1 ? ' trabajo' : ' trabajos') + '.' +
        (m.por_hora != null ? ' Te han quedado ' + C.euros(m.por_hora) + ' por hora.' : '') + ' ¿Algo más?');
      return alMenu();
    }
    if (q === 'nuevo') { chat.datos = {}; return irPaso('cliente'); }
    if (q === 'numero') { chat.datos = { numero: intencion.numero }; return irPaso('numero'); }
    elegirTrabajoPara(intencion);
  }

  // Si hay un solo trabajo en marcha lo usa; si hay varios, pregunta; si no hay, empieza uno.
  function elegirTrabajoPara(intencion) {
    chat.datos = Object.assign({}, intencion);
    const lista = abiertos();
    if (!lista.length) {
      if (intencion.que === 'terminar') { decir('No tienes ningún trabajo en marcha. ¿Qué quieres apuntar?'); return alMenu(); }
      decir('No tienes ningún trabajo en marcha. Empecemos uno.');
      return irPaso('cliente');
    }
    if (lista.length === 1) { chat.datos.id = lista[0].id; decir('Para el trabajo de ' + lista[0].cliente + '.'); return seguir(); }
    irPaso('cual');
  }

  // El trabajo de la conversación. Si ya no existe (por un Deshacer, por ejemplo), lo dice y vuelve a empezar.
  function trabajoDelChat() {
    const t = buscarTrabajo(chat.datos.id);
    if (!t || t.estado !== 'abierto') { decir('Ese trabajo ya no está en marcha. ¿Qué quieres apuntar?'); alMenu(); return null; }
    return t;
  }

  function seguir() {
    const d = chat.datos;
    if (!trabajoDelChat()) return;
    if (d.que === 'terminar') { const id = d.id; alMenu(); return ir('cerrar', { id: id }); }
    if (d.que === 'ticket') return d.importe != null ? (d.cosa ? guardarTicket(d.cosa) : irPaso('cosa')) : irPaso('importe');
    if (d.que === 'horas') return d.horas != null ? guardarHoras(d.horas) : irPaso('horas');
    return d.km != null ? guardarViaje(d.km) : irPaso('km');
  }

  function guardarTicket(cosa) {
    const t = trabajoDelChat(); if (!t) return;
    const importe = chat.datos.importe;
    cambiar('Ticket apuntado', () => apuntar(t, 'ticket', importe, cosa.trim()));
    decir('Apuntado: ' + C.euros(importe) + (cosa.trim() ? ' de ' + cosa.trim() : '') + ' en el trabajo de ' + t.cliente + '. Precio justo hasta ahora: ' + C.euros(C.calcular(t, datos.perfil, false).justo) + '. ¿Algo más?');
    alMenu();
  }

  function guardarHoras(n) {
    const t = trabajoDelChat(); if (!t) return;
    cambiar('Horas apuntadas', () => apuntar(t, 'horas', n));
    decir('Apuntadas ' + n2t(n) + ' h en el trabajo de ' + t.cliente + '. Precio justo hasta ahora: ' + C.euros(C.calcular(t, datos.perfil, false).justo) + '. ¿Algo más?');
    alMenu();
  }

  function guardarViaje(km) {
    const t = trabajoDelChat(); if (!t) return;
    apuntarViaje(t, km);
    decir('Apuntado un viaje de ' + n2t(km) + ' km en el trabajo de ' + t.cliente + ' (unos ' + C.euros(C.gasolinaViaje(km, datos.perfil)) + ' de gasolina). Precio justo hasta ahora: ' + C.euros(C.calcular(t, datos.perfil, false).justo) + '. ¿Algo más?');
    alMenu();
  }

  const CANCELAR = { texto: 'Cancelar', valor: '__cancelar' };
  const MENU = [
    { texto: 'Un ticket', valor: 'ticket' }, { texto: 'Horas', valor: 'horas' },
    { texto: 'Un viaje', valor: 'viaje' }, { texto: 'Un trabajo nuevo', valor: 'nuevo' },
    { texto: 'Terminar un trabajo', valor: 'terminar' }, { texto: 'Cómo voy este mes', valor: 'mes' }
  ];

  // Cada paso: la pregunta, los botones, y qué hacer si se pulsa (elegir) o se escribe (escrito).
  // Si un paso no tiene "escrito", lo escrito se intenta entender como una orden nueva.
  const PASOS = {
    menu: {
      opciones: () => MENU,
      elegir: (v) => hacer({ que: v })
    },
    cual: {
      pregunta: () => '¿Para qué trabajo?', escribir: 'Escribe el cliente',
      opciones: () => abiertos().map((t) => ({ texto: t.cliente + ' · ' + t.que, valor: t.id })).concat([CANCELAR]),
      elegir: (v) => { chat.datos.id = Number(v); seguir(); },
      escrito: function (texto) {
        const b = normal(texto);
        const hay = abiertos().filter((t) => normal(t.cliente).includes(b) || normal(t.que).includes(b));
        if (hay.length === 1) { chat.datos.id = hay[0].id; decir('Para el trabajo de ' + hay[0].cliente + '.'); return seguir(); }
        decir(hay.length ? 'Hay varios con ese nombre. Pulsa el que es.' : 'No encuentro ese trabajo. Pulsa el que es.');
      }
    },
    numero: {
      pregunta: (d) => '¿Qué es ese ' + n2t(d.numero) + '?',
      opciones: () => [{ texto: 'Euros de un ticket', valor: 'ticket' }, { texto: 'Horas', valor: 'horas' }, { texto: 'Km de un viaje', valor: 'viaje' }, CANCELAR],
      elegir: (v) => {
        const n = chat.datos.numero;
        if (v === 'horas' && n > 24) { decir('Son demasiadas horas para un día. ¿Qué quieres apuntar?'); return alMenu(); }
        hacer({ que: v, importe: v === 'ticket' ? n : undefined, horas: v === 'horas' ? n : undefined, km: v === 'viaje' ? n : undefined });
      }
    },
    importe: {
      pregunta: () => '¿Cuánto pone el ticket?', escribir: '30,50', numero: true,
      opciones: () => [CANCELAR],
      escrito: function (texto) {
        const i = entender(texto);
        const n = i && i.que === 'ticket' && i.importe != null ? i.importe : C.leerNumero(texto);
        if (n == null || n === 0) return decir('No lo entiendo. Escribe solo el número, por ejemplo 30,50.');
        chat.datos.importe = n;
        if (i && i.cosa) return guardarTicket(i.cosa);
        irPaso('cosa');
      }
    },
    cosa: {
      pregunta: () => '¿Qué es? Por ejemplo: grifo, tubos, pintura.', escribir: 'Grifo',
      opciones: () => [{ texto: 'Saltar', valor: '' }, CANCELAR],
      elegir: () => guardarTicket(''),
      escrito: (texto) => guardarTicket(texto)
    },
    horas: {
      pregunta: () => '¿Cuántas horas has trabajado?', escribir: 'Otra cantidad', numero: true,
      opciones: () => [0.5, 1, 2, 4, 8].map((h) => ({ texto: n2t(h) + ' h', valor: h })).concat([CANCELAR]),
      elegir: (v) => guardarHoras(Number(v)),
      escrito: function (texto) {
        const i = entender(texto);
        const n = i && i.horas != null ? i.horas : C.leerNumero(texto);
        if (n == null || n === 0 || n > 24) return decir('No lo entiendo. Escribe las horas, por ejemplo 3,5.');
        guardarHoras(n);
      }
    },
    km: {
      pregunta: () => '¿Cuántos km son, ida y vuelta?', escribir: 'Km', numero: true,
      opciones: (d) => {
        const t = buscarTrabajo(d.id);
        const ultima = t ? kmDeCliente(t.cliente) : null;
        return (ultima != null ? [{ texto: 'Igual que la última vez: ' + n2t(ultima) + ' km', valor: ultima }] : []).concat([CANCELAR]);
      },
      elegir: (v) => guardarViaje(Number(v)),
      escrito: function (texto) {
        const i = entender(texto);
        const n = i && i.km != null ? i.km : C.leerNumero(texto);
        if (n == null || n > 1000) return decir('No lo entiendo. Escribe solo los km, por ejemplo 20.');
        guardarViaje(n);
      }
    },
    cliente: {
      pregunta: () => '¿Para quién es el trabajo?' + (clientes().length ? ' Escríbelo o pulsa uno de tus clientes.' : ''), escribir: 'Ana Pérez',
      opciones: () => clientes().slice(0, 4).map((c) => ({ texto: c, valor: c })).concat([CANCELAR]),
      elegir: (v) => { chat.datos.cliente = v; irPaso('que'); },
      escrito: (texto) => { chat.datos.cliente = texto.trim(); irPaso('que'); }
    },
    que: {
      pregunta: () => '¿Qué vas a hacer?', escribir: 'Cambiar el grifo',
      opciones: () => [CANCELAR],
      escrito: function (texto) {
        let t;
        cambiar('Trabajo empezado', () => { t = crearTrabajo(chat.datos.cliente, texto); });
        const antes = trabajosAntes(t);
        decir('Empezado el trabajo de ' + t.cliente + '.' + (antes ? ' Es cliente de siempre: ' + antes + (antes === 1 ? ' trabajo' : ' trabajos') + ' antes de este.' : ''));
        // Si venía a apuntar algo (un ticket, horas…), sigue con eso.
        const pendiente = chat.datos;
        if (['ticket', 'horas', 'viaje'].includes(pendiente.que)) { pendiente.id = t.id; return seguir(); }
        decir('¿Qué quieres apuntar?');
        alMenu();
      }
    }
  };

  // Lo escrito en el chat: si el paso espera algo concreto, lo usa; si no, lo intenta entender.
  function chatEscrito(texto) {
    yoDigo(texto);
    const paso = PASOS[chat.paso];
    const i = entender(texto);
    if (i && i.que === 'cancelar') return hacer(i);
    if (paso.escrito) return paso.escrito(texto);
    hacer(i);
  }

  function chatOpcion(v) {
    const paso = PASOS[chat.paso];
    const op = (paso.opciones(chat.datos) || []).find((o) => String(o.valor) === v);
    if (op) yoDigo(op.texto);
    if (v === '__cancelar') return hacer({ que: 'cancelar' });
    paso.elegir(v);
  }

  // ---------- Pintar y responder a los toques ----------

  function pintar() {
    if (vista.pantalla !== 'alta' && !datos.perfil) vista = { pantalla: 'alta' };
    if (vista.pantalla === 'ayudante' && !chat) chat = chatNuevo();
    document.getElementById('app').innerHTML = pantallas[vista.pantalla]();
    const menu = document.getElementById('menu');
    menu.hidden = vista.pantalla === 'alta';
    const seccion = { trabajo: 'trabajos', cerrar: 'trabajos', papel: 'trabajos', nuevo: 'trabajos' }[vista.pantalla] || vista.pantalla;
    menu.querySelectorAll('button').forEach((b) => b.classList.toggle('activo', b.dataset.valor === seccion));
    // En el chat se baja al último mensaje, como en cualquier chat; en lo demás, se empieza arriba.
    if (window.scrollTo) window.scrollTo(0, vista.pantalla === 'ayudante' ? document.body.scrollHeight : 0);
  }

  function ir(pantalla, extra) { vista = Object.assign({ pantalla: pantalla }, extra || {}); pintar(); }

  const acciones = {
    ir: (v) => { quitarAviso(); ir(v, vista.id && (v === 'cerrar') ? { id: vista.id } : {}); },
    abrir: (v) => ir('trabajo', { id: Number(v) }),
    deshacer: () => deshacer(),
    formulario: (v) => { vista.formulario = vista.formulario === v ? null : v; pintar(); },
    'viaje-km': (v) => { apuntarViaje(buscarTrabajo(vista.id), Number(v)); vista.formulario = null; pintar(); },
    horas: (v) => { cambiar('Horas apuntadas', () => apuntar(buscarTrabajo(vista.id), 'horas', Number(v))); vista.formulario = null; pintar(); },
    quitar: (v) => {
      const t = buscarTrabajo(vista.id);
      cambiar('Apunte quitado', () => { t.apuntes = t.apuntes.filter((a) => a.id !== Number(v)); });
      pintar();
    },
    'borrar-trabajo': (v) => { cambiar('Trabajo borrado', () => { datos.trabajos = datos.trabajos.filter((t) => t.id !== Number(v)); }); ir('inicio'); },
    descuento: () => { vista.con_descuento = !vista.con_descuento; pintar(); },
    reabrir: (v) => { cambiar('Trabajo reabierto', () => { const t = buscarTrabajo(v); t.estado = 'abierto'; t.cierre = null; }); pintar(); },
    papel: (v) => ir('papel', { id: Number(v) }),
    imprimir: () => window.print(),
    compartir: (v) => { navigator.share({ title: 'Manitu', text: textoPapel(buscarTrabajo(v)) }).catch(() => {}); },
    'chat-opcion': (v) => { chatOpcion(v); if (vista.pantalla === 'ayudante') pintar(); },
    copia: () => {
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
      enlace.download = 'manitu-copia-' + new Date().toISOString().slice(0, 10) + '.json';
      enlace.click();
    },
    'pedir-borrar': () => { vista.confirmar_borrar = true; pintar(); },
    'no-borrar': () => { vista.confirmar_borrar = false; pintar(); },
    'borrar-todo': () => { cambiar('Todo borrado', () => { datos = datosVacios(); }); chat = null; ir('alta'); }
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-accion]');
    if (!el || el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'file') return;
    const fn = acciones[el.dataset.accion];
    if (fn) fn(el.dataset.valor);
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.accion === 'descuento') acciones.descuento();
    if (el.dataset.accion === 'oficio') {
      document.getElementById('referencia').textContent = referencia(el.value);
      const r = C.REFERENCIAS[el.value];
      const campo = document.getElementById('precio_hora');
      if (r && r.min != null && !campo.value) campo.placeholder = String(Math.round((r.min + r.max) / 2));
    }
    if (el.dataset.accion === 'vehiculo') {
      const v = C.VEHICULOS[el.value];
      const campo = document.getElementById('consumo');
      if (v && v.consumo) campo.value = String(v.consumo).replace('.', ',');
      else { campo.value = ''; campo.focus(); }
    }
    if (el.dataset.accion === 'combustible') {
      document.getElementById('ref-litro').textContent = referenciaLitro(el.value);
      document.getElementById('precio_litro').value = String(C.COMBUSTIBLES[el.value].normal).replace('.', ',');
    }
    if (el.dataset.accion === 'restaurar' && el.files[0]) {
      el.files[0].text().then((texto) => {
        let nuevos;
        try { nuevos = JSON.parse(texto); } catch (err) { return avisar('Ese archivo no es una copia de Manitu', false); }
        if (!nuevos || !Array.isArray(nuevos.trabajos)) return avisar('Ese archivo no es una copia de Manitu', false);
        cambiar('Copia recuperada', () => { datos = nuevos; });
        ir(datos.perfil ? 'inicio' : 'alta');
      });
    }
  });

  // Al escribir lo que pensaba cobrar, se compara al momento.
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'pensaba') return;
    const t = buscarTrabajo(vista.id);
    const c = C.calcular(t, datos.perfil, vista.con_descuento);
    const n = C.leerNumero(e.target.value);
    document.getElementById('comparar').innerHTML = n ? textoPorHora(c, n, 'Cobrando lo que pensabas') : '';
    const b = document.getElementById('cobrar-pensaba');
    b.hidden = !n;
    if (n) b.textContent = 'Cobrar lo que pensaba: ' + C.euros(n);
  });

  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const f = Object.fromEntries(new FormData(form));
    const tipo = form.dataset.form;

    if (tipo === 'perfil') {
      const perfil = {
        nombre: f.nombre.trim(), oficio: f.oficio,
        precio_hora: C.leerNumero(f.precio_hora), precio_viaje: C.leerNumero(f.precio_viaje),
        margen: C.leerNumero(f.margen), descuento_fiel: Number(f.descuento_fiel),
        vehiculo: f.vehiculo, combustible: f.combustible, consumo: C.leerNumero(f.consumo), precio_litro: C.leerNumero(f.precio_litro)
      };
      if (!perfil.nombre || !perfil.precio_hora || perfil.precio_viaje == null || perfil.margen == null || !perfil.consumo || !perfil.precio_litro) {
        return avisar('Revisa los números: escribe solo cifras', false);
      }
      perfil.margen = perfil.margen / 100;
      const primeraVez = !datos.perfil;
      cambiar(primeraVez ? 'Listo' : 'Cambios guardados', () => { datos.perfil = perfil; });
      return ir('inicio');
    }
    if (tipo === 'nuevo') {
      let t;
      cambiar('Trabajo empezado', () => { t = crearTrabajo(f.cliente, f.que); });
      return ir('trabajo', { id: t.id });
    }
    if (tipo === 'ticket') {
      const n = C.leerNumero(f.importe);
      if (!n) return avisar('Escribe solo el número del ticket, por ejemplo 30,50', false);
      cambiar('Ticket apuntado', () => apuntar(buscarTrabajo(vista.id), 'ticket', n, (f.cosa || '').trim()));
      vista.formulario = null;
      return pintar();
    }
    if (tipo === 'viaje') {
      const n = C.leerNumero(f.km);
      if (n == null || n > 1000) return avisar('Escribe los km, por ejemplo 20', false);
      apuntarViaje(buscarTrabajo(vista.id), n);
      vista.formulario = null;
      return pintar();
    }
    if (tipo === 'horas') {
      const n = C.leerNumero(f.horas);
      if (!n || n > 24) return avisar('Escribe las horas, por ejemplo 3,5', false);
      cambiar('Horas apuntadas', () => apuntar(buscarTrabajo(vista.id), 'horas', n));
      vista.formulario = null;
      return pintar();
    }
    if (tipo === 'cerrar') {
      const t = buscarTrabajo(vista.id);
      const c = C.calcular(t, datos.perfil, vista.con_descuento);
      const pensaba = C.leerNumero(f.pensaba);
      const cobrado = e.submitter && e.submitter.value === 'pensaba' && pensaba ? pensaba : c.total;
      cambiar('Trabajo terminado', () => {
        t.estado = 'cerrado';
        // Se guardan los ajustes de ese momento: si luego cambia sus precios, este trabajo no cambia.
        t.cierre = { fecha: new Date().toISOString(), ajustes: Object.assign({}, datos.perfil), con_descuento: !!vista.con_descuento, pensaba: pensaba, cobrado: cobrado };
      });
      return ir('trabajo', { id: t.id });
    }
    if (tipo === 'chat') {
      const texto = (f.texto || '').trim();
      if (!texto) return;
      chatEscrito(texto);
      if (vista.pantalla !== 'ayudante') return;
      pintar();
      const campo = document.querySelector('[data-form="chat"] input');
      if (campo) campo.focus();
    }
  });

  pintar();

  // Guarda una copia de la app en el móvil para que abra también sin internet (sw.js).
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
