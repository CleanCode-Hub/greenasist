// =====================================================================
// Ventana de contraseña. Tiene tres modos:
//   'propia'       El usuario cambia su contraseña (botón "Cambiar contraseña").
//   'obligatoria'  Entró con una contraseña temporal: debe cambiarla para continuar.
//   'restablecer'  El administrador asigna una contraseña temporal a otra cuenta.
// =====================================================================
(() => {
  const dialogo = document.getElementById('dialogo-contrasena');
  const form = document.getElementById('form-contrasena');
  const error = form.querySelector('.error');
  const botonGenerar = form.querySelector('[data-generar]');
  const botonCerrar = form.querySelector('[data-cerrar]');
  let modo = 'propia', cuenta = null, ocupado = false;

  const TEXTOS = {
    propia:      { titulo: 'Cambiar contraseña', texto: 'Escribe tu contraseña actual y elige una nueva.', nueva: 'Nueva contraseña', cerrar: 'Cancelar' },
    obligatoria: { titulo: 'Cambia tu contraseña temporal', texto: 'Antes de entrar, elige una contraseña que solo tú conozcas.', nueva: 'Nueva contraseña', cerrar: 'Cerrar sesión' },
    restablecer: { titulo: 'Contraseña temporal', texto: '', nueva: 'Contraseña temporal', cerrar: 'Cancelar' }
  };

  Portal.abrirContrasena = function (nuevoModo, cuentaObjetivo = null) {
    modo = nuevoModo; cuenta = cuentaObjetivo;
    const t = TEXTOS[modo];
    form.reset(); error.textContent = '';
    mostrarCampos(false);
    document.getElementById('contrasena-titulo').textContent = t.titulo;
    document.getElementById('etiqueta-nueva').textContent = t.nueva;
    document.getElementById('contrasena-texto').innerHTML = modo === 'restablecer'
      ? `Asigna una contraseña temporal a <strong>${Portal.esc(cuenta.nombre_completo)}</strong> (${Portal.esc(cuenta.usuario)}). Al entrar deberá cambiarla.`
      : t.texto;
    // Al restablecer no se pide la contraseña actual (es de otra persona).
    const campoActual = document.getElementById('campo-actual');
    campoActual.hidden = modo === 'restablecer';
    form.elements.actual.required = modo !== 'restablecer';
    botonGenerar.hidden = modo !== 'restablecer';
    // Al restablecer, se pone la contraseña temporal del equipo (config.js), a la vista.
    const temporal = window.PORTAL_CONFIG.contrasenaTemporal;
    if (modo === 'restablecer' && temporal) {
      form.elements.nueva.value = temporal;
      form.elements.confirmar.value = temporal;
      mostrarCampos(true);
    }
    botonCerrar.textContent = t.cerrar;
    if (!dialogo.open) dialogo.showModal();
  };

  // Muestra u oculta lo escrito en los campos de contraseña nueva.
  function mostrarCampos(visible) {
    form.elements.nueva.type = visible ? 'text' : 'password';
    form.elements.confirmar.type = visible ? 'text' : 'password';
  }

  botonGenerar.addEventListener('click', () => {
    const temporal = Portal.generarTemporal();
    form.elements.nueva.value = temporal;
    form.elements.confirmar.value = temporal;
    mostrarCampos(true);
  });

  // En modo obligatorio no se puede cerrar con Esc: solo cambiar o cerrar sesión.
  dialogo.addEventListener('cancel', e => { if (modo === 'obligatoria' || ocupado) e.preventDefault(); });

  botonCerrar.addEventListener('click', async () => {
    if (ocupado) return;
    dialogo.close();
    if (modo === 'obligatoria') await Portal.salir('local');
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (ocupado) return;
    const nueva = form.elements.nueva.value;
    if (nueva.length < Portal.CONTRASENA_MIN || nueva.length > Portal.CONTRASENA_MAX) {
      error.textContent = `Usa entre ${Portal.CONTRASENA_MIN} y ${Portal.CONTRASENA_MAX} caracteres.`; return;
    }
    if (nueva !== form.elements.confirmar.value) { error.textContent = 'Las contraseñas no coinciden.'; return; }

    ocupado = true; error.textContent = 'Guardando…';
    form.querySelectorAll('button').forEach(b => b.disabled = true);
    try {
      if (modo === 'restablecer') {
        await Portal.gestionarCuenta({ accion: 'restablecer-contrasena', idCuenta: cuenta.id, temporal: nueva });
        dialogo.close();
        alert(`Listo. Contraseña temporal de ${cuenta.nombre_completo}:\n\n${nueva}\n\nEntrégasela personalmente; deberá cambiarla al entrar.`);
      } else {
        await Portal.gestionarCuenta({ accion: 'cambiar-contrasena', actual: form.elements.actual.value, nueva });
        dialogo.close();
        alert('Contraseña actualizada. Inicia sesión con tu nueva contraseña.');
        await Portal.salir('local');
      }
    } catch (err) {
      error.textContent = err.message;
    } finally {
      ocupado = false;
      form.querySelectorAll('button').forEach(b => b.disabled = false);
    }
  });

  dialogo.addEventListener('close', () => { form.reset(); mostrarCampos(false); });
})();
