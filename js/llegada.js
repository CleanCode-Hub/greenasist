// =====================================================================
// Llegada con QR · lado del JUGADOR.
//   1. El QR abre el portal con ?llegada=<código>.
//   2. El código se guarda mientras la persona inicia sesión (si hace falta).
//   3. Al entrar, se registra su llegada y se le muestra "¡Llegada registrada!".
//   4. O, ya dentro del portal, toca "📷 Escanear QR de llegada" y lo lee
//      con la cámara sin salir de la app.
// (El QR lo genera el administrador en admin-qr.js.)
// =====================================================================
(() => {
  const CLAVE = 'green-devils-llegada';
  const guardar = valor => { try { sessionStorage.setItem(CLAVE, valor); } catch (_) {} };
  const leer = () => { try { return sessionStorage.getItem(CLAVE); } catch (_) { return null; } };
  const olvidar = () => { try { sessionStorage.removeItem(CLAVE); } catch (_) {} };

  // --- 1. Tomar el código del link y quitarlo de la barra de direcciones ---
  const params = new URLSearchParams(location.search);
  let codigoEnMemoria = params.get('llegada');
  if (codigoEnMemoria) {
    guardar(codigoEnMemoria);
    params.delete('llegada');
    history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash);
  }
  const pendiente = () => leer() || codigoEnMemoria;

  // Aviso en la pantalla de inicio de sesión.
  document.getElementById('login-llegada').hidden = !pendiente();

  // Link del portal que va dentro del QR.
  Portal.urlPortal = function () {
    const configurada = window.PORTAL_CONFIG.urlPublica;
    if (configurada) return configurada;
    return /^https?:$/.test(location.protocol) ? location.origin + location.pathname : '';
  };

  // --- 2. Registrar (lo llama sesion.js justo después de entrar) ---------
  Portal.registrarLlegadaPendiente = async function () {
    const codigo = pendiente();
    if (!codigo) return;
    olvidar(); codigoEnMemoria = null;
    await registrar(codigo);
  };

  async function registrar(codigo) {
    if (Portal.perfil.rol === 'admin') {
      mostrar(false, 'Eres administrador', 'Este QR es para que los jugadores registren su llegada.');
      return;
    }
    const { data, error } = await Portal.nube.rpc('registrar_llegada', { p_codigo: codigo });
    if (error || !data?.ok) {
      mostrar(false, 'No se pudo registrar', `${data?.error || 'Revisa tu conexión a internet.'} Si sigue sin funcionar, pídele al administrador que te marque en la lista.`);
      return;
    }
    const nombre = Portal.perfil.nombre_completo.split(' ')[0];
    mostrar(true, '¡Llegada registrada!', `Bienvenido, ${nombre}. Quedaste registrado el ${Portal.club.fechaLarga(data.fecha)}.`);
    Portal.recargarJugador?.();   // para que ya salga "Asistí" en su panel
  }

  // --- 3. Ventana grande con el resultado -------------------------------
  const dialogo = document.getElementById('dialogo-llegada');
  function mostrar(bien, titulo, texto) {
    const icono = document.getElementById('llegada-icono');
    icono.textContent = bien ? '✓' : '✗';
    icono.className = `llegada-icono ${bien ? 'bien' : 'mal'}`;
    document.getElementById('llegada-titulo').textContent = titulo;
    document.getElementById('llegada-texto').textContent = texto;
    dialogo.showModal();
  }
  dialogo.querySelector('[data-cerrar]').addEventListener('click', () => dialogo.close());

  // --- 4. Escanear el QR desde el portal (ya con la sesión abierta) -----
  // Usa la cámara de atrás. Lee el QR con el lector del navegador si lo tiene
  // (Chrome en Android) o con jsQR (iPhone y los demás), que se carga solo al usarlo.
  const escaner = document.getElementById('dialogo-escaner');
  const video = document.getElementById('escaner-video');
  const estado = document.getElementById('escaner-estado');
  const lienzo = document.createElement('canvas');
  let camara = null, leyendo = false;

  const cargarJsQR = () => window.jsQR ? Promise.resolve() : new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    s.onload = ok; s.onerror = () => mal(new Error('sin-lector'));
    document.head.append(s);
  });

  // Lector: devuelve una función que recibe el video y regresa el texto del QR (o null).
  async function crearLector() {
    if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      return async () => (await detector.detect(video))[0]?.rawValue || null;
    }
    await cargarJsQR();
    return async () => {
      const escala = Math.min(1, 640 / video.videoWidth);
      lienzo.width = Math.round(video.videoWidth * escala);
      lienzo.height = Math.round(video.videoHeight * escala);
      const ctx = lienzo.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
      const imagen = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
      return window.jsQR(imagen.data, imagen.width, imagen.height)?.data || null;
    };
  }

  // Del texto del QR saca el código: viene como <link del portal>?llegada=<código>.
  function codigoDe(texto) {
    try { return new URL(texto).searchParams.get('llegada'); }
    catch (_) { return /^[A-Za-z0-9]{16,64}$/.test(texto) ? texto : null; }
  }

  async function abrirEscaner() {
    estado.textContent = 'Abriendo la cámara…';
    estado.classList.remove('mal');
    escaner.showModal();
    if (!navigator.mediaDevices?.getUserMedia) {
      return fallo('Este navegador no deja usar la cámara aquí. Escanea el QR con la app de Cámara del celular.');
    }
    try {
      camara = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (err) {
      return fallo(err.name === 'NotAllowedError'
        ? 'No diste permiso para usar la cámara. Actívalo en los ajustes del navegador para este sitio, o escanea el QR con la app de Cámara.'
        : 'No se pudo abrir la cámara. Escanea el QR con la app de Cámara del celular.');
    }
    if (!escaner.open) return detener();   // lo cerraron mientras pedía permiso
    video.srcObject = camara;
    await video.play().catch(() => {});

    let leer;
    try { leer = await crearLector(); }
    catch (_) { return fallo('No se pudo cargar el lector de QR. Revisa tu conexión a internet.'); }
    estado.textContent = 'Apunta al QR que muestra el administrador.';

    leyendo = true;
    while (leyendo && escaner.open) {
      await new Promise(r => setTimeout(r, 200));
      if (!video.videoWidth) continue;
      let texto = null;
      try { texto = await leer(); } catch (_) {}
      if (!texto || !leyendo) continue;
      const codigo = codigoDe(texto);
      if (!codigo) { estado.textContent = 'Ese QR no es el de llegada. Apunta al QR que muestra el administrador.'; continue; }
      leyendo = false;
      estado.textContent = 'Registrando…';
      escaner.close();
      await registrar(codigo);
    }
  }

  function fallo(texto) {
    detener();
    estado.textContent = texto;
    estado.classList.add('mal');
  }

  function detener() {
    leyendo = false;
    camara?.getTracks().forEach(t => t.stop());
    camara = null;
    video.srcObject = null;
  }

  escaner.addEventListener('close', detener);
  document.getElementById('btn-escanear').addEventListener('click', abrirEscaner);
})();
