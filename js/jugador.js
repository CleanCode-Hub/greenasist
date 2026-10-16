// =====================================================================
// Panel del jugador: Green Card, asistencia por tetramestre, calendario
// (asistí / falté / cancelado), días que faltó y sus datos.
// Solo ve lo suyo (lo garantiza RLS).
// También lo usan:
//   coach -> igual que un jugador (las estadísticas del equipo están en coach.js)
//   pits  -> "modo staff": lleva asistencia, pero no ve Green Card ni categoría
//            (lo marcado con data-no-pits en el HTML se oculta).
// =====================================================================
(() => {
  const { club } = Portal;
  const panel = document.getElementById('panel-jugador');
  const selectorAnio = document.getElementById('anio-jugador');
  const calendario = document.getElementById('jugador-cal-dias');
  const CHIP = {
    asistio:     '<span class="chip activo">Asistí</span>',
    falta:       '<span class="chip inactivo">Falté</span>',
    justificada: '<span class="chip admin">Justificada</span>',
    cancelado:   '<span class="chip cancelado">Cancelado</span>',
    proximo:     '<span class="chip">Próximo</span>',
    sinRegistro: '<span class="chip">Sin registro</span>',
    // Torneos: asistencia extra (no ir no es falta)
    torneoFue:     '<span class="chip torneo">🏆 Fui</span>',
    torneoNo:      '<span class="chip">No fui</span>',
    torneoProximo: '<span class="chip torneo">🏆 Próximo</span>'
  };
  const ETIQUETA_DIA = {
    asistio: 'Asistí', falta: 'Falté', justificada: 'Justificada', proximo: 'Entreno', sinRegistro: 'Sin registro',
    torneoFue: '🏆 Fui', torneoNo: '🏆 Torneo', torneoProximo: '🏆 Torneo'
  };
  let datos = null, categorias = null, historial = [];   // historial = mis cambios [{ jugador_id, desde, categoria_id }]
  let entreno = null;   // coach: ids de las categorías que entreno (null = falta instalar 14)
  const esPits = () => Portal.perfil.rol === 'pits';

  // --- Pestañas del panel: Inicio · Calendario · Asistencia · Green Card ---
  const pestanas = panel.querySelectorAll('[data-jpestana]');
  function verPestana(nombre) {
    pestanas.forEach(b => {
      const activa = b.dataset.jpestana === nombre;
      b.classList.toggle('activa', activa);
      b.setAttribute('aria-selected', String(activa));
    });
    panel.querySelectorAll('[data-jvista]').forEach(v => { v.hidden = v.dataset.jvista !== nombre; });
    window.scrollTo({ top: 0 });
  }
  pestanas.forEach(b => b.addEventListener('click', () => verPestana(b.dataset.jpestana)));

  Portal.mostrarJugador = async function () {
    panel.hidden = false;
    panel.classList.toggle('modo-pits', esPits());
    verPestana('inicio');
    club.llenarAnios(selectorAnio);
    const [cats, cambios, coaches] = await Promise.all([club.cargarCategorias(), club.cargarHistorialCategorias(), club.cargarCoaches()]);   // RLS: solo lo mío
    categorias = cambios ? cats : null;
    historial = club.historialDe(cambios, Portal.perfil.id);
    entreno = coaches && (categorias || []).filter(c => coaches.some(a => a.coach_id === Portal.perfil.id && a.categoria_id === c.id)).map(c => c.id);
    await cargar();
  };

  // --- Mi categoría en el torneo (la asigna el admin en el Roster) ---
  function pintarCategoria(anio) {
    const tarjeta = document.getElementById('mi-categoria');
    tarjeta.hidden = !categorias || !club.vaEnRoster(Portal.perfil);   // reclutas y pits no van en el roster
    if (tarjeta.hidden) return;
    const fecha = club.fechaReferencia(anio);
    const nombre = club.nombreCategoria(categorias, club.categoriaEn(historial, Portal.perfil.id, fecha));
    const cuando = fecha === club.hoy() ? '' : ` · ${club.fechaLarga(fecha)}`;
    const conHistorial = historial.length > 1 ? `<small>Historial: ${Portal.esc(club.textoHistorial(categorias, historial))}</small>` : '';

    // Coach: dónde JUEGA y qué categoría(s) ENTRENA son dos cosas distintas.
    if (Portal.perfil.rol === 'coach' && entreno) {
      const entrenaTexto = entreno.map(id => club.nombreCategoria(categorias, id)).join(' · ');
      tarjeta.innerHTML = `
        <div class="categoria-doble">
          <div><span>🎯 Juego en${cuando}</span>${nombre ? `<strong>${Portal.esc(nombre)}</strong>` : '<strong class="tenue">No juego</strong>'}</div>
          <div><span>🧢 Soy coach de</span>${entrenaTexto ? `<strong>${Portal.esc(entrenaTexto)}</strong>` : '<strong class="tenue">Sin asignar</strong>'}</div>
        </div>${conHistorial}`;
      return;
    }

    const titulo = (Portal.perfil.rol === 'coach' ? '🧢 Soy coach de' : '🎯 Mi categoría en el torneo') + cuando;
    tarjeta.innerHTML = `<span>${titulo}</span>` +
      (nombre ? `<strong>${Portal.esc(nombre)}</strong>` : '<strong class="tenue">Sin asignar</strong><small>El administrador te asignará una división.</small>') +
      conHistorial;
  }
  selectorAnio.addEventListener('change', cargar);

  async function cargar() {
    try {
      datos = await club.cargarAnio(Number(selectorAnio.value));
      pintarCategoria(datos.anio);
      pintar();
      // 🔔 Avisos: se arman con el calendario del año en curso.
      if (datos.anio === club.anioActual()) Portal.actualizarAvisos(datos.entrenamientos);
      await pintarAvanceRecluta();
    }
    catch (err) { alert(err.message); }
  }

  // "Pagado hasta octubre" (la Green Card es mensual: se muestra el último mes pagado).
  function textoPagadoHasta(meses) {
    const pagados = meses.filter(m => m.estado === 'pagado');
    if (!pagados.length) return 'Sin pagos pendientes';
    return `Pagado hasta ${club.MESES[pagados[pagados.length - 1].mes - 1].toLowerCase()}`;
  }

  // --- Recluta: mi avance contra la meta de 50% ----------------------
  async function pintarAvanceRecluta() {
    const tarjeta = document.getElementById('mi-recluta');
    tarjeta.hidden = Portal.perfil.rol !== 'recluta';
    if (tarjeta.hidden) return;
    const actual = club.tetraActual();
    const rango = await club.cargarRango(club.tetraAnterior(actual).desde, actual.hasta);   // RLS: solo lo mío
    const { actual: a, anterior, puedeSubir } = club.evaluarRecluta(rango, Portal.perfil);
    const pct = a.r.porcentaje;
    // El mismo texto que ve el admin, pero hablándole al recluta.
    const avance = club.textoAvanceRecluta(a)
      .replace('necesita ir', 'necesitas ir').replace('ya tiene asegurado', 'ya tienes asegurado')
      .replace('Se evalúa en el siguiente', 'Tu evaluación sigue en el siguiente');

    tarjeta.innerHTML = `
      <span>🔰 Soy recluta · meta: <strong>50% de asistencia</strong> en el tetramestre</span>
      ${puedeSubir
        ? `<p class="recluta-listo">✅ ¡Cumpliste el 50% en el ${anterior.nombre}! El administrador ya puede subirte a jugador.</p>`
        : anterior.participo && anterior.r.porcentaje != null
          ? `<small>${anterior.nombre}: ${club.pct(anterior.r.porcentaje)} (no llegaste al 50%).</small>` : ''}
      <div class="recluta-actual">
        <span>${a.nombre} · en curso</span>
        <strong>${club.pct(pct)}</strong>
        ${club.barraMeta(pct)}
        <small>${a.r.asistio} de ${a.r.asistio + a.r.falta} entrenamientos. ${avance}</small>
      </div>`;
  }

  // Estado de un día para mí:
  //   entrenamiento: asistio | falta | justificada | cancelado | proximo | sinRegistro
  //   torneo:        torneoFue | torneoNo | torneoProximo | cancelado
  function miEstado(e, mios, hoy) {
    if (e.cancelado) return 'cancelado';
    if (club.esTorneo(e)) return mios.get(e.id) === 'asistio' ? 'torneoFue' : e.fecha > hoy ? 'torneoProximo' : 'torneoNo';
    if (mios.has(e.id)) return mios.get(e.id);
    return e.fecha > hoy ? 'proximo' : 'sinRegistro';
  }

  function pintar() {
    const yo = Portal.perfil, hoy = club.hoy();
    const meses = club.estadoMeses(datos, yo);
    const debe = club.mesesQueDebe(meses);
    const tetraHoy = datos.anio === club.anioActual() ? club.tetraDe(hoy) : null;
    const anual = club.resumenAsistencia(datos, yo.id);
    const mios = new Map(datos.asistencias.filter(a => a.jugador_id === yo.id).map(a => [a.entrenamiento_id, a.estado]));
    const misEntrenamientos = datos.entrenamientos.filter(e => e.fecha >= yo.fecha_alta);

    // --- Tarjetas de resumen ---
    const proximo = datos.entrenamientos.find(e => e.fecha >= hoy && !e.cancelado);
    const tetraActual = tetraHoy ? club.TETRAS[tetraHoy - 1] : null;
    const asistenciaActual = tetraActual ? club.resumenAsistencia(datos, yo.id, { tetra: tetraHoy }) : anual;
    const torneos = club.resumenTorneos(datos, yo);
    const textoProximo = proximo ? Portal.esc(club.esTorneo(proximo) ? club.nombreEvento(proximo) : proximo.nota || 'Entrenamiento') : '';
    // 🏠 Inicio: lo más importante (Green Card o rol, asistencia y lo próximo).
    // Pits (staff): lleva asistencia, pero no paga Green Card (en su lugar se muestra su rol).
    document.getElementById('jugador-metricas').innerHTML = [
      esPits()
        ? club.metrica('Mi rol', '🔧 Pits', 'staff del equipo')
        : debe
          ? club.metrica(club.nombreMembresia, `Debes ${club.dinero(debe * club.monto)}`, `${debe} ${debe === 1 ? 'mes pendiente' : 'meses pendientes'}`, 'alerta')
          : club.metrica(club.nombreMembresia, 'Al corriente', textoPagadoHasta(meses), 'bien'),
      club.metrica(tetraActual ? `Asistencia · ${tetraActual.nombre}` : `Asistencia ${datos.anio}`, club.pct(asistenciaActual.porcentaje), tetraActual ? tetraActual.meses : ''),
      club.metrica('Próximo', proximo ? club.fechaCorta(proximo.fecha) : 'Sin fecha', textoProximo)
    ].join('');
    // 📊 Asistencia: faltas y torneos del año.
    document.getElementById('jugador-metricas-asistencia').innerHTML = [
      club.metrica(`Faltas en ${datos.anio}`, anual.falta, '', anual.falta ? 'alerta' : 'bien'),
      club.metrica('🏆 Torneos', club.textoTorneos(torneos), torneos.fue ? `+${torneos.fue} asistencia extra` : 'asistencia extra')
    ].join('');

    // --- Green Card mes por mes ---
    const etiquetaPago = { pagado: 'Pagado', debe: 'Pendiente', proximo: '—', 'no-aplica': '' };
    document.getElementById('mis-pagos').innerHTML = meses.map(m =>
      `<div class="mes ${m.estado}" title="${m.pago ? `Pagado el ${club.fechaCorta(m.pago.fecha_pago)}` : ''}">
        <span>${club.MESES_CORTOS[m.mes - 1]}</span><strong>${etiquetaPago[m.estado]}</strong>
      </div>`).join('');
    document.getElementById('mi-monto').textContent = `Membresía mensual: ${club.dinero(club.monto)}.`;

    // --- Asistencia por tetramestre ---
    document.getElementById('mis-tetras').innerHTML = club.TETRAS
      .map(t => club.tarjetaTetra(t, club.resumenAsistencia(datos, yo.id, { tetra: t.numero }), t.numero === tetraHoy, club.resumenTorneos(datos, yo, { tetra: t.numero }))).join('');

    // --- Días que falté ---
    document.getElementById('mis-faltas').innerHTML = anual.faltas.length
      ? anual.faltas.map(e => `<li><span><strong>${club.fechaLarga(e.fecha)}</strong>${e.nota ? ` · ${Portal.esc(e.nota)}` : ''}</span>${CHIP.falta}</li>`).join('')
      : `<li class="vacio">No has faltado en ${datos.anio}. 💪</li>`;

    // --- Cancelados (lluvia, etc.) ---
    const cancelados = misEntrenamientos.filter(e => e.cancelado);
    document.getElementById('mis-cancelados').innerHTML = cancelados.length
      ? cancelados.map(e => `<li><span><strong>${club.rangoLargo(e)}</strong>${club.motivo(e) ? `<br><small>${Portal.esc(club.motivo(e))}</small>` : ''}</span>${CHIP.cancelado}</li>`).join('')
      : `<li class="vacio">No se ha cancelado ningún entrenamiento en ${datos.anio}.</li>`;

    // --- Todos los entrenamientos ---
    document.getElementById('mis-entrenamientos').innerHTML = misEntrenamientos.length
      ? misEntrenamientos.map(e => {
          const estado = miEstado(e, mios, hoy);
          const detalle = Portal.esc(e.cancelado ? club.motivo(e) : club.esTorneo(e) ? club.nombreEvento(e) : e.nota || '');
          return `<li><span><strong>${club.rangoCorto(e)}</strong>${detalle ? ` · ${detalle}` : ''}</span>${CHIP[estado]}</li>`;
        }).join('')
      : `<li class="vacio">No hay entrenamientos en ${datos.anio}.</li>`;

    irAnio(datos.anio);
  }

  // --- Mi calendario ------------------------------------------------
  const irAnio = club.navegadorMes(document.getElementById('jugador-calendario'), (anio, mes) => {
    if (!datos || datos.anio !== anio) return;
    const yo = Portal.perfil, hoy = club.hoy();
    const misEventos = datos.entrenamientos.filter(e => club.fechaFin(e) >= yo.fecha_alta);
    const mios = new Map(datos.asistencias.filter(a => a.jugador_id === yo.id).map(a => [a.entrenamiento_id, a.estado]));

    calendario.innerHTML = club.calendario(anio, mes, iso => {
      const e = club.eventoEn(misEventos, iso);   // un torneo de varios días aparece en todos sus días
      const estado = e ? miEstado(e, mios, hoy) : '';
      const clase = estado.startsWith('torneo') ? `torneo ${estado === 'torneoFue' ? 'fui' : ''}` : estado === 'proximo' ? 'programado' : estado;
      const diaDelTorneo = e && iso !== e.fecha ? ` · día ${club.diasDe({ fecha: e.fecha, fecha_fin: iso })}` : '';
      const etiqueta = (estado === 'cancelado' ? club.motivo(e) || 'Cancelado' : ETIQUETA_DIA[estado] || '') + diaDelTorneo;
      return `<div class="cal-dia ${clase} ${club.esFinDeSemana(iso) ? 'finde' : ''} ${iso === hoy ? 'hoy' : ''}"
        ${etiqueta ? `title="${Portal.esc(etiqueta)}"` : ''}>
        <span class="cal-num">${Number(iso.slice(8))}</span>${etiqueta ? `<small>${Portal.esc(etiqueta)}</small>` : ''}
      </div>`;
    });
  });

})();
