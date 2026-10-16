// =====================================================================
// Pasar lista (pensado para el celular, en el campo):
//   - Tocar el nombre de quien llegó  -> "✓ Llegó" (verde).
//   - Tocarlo otra vez                -> "No vino" (rojo).
//   - Botón "Justificar"              -> "Justificada" (no cuenta en contra).
//   - Cada toque se guarda solo.
//   - "Terminar lista": los que no se tocaron quedan como falta.
// =====================================================================
(() => {
  const { club, admin } = Portal;
  const dialogo = document.getElementById('dialogo-lista');
  const filas = document.getElementById('lista-jugadores');
  const contador = document.getElementById('lista-contador');
  const buscar = document.getElementById('lista-buscar');
  const error = document.getElementById('lista-error');
  const ESTADO = {
    '':          'Toca si llegó',
    asistio:     '✓ Llegó',
    falta:       '✗ No vino',
    justificada: 'Justificada'
  };
  // En torneo (asistencia extra) no hay "justificar": faltar no cuenta en contra.
  const ESTADO_TORNEO = { '': 'Toca si fue', asistio: '🏆 Fue', falta: 'No fue', justificada: 'No fue' };
  const etiqueta = estado => (club.esTorneo(entrenamiento) ? ESTADO_TORNEO : ESTADO)[estado];
  let entrenamiento = null, jugadores = [], estados = new Map(), huboCambios = false;

  admin.abrirLista = function (id) {
    entrenamiento = admin.datos.entrenamientos.find(e => e.id === id);
    if (!entrenamiento || entrenamiento.cancelado) return;
    estados = new Map(admin.datos.asistencias.filter(a => a.entrenamiento_id === id).map(a => [a.jugador_id, a.estado]));
    // Jugadores activos dados de alta en o antes de esa fecha, más quien ya tenga registro.
    jugadores = admin.cuentas.filter(c => club.llevaAsistencia(c) && ((c.activo && c.fecha_alta <= club.fechaFin(entrenamiento)) || estados.has(c.id)));
    huboCambios = false;
    buscar.value = ''; error.textContent = '';
    const titulo = club.rangoLargo(entrenamiento);
    const torneo = club.esTorneo(entrenamiento);
    document.getElementById('lista-titulo').textContent = (torneo ? `${club.nombreEvento(entrenamiento)} · ` : '') + titulo[0].toUpperCase() + titulo.slice(1);
    dialogo.classList.toggle('modo-torneo', torneo);
    pintar();
    dialogo.showModal();
    filas.scrollTop = 0;
  };

  // --- Pintar -------------------------------------------------------
  function fila(j) {
    const estado = estados.get(j.id) || '';
    return `<li class="jugador-fila ${estado}" data-buscar="${Portal.esc(Portal.textoBusqueda(j))}">
      <button type="button" class="jugador-boton" data-marcar="${j.id}" aria-pressed="${estado === 'asistio'}">
        <span class="jugador-nombre">${Portal.esc(j.nombre_completo)}${club.marcaRol(j.rol)}</span>
        <span class="jugador-estado">${etiqueta(estado)}</span>
      </button>
      <button type="button" class="jugador-justificar" data-justificar="${j.id}">${estado === 'justificada' ? 'Quitar justificación' : 'Justificar'}</button>
    </li>`;
  }

  function pintar() {
    filas.innerHTML = jugadores.length
      ? jugadores.map(fila).join('')
      : '<li class="vacio">No hay jugadores activos dados de alta para esta fecha.</li>';
    filtrar();
    pintarContador();
  }

  function pintarContador() {
    const llegaron = jugadores.filter(j => estados.get(j.id) === 'asistio').length;
    const sinMarcar = jugadores.filter(j => !estados.has(j.id)).length;
    contador.innerHTML = `${llegaron} de ${jugadores.length} ${club.esTorneo(entrenamiento) ? 'fueron' : 'llegaron'}${sinMarcar ? ` <small>· ${sinMarcar} sin marcar</small>` : ''}`;
  }

  function filtrar() {
    const texto = Portal.normalizarBusqueda(buscar.value);   // busca en nombre o usuario
    filas.querySelectorAll('.jugador-fila').forEach(li => { li.hidden = !!texto && !li.dataset.buscar.includes(texto); });
  }
  buscar.addEventListener('input', filtrar);

  // --- Guardar un toque ---------------------------------------------
  async function guardar(jugadorId, nuevo) {
    const anterior = estados.get(jugadorId);
    estados.set(jugadorId, nuevo);
    repintarFila(jugadorId);
    error.textContent = '';
    const { error: errorBD } = await Portal.nube.from('asistencias')
      .upsert({ entrenamiento_id: entrenamiento.id, jugador_id: jugadorId, estado: nuevo }, { onConflict: 'entrenamiento_id,jugador_id' });
    if (errorBD) {
      // Se regresa como estaba para no mostrar algo que no se guardó.
      if (anterior) estados.set(jugadorId, anterior); else estados.delete(jugadorId);
      repintarFila(jugadorId);
      error.textContent = 'No se pudo guardar. Revisa tu conexión e inténtalo otra vez.';
      return;
    }
    huboCambios = true;
  }

  function repintarFila(jugadorId) {
    const li = filas.querySelector(`[data-marcar="${jugadorId}"]`)?.closest('li');
    const j = jugadores.find(x => x.id === jugadorId);
    if (li && j) { const oculta = li.hidden; li.outerHTML = fila(j); if (oculta) filtrar(); }
    pintarContador();
  }

  filas.addEventListener('click', e => {
    const marcar = e.target.closest('[data-marcar]');
    if (marcar) {
      const id = marcar.dataset.marcar;
      guardar(id, estados.get(id) === 'asistio' ? 'falta' : 'asistio');
      return;
    }
    const justificar = e.target.closest('[data-justificar]');
    if (justificar) {
      const id = justificar.dataset.justificar;
      guardar(id, estados.get(id) === 'justificada' ? 'falta' : 'justificada');
    }
  });

  // --- Terminar: los que no se tocaron quedan como falta ------------
  document.getElementById('lista-terminar').addEventListener('click', async () => {
    const sinMarcar = jugadores.filter(j => !estados.has(j.id));
    if (sinMarcar.length) {
      const nombres = sinMarcar.slice(0, 5).map(j => `• ${j.nombre_completo}`).join('\n') + (sinMarcar.length > 5 ? `\n… y ${sinMarcar.length - 5} más` : '');
      const aviso = club.esTorneo(entrenamiento)
        ? `Estos ${sinMarcar.length} jugadores no se marcaron y quedarán como "no fue" (en torneo no cuenta en contra):`
        : `Estos ${sinMarcar.length} jugadores no se marcaron y quedarán como FALTA:`;
      if (!confirm(`${aviso}\n\n${nombres}\n\n¿Terminar la lista?`)) return;
      const { error: errorBD } = await Portal.nube.from('asistencias').upsert(
        sinMarcar.map(j => ({ entrenamiento_id: entrenamiento.id, jugador_id: j.id, estado: 'falta' })),
        { onConflict: 'entrenamiento_id,jugador_id' });
      if (errorBD) { error.textContent = 'No se pudo terminar la lista. Inténtalo otra vez.'; return; }
      huboCambios = true;
    }
    dialogo.close();
  });

  dialogo.querySelector('[data-cerrar]').addEventListener('click', () => dialogo.close());
  // Cambiar a QR: los jugadores se registran solos escaneando.
  document.getElementById('lista-qr').addEventListener('click', () => {
    const id = entrenamiento.id;
    dialogo.close();
    admin.abrirQR(id);
  });
  // Al cerrar, se recargan los datos para que Hoy, calendario y estadísticas se actualicen.
  dialogo.addEventListener('close', () => { if (huboCambios) admin.recargar(); });
})();
