// =====================================================================
// Llegada con QR · lado del ADMINISTRADOR.
//   - Muestra un QR grande que cambia cada 30 segundos.
//   - Cada código vale 5 minutos (lo define la base de datos).
//   - Cada 5 segundos actualiza quién ya llegó.
//   - Mantiene la pantalla encendida mientras está abierto (si el celular lo permite).
// (El registro del jugador está en llegada.js.)
// =====================================================================
(() => {
  const { club, admin } = Portal;
  const dialogo = document.getElementById('dialogo-qr');
  const imagen = document.getElementById('qr-imagen');
  const nota = document.getElementById('qr-nota');
  const contador = document.getElementById('qr-contador');
  const nombres = document.getElementById('qr-nombres');
  const error = document.getElementById('qr-error');
  const CAMBIO_QR = 30000, REVISAR_LLEGADAS = 5000;
  let entrenamiento = null, relojCodigo = null, relojLlegadas = null, pantallaEncendida = null, irALista = false;

  // Código difícil de adivinar (24 caracteres).
  function codigoAleatorio() {
    const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    return Array.from(crypto.getRandomValues(new Uint32Array(24)), n => letras[n % letras.length]).join('');
  }

  admin.abrirQR = async function (id) {
    entrenamiento = admin.datos.entrenamientos.find(e => e.id === id);
    if (!entrenamiento || entrenamiento.cancelado) return;
    const titulo = club.rangoLargo(entrenamiento);
    document.getElementById('qr-fecha').textContent = titulo[0].toUpperCase() + titulo.slice(1);
    error.textContent = ''; contador.textContent = ''; nombres.textContent = ''; irALista = false;
    dialogo.showModal();

    if (!Portal.urlPortal()) {
      imagen.innerHTML = `<p class="qr-sin-link">Para usar el QR primero hay que <strong>publicar el portal con un link</strong> (por ejemplo GitHub Pages).<br><br>Mientras tanto usa <strong>“Ver lista”</strong> y marca a cada jugador.</p>`;
      nota.hidden = true;
    } else {
      nota.hidden = false;
      imagen.innerHTML = '<div class="spinner"></div>';
      await nuevoCodigo();
      if (!dialogo.open) return;   // lo cerraron mientras cargaba
      relojCodigo = setInterval(nuevoCodigo, CAMBIO_QR);
      try { pantallaEncendida = await navigator.wakeLock?.request('screen'); } catch (_) {}
      // Limpieza: borra códigos de días anteriores.
      Portal.nube.from('codigos_llegada').delete().lt('expira', new Date(Date.now() - 86400000).toISOString()).then(() => {});
    }
    await revisarLlegadas();
    if (!dialogo.open) return;
    relojLlegadas = setInterval(revisarLlegadas, REVISAR_LLEGADAS);
  };

  async function nuevoCodigo() {
    const codigo = codigoAleatorio();
    const { error: errorBD } = await Portal.nube.from('codigos_llegada').insert({ codigo, entrenamiento_id: entrenamiento.id });
    if (errorBD) { error.textContent = 'No se pudo generar el código. Revisa tu conexión.'; return; }
    error.textContent = '';
    const qr = qrcode(0, 'M');
    qr.addData(`${Portal.urlPortal()}?llegada=${codigo}`);
    qr.make();
    imagen.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  }

  async function revisarLlegadas() {
    const { data } = await Portal.nube.from('asistencias')
      .select('jugador_id, actualizado_en')
      .eq('entrenamiento_id', entrenamiento.id).eq('estado', 'asistio')
      .order('actualizado_en', { ascending: false });
    if (!data) return;
    contador.textContent = data.length ? `✓ Ya llegaron ${data.length}` : 'Todavía no llega nadie';
    nombres.textContent = data.map(a => admin.cuentas.find(c => c.id === a.jugador_id)?.nombre_completo).filter(Boolean).join(' · ');
  }

  function detener() {
    clearInterval(relojCodigo); clearInterval(relojLlegadas);
    relojCodigo = relojLlegadas = null;
    pantallaEncendida?.release?.().catch(() => {}); pantallaEncendida = null;
  }

  dialogo.querySelector('[data-cerrar]').addEventListener('click', () => dialogo.close());
  document.getElementById('qr-a-lista').addEventListener('click', () => { irALista = true; dialogo.close(); });

  // Al cerrar: se recargan los datos (para ver las llegadas) y, si se pidió, se abre la lista.
  dialogo.addEventListener('close', async () => {
    detener();
    await admin.recargar();
    if (irALista) admin.abrirLista(entrenamiento.id);
  });
})();
