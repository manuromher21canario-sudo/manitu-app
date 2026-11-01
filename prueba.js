// Prueba automática de Manitu: usa la app como lo haría un trabajador y comprueba las cuentas.
// Uso: NODE_PATH=~/.npm-global/lib/node_modules/n8n/node_modules node prueba.js
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const aqui = __dirname;
const leer = (f) => fs.readFileSync(path.join(aqui, f), 'utf8');
// Metemos los scripts dentro del HTML para que funcionen sin servidor.
const html = leer('index.html')
  // Con función, para que símbolos del código como "$'" no se tomen como órdenes de reemplazo.
  .replace('<script src="cuentas.js"></script>', () => '<script>' + leer('cuentas.js') + '</script>')
  .replace('<script src="app.js"></script>', () => '<script>' + leer('app.js') + '</script>');

// Callamos el aviso de "scroll no disponible": el robot no tiene pantalla.
const consola = new VirtualConsole();
consola.on('error', (e) => console.error(e));
consola.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) console.error(e); });
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: consola });
const { window } = dom;
const doc = window.document;
window.scrollTo = () => {};
window.print = () => {};

let bien = 0, mal = 0;
function comprobar(nombre, ok) {
  if (ok) { bien++; console.log('  ✓ ' + nombre); } else { mal++; console.log('  ✗ ' + nombre); }
}
const texto = () => doc.getElementById('app').textContent;
const $ = (sel) => doc.querySelector(sel);
function tocar(accion, valor) {
  const sel = '[data-accion="' + accion + '"]' + (valor != null ? '[data-valor="' + valor + '"]' : '');
  const el = $(sel);
  if (!el) throw new Error('No encuentro el botón ' + sel);
  el.click();
}
function tocarTexto(t) {
  const el = [...doc.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
  if (!el) throw new Error('No encuentro el botón «' + t + '»');
  el.click();
}
function rellenar(campos) {
  Object.entries(campos).forEach(([id, v]) => {
    const el = doc.getElementById(id);
    el.value = v;
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}
function enviar(form, boton) {
  const f = $('[data-form="' + form + '"]');
  f.requestSubmit(boton ? f.querySelector(boton) : undefined);
}
function chat(t) { $('[data-form="chat"] input').value = t; enviar('chat'); }

console.log('Alta');
comprobar('empieza en la pantalla de alta', texto().includes('Empecemos'));
rellenar({ oficio: 'fontanero' });
comprobar('enseña los precios de la zona', $('#referencia').textContent.includes('entre 17 y 40'));
rellenar({ combustible: 'diesel' });
comprobar('al elegir diésel propone 1,60 € el litro', $('#precio_litro').value === '1,6');
rellenar({ vehiculo: 'furgoneta' });
comprobar('al elegir furgoneta propone 7,5 litros', $('#consumo').value === '7,5');
rellenar({ nombre: 'Juan', precio_hora: '25', precio_viaje: '12', margen: '10', descuento_fiel: '0.1', combustible: 'gasolina', precio_litro: '1,50' });
enviar('perfil');
comprobar('llega al inicio con su nombre', texto().includes('Juan') && texto().includes('Este mes has cobrado'));
comprobar('la primera vez explica cómo funciona', texto().includes('Cómo funciona'));

console.log('Primer trabajo (el ejemplo del grifo)');
tocar('ir', 'nuevo');
rellenar({ cliente: 'Ana Pérez', que: 'Cambiar el grifo' });
enviar('nuevo');
comprobar('abre el trabajo', texto().includes('Ana Pérez') && texto().includes('Cambiar el grifo'));
comprobar('no es cliente de siempre todavía', !texto().includes('Cliente de siempre'));
tocar('formulario', 'ticket');
rellenar({ importe: '30', cosa: 'Grifo' });
enviar('ticket');
tocar('formulario', 'horas');
tocar('horas', '2');
tocar('formulario', 'viaje');
comprobar('la primera vez pregunta los km sin proponer', texto().includes('¿Cuántos km son') && !texto().includes('la última vez'));
rellenar({ km: '20' });
enviar('viaje');
comprobar('el viaje sale con sus km', texto().includes('Viaje · 20 km'));
comprobar('precio justo 95 € (30 + 3 + 50 + 12)', texto().includes('95 €'));

console.log('Deshacer');
tocar('quitar', $('[data-accion="quitar"]').dataset.valor);
comprobar('al quitar el ticket baja el precio', !texto().includes('95 €'));
tocar('deshacer');
comprobar('Deshacer lo devuelve', texto().includes('95 €'));

console.log('Terminar');
tocarTexto('Terminar el trabajo');
comprobar('gasolina: 20 km × 7,5 l/100 km × 1,50 € = 2,25 €', texto().includes('Tu gasolina en este trabajo: 2,25 € (20 km)'));
comprobar('con el precio justo quedan 31,38 €/h', texto().includes('31,38 € por hora'));
comprobar('primer trabajo: sin casilla de descuento', !$('[data-accion="descuento"]'));
rellenar({ pensaba: '50' });
comprobar('pensando 50 € le quedan 8,88 €/h y le avisa', $('#comparar').textContent.includes('8,88 € por hora') && $('#comparar .ojo'));
enviar('cerrar', 'button[value="justo"]');
comprobar('terminado y cobrado 95 €', texto().includes('Cobraste') && texto().includes('95 €'));

console.log('Papel para el cliente');
tocar('papel', $('[data-accion="papel"]').dataset.valor);
const papel = texto();
comprobar('total 95 € y "no es una factura"', papel.includes('95 €') && papel.includes('Esto no es una factura'));
comprobar('las horas NO salen en el papel', !/\d\s?h\b/.test(papel) && !papel.includes('hora'));
comprobar('ni los km ni la gasolina', !papel.includes('km') && !papel.includes('asolina'));
comprobar('sale el material del ticket', papel.includes('Material: Grifo'));
const mensaje = decodeURIComponent($('#enviar-whatsapp').href.split('text=')[1]);
comprobar('el mensaje de WhatsApp lleva el total en negrita', mensaje.includes('*Total: 95 €*') && mensaje.includes('Para: Ana Pérez'));
comprobar('y tampoco lleva horas, km ni gasolina', !/\d\s?h\b/.test(mensaje) && !mensaje.includes('km') && !mensaje.includes('asolina'));

console.log('Ayudante: escribiendo como se habla');
tocar('ir', 'ayudante');
comprobar('el ayudante saluda', texto().includes('¿Qué quieres apuntar?'));
comprobar('se puede escribir desde el principio', !!$('[data-form="chat"] input'));
chat('hola qué tal');
comprobar('si no entiende, no se rinde: pregunta qué hacer con ello', texto().includes('No sé qué es «hola qué tal»') && texto().includes('Guardarlo como nota'));
tocarTexto('Cancelar');
chat('nuevo trabajo');
comprobar('pregunta el cliente y ofrece los de siempre', texto().includes('¿Para quién es el trabajo?') && [...doc.querySelectorAll('.opciones button')].some((b) => b.textContent === 'Ana Pérez'));
tocarTexto('Ana Pérez');
chat('Pintar la cocina');
comprobar('reconoce a la clienta de siempre', texto().includes('Es cliente de siempre: 1 trabajo'));
comprobar('sin botón de más: vuelve directo al menú', !texto().includes('Apuntar otra cosa') && !!$('[data-valor="ticket"]'));
chat('2 horas');
comprobar('«2 horas» → apunta 2 h sin preguntar', texto().includes('Para el trabajo de Ana Pérez') && texto().includes('Apuntadas 2 h'));
chat('10 € de pintura');
comprobar('«10 € de pintura» → ticket de 10 € de pintura', texto().includes('Apuntado: 10 € de pintura'));
chat('viaje');
comprobar('«viaje» → pregunta los km y recuerda los de la clienta', texto().includes('¿Cuántos km son') && texto().includes('Igual que la última vez: 20 km'));
tocarTexto('Igual que la última vez: 20 km');
comprobar('apunta el viaje con su gasolina', texto().includes('Apuntado un viaje de 20 km') && texto().includes('2,25 € de gasolina'));
const apuntesAna = () => JSON.parse(window.localStorage.getItem('manitu-v1')).trabajos[0].apuntes;
const antesDeProbar = apuntesAna().length;
chat('5');
comprobar('un número solo → pregunta qué es', texto().includes('¿Qué es ese 5?'));
tocarTexto('Euros de un ticket');
chat('cancelar');
comprobar('«cancelar» lo deja sin apuntar nada', texto().includes('Vale, lo dejamos') && apuntesAna().length === antesDeProbar);
chat('media hora');
comprobar('«media hora» → 0,5 h', texto().includes('Apuntadas 0,5 h'));
tocar('deshacer');
comprobar('al Deshacer, el chat lo dice y se quita', texto().includes('Deshecho: lo último ya no está apuntado') && apuntesAna().length === antesDeProbar);
chat('30 € de grifo nuevo');
comprobar('«30 € de grifo nuevo» es un ticket, no un trabajo nuevo', texto().includes('Apuntado: 30 € de grifo nuevo'));
tocar('deshacer');
console.log('Ayudante: situaciones de la vida real');
chat('el cliente me dio 50 € para el material');
comprobar('«el cliente me dio 50 € para el material» → dinero del cliente', texto().includes('Ana Pérez te dio 50 € (para el material)'));
comprobar('no cambia el precio justo y dice lo que queda por cobrar (73 − 50 = 23 €)', texto().includes('precio justo (73 €)') && texto().includes('por cobrar 23 €'));
chat('parking 3 €');
comprobar('«parking 3 €» → otro gasto, sin el % de gestión (76 €)', texto().includes('Apuntado otro gasto: parking, 3 €') && texto().includes('hasta ahora: 76 €'));
tocar('deshacer');
chat('nota: pone ella la pintura');
comprobar('«nota: …» → nota privada', texto().includes('Guardada la nota') && apuntesAna().some((a) => a.tipo === 'nota' && a.cosa === 'pone ella la pintura'));
chat('la vecina 20');
comprobar('frase rara con número → ofrece usarlo', texto().includes('No sé qué es «la vecina 20»') && texto().includes('Es otro gasto mío (20 €)'));
tocarTexto('Es otro gasto mío (20 €)');
comprobar('y lo apunta como gasto con su nombre', texto().includes('Apuntado otro gasto: la vecina, 20 €'));
tocar('deshacer');
tocarTexto('Otra cosa');
comprobar('el botón «Otra cosa» ofrece dinero, gasto y nota', texto().includes('¿Qué ha pasado?') && texto().includes('El cliente me dio dinero'));
tocarTexto('Cancelar');
chat('cómo voy este mes');
comprobar('«cómo voy este mes» → lo cobrado', texto().includes('Este mes has cobrado 95 €'));
tocar('ir', 'inicio');
tocar('ir', 'ayudante');
comprobar('al salir y volver, la conversación sigue ahí', texto().includes('Pintar la cocina'));

console.log('Descuento de cliente de siempre');
tocar('ir', 'inicio');
tocar('abrir', $('[data-accion="abrir"]').dataset.valor);
tocarTexto('Terminar el trabajo');
comprobar('sale la casilla de descuento, marcada', $('[data-accion="descuento"]') && $('[data-accion="descuento"]').checked);
comprobar('73 € − 10 % = 65,70 €', texto().includes('65,70 €'));
$('[data-accion="descuento"]').click();
comprobar('quitando el descuento vuelve a 73 €', texto().includes('Precio justo73 €'));
$('[data-accion="descuento"]').click();
enviar('cerrar', 'button[value="justo"]');
tocar('papel', $('[data-accion="papel"]').dataset.valor);
comprobar('el papel enseña el descuento', texto().includes('Descuento por ser cliente de siempre'));
comprobar('y lo ya pagado: 65,70 − 50 = 15,70 € por pagar', texto().includes('Ya pagado (para el material)') && texto().includes('Queda por pagar15,70 €'));
comprobar('la nota no sale en el papel', !texto().includes('pone ella'));

console.log('Inicio y datos guardados');
tocar('ir', 'inicio');
comprobar('este mes: 95 + 65,70 = 160,70 €', texto().includes('160,70 €') && texto().includes('2 trabajos terminados'));
comprobar('se guarda en el móvil', JSON.parse(window.localStorage.getItem('manitu-v1')).trabajos.length === 2);
comprobar('con trabajos ya no sale la guía', !texto().includes('Cómo funciona'));

console.log('Empezar de cero');
tocar('ir', 'ajustes');
tocar('pedir-borrar');
tocar('borrar-todo');
comprobar('vuelve al alta', texto().includes('Empecemos'));
tocar('deshacer');
comprobar('y Deshacer lo recupera todo', texto().includes('160,70 €'));

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
