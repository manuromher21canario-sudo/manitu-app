// Prueba automática de Manitu: usa la app como lo haría un trabajador y comprueba las cuentas.
// Uso: NODE_PATH=~/.npm-global/lib/node_modules/n8n/node_modules node prueba.js
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const aqui = __dirname;
const leer = (f) => fs.readFileSync(path.join(aqui, f), 'utf8');
// Metemos los scripts dentro del HTML para que funcionen sin servidor.
const html = leer('index.html')
  .replace('<script src="cuentas.js"></script>', '<script>' + leer('cuentas.js') + '</script>')
  .replace('<script src="app.js"></script>', '<script>' + leer('app.js') + '</script>');

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
rellenar({ nombre: 'Juan', precio_hora: '25', precio_viaje: '12', gasolina: '4', margen: '10', descuento_fiel: '0.1' });
enviar('perfil');
comprobar('llega al inicio con su nombre', texto().includes('Juan') && texto().includes('Este mes has cobrado'));

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
tocarTexto('Viaje');
comprobar('precio justo 95 € (30 + 3 + 50 + 12)', texto().includes('95 €'));

console.log('Deshacer');
tocar('quitar', $('[data-accion="quitar"]').dataset.valor);
comprobar('al quitar el ticket baja el precio', !texto().includes('95 €'));
tocar('deshacer');
comprobar('Deshacer lo devuelve', texto().includes('95 €'));

console.log('Terminar');
tocarTexto('Terminar el trabajo');
comprobar('con el precio justo quedan 30,50 €/h', texto().includes('30,50 € por hora'));
comprobar('primer trabajo: sin casilla de descuento', !$('[data-accion="descuento"]'));
rellenar({ pensaba: '50' });
comprobar('pensando 50 € le quedan 8 €/h y le avisa', $('#comparar').textContent.includes('8 € por hora') && $('#comparar .ojo'));
enviar('cerrar', 'button[value="justo"]');
comprobar('terminado y cobrado 95 €', texto().includes('Cobraste') && texto().includes('95 €'));

console.log('Papel para el cliente');
tocar('papel', $('[data-accion="papel"]').dataset.valor);
const papel = texto();
comprobar('total 95 € y "no es una factura"', papel.includes('95 €') && papel.includes('Esto no es una factura'));
comprobar('las horas NO salen en el papel', !/\d\s?h\b/.test(papel) && !papel.includes('hora'));
comprobar('sale el material del ticket', papel.includes('Material: Grifo'));

console.log('Segundo trabajo con el ayudante (cliente de siempre)');
tocar('ir', 'ayudante');
comprobar('el ayudante saluda', texto().includes('¿Qué quieres apuntar?'));
tocarTexto('Un trabajo nuevo');
chat('ana pérez');
chat('Pintar la cocina');
comprobar('reconoce a la clienta de siempre', texto().includes('Es cliente de siempre: 1 trabajo'));
tocarTexto('Apuntar otra cosa');
tocarTexto('Horas');
comprobar('con un solo trabajo en marcha no pregunta cuál', texto().includes('Para el trabajo de ana pérez'));
tocarTexto('2 h');
comprobar('apunta las horas', texto().includes('Apuntadas 2 h'));
tocarTexto('Apuntar otra cosa');
tocarTexto('Un ticket');
chat('diez');
comprobar('si no entiende el número, lo dice', texto().includes('No lo entiendo'));
chat('10');
chat('Pintura');
comprobar('apunta el ticket', texto().includes('Apuntado: 10 € de Pintura'));

console.log('Descuento de cliente de siempre');
tocar('ir', 'inicio');
tocar('abrir', $('[data-accion="abrir"]').dataset.valor);
tocarTexto('Terminar el trabajo');
comprobar('sale la casilla de descuento, marcada', $('[data-accion="descuento"]') && $('[data-accion="descuento"]').checked);
comprobar('61 € − 10 % = 54,90 €', texto().includes('54,90 €'));
$('[data-accion="descuento"]').click();
comprobar('quitando el descuento vuelve a 61 €', texto().includes('Precio justo61 €'));
$('[data-accion="descuento"]').click();
enviar('cerrar', 'button[value="justo"]');
tocar('papel', $('[data-accion="papel"]').dataset.valor);
comprobar('el papel enseña el descuento', texto().includes('Descuento por ser cliente de siempre'));

console.log('Inicio y datos guardados');
tocar('ir', 'inicio');
comprobar('este mes: 95 + 54,90 = 149,90 €', texto().includes('149,90 €') && texto().includes('2 trabajos terminados'));
comprobar('se guarda en el móvil', JSON.parse(window.localStorage.getItem('manitu-v1')).trabajos.length === 2);

console.log('Empezar de cero');
tocar('ir', 'ajustes');
tocar('pedir-borrar');
tocar('borrar-todo');
comprobar('vuelve al alta', texto().includes('Empecemos'));
tocar('deshacer');
comprobar('y Deshacer lo recupera todo', texto().includes('149,90 €'));

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
