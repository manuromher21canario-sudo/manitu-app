// Prueba "como una persona": abre Manitu en un Chrome invisible con pantalla de móvil,
// mueve el ratón poco a poco, hace scroll con la rueda, escribe letra a letra y hace fotos.
// Comprueba además que cada botón se ve y que nada lo tapa (el menú de abajo, el aviso…).
// Uso: NODE_PATH=~/.npm-global/lib/node_modules/n8n/node_modules node prueba-persona.js
// Las fotos quedan en capturas/ (no se suben a GitHub).
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const aqui = __dirname;
const carpetaFotos = path.join(aqui, 'capturas');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

// Un servidor pequeñito solo para la prueba (localStorage no funciona bien abriendo el archivo a pelo).
function servidor() {
  const srv = http.createServer((req, res) => {
    const ruta = path.join(aqui, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    if (!ruta.startsWith(aqui) || !fs.existsSync(ruta)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(ruta)] || 'application/octet-stream' });
    fs.createReadStream(ruta).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

let bien = 0, mal = 0, numFoto = 0;
function comprobar(nombre, ok) {
  if (ok) { bien++; console.log('  ✓ ' + nombre); } else { mal++; console.log('  ✗ ' + nombre); }
}
const azar = (min, max) => min + Math.random() * (max - min);
const pausa = (page, min = 150, max = 450) => page.waitForTimeout(azar(min, max));

async function main() {
  fs.mkdirSync(carpetaFotos, { recursive: true });
  fs.readdirSync(carpetaFotos).forEach((f) => fs.unlinkSync(path.join(carpetaFotos, f)));
  const srv = await servidor();
  const navegador = await chromium.launch();
  const page = await navegador.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-ES' });
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('dialog', (d) => d.dismiss());
  await page.addInitScript(() => { window.print = () => {}; });

  let raton = { x: 195, y: 400 };

  // --- Lo que hace "la persona" ---

  async function foto(nombre) {
    numFoto++;
    await page.screenshot({ path: path.join(carpetaFotos, String(numFoto).padStart(2, '0') + '-' + nombre + '.png') });
  }

  // Mueve el ratón en curva suave, con varios pasos, como una mano.
  async function moverA(x, y) {
    const pasos = Math.round(azar(12, 22));
    const curva = { x: (raton.x + x) / 2 + azar(-40, 40), y: (raton.y + y) / 2 + azar(-40, 40) };
    for (let i = 1; i <= pasos; i++) {
      const t = i / pasos;
      const px = (1 - t) * (1 - t) * raton.x + 2 * (1 - t) * t * curva.x + t * t * x;
      const py = (1 - t) * (1 - t) * raton.y + 2 * (1 - t) * t * curva.y + t * t * y;
      await page.mouse.move(px, py);
      await page.waitForTimeout(azar(8, 22));
    }
    raton = { x, y };
  }

  // Hace scroll con la rueda, a tirones pequeños, hasta que el elemento esté a la vista.
  async function llevarALaVista(loc) {
    // Lo que está fijo en la pantalla (el menú de abajo, el aviso) no se mueve con el scroll: se toca y ya.
    const fijo = await loc.evaluate((el) => {
      for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') return true;
      return false;
    });
    if (fijo) return loc.boundingBox();
    for (let intento = 0; intento < 40; intento++) {
      const caja = await loc.boundingBox();
      if (!caja) throw new Error('No se ve en la página');
      const alto = page.viewportSize().height;
      const zonaLibreAbajo = alto - 130; // el menú de abajo y el aviso tapan esa franja
      if (caja.y >= 10 && caja.y + caja.height <= zonaLibreAbajo) return caja;
      const sentido = caja.y < 10 ? -1 : 1;
      await page.mouse.wheel(0, sentido * azar(90, 180));
      await page.waitForTimeout(azar(60, 140));
    }
    throw new Error('No consigo llevarlo a la vista con scroll');
  }

  // Comprueba que en el centro del elemento no hay otra cosa encima (algo que lo tape).
  async function nadaLoTapa(loc, caja) {
    return loc.evaluate((el, p) => {
      const arriba = document.elementFromPoint(p.x, p.y);
      return el === arriba || el.contains(arriba);
    }, { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 });
  }

  async function tocar(loc, nombre) {
    loc = loc.first();
    await loc.waitFor({ state: 'visible', timeout: 3000 });
    const caja = await llevarALaVista(loc);
    const libre = await nadaLoTapa(loc, caja);
    if (!libre) comprobar('«' + nombre + '» no está tapado por nada', false);
    await moverA(caja.x + caja.width * azar(0.3, 0.7), caja.y + caja.height * azar(0.3, 0.7));
    await pausa(page, 80, 220);
    await page.mouse.down(); await page.waitForTimeout(azar(50, 120)); await page.mouse.up();
    await pausa(page);
  }
  const boton = (texto) => page.getByRole('button', { name: texto, exact: true });
  const tocarBoton = (texto) => tocar(boton(texto), texto);

  // Escribe letra a letra, con el ritmo irregular de una persona.
  async function escribir(selector, texto) {
    const loc = page.locator(selector);
    await tocar(loc, selector);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    for (const letra of texto) {
      await page.keyboard.type(letra);
      await page.waitForTimeout(azar(40, 140));
    }
    await pausa(page, 100, 250);
  }
  async function elegir(selector, valor) {
    const loc = page.locator(selector);
    await tocar(loc, selector);
    await loc.selectOption(valor);
    await pausa(page);
  }
  const texto = () => page.locator('#app').innerText();
  // ¿Se ve entero en la pantalla, sin que nada lo tape? (sin hacer scroll: lo que ve la persona ahora mismo)
  async function seVeSinTapar(loc) {
    loc = loc.last();
    const caja = await loc.boundingBox();
    if (!caja || caja.y < 0 || caja.y + caja.height > page.viewportSize().height) return false;
    const puntos = [[0.5, 0.15], [0.5, 0.85], [0.1, 0.5], [0.9, 0.5]];
    for (const [fx, fy] of puntos) {
      const ok = await loc.evaluate((el, p) => { const a = document.elementFromPoint(p.x, p.y); return el === a || el.contains(a); },
        { x: caja.x + caja.width * fx, y: caja.y + caja.height * fy });
      if (!ok) return false;
    }
    return true;
  }
  // Mira la pantalla de arriba abajo con la rueda, como quien lee.
  async function leerPantalla() {
    const altoPagina = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < altoPagina; y += azar(150, 260)) { await page.mouse.wheel(0, azar(150, 260)); await page.waitForTimeout(azar(80, 160)); }
    await page.mouse.wheel(0, -altoPagina * 2); await page.waitForTimeout(200);
  }

  // --- La visita ---
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  await page.goto(url);

  console.log('Alta');
  await foto('alta');
  comprobar('abre en la pantalla de alta', (await texto()).includes('Empecemos'));
  await escribir('#nombre', 'Juan');
  await elegir('#oficio', 'fontanero');
  comprobar('enseña los precios de la zona', (await page.locator('#referencia').innerText()).includes('entre 17 y 40'));
  await escribir('#precio_hora', '25');
  await escribir('#precio_viaje', '12');
  await elegir('#descuento_fiel', '0.1');
  await elegir('#vehiculo', 'furgoneta');
  comprobar('furgoneta: propone 7,5 litros', (await page.inputValue('#consumo')) === '7,5');
  await escribir('#precio_litro', '1,50');
  await foto('alta-rellena');
  await tocarBoton('Empezar');
  comprobar('llega al inicio', (await texto()).includes('Este mes has cobrado'));
  comprobar('la primera vez explica cómo funciona', (await texto()).includes('Cómo funciona'));
  await foto('inicio');

  console.log('Primer trabajo');
  await tocarBoton('Nuevo trabajo');
  await escribir('#cliente', 'Ana Pérez');
  await escribir('#que', 'Cambiar el grifo');
  await tocarBoton('Empezar el trabajo');
  await tocarBoton('Ticket');
  await escribir('#importe', '30');
  await escribir('#cosa', 'Grifo');
  await tocarBoton('Apuntar el ticket');
  await tocarBoton('Horas');
  await tocarBoton('2 h');
  await tocarBoton('Viaje');
  await escribir('#km', '20');
  await foto('viaje');
  await tocarBoton('Apuntar');
  comprobar('precio justo 95 €', (await texto()).includes('95 €'));
  await tocarBoton('Más');
  await tocarBoton('El cliente me dio dinero');
  await escribir('#importe', '50');
  await escribir('#cosa', 'Para el material');
  await tocarBoton('Apuntar el dinero');
  comprobar('dinero del cliente: queda por cobrar 45 €', (await texto()).includes('Te queda por cobrar 45 €'));
  await foto('dinero-del-cliente');
  await leerPantalla();
  await foto('trabajo');

  console.log('Terminar (el botón está abajo: hay que bajar con scroll)');
  await tocarBoton('Terminar el trabajo');
  comprobar('al entrar en Terminar no hay ningún aviso tapando', await page.locator('#aviso').isHidden());
  comprobar('gasolina 2,25 €', (await texto()).includes('2,25 €'));
  await escribir('#pensaba', '50');
  comprobar('pensando 50 € le avisa: 8,88 €/h', (await page.locator('#comparar').innerText()).includes('8,88 € por hora'));
  await foto('terminar');
  await tocarBoton('Cobrar el precio justo: 95 €');
  await tocarBoton('Ver el papel para el cliente');
  await foto('papel');
  const papel = await texto();
  comprobar('el papel no enseña horas, km ni gasolina', !papel.includes(' h ') && !papel.includes('km') && !papel.includes('asolina'));
  comprobar('el papel dice lo ya pagado y lo que queda', papel.includes('Ya pagado (para el material)') && papel.includes('Queda por pagar'));
  const enlace = await page.locator('#enviar-whatsapp').getAttribute('href');
  comprobar('botón Enviar por WhatsApp con el papel dentro', enlace.startsWith('https://wa.me/?text=') && decodeURIComponent(enlace).includes('*Total: 95 €*'));
  comprobar('el botón de WhatsApp se ve sin tapar al bajar', await (async () => { await llevarALaVista(page.locator('#enviar-whatsapp')); return seVeSinTapar(page.locator('#enviar-whatsapp')); })());

  console.log('Ayudante');
  await tocar(page.locator('#menu button', { hasText: 'Ayudante' }), 'menú Ayudante');
  comprobar('nada más entrar se puede escribir', await page.locator('[data-form="chat"] input').isVisible());
  await escribir('[data-form="chat"] input', 'nuevo trabajo'); await page.keyboard.press('Enter'); await pausa(page);
  await tocarBoton('Ana Pérez');
  await escribir('[data-form="chat"] input', 'Pintar la cocina'); await page.keyboard.press('Enter'); await pausa(page);
  await escribir('[data-form="chat"] input', '2 horas'); await page.keyboard.press('Enter'); await pausa(page);
  comprobar('«2 horas» apuntado escribiendo', (await texto()).includes('Apuntadas 2 h'));
  await escribir('[data-form="chat"] input', 'viaje'); await page.keyboard.press('Enter'); await pausa(page);
  comprobar('recuerda los km de Ana', (await texto()).includes('Igual que la última vez: 20 km'));
  await tocarBoton('Igual que la última vez: 20 km');
  await page.waitForTimeout(300);
  comprobar('el chat baja solo y la última respuesta se ve entera', await seVeSinTapar(page.locator('.burbuja.bot')));
  comprobar('y la caja de escribir también se ve', await seVeSinTapar(page.locator('[data-form="chat"] input')));
  await foto('ayudante');

  console.log('Deshacer (el aviso de abajo)');
  await tocar(page.locator('#aviso button', { hasText: 'Deshacer' }), 'Deshacer');
  const viajesDeAna = await page.evaluate(() => JSON.parse(localStorage.getItem('manitu-v1')).trabajos[0].apuntes.filter((a) => a.tipo === 'viaje').length);
  comprobar('Deshacer quita el viaje que acababa de apuntar', viajesDeAna === 0);
  comprobar('y el chat lo dice', (await texto()).includes('Deshecho'));

  console.log('Ajustes');
  await tocar(page.locator('#menu button', { hasText: 'Ajustes' }), 'menú Ajustes');
  await leerPantalla();
  await foto('ajustes');
  await tocarBoton('Guardar los cambios');

  console.log('Sin internet');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.context().setOffline(true);
  await page.reload();
  comprobar('sin internet, Manitu abre igual y con los datos', (await texto()).includes('Este mes has cobrado') && (await texto()).includes('95 €'));
  await foto('sin-internet');
  await page.context().setOffline(false);

  comprobar('sin errores en la consola de la página', errores.length === 0);
  if (errores.length) console.log('    ' + errores.join('\n    '));

  await navegador.close();
  srv.close();
  console.log('\n' + bien + ' bien, ' + mal + ' mal · fotos en capturas/');
  process.exit(mal ? 1 : 0);
}

main().catch((e) => { console.error('La prueba se paró: ' + e.message); process.exit(1); });
