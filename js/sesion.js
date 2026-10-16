// =====================================================================
// Inicio y cierre de sesión. Decide qué panel ve cada quien:
//   1. ¿Hay sesión?                        No  -> pantalla de inicio de sesión.
//   2. ¿Tiene contraseña temporal?         Sí  -> obligar a cambiarla.
//   3. ¿Perfil activo?                     No  -> sacar con mensaje.
//   4. Según el rol:
//        admin   -> panel del administrador
//        coach   -> su panel de jugador + estadísticas del equipo (solo ver)
//        jugador -> panel del jugador
//        pits    -> panel del jugador en modo staff (solo calendario)
// Este archivo se carga al final: usa funciones de los demás.
// =====================================================================
(() => {
  const html = document.documentElement;
  const login = document.getElementById('login');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const portal = document.getElementById('portal');

  function mostrarLogin(mensaje = '') {
    portal.hidden = true;
    login.classList.remove('oculto');
    loginError.textContent = mensaje;
    loginError.classList.toggle('oculto', !mensaje);
    html.dataset.estado = 'listo';
  }

  async function entrar() {
    const { debeCambiar } = await Portal.gestionarCuenta({ accion: 'estado-contrasena' });
    if (debeCambiar) {
      login.classList.add('oculto');
      html.dataset.estado = 'listo';
      Portal.abrirContrasena('obligatoria');
      return;
    }

    const { data: { user } } = await Portal.nube.auth.getUser();
    const { data: perfil } = await Portal.nube.from('perfiles').select('*').eq('id', user.id).single();
    if (!perfil || !perfil.activo) throw new Error('Esta cuenta no está activa. Consulta al administrador.');
    Portal.perfil = perfil;

    document.getElementById('bienvenida').textContent =
      `${perfil.nombre_completo} · ${Portal.club.nombreRol(perfil.rol)}`;
    // Solo el admin cambia su contraseña desde el portal. Los demás piden una
    // temporal al admin (y al entrar con ella el portal los obliga a cambiarla).
    document.getElementById('btn-mi-contrasena').hidden = perfil.rol !== 'admin';
    login.classList.add('oculto');
    portal.hidden = false;
    html.dataset.estado = 'listo';

    // Si llegó escaneando el QR, se registra su llegada antes de cargar el panel.
    await Portal.registrarLlegadaPendiente();
    if (perfil.rol === 'admin') await Portal.mostrarAdmin();
    else if (perfil.rol === 'coach') await Portal.mostrarCoach();   // su panel + estadísticas del equipo
    else await Portal.mostrarJugador();
  }

  // Cierra sesión y recarga limpio (no quedan datos de la cuenta anterior en memoria).
  Portal.salir = async function (alcance = 'global') {
    html.dataset.estado = 'cargando';
    await Portal.cerrarSesion(alcance);
    location.reload();
  };

  // --- Formulario de inicio de sesión -------------------------------
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const boton = loginForm.querySelector('button');
    const datos = new FormData(loginForm);
    boton.disabled = true;
    loginError.classList.add('oculto');
    try {
      const { error } = await Portal.nube.auth.signInWithPassword({
        email: await Portal.correoDeUsuario(datos.get('usuario')),
        password: datos.get('contrasena')
      });
      if (error) throw new Error(/banned/i.test(error.message)
        ? 'Esta cuenta está desactivada. Consulta al administrador.'
        : 'Usuario o contraseña incorrectos.');
      loginForm.reset();
      await entrar();
    } catch (err) {
      await Portal.cerrarSesion('local');
      mostrarLogin(err.message || 'No se pudo iniciar sesión. Intenta nuevamente.');
    } finally {
      boton.disabled = false;
    }
  });

  document.getElementById('btn-salir').addEventListener('click', () => Portal.salir('global'));
  document.getElementById('btn-mi-contrasena').addEventListener('click', () => Portal.abrirContrasena('propia'));

  // --- Al abrir la página: ¿ya había sesión? ------------------------
  (async () => {
    try {
      const { data: { session } } = await Portal.nube.auth.getSession();
      if (!session) return mostrarLogin();
      await entrar();
    } catch (err) {
      await Portal.cerrarSesion('local');
      mostrarLogin(err.message);
    }
  })();
})();
