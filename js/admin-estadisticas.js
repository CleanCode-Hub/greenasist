// =====================================================================
// Pestaña "Estadísticas", separada por rol (Jugadores · Coaches · Pits · Reclutas):
//   1. Resumen del grupo elegido.
//   2. Tabla del grupo: por periodo o por mes (con filtro de categoría
//      para jugadores y coaches).
//   3. Asistencia por categoría (solo jugadores y coaches: los del roster).
//   4. Asistencia a torneos (todo el equipo).
//   5. Detalle individual: mes, periodo, año y días que faltó.
// Los días cancelados y las faltas justificadas no cuentan en contra.
// =====================================================================
(() => {
  const { club, admin } = Portal;
  const metricas = document.getElementById('est-metricas');
  const cabecera = document.getElementById('est-cabecera');
  const cuerpo = document.getElementById('est-cuerpo');
  const botonesVista = document.querySelectorAll('[data-est-vista]');
  const selectorJugador = document.getElementById('est-jugador');
  const detalle = document.getElementById('est-detalle-contenido');
  const filtroCategoria = document.getElementById('est-categoria');
  const pestanasRol = document.getElementById('est-roles');
  let vista = 'tetra';       // 'tetra' | 'mes'
  let rolVista = 'jugador';  // pestaña de rol elegida

  const GRUPOS = [
    { rol: 'jugador', nombre: '🎯 Jugadores' },
    { rol: 'coach',   nombre: '🧢 Coaches' },
    { rol: 'pits',    nombre: '🔧 Pits' },
    { rol: 'recluta', nombre: '🔰 Reclutas' }
  ];
  const grupoActual = () => GRUPOS.find(g => g.rol === rolVista);
  const personasDelGrupo = () => admin.conAsistencia().filter(j => j.rol === rolVista);
  const grupoConRoster = () => rolVista === 'jugador' || rolVista === 'coach';

  // Personas de la tabla: las del grupo, y si es jugador/coach, según el filtro de categoría
  // ('' = todas · número = esa categoría · 'sin' = sin categoría).
  function jugadoresFiltrados() {
    const valor = grupoConRoster() ? filtroCategoria.value : '';
    return personasDelGrupo().filter(j =>
      !valor || (valor === 'sin' ? !admin.categoriaDe(j.id) : admin.categoriaDe(j.id) === Number(valor)));
  }

  // --- Pestañas de rol ----------------------------------------------
  function pintarPestanasRol() {
    const todos = admin.conAsistencia();
    pestanasRol.innerHTML = GRUPOS.map(g => {
      const n = todos.filter(j => j.rol === g.rol).length;
      return `<button type="button" role="tab" data-est-rol="${g.rol}" class="${g.rol === rolVista ? 'activa' : ''}"
        aria-selected="${g.rol === rolVista}">${g.nombre} <small>${n}</small></button>`;
    }).join('');
  }
  pestanasRol.addEventListener('click', e => {
    const boton = e.target.closest('[data-est-rol]');
    if (!boton || boton.dataset.estRol === rolVista) return;
    rolVista = boton.dataset.estRol;
    admin.vistas.estadisticas();
  });

  // Suma la asistencia de un grupo de personas. Para una categoría se usa el
  // filtro "solo los días en que estaba en esa categoría" (si alguien subió a
  // mitad de año, lo de antes cuenta en su categoría anterior).
  const enCategoria = (j, categoriaId) => e => admin.categoriaDe(j.id, e.fecha) === categoriaId;
  function sumarAsistencia(personas, filtroDe, periodo = {}) {
    let asistio = 0, falta = 0;
    for (const j of personas) {
      const r = club.resumenAsistencia(admin.datos, j.id, { ...periodo, filtro: filtroDe(j) });
      asistio += r.asistio; falta += r.falta;
    }
    return { asistio, falta, justificada: 0, porcentaje: asistio + falta ? asistio / (asistio + falta) : null };
  }
  function sumarTorneos(personas, filtroDe) {
    let fue = 0, total = 0;
    for (const j of personas) {
      const t = club.resumenTorneos(admin.datos, j, { filtro: filtroDe(j) });
      fue += t.fue; total += t.total;
    }
    return { fue, total };
  }

  const promedio = valores => {
    const v = valores.filter(x => x != null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };

  // Casilla con porcentaje, barra y conteo.
  const celdaPorcentaje = (r, compacta = false) => r.porcentaje == null
    ? '<span class="tenue">—</span>'
    : `<div class="pct">
         <strong class="${club.tonoPorcentaje(r.porcentaje)}">${club.pct(r.porcentaje)}</strong>
         ${compacta ? '' : club.barra(r.porcentaje)}
         <small>${r.asistio}/${r.asistio + r.falta}${!compacta && r.justificada ? ` · ${r.justificada} just.` : ''}</small>
       </div>`;

  // Entrenamientos que cuentan: ya pasaron, no cancelados, no son torneo y con lista tomada.
  function entrenamientosValidos() {
    const hoy = club.hoy();
    const conLista = new Set(admin.datos.asistencias.map(a => a.entrenamiento_id));
    return admin.datos.entrenamientos.filter(e => !e.cancelado && !club.esTorneo(e) && e.fecha <= hoy && conLista.has(e.id));
  }
  // Torneos ya realizados (pasados y no cancelados).
  const torneosRealizados = () => admin.datos.entrenamientos.filter(e => club.esTorneo(e) && !e.cancelado && e.fecha <= club.hoy());
  const celdaTorneos = t => `<strong class="texto-torneo">${club.textoTorneos(t)}</strong>`;

  // --- 1 y 2. Resumen y tabla general -------------------------------
  admin.vistas.estadisticas = function () {
    const datos = admin.datos, hoy = club.hoy();
    const jugadores = personasDelGrupo();   // solo el grupo de la pestaña elegida
    const validos = entrenamientosValidos();
    const pendientes = datos.entrenamientos.filter(e => !e.cancelado && !club.esTorneo(e) && e.fecha < hoy && !validos.includes(e)).length;
    const cancelados = datos.entrenamientos.filter(e => e.cancelado).length;
    const anuales = jugadores.map(j => club.resumenAsistencia(datos, j.id).porcentaje);
    const torneos = torneosRealizados();
    const idsTorneos = new Set(torneos.map(e => e.id));
    const participaciones = datos.asistencias.filter(a => idsTorneos.has(a.entrenamiento_id) && a.estado === 'asistio').length;

    const tarjetas = [
      club.metrica('Entrenamientos realizados', validos.length, pendientes ? `${pendientes} con lista pendiente` : 'todos con lista', pendientes ? 'alerta' : ''),
      club.metrica('🏆 Torneos', torneos.length, `${participaciones} participaciones (extra)`),
      club.metrica('Cancelados', cancelados, 'no cuentan en estadísticas'),
      club.metrica(`Promedio ${grupoActual().nombre} ${datos.anio}`, club.pct(promedio(anuales)), 'solo entrenamientos')
    ];
    if (datos.anio === club.anioActual()) {
      const t = club.TETRAS[club.tetraDe(hoy) - 1];
      tarjetas.push(club.metrica(`Promedio ${t.nombre}`, club.pct(promedio(jugadores.map(j => club.resumenAsistencia(datos, j.id, { tetra: t.numero }).porcentaje))), t.meses));
    }
    metricas.innerHTML = tarjetas.join('');

    pintarPestanasRol();
    document.getElementById('est-titulo-tabla').textContent = `Asistencia · ${grupoActual().nombre}`;
    pintarFiltroCategoria();
    pintarTabla(jugadoresFiltrados(), validos);
    pintarCategorias(validos);
    pintarTorneos(torneos);
    pintarSelector(jugadores);
    pintarDetalle();
  };

  // --- Filtro de categoría de la tabla general ----------------------
  function pintarFiltroCategoria() {
    const elegido = filtroCategoria.value;
    filtroCategoria.closest('label').hidden = !admin.categorias || !grupoConRoster();   // pits y reclutas no tienen categoría
    filtroCategoria.innerHTML = '<option value="">Todas las categorías</option>' +
      (admin.categorias || []).map(c => `<option value="${c.id}">${Portal.esc(c.nombre)}</option>`).join('') +
      '<option value="sin">Sin categoría</option>';
    filtroCategoria.value = [...filtroCategoria.options].some(o => o.value === elegido) ? elegido : '';
  }
  filtroCategoria.addEventListener('change', () => pintarTabla(jugadoresFiltrados(), entrenamientosValidos()));

  // --- Tarjeta "Asistencia por categoría" ----------------------------
  // Solo se muestra en las pestañas Jugadores y Coaches (los del roster).
  function pintarCategorias(validos) {
    const tarjeta = document.getElementById('est-cat-cuerpo').closest('.tarjeta');
    tarjeta.hidden = !admin.categorias || !grupoConRoster();
    if (tarjeta.hidden) return;
    // Cada categoría + "Sin categoría", con todos los del roster (jugadores y coaches).
    const delRoster = admin.jugadoresActivos();
    const grupos = admin.categorias.map(c => ({ id: c.id, nombre: `🎯 ${c.nombre}`, personas: delRoster, filtroDe: j => enCategoria(j, c.id) }));
    grupos.push({ id: null, nombre: 'Sin categoría', personas: delRoster, filtroDe: j => enCategoria(j, null) });

    // Si quien ve es un coach, las categorías que ENTRENA van resaltadas.
    const entreno = Portal.perfil.rol === 'coach' ? admin.categoriasQueEntrena(Portal.perfil.id) : [];
    const coaches = id => id === null ? '—' : admin.coachesDe(id).map(c => Portal.esc(c.nombre_completo)).join('<br>') || '<span class="texto-rojo">Sin coach</span>';

    document.getElementById('est-cat-cabecera').innerHTML = `<tr><th>Categoría</th><th>🧢 Coach</th><th>Integrantes<small>ahora</small></th>
      ${club.TETRAS.map(t => `<th>${t.nombre}<small>${t.meses}</small></th>`).join('')}
      <th>Año</th><th>🏆 Torneos<small>extra</small></th></tr>`;
    document.getElementById('est-cat-cuerpo').innerHTML = grupos.map(g => {
      const ahora = delRoster.filter(j => admin.categoriaDe(j.id) === g.id).length;
      const anual = sumarAsistencia(g.personas, g.filtroDe);
      const torneos = sumarTorneos(g.personas, g.filtroDe);
      const mia = entreno.includes(g.id);
      const marca = mia ? '<br><small class="chip coach">La entrenas</small>' : '';
      if (!ahora && anual.porcentaje == null && !torneos.total) {
        return g.id === null ? '' : `<tr class="tenue"><th scope="row">${Portal.esc(g.nombre)}${marca}</th><td>${coaches(g.id)}</td><td>0</td><td colspan="5">—</td></tr>`;
      }
      return `<tr class="${mia ? 'mi-fila' : ''}">
        <th scope="row">${Portal.esc(g.nombre)}${marca}</th>
        <td>${coaches(g.id)}</td>
        <td><strong>${ahora}</strong></td>
        ${club.TETRAS.map(t => `<td>${celdaPorcentaje(sumarAsistencia(g.personas, g.filtroDe, { tetra: t.numero }))}</td>`).join('')}
        <td>${celdaPorcentaje(anual)}</td>
        <td>${celdaTorneos(torneos)}</td>
      </tr>`;
    }).join('');
  }

  // --- Tarjeta "Asistencia a torneos": quién fue a cada uno ----------
  function pintarTorneos(torneos) {
    const lista = document.getElementById('est-torneos');
    lista.innerHTML = torneos.length
      ? [...torneos].reverse().map(e => {
          // Cada nombre con la categoría con la que jugó (roster de ese año).
          const fueron = admin.datos.asistencias
            .filter(a => a.entrenamiento_id === e.id && a.estado === 'asistio')
            .map(a => {
              const nombre = admin.cuentas.find(c => c.id === a.jugador_id)?.nombre_completo;
              const categoria = admin.nombreCategoria(admin.categoriaDe(a.jugador_id, e.fecha));   // la de ESE día
              return nombre && (categoria ? `${nombre} (${categoria})` : nombre);
            }).filter(Boolean);
          return `<li class="torneo-fila">
            <div>
              <strong>${Portal.esc(club.nombreEvento(e))}</strong> · ${club.rangoLargo(e)}
              <small class="tenue">${fueron.length ? Portal.esc(fueron.join(' · ')) : 'Sin lista todavía'}</small>
            </div>
            <span class="chip torneo">${fueron.length} fueron</span>
          </li>`;
        }).join('')
      : `<li class="vacio">No hay torneos realizados en ${admin.datos.anio}.</li>`;
  }

  function pintarTabla(jugadores, validos) {
    const datos = admin.datos;
    const nombre = j => `<button type="button" class="enlace" data-ver-jugador="${j.id}">${Portal.esc(j.nombre_completo)}</button>${club.marcaRol(j.rol)}`;
    const filas = jugadores
      .map(j => ({ j, anio: club.resumenAsistencia(datos, j.id) }))
      .sort((a, b) => (b.anio.porcentaje ?? -1) - (a.anio.porcentaje ?? -1));

    if (vista === 'tetra') {
      const cuantos = n => validos.filter(e => club.tetraDe(e.fecha) === n).length;
      cabecera.innerHTML = `<tr><th>Nombre</th>
        ${club.TETRAS.map(t => `<th>${t.nombre}<small>${t.meses} · ${cuantos(t.numero)} entr.</small></th>`).join('')}
        <th>Año</th><th>🏆 Torneos<small>extra</small></th></tr>`;
      cuerpo.innerHTML = filas.map(f => `<tr>
        <th scope="row">${nombre(f.j)}</th>
        ${club.TETRAS.map(t => `<td>${celdaPorcentaje(club.resumenAsistencia(datos, f.j.id, { tetra: t.numero }))}</td>`).join('')}
        <td>${celdaPorcentaje(f.anio)}</td>
        <td>${celdaTorneos(club.resumenTorneos(datos, f.j))}</td>
      </tr>`).join('');
    } else {
      const cuantos = m => validos.filter(e => Number(e.fecha.slice(5, 7)) === m).length;
      cabecera.innerHTML = `<tr><th>Nombre</th>
        ${club.MESES_CORTOS.map((m, i) => `<th>${m}<small>${cuantos(i + 1)} entr.</small></th>`).join('')}
        <th>Año</th><th>🏆</th></tr>`;
      cuerpo.innerHTML = filas.map(f => `<tr>
        <th scope="row">${nombre(f.j)}</th>
        ${club.MESES.map((_, i) => `<td>${celdaPorcentaje(club.resumenAsistencia(datos, f.j.id, { mes: i + 1 }), true)}</td>`).join('')}
        <td>${celdaPorcentaje(f.anio, true)}</td>
        <td>${celdaTorneos(club.resumenTorneos(datos, f.j))}</td>
      </tr>`).join('');
    }
    if (!filas.length) cuerpo.innerHTML = `<tr><td colspan="15" class="vacio">No hay ${grupoActual().nombre.slice(3).toLowerCase()} activos.</td></tr>`;
  }

  botonesVista.forEach(boton => boton.addEventListener('click', () => {
    vista = boton.dataset.estVista;
    botonesVista.forEach(b => { b.classList.toggle('activa', b === boton); b.setAttribute('aria-pressed', String(b === boton)); });
    pintarTabla(jugadoresFiltrados(), entrenamientosValidos());
  }));

  // --- 3. Detalle individual ----------------------------------------
  function pintarSelector(jugadores) {
    const elegido = selectorJugador.value;
    selectorJugador.innerHTML = jugadores.map(j => `<option value="${j.id}">${Portal.esc(j.nombre_completo)}</option>`).join('');
    if (jugadores.some(j => j.id === elegido)) selectorJugador.value = elegido;
  }

  function pintarDetalle() {
    const datos = admin.datos;
    const jugador = admin.cuentas.find(c => c.id === selectorJugador.value);
    if (!jugador) { detalle.innerHTML = '<p class="vacio">No hay nadie en este grupo.</p>'; return; }

    const anual = club.resumenAsistencia(datos, jugador.id);
    const torneos = club.resumenTorneos(datos, jugador);
    const tetraHoy = datos.anio === club.anioActual() ? club.tetraDe(club.hoy()) : null;
    const meses = club.MESES.map((nombre, i) => ({
      nombre,
      r: club.resumenAsistencia(datos, jugador.id, { mes: i + 1 }),
      t: club.resumenTorneos(datos, jugador, { mes: i + 1 })
    }));

    detalle.innerHTML = `
      <div class="metricas">
        ${jugador.rol === 'pits' ? club.metrica('Rol', '🔧 Pits', 'staff del equipo') : ''}
        ${jugador.rol === 'recluta' ? club.metrica('Rol', '🔰 Recluta', 'a prueba: meta 50% por periodo') : ''}
        ${admin.categorias && club.vaEnRoster(jugador) ? club.metrica('🎯 Categoría',Portal.esc(admin.nombreCategoria(admin.categoriaDe(jugador.id)) || 'Sin categoría'),
            Portal.esc(club.textoHistorial(admin.categorias, club.historialDe(admin.historial, jugador.id)))) : ''}
        ${club.metrica(`Asistencia ${datos.anio}`, club.pct(anual.porcentaje), `${anual.asistio} de ${anual.asistio + anual.falta} entrenamientos`)}
        ${club.metrica('Asistencias', anual.asistio, '', 'bien')}
        ${club.metrica('Faltas', anual.falta, '', anual.falta ? 'alerta' : '')}
        ${club.metrica('Justificadas', anual.justificada)}
        ${club.metrica('🏆 Torneos (extra)', club.textoTorneos(torneos), torneos.fue ? `+${torneos.fue} asistencia extra` : '')}
      </div>

      <h3 class="subtitulo">Por periodo</h3>
      <div class="tetras en-fila">
        ${club.TETRAS.map(t => club.tarjetaTetra(t, club.resumenAsistencia(datos, jugador.id, { tetra: t.numero }), t.numero === tetraHoy, club.resumenTorneos(datos, jugador, { tetra: t.numero }))).join('')}
      </div>

      <h3 class="subtitulo">Por mes</h3>
      <div class="tabla-contenedor">
        <table class="tabla matriz">
          <thead><tr><th>Mes</th><th>Asistió</th><th>Faltas</th><th>Justificadas</th><th>Asistencia</th><th>🏆</th></tr></thead>
          <tbody>${meses.map(m => {
            const sinDatos = !m.r.asistio && !m.r.falta && !m.r.justificada;
            return `<tr class="${sinDatos && !m.t.total ? 'tenue' : ''}">
              <th scope="row">${m.nombre}</th>
              <td>${sinDatos ? '—' : m.r.asistio}</td>
              <td class="${m.r.falta ? 'texto-rojo' : ''}">${sinDatos ? '—' : m.r.falta}</td>
              <td>${sinDatos ? '—' : m.r.justificada}</td>
              <td>${celdaPorcentaje(m.r)}</td>
              <td>${m.t.total ? celdaTorneos(m.t) : '—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>

      <h3 class="subtitulo">🏆 Torneos <small>${club.textoTorneos(torneos)}</small></h3>
      <ul class="lista">${torneos.total
        ? torneos.torneos.map(({ e, fue }) => `<li><span><strong>${Portal.esc(club.nombreEvento(e))}</strong> · ${club.rangoLargo(e)}</span>
            ${fue ? '<span class="chip torneo">🏆 Fue</span>' : '<span class="chip">No fue</span>'}</li>`).join('')
        : '<li class="vacio">No hubo torneos en este año.</li>'}</ul>

      <h3 class="subtitulo">Días que faltó <small>${anual.faltas.length}</small></h3>
      <ul class="lista">${anual.faltas.length
        ? anual.faltas.map(e => `<li><span><strong>${club.fechaLarga(e.fecha)}</strong>${e.nota ? ` · ${Portal.esc(e.nota)}` : ''}</span><span class="chip inactivo">Falta</span></li>`).join('')
        : '<li class="vacio">Sin faltas en este año. 💪</li>'}</ul>`;
  }

  selectorJugador.addEventListener('change', pintarDetalle);

  // Tocar un nombre en la tabla abre su detalle.
  cuerpo.addEventListener('click', e => {
    const boton = e.target.closest('[data-ver-jugador]');
    if (!boton) return;
    selectorJugador.value = boton.dataset.verJugador;
    pintarDetalle();
    document.getElementById('est-detalle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();
