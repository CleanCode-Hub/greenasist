// =====================================================================
// Llegada con QR · lado del JUGADOR.
//   1. El QR abre el portal con ?llegada=<código>.
//   2. El código se guarda mientras la persona inicia sesión (si hace falta).
//   3. Al entrar, se registra su llegada y se le muestra "¡Llegada registrada!".
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
  };

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
})();
