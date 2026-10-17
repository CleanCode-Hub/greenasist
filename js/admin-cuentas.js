// =====================================================================
// Pestaña "Cuentas": lista, alta, editar, contraseña temporal, desactivar y reactivar.
// =====================================================================
(() => {
  const admin = Portal.admin;
  const lista = document.getElementById('lista-cuentas');
  const buscar = document.getElementById('buscar');
  const filtroRol = document.getElementById('filtro-rol');
  const verInactivos = document.getElementById('ver-inactivos');

  // --- Tabla --------------------------------------------------------
  admin.vistas.cuentas = function () {
    const visibles = admin.cuentas.filter(c =>
      (verInactivos.checked || c.activo) &&
      (!filtroRol.value || c.rol === filtroRol.value) &&
      Portal.coincideBusqueda(c, buscar.value)   // nombre o usuario
    );
    lista.innerHTML = visibles.length
      ? visibles.map(fila).join('')
      : '<tr><td colspan="6" class="vacio">No hay cuentas que coincidan.</td></tr>';
  };

  function fila(c) {
    const esYo = c.id === Portal.perfil.id;
    const rol = Portal.club.chipRol(c.rol);
    const estado = c.activo ? '<span class="chip activo">Activa</span>' : '<span class="chip inactivo">Inactiva</span>';
    const editar = `<button class="secundario" data-accion="editar" data-id="${c.id}">✏️ Editar</button>`;
    let acciones = `${editar}<em class="tenue">Tu cuenta</em>`;
    if (!esYo) acciones = c.activo
      ? `${editar}
         <button class="secundario" data-accion="restablecer" data-id="${c.id}">Contraseña temporal</button>
         <button class="secundario peligro" data-accion="desactivar" data-id="${c.id}">Desactivar</button>`
      : `${editar}<button class="secundario" data-accion="reactivar" data-id="${c.id}">Reactivar</button>`;
    return `<tr>
      <td data-etiqueta="Nombre">${Portal.esc(c.nombre_completo)}</td>
      <td data-etiqueta="Usuario">${Portal.esc(c.usuario)}</td>
      <td data-etiqueta="Rol">${rol}</td>
      <td data-etiqueta="Alta">${Portal.fecha(c.fecha_alta + 'T12:00')}</td>
      <td data-etiqueta="Estado">${estado}</td>
      <td data-etiqueta="Acciones"><div class="acciones">${acciones}</div></td>
    </tr>`;
  }

  buscar.addEventListener('input', admin.vistas.cuentas);
  filtroRol.addEventListener('change', admin.vistas.cuentas);
  verInactivos.addEventListener('change', admin.vistas.cuentas);

  // --- Botones de cada fila -----------------------------------------
  lista.addEventListener('click', async e => {
    const boton = e.target.closest('[data-accion]');
    if (!boton) return;
    const cuenta = admin.cuentas.find(c => c.id === boton.dataset.id);
    if (!cuenta) return;
    const accion = boton.dataset.accion;

    if (accion === 'restablecer') { Portal.abrirContrasena('restablecer', cuenta); return; }
    if (accion === 'editar') { abrirEditar(cuenta); return; }

    const pregunta = accion === 'desactivar'
      ? `¿Desactivar a ${cuenta.nombre_completo}? Ya no podrá iniciar sesión.`
      : `¿Reactivar a ${cuenta.nombre_completo}? Podrá volver a iniciar sesión.`;
    if (!confirm(pregunta)) return;
    boton.disabled = true;
    try {
      await Portal.gestionarCuenta({ accion, idCuenta: cuenta.id });
      await admin.recargar();
    } catch (err) {
      alert(err.message);
      boton.disabled = false;
    }
  });

  // --- Editar cuenta ------------------------------------------------
  const dialogoEditar = document.getElementById('dialogo-editar-cuenta');
  const formEditar = document.getElementById('form-editar-cuenta');
  const errorEditar = formEditar.querySelector('.error');
  let editando = null;

  function abrirEditar(cuenta) {
    editando = cuenta;
    const esYo = cuenta.id === Portal.perfil.id;
    formEditar.reset(); errorEditar.textContent = '';
    formEditar.elements.nombre.value = cuenta.nombre_completo;
    formEditar.elements.usuario.value = cuenta.usuario;
    formEditar.elements.rol.value = cuenta.rol;
    formEditar.elements.rol.disabled = esYo;          // no se puede quitar el rol de admin a sí mismo
    document.getElementById('editar-aviso-rol').hidden = !esYo;
    formEditar.elements.fechaAlta.value = cuenta.fecha_alta;
    dialogoEditar.showModal();
  }
  formEditar.querySelector('[data-cerrar]').addEventListener('click', () => dialogoEditar.close());

  formEditar.addEventListener('submit', async e => {
    e.preventDefault();
    const datos = {
      accion: 'editar',
      idCuenta: editando.id,
      nombre: formEditar.elements.nombre.value.trim(),
      usuario: Portal.normalizarUsuario(formEditar.elements.usuario.value),
      rol: formEditar.elements.rol.disabled ? editando.rol : formEditar.elements.rol.value,
      fechaAlta: formEditar.elements.fechaAlta.value
    };
    // Un recluta solo sube a jugador o coach si cumplió el 50% en un periodo terminado.
    if (editando.rol === 'recluta' && ['jugador', 'coach'].includes(datos.rol) && !admin.reclutaPuedeSubir(editando.id)) {
      errorEditar.textContent = 'Este recluta todavía no cumple el 50% de asistencia en un periodo terminado. Revisa su avance en 🔰 Reclutas.';
      return;
    }
    const cambiaUsuario = datos.usuario !== editando.usuario;
    if (cambiaUsuario && !confirm(`El usuario cambiará de "${editando.usuario}" a "${datos.usuario}".\n\nA partir de ahora deberá entrar con el usuario nuevo (su contraseña no cambia). ¿Continuar?`)) return;

    const botones = formEditar.querySelectorAll('button');
    botones.forEach(b => b.disabled = true); errorEditar.textContent = 'Guardando…';
    try {
      await Portal.gestionarCuenta(datos);
      // Si me edité a mí mismo, se actualiza el saludo de arriba.
      if (editando.id === Portal.perfil.id) {
        Object.assign(Portal.perfil, { nombre_completo: datos.nombre, usuario: datos.usuario, fecha_alta: datos.fechaAlta });
        document.getElementById('bienvenida').textContent = `${datos.nombre} · ${Portal.club.nombreRol(Portal.perfil.rol)}`;
      }
      dialogoEditar.close();
      await admin.recargar();
    } catch (err) {
      errorEditar.textContent = err.message;
    } finally {
      botones.forEach(b => b.disabled = false);
    }
  });

  // --- Nueva cuenta -------------------------------------------------
  const dialogo = document.getElementById('dialogo-nueva-cuenta');
  const form = document.getElementById('form-nueva-cuenta');
  const error = form.querySelector('.error');

  // También la usa la pestaña Reclutas ("+ Nuevo recluta").
  admin.abrirNuevaCuenta = function (rol = 'jugador') {
    form.reset(); error.textContent = '';
    form.elements.rol.value = rol;
    form.elements.temporal.value = window.PORTAL_CONFIG.contrasenaTemporal || Portal.generarTemporal();
    form.elements.fechaAlta.value = Portal.club.hoy();
    dialogo.showModal();
  };
  document.getElementById('btn-nueva-cuenta').addEventListener('click', () => admin.abrirNuevaCuenta());
  form.querySelector('[data-generar]').addEventListener('click', () => { form.elements.temporal.value = Portal.generarTemporal(); });
  form.querySelector('[data-cerrar]').addEventListener('click', () => dialogo.close());

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(form));
    datos.usuario = Portal.normalizarUsuario(datos.usuario);
    const botones = form.querySelectorAll('button');
    botones.forEach(b => b.disabled = true); error.textContent = 'Creando…';
    try {
      await Portal.gestionarCuenta({ accion: 'crear', ...datos });
      dialogo.close();
      alert(`Cuenta creada.\n\nUsuario: ${datos.usuario}\nContraseña temporal: ${datos.temporal}\n\nEntrégasela personalmente; deberá cambiarla al entrar.`);
      await admin.recargar();
    } catch (err) {
      error.textContent = err.message;
    } finally {
      botones.forEach(b => b.disabled = false);
    }
  });
})();
