// =====================================================================
// Comisionado: alguien de Pits que va en lugar del admin (19-comisionado.sql).
//   - En su Inicio ve "Hoy eres comisionado" (o la fecha en que lo será).
//   - Ese día puede mostrar el QR de llegada (cambia cada 30 s).
//   - Puede VER la lista (se actualiza cada 5 s), pero no cambiarla.
// Todo pasa por funciones de la base de datos que revisan que sea el
// comisionado de ESE evento; no tiene más permisos.
// =====================================================================
(() => {
  const { club } = Portal;
  const tarjeta = document.getElementById('mi-comision');
  const dialogo = document.getElementById('dialogo-comisionado');
  const imagen = document.getElementById('com-qr');
  const lista = document.getElementById('com-lista');
  const contador = document.getElementById('com-contador');
  const error = document.getElementById('com-error');
  const botones = dialogo.querySelectorAll('[data-com-vista]');
  const CAMBIO_QR = 30000, REVISAR_LISTA = 5000;
  let evento = null, relojQR = null, relojLista = null, pantallaEncendida = null;

  const textoEvento = e => [club.esTorneo(e) ? club.nombreEvento(e) : 'Entrenamiento', club.horaTexto(e.hora_inicio)].filter(Boolean).join(' · ');

  // --- Tarjeta en Inicio (la llama jugador.js con el calendario del año) ---
  Portal.actualizarComision = entrenamientos => {
    const hoy = club.hoy();
    const mios = entrenamientos.filter(e => e.comisionado_id === Portal.perfil.id && !e.cancelado && club.fechaFin(e) >= hoy);
    tarjeta.hidden = !mios.length;
    if (!mios.length) return;
    evento = mios[0];
    const esHoy = evento.fecha <= hoy;
    tarjeta.innerHTML = esHoy
      ? `<span>👤 Hoy eres comisionado</span>
         <strong>${Portal.esc(textoEvento(evento))}</strong>
         <small>Muestra el QR para que registren su llegada. La lista solo la puedes ver.</small>
         <div class="acciones">
           <button type="button" class="primario enorme" data-com-abrir="qr">📱 Mostrar QR</button>
           <button type="button" class="secundario grande" data-com-abrir="lista">📋 Ver lista</button>
         </div>`
      : `<span>👤 Serás comisionado</span>
         <strong>${club.rangoLargo(evento)}</strong>
         <small>${Portal.esc(textoEvento(evento))}. Ese día aquí te saldrá el botón para mostrar el QR.</small>
         ${mios.length > 1 ? `<small>Y ${mios.length - 1} ${mios.length === 2 ? 'fecha más' : 'fechas más'} después.</small>` : ''}`;
  };
  tarjeta.addEventListener('click', e => {
    const boton = e.target.closest('[data-com-abrir]');
    if (boton) abrir(boton.dataset.comAbrir);
  });

  // --- Ventana ------------------------------------------------------
  async function abrir(vista) {
    const titulo = club.rangoLargo(evento);
    document.getElementById('com-fecha').textContent = `${titulo[0].toUpperCase() + titulo.slice(1)} · ${textoEvento(evento)}`;
    error.textContent = ''; contador.textContent = ''; lista.innerHTML = '';
    ver(vista);
    dialogo.showModal();

    if (!Portal.urlPortal()) {
      imagen.innerHTML = '<p class="qr-sin-link">El QR solo funciona en el portal publicado (con su link).</p>';
    } else {
      imagen.innerHTML = '<div class="spinner"></div>';
      await nuevoCodigo();
      if (!dialogo.open) return;
      relojQR = setInterval(nuevoCodigo, CAMBIO_QR);
      try { pantallaEncendida = await navigator.wakeLock?.request('screen'); } catch (_) {}
    }
    await revisarLista();
    if (dialogo.open) relojLista = setInterval(revisarLista, REVISAR_LISTA);
  }

  function ver(vista) {
    botones.forEach(b => { const activa = b.dataset.comVista === vista; b.classList.toggle('activa', activa); b.setAttribute('aria-selected', String(activa)); });
    dialogo.querySelectorAll('[data-com]').forEach(div => { div.hidden = div.dataset.com !== vista; });
  }
  botones.forEach(b => b.addEventListener('click', () => ver(b.dataset.comVista)));

  // Código difícil de adivinar (24 caracteres), igual que el del admin.
  function codigoAleatorio() {
    const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    return Array.from(crypto.getRandomValues(new Uint32Array(24)), n => letras[n % letras.length]).join('');
  }

  async function nuevoCodigo() {
    const codigo = codigoAleatorio();
    const { error: errorBD } = await Portal.nube.rpc('codigo_comisionado', { p_entrenamiento: evento.id, p_codigo: codigo });
    if (errorBD) {
      // Los mensajes de la base de datos ya vienen claros ("solo el día del entrenamiento", etc.).
      error.textContent = errorBD.message?.includes('comisionado') || errorBD.message?.includes('día') || errorBD.message?.includes('cancelado')
        ? errorBD.message : 'No se pudo generar el código. Revisa tu conexión.';
      return;
    }
    error.textContent = '';
    const qr = qrcode(0, 'M');
    qr.addData(`${Portal.urlPortal()}?llegada=${codigo}`);
    qr.make();
    imagen.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  }

  // --- Lista (solo ver) ---------------------------------------------
  const hora = iso => new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  const CHIP = {
    falta: '<span class="chip inactivo">✗ No vino</span>',
    justificada: '<span class="chip admin">Justificada</span>',
    '': '<span class="chip">Sin marcar</span>'
  };

  async function revisarLista() {
    const { data, error: errorBD } = await Portal.nube.rpc('lista_comisionado', { p_entrenamiento: evento.id });
    if (errorBD || !data) return;
    const llegaron = data.filter(p => p.estado === 'asistio').sort((a, b) => a.llego_en.localeCompare(b.llego_en));
    const resto = data.filter(p => p.estado !== 'asistio');
    contador.textContent = `✓ ${llegaron.length} de ${data.length} ${club.esTorneo(evento) ? 'fueron' : 'llegaron'}`;
    lista.innerHTML = [...llegaron, ...resto].map(p => `<li>
        <span>${Portal.esc(p.nombre)}${club.marcaRol(p.rol)}</span>
        ${p.estado === 'asistio'
          ? `<span class="chip activo">✓ ${hora(p.llego_en)}${p.por_qr ? ' · 📱' : ''}</span>`
          : CHIP[p.estado || '']}
      </li>`).join('') || '<li class="vacio">Todavía no hay nadie en la lista.</li>';
  }

  dialogo.addEventListener('close', () => {
    clearInterval(relojQR); clearInterval(relojLista);
    relojQR = relojLista = null;
    pantallaEncendida?.release?.().catch(() => {}); pantallaEncendida = null;
  });
})();
