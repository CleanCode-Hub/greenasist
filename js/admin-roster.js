// =====================================================================
// Pestaña "Roster": jugadores por categoría del torneo
// (Junior 3v3, Novice 5Man, Elite, Premier, Ultimate Champions).
//   - Cada cambio de categoría se guarda con su fecha "desde": queda el
//     historial y las estadísticas cuentan cada día con la categoría de ese día.
//   - "+ Agregar" suma jugadores; "Cambiar" los mueve (preguntando desde cuándo),
//     los quita, o borra un cambio hecho por error.
// La pestaña muestra el roster de hoy (o del 31 de dic si se ve un año pasado).
// =====================================================================
(() => {
  const { club, admin } = Portal;
  const resumen = document.getElementById('roster-resumen');
  const contenedor = document.getElementById('roster-categorias');
  const selector = document.getElementById('roster-selector');
  let elegida = null;   // categoría que se ve: id, 'sin' (sin categoría) o 'todas'
  const referencia = () => club.fechaReferencia(admin.datos.anio);

  // Fecha "desde" sugerida: si nunca ha tenido categoría, desde su alta
  // (siempre ha jugado ahí); si es un cambio, desde hoy (o el 1 de enero del año que se ve).
  function desdeSugerido(jugador) {
    if (!club.historialDe(admin.historial, jugador.id).length) return jugador.fecha_alta;
    return admin.datos.anio === club.anioActual() ? club.hoy() : `${admin.datos.anio}-01-01`;
  }

  // --- Guardar (funciones seguras, solo admin) -----------------------
  async function cambiar(jugador, categoriaId, desde) {
    const { error } = await Portal.nube.rpc('cambiar_categoria', { p_jugador: jugador.id, p_categoria: categoriaId, p_desde: desde });
    if (error) throw new Error('No se pudo guardar. Revisa tu conexión e inténtalo otra vez.');
    // Se actualiza aquí para verlo al instante.
    admin.historial = admin.historial.filter(h => !(h.jugador_id === jugador.id && h.desde === desde));
    admin.historial.push({ jugador_id: jugador.id, desde, categoria_id: categoriaId });
    repintar();
  }
  async function borrarCambio(jugador, desde) {
    const { error } = await Portal.nube.rpc('borrar_cambio_categoria', { p_jugador: jugador.id, p_desde: desde });
    if (error) throw new Error('No se pudo borrar. Inténtalo otra vez.');
    admin.historial = admin.historial.filter(h => !(h.jugador_id === jugador.id && h.desde === desde));
    repintar();
  }
  const repintar = () => Object.values(admin.vistas).forEach(pintar => pintar());

  // --- Pintar la pestaña --------------------------------------------
  admin.vistas.roster = function () {
    if (!admin.categorias) {
      resumen.innerHTML = ''; selector.innerHTML = '';
      contenedor.innerHTML = '<div class="tarjeta"><p class="vacio">Falta instalar <strong>09-roster.sql</strong> en Supabase para usar el roster.</p></div>';
      return;
    }
    const esHoy = referencia() === club.hoy();
    document.querySelector('[data-vista="roster"] h2').textContent = esHoy ? '👥 Roster actual' : `👥 Roster al ${club.fechaLarga(referencia())}`;
    const jugadores = admin.jugadoresActivos();
    const sinCategoria = jugadores.filter(j => !admin.categoriaDe(j.id));

    resumen.innerHTML = [
      club.metrica('En el roster', jugadores.length - sinCategoria.length, `de ${jugadores.length} activos`),
      club.metrica('Sin categoría', sinCategoria.length, sinCategoria.length ? 'falta asignarlos' : 'todos asignados', sinCategoria.length ? 'alerta' : 'bien')
    ].join('');

    // Línea "🧢 Coach: …" de cada categoría.
    const lineaCoach = categoriaId => {
      const coaches = admin.coachesDe(categoriaId);
      return coaches.length
        ? `<p class="coach-categoria">🧢 Coach: <strong>${Portal.esc(coaches.map(c => c.nombre_completo).join(', '))}</strong></p>`
        : '<p class="coach-categoria sin-coach">⚠️ Sin coach asignado</p>';
    };

    const tarjeta = (titulo, lista, categoriaId) => `
      <div class="tarjeta categoria ${categoriaId ? '' : 'sin-categoria'}">
        <div class="tarjeta-titulo">
          <h2>${titulo} <small>${lista.length} ${lista.length === 1 ? 'integrante' : 'integrantes'}</small></h2>
          ${categoriaId ? `<div class="botones-categoria">
            ${admin.coaches ? `<button type="button" class="secundario" data-roster-coach="${categoriaId}">🧢 Coach</button>` : ''}
            <button type="button" class="primario" data-roster-agregar="${categoriaId}">+ Agregar</button>
          </div>` : ''}
        </div>
        ${categoriaId ? lineaCoach(categoriaId) : ''}
        <ul class="lista">${lista.length
          ? lista.map(j => `<li>
              <span class="nombre-roster">${Portal.esc(j.nombre_completo)}${j.rol === 'coach' ? ' <span class="chip coach">🧢 Coach</span>' : ''}</span>
              <button type="button" class="secundario" data-roster-cambiar="${j.id}">${categoriaId ? 'Cambiar' : 'Asignar'}</button>
            </li>`).join('')
          : `<li class="vacio">${categoriaId ? 'Nadie todavía. Toca “+ Agregar”.' : '✓ Todos tienen categoría.'}</li>`}</ul>
      </div>`;

    // Coaches primero en la lista de su categoría.
    const de = id => jugadores.filter(j => admin.categoriaDe(j.id) === id).sort((a, b) => (b.rol === 'coach') - (a.rol === 'coach'));

    // Selector: se ve una categoría a la vez ("Ver todas" las muestra juntas).
    const valida = elegida === 'todas' || elegida === 'sin' || admin.categorias.some(c => c.id === elegida);
    // Al entrar: la primera categoría que tenga jugadores (o la primera, si todas están vacías).
    if (!valida) elegida = (admin.categorias.find(c => de(c.id).length) || admin.categorias[0])?.id ?? 'todas';
    const opcion = (valor, texto, n, tono = '') =>
      `<button type="button" role="tab" data-roster-ver="${valor}" class="${valor === elegida ? 'activa' : ''} ${tono}"
        aria-selected="${valor === elegida}">${texto}${n == null ? '' : ` <small>${n}</small>`}</button>`;
    selector.innerHTML =
      admin.categorias.map(c => opcion(c.id, Portal.esc(c.nombre), de(c.id).length)).join('') +
      opcion('sin', 'Sin categoría', sinCategoria.length, sinCategoria.length ? 'alerta' : '') +
      opcion('todas', 'Ver todas', null);

    const tarjetaDe = c => tarjeta(`🎯 ${Portal.esc(c.nombre)}`, de(c.id), c.id);
    contenedor.classList.toggle('una', elegida !== 'todas');
    contenedor.innerHTML =
      elegida === 'todas' ? admin.categorias.map(tarjetaDe).join('') + tarjeta('Sin categoría', sinCategoria, null)
      : elegida === 'sin' ? tarjeta('Sin categoría', sinCategoria, null)
      : tarjetaDe(admin.categorias.find(c => c.id === elegida));

    if (dialogoAgregar.open) pintarCandidatos();
    if (dialogoCambiar.open) pintarCambiar();
    if (dialogoCoach.open) pintarCoaches();
  };

  selector.addEventListener('click', e => {
    const boton = e.target.closest('[data-roster-ver]');
    if (!boton) return;
    const valor = boton.dataset.rosterVer;
    elegida = valor === 'todas' || valor === 'sin' ? valor : Number(valor);
    admin.vistas.roster();
  });

  contenedor.addEventListener('click', e => {
    const coach = e.target.closest('[data-roster-coach]');
    if (coach) { abrirCoach(Number(coach.dataset.rosterCoach)); return; }
    const agregar = e.target.closest('[data-roster-agregar]');
    if (agregar) { abrirAgregar(Number(agregar.dataset.rosterAgregar)); return; }
    const cambiarBoton = e.target.closest('[data-roster-cambiar]');
    if (cambiarBoton) abrirCambiar(admin.cuentas.find(c => c.id === cambiarBoton.dataset.rosterCambiar));
  });

  // --- Ventana "Agregar a <categoría>" ------------------------------
  const dialogoAgregar = document.getElementById('dialogo-roster-agregar');
  const candidatos = document.getElementById('roster-candidatos');
  const buscar = document.getElementById('roster-buscar');
  const errorAgregar = dialogoAgregar.querySelector('.error');
  let categoriaDestino = null;

  function abrirAgregar(categoriaId) {
    categoriaDestino = categoriaId;
    document.getElementById('roster-agregar-titulo').textContent = `Agregar a ${admin.nombreCategoria(categoriaId)}`;
    buscar.value = ''; errorAgregar.textContent = '';
    pintarCandidatos();
    dialogoAgregar.showModal();
  }

  // Primero los que no tienen categoría; luego los de otras categorías (se "mueven").
  function pintarCandidatos() {
    const lista = admin.jugadoresActivos()
      .filter(j => admin.categoriaDe(j.id) !== categoriaDestino)
      .filter(j => Portal.coincideBusqueda(j, buscar.value))   // nombre o usuario
      .sort((a, b) => (admin.categoriaDe(a.id) ? 1 : 0) - (admin.categoriaDe(b.id) ? 1 : 0));
    candidatos.innerHTML = lista.length
      ? lista.map(j => {
          const actual = admin.categoriaDe(j.id);
          return `<li>
            <div>
              <span class="nombre-roster">${Portal.esc(j.nombre_completo)}${j.rol === 'coach' ? ' <span class="chip coach">🧢 Coach</span>' : ''}</span>
              ${actual ? `<span class="chip">Ahora en ${Portal.esc(admin.nombreCategoria(actual))}</span>` : '<span class="chip admin">Sin categoría</span>'}
              <small class="tenue">Desde ${club.fechaCorta(desdeSugerido(j))}</small>
            </div>
            <button type="button" class="primario" data-roster-poner="${j.id}">${actual ? 'Mover aquí' : 'Agregar'}</button>
          </li>`;
        }).join('')
      : '<li class="vacio">No hay más jugadores para agregar.</li>';
  }
  buscar.addEventListener('input', pintarCandidatos);

  candidatos.addEventListener('click', async e => {
    const boton = e.target.closest('[data-roster-poner]');
    if (!boton) return;
    const jugador = admin.cuentas.find(c => c.id === boton.dataset.rosterPoner);
    boton.disabled = true; errorAgregar.textContent = '';
    try {
      await cambiar(jugador, categoriaDestino, desdeSugerido(jugador));
      // Buscador limpio para buscar al siguiente.
      buscar.value = '';
      pintarCandidatos();
      buscar.focus();
    }
    catch (err) { errorAgregar.textContent = err.message; boton.disabled = false; }
  });
  dialogoAgregar.querySelector('[data-cerrar]').addEventListener('click', () => dialogoAgregar.close());

  // --- Ventana "🧢 Coach de <categoría>" ------------------------------
  // Quién ENTRENA la categoría. Es aparte de dónde juega cada coach.
  const dialogoCoach = document.getElementById('dialogo-roster-coach');
  const listaCoach = document.getElementById('roster-coach-lista');
  const errorCoach = dialogoCoach.querySelector('.error');
  let categoriaCoach = null;

  function abrirCoach(categoriaId) {
    categoriaCoach = categoriaId;
    document.getElementById('roster-coach-titulo').textContent = `🧢 Coach de ${admin.nombreCategoria(categoriaId)}`;
    errorCoach.textContent = '';
    pintarCoaches();
    dialogoCoach.showModal();
  }

  function pintarCoaches() {
    const coaches = admin.cuentas.filter(c => c.rol === 'coach' && c.activo);
    listaCoach.innerHTML = coaches.length
      ? coaches.map(c => {
          const entrena = admin.coachesDe(categoriaCoach).some(k => k.id === c.id);
          const juega = admin.nombreCategoria(admin.categoriaDe(c.id));
          const otras = admin.categoriasQueEntrena(c.id).filter(id => id !== categoriaCoach).map(admin.nombreCategoria);
          return `<li>
            <div>
              <span class="nombre-roster">${Portal.esc(c.nombre_completo)}</span>
              <small class="tenue">🎯 Juega en: ${juega ? Portal.esc(juega) : 'no juega'}${otras.length ? ` · 🧢 También entrena: ${Portal.esc(otras.join(', '))}` : ''}</small>
            </div>
            <button type="button" class="${entrena ? 'primario' : 'secundario'}" data-coach-id="${c.id}" data-coach-poner="${!entrena}">
              ${entrena ? '✓ Es coach' : 'Poner'}
            </button>
          </li>`;
        }).join('')
      : '<li class="vacio">No hay cuentas con rol Coach. Cámbiale el rol a alguien en la pestaña Cuentas.</li>';
  }

  listaCoach.addEventListener('click', async e => {
    const boton = e.target.closest('[data-coach-id]');
    if (!boton) return;
    const coachId = boton.dataset.coachId, asignar = boton.dataset.coachPoner === 'true';
    boton.disabled = true; errorCoach.textContent = '';
    const { error } = await Portal.nube.rpc('asignar_coach', { p_categoria: categoriaCoach, p_coach: coachId, p_asignar: asignar });
    if (error) { errorCoach.textContent = 'No se pudo guardar. Revisa tu conexión e inténtalo otra vez.'; boton.disabled = false; return; }
    // Se actualiza aquí para verlo al instante.
    admin.coaches = admin.coaches.filter(a => !(a.categoria_id === categoriaCoach && a.coach_id === coachId));
    if (asignar) admin.coaches.push({ categoria_id: categoriaCoach, coach_id: coachId });
    repintar();
  });
  dialogoCoach.querySelector('[data-cerrar]').addEventListener('click', () => dialogoCoach.close());

  // --- Ventana "Cambiar categoría" de un jugador --------------------
  const dialogoCambiar = document.getElementById('dialogo-roster-jugador');
  const opciones = document.getElementById('roster-opciones');
  const desdeInput = document.getElementById('roster-desde');
  const historialLista = document.getElementById('roster-historial');
  const errorCambiar = dialogoCambiar.querySelector('.error');
  let jugadorElegido = null;

  function abrirCambiar(jugador) {
    jugadorElegido = jugador;
    document.getElementById('roster-jugador-titulo').textContent = jugador.nombre_completo;
    desdeInput.value = desdeSugerido(jugador);
    errorCambiar.textContent = '';
    pintarCambiar();
    dialogoCambiar.showModal();
  }

  function pintarCambiar() {
    const actual = admin.categoriaDe(jugadorElegido.id);
    opciones.innerHTML = admin.categorias.map(c => `
      <button type="button" class="${c.id === actual ? 'primario' : 'secundario'} grande" data-roster-a="${c.id}">
        ${c.id === actual ? '✓ ' : ''}🎯 ${Portal.esc(c.nombre)}
      </button>`).join('') +
      (actual ? '<button type="button" class="secundario peligro" data-roster-a="">Sacar del roster</button>' : '');

    const cambios = club.historialDe(admin.historial, jugadorElegido.id);
    historialLista.innerHTML = cambios.length
      ? [...cambios].reverse().map(h => `<li>
          <span><strong>${Portal.esc(admin.nombreCategoria(h.categoria_id) || 'Sin categoría')}</strong><br><small class="tenue">desde ${club.fechaLarga(h.desde)}</small></span>
          <button type="button" class="secundario peligro" data-roster-borrar="${h.desde}" aria-label="Borrar este cambio">Borrar</button>
        </li>`).join('')
      : '<li class="vacio">Todavía no tiene categoría.</li>';
  }

  opciones.addEventListener('click', async e => {
    const boton = e.target.closest('[data-roster-a]');
    if (!boton) return;
    if (!desdeInput.value) { errorCambiar.textContent = 'Elige desde qué fecha.'; return; }
    const categoriaId = boton.dataset.rosterA ? Number(boton.dataset.rosterA) : null;
    if (categoriaId === club.categoriaEn(admin.historial, jugadorElegido.id, desdeInput.value)) { dialogoCambiar.close(); return; }
    opciones.querySelectorAll('button').forEach(b => b.disabled = true); errorCambiar.textContent = '';
    try { await cambiar(jugadorElegido, categoriaId, desdeInput.value); dialogoCambiar.close(); }
    catch (err) { errorCambiar.textContent = err.message; }
    finally { opciones.querySelectorAll('button').forEach(b => b.disabled = false); }
  });

  historialLista.addEventListener('click', async e => {
    const boton = e.target.closest('[data-roster-borrar]');
    if (!boton) return;
    if (!confirm(`¿Borrar el cambio del ${club.fechaLarga(boton.dataset.rosterBorrar)}? Úsalo solo si fue un error.`)) return;
    boton.disabled = true;
    try { await borrarCambio(jugadorElegido, boton.dataset.rosterBorrar); }
    catch (err) { errorCambiar.textContent = err.message; boton.disabled = false; }
  });
  dialogoCambiar.querySelector('[data-cerrar]').addEventListener('click', () => dialogoCambiar.close());
})();
