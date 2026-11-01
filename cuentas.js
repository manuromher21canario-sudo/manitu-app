// Las cuentas de un trabajo: las mismas que usaba el bot de Telegram (Cuentas.gs).
//   precio justo = material + gestión del material + horas × €/hora + viajes × €/viaje
//   total        = precio justo − descuento de cliente de siempre (si lo tiene)
//   lo que de verdad te queda por hora = (lo que cobras − material − gasolina) ÷ horas
// No toca la pantalla: solo hace números. Así se puede probar sola.

(function () {
  const POR_DEFECTO = { precio_hora: 25, precio_viaje: 12, gasolina: 4, margen: 0.10, descuento_fiel: 0 };

  // Precios por hora orientativos, buscados en internet el 01/11/2026 (webs de presupuestos).
  // Las webs no coinciden entre sí: son una guía, no un precio exacto.
  const REFERENCIAS = {
    fontanero:   { nombre: 'Fontanero',   min: 17, max: 40, zona: 'Gran Canaria y Tenerife' },
    electricista:{ nombre: 'Electricista',min: 22, max: 70, zona: 'España y Tenerife' },
    albanil:     { nombre: 'Albañil',     min: 20, max: 30, zona: 'España' },
    pintor:      { nombre: 'Pintor',      min: 15, max: 25, zona: 'España' },
    manitas:     { nombre: 'Manitas',     min: 23, max: 23, zona: 'España (solo encontramos un dato)' },
    otro:        { nombre: 'Otro oficio', min: null, max: null, zona: '' }
  };

  function redondear(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  function euros(n) {
    const v = redondear(n);
    const [ent, dec] = Math.abs(v).toFixed(2).split('.');
    const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (v < 0 ? '−' : '') + miles + (dec === '00' ? '' : ',' + dec) + ' €';
  }

  // Acepta "30", "30,5", "30.50 €"… Devuelve null si no hay número.
  function leerNumero(texto) {
    const limpio = String(texto == null ? '' : texto).replace(/[€\s]/g, '').replace(',', '.');
    if (limpio === '') return null;
    const n = Number(limpio);
    return isFinite(n) && n >= 0 ? n : null;
  }

  // Junta los apuntes de un trabajo: tickets, horas y viajes.
  function resumen(trabajo) {
    const apuntes = trabajo.apuntes || [];
    const tickets = apuntes.filter((a) => a.tipo === 'ticket');
    return {
      tickets: tickets,
      material: redondear(tickets.reduce((s, a) => s + Number(a.cantidad), 0)),
      horas: redondear(apuntes.filter((a) => a.tipo === 'horas').reduce((s, a) => s + Number(a.cantidad), 0)),
      viajes: apuntes.filter((a) => a.tipo === 'viaje').reduce((s, a) => s + Number(a.cantidad), 0)
    };
  }

  // ajustes: los del trabajador. conDescuento: si se aplica el descuento de cliente de siempre.
  function calcular(trabajo, ajustes, conDescuento) {
    const a = Object.assign({}, POR_DEFECTO, ajustes || {});
    const r = resumen(trabajo);
    const gestion = redondear(r.material * a.margen);
    const manoObra = redondear(r.horas * a.precio_hora);
    const desplazamiento = redondear(r.viajes * a.precio_viaje);
    const justo = redondear(r.material + gestion + manoObra + desplazamiento);
    const descuento = conDescuento ? redondear(justo * a.descuento_fiel) : 0;
    const total = redondear(justo - descuento);
    const gastosReales = redondear(r.material + r.viajes * a.gasolina);
    return {
      material: r.material, gestion: gestion, mano_obra: manoObra, desplazamiento: desplazamiento,
      justo: justo, descuento: descuento, total: total, gastos_reales: gastosReales,
      horas: r.horas, viajes: r.viajes, tickets: r.tickets, precio_hora: a.precio_hora
    };
  }

  // Lo que de verdad le queda por hora si cobra "cobrado". null si no hay horas apuntadas.
  function porHora(cuentas, cobrado) {
    if (!cuentas.horas) return null;
    return redondear((Number(cobrado) - cuentas.gastos_reales) / cuentas.horas);
  }

  window.Cuentas = { POR_DEFECTO, REFERENCIAS, redondear, euros, leerNumero, resumen, calcular, porHora };
})();
