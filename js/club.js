// =====================================================================
// Reglas del club que usan tanto el administrador como el jugador:
// fechas, periodos, Green Card y porcentajes de asistencia.
// Todo cálculo vive aquí para que ambos paneles den el mismo resultado.
// =====================================================================
(() => {
  const dos = n => String(n).padStart(2, '0');
  const config = window.PORTAL_CONFIG.greenCard;

  const club = Portal.club = {
    nombreMembresia: config.nombre,
    monto: config.monto,
    MESES: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
    MESES_CORTOS: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    // 3 periodos al año
    TETRAS: [
      { numero: 1, nombre: '1er periodo', meses: 'Ene – Abr' },
      { numero: 2, nombre: '2do periodo', meses: 'May – Ago' },
      { numero: 3, nombre: '3er periodo', meses: 'Sep – Dic' }
    ]
  };

  // --- Roles ----------------------------------------------------------
  //   admin   administra todo
  //   jugador paga Green Card, se le pasa lista, va en el roster
  //   coach   como jugador + puede VER las estadísticas del equipo
  //   pits    staff: se le pasa lista, pero no paga Green Card ni va en el roster
  //   recluta a prueba: paga Green Card y se le pasa lista; no va en el roster.
  //           Sube a jugador con 50% de asistencia en un periodo terminado.
  club.ROLES = { admin: 'Administrador', jugador: 'Jugador', coach: 'Coach', pits: 'Pits', recluta: 'Recluta' };
  club.nombreRol = rol => club.ROLES[rol] || rol;
  club.llevaAsistencia = cuenta => ['jugador', 'coach', 'pits', 'recluta'].includes(cuenta.rol);
  club.pagaGreenCard = cuenta => ['jugador', 'coach', 'recluta'].includes(cuenta.rol);
  club.vaEnRoster = cuenta => cuenta.rol === 'jugador' || cuenta.rol === 'coach';
  club.marcaRol = rol => ({ coach: ' 🧢', pits: ' 🔧', recluta: ' 🔰' }[rol] || '');   // junto al nombre
  club.chipRol = rol => ({
    admin:   '<span class="chip admin">Administrador</span>',
    coach:   '<span class="chip coach">🧢 Coach</span>',
    pits:    '<span class="chip pits">🔧 Pits</span>',
    recluta: '<span class="chip recluta">🔰 Recluta</span>'
  }[rol] || '<span class="chip">Jugador</span>');

  // --- Fechas (siempre como texto 'AAAA-MM-DD', en hora local) -------
  club.aISO = d => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
  club.hoy = () => club.aISO(new Date());
  club.aFecha = iso => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); };
  club.anioActual = () => new Date().getFullYear();
  club.mesActual = () => new Date().getMonth() + 1;
  club.mesISO = (anio, mes) => `${anio}-${dos(mes)}-01`;
  club.tetraDe = iso => Math.ceil(Number(iso.slice(5, 7)) / 4);
  club.fechaCorta = iso => club.aFecha(iso).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
  club.fechaLarga = iso => club.aFecha(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // --- Formatos ------------------------------------------------------
  club.dinero = n => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  club.pct = v => v == null ? '—' : `${Math.round(v * 100)}%`;
  club.metrica = (titulo, valor, detalle = '', tono = '') =>
    `<div class="metrica ${tono}"><span>${titulo}</span><strong>${valor}</strong>${detalle ? `<small>${detalle}</small>` : ''}</div>`;
  club.barra = v => `<span class="barra" aria-hidden="true"><i style="width:${Math.round((v || 0) * 100)}%"></i></span>`;

  club.llenarAnios = select => {
    const actual = club.anioActual();
    select.innerHTML = [actual + 1, actual, actual - 1, actual - 2].map(a => `<option>${a}</option>`).join('');
    select.value = actual;
  };

  // --- Datos de un año -----------------------------------------------
  // Los permisos (RLS) hacen que el jugador reciba solo SU asistencia y SUS pagos.
  club.cargarAnio = async anio => {
    const desde = `${anio}-01-01`, hasta = `${anio}-12-31`;
    const [entrenamientos, pagos] = await Promise.all([
      Portal.nube.from('entrenamientos').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha'),
      Portal.nube.from('pagos').select('*').gte('mes', desde).lte('mes', hasta)
    ]);
    if (entrenamientos.error || pagos.error) throw new Error('No se pudieron cargar los datos del club.');

    let asistencias = [];
    const ids = entrenamientos.data.map(e => e.id);
    if (ids.length) {
      const respuesta = await Portal.nube.from('asistencias').select('*').in('entrenamiento_id', ids);
      if (respuesta.error) throw new Error('No se pudo cargar la asistencia.');
      asistencias = respuesta.data;
    }
    return { anio, entrenamientos: entrenamientos.data, pagos: pagos.data, asistencias };
  };

  // --- Categorías del roster (Junior 3v3, Novice 5Man, Elite, …) -----
  // Las dos devuelven null si todavía no se instaló 09-roster.sql.
  club.cargarCategorias = async () => {
    const { data, error } = await Portal.nube.from('categorias').select('*').order('orden');
    return error ? null : data;
  };
  // Historial de cambios: [{ jugador_id, desde, categoria_id }] (el jugador solo recibe el suyo).
  club.cargarHistorialCategorias = async () => {
    const { data, error } = await Portal.nube.from('historial_categorias').select('jugador_id, desde, categoria_id');
    return error ? null : data;
  };
  club.nombreCategoria = (categorias, id) => (categorias || []).find(c => c.id === id)?.nombre || '';
  // Qué categorías entrena cada coach: [{ categoria_id, coach_id }] (null si falta instalar 14).
  // Ojo: es aparte de dónde JUEGA el coach (eso está en historial_categorias).
  club.cargarCoaches = async () => {
    const { data, error } = await Portal.nube.from('coaches_categoria').select('categoria_id, coach_id');
    return error ? null : data;
  };

  // Categoría de un jugador en una fecha = el último cambio con "desde" <= esa fecha.
  club.categoriaEn = (historial, jugadorId, fecha) => {
    let categoria = null, desde = '';
    for (const h of historial || [])
      if (h.jugador_id === jugadorId && h.desde <= fecha && h.desde >= desde) { categoria = h.categoria_id; desde = h.desde; }
    return categoria;
  };
  club.historialDe = (historial, jugadorId) =>
    (historial || []).filter(h => h.jugador_id === jugadorId).sort((a, b) => a.desde.localeCompare(b.desde));
  // "Novice 5Man (desde ene 2026) → Elite (desde jun 2026)"
  club.textoHistorial = (categorias, cambios) => cambios.map(h =>
    `${club.nombreCategoria(categorias, h.categoria_id) || 'Sin categoría'} (desde ${club.aFecha(h.desde).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })})`
  ).join(' → ');

  // Fecha con la que se muestra "la categoría" al ver un año:
  // año actual = hoy · años pasados = 31 de diciembre · años futuros = 1 de enero.
  club.fechaReferencia = anio => anio === club.anioActual() ? club.hoy() : anio < club.anioActual() ? `${anio}-12-31` : `${anio}-01-01`;

  // --- Asistencia ----------------------------------------------------
  // Cada día del calendario es un entrenamiento (obligatorio) o un torneo (extra).
  club.esTorneo = e => e?.tipo === 'torneo';

  // Torneos de varios días: van de "fecha" a "fecha_fin" pero son UN solo evento
  // (una lista, una asistencia extra).
  club.sumarDias = (iso, dias) => { const d = club.aFecha(iso); d.setDate(d.getDate() + dias); return club.aISO(d); };
  club.fechaFin = e => e.fecha_fin || e.fecha;
  club.diasDe = e => Math.round((club.aFecha(club.fechaFin(e)) - club.aFecha(e.fecha)) / 86400000) + 1;
  // Evento que ocupa un día (el que empieza ese día, o un torneo que lo abarca).
  club.eventoEn = (entrenamientos, iso) =>
    entrenamientos.find(e => e.fecha === iso) || entrenamientos.find(e => e.fecha < iso && club.fechaFin(e) >= iso);
  // "sáb 28 – dom 29 de nov" o "sáb 28 de nov"
  club.rangoCorto = e => club.diasDe(e) > 1 ? `${club.fechaCorta(e.fecha)} – ${club.fechaCorta(club.fechaFin(e))}` : club.fechaCorta(e.fecha);
  club.rangoLargo = e => club.diasDe(e) > 1 ? `${club.fechaLarga(e.fecha)} al ${club.fechaLarga(club.fechaFin(e))}` : club.fechaLarga(e.fecha);
  // Hora de inicio del entrenamiento (18-hora-entrenamiento.sql): '09:00:00' -> "9:00 a.m."
  club.horaTexto = hora => hora
    ? new Date(`2000-01-01T${hora.slice(0, 5)}`).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }) : '';
  // Versión corta para las casillas del calendario: '16:30:00' -> "4:30 pm"
  club.horaCorta = hora => {
    if (!hora) return '';
    const [h, m] = hora.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  };
  club.nombreEvento = e => club.esTorneo(e) ? `🏆 ${e.nota || 'Torneo'}` : (e.nota || 'Entrenamiento');
  // periodo.filtro(e) (opcional) decide si cuenta ese día; se usa para "solo cuando estaba en Elite".
  const enPeriodo = (e, periodo) =>
    (!periodo.tetra || club.tetraDe(e.fecha) === periodo.tetra) &&
    (!periodo.mes || Number(e.fecha.slice(5, 7)) === periodo.mes) &&
    (!periodo.filtro || periodo.filtro(e));

  // periodo: { mes: 1-12 } o { tetra: 1-3 }; vacío = todo el año.
  // Solo cuentan ENTRENAMIENTOS ya pasados y NO cancelados (los torneos van aparte).
  club.resumenAsistencia = (datos, jugadorId, periodo = {}) => {
    const hoy = club.hoy();
    const porId = new Map(datos.entrenamientos.map(e => [e.id, e]));
    const r = { asistio: 0, falta: 0, justificada: 0, faltas: [] };
    for (const a of datos.asistencias) {
      if (a.jugador_id !== jugadorId) continue;
      const e = porId.get(a.entrenamiento_id);
      if (!e || e.cancelado || club.esTorneo(e) || e.fecha > hoy || !enPeriodo(e, periodo)) continue;
      r[a.estado]++;
      if (a.estado === 'falta') r.faltas.push(e);
    }
    const cuentan = r.asistio + r.falta;              // las justificadas no cuentan en contra
    r.porcentaje = cuentan ? r.asistio / cuentan : null;
    r.faltas.sort((x, y) => x.fecha.localeCompare(y.fecha));
    return r;
  };

  // Torneos = asistencia EXTRA: ir suma, faltar no resta.
  // total = torneos ya pasados y no cancelados desde la fecha de alta del jugador.
  club.resumenTorneos = (datos, jugador, periodo = {}) => {
    const hoy = club.hoy();
    const fue = new Set(datos.asistencias.filter(a => a.jugador_id === jugador.id && a.estado === 'asistio').map(a => a.entrenamiento_id));
    const torneos = datos.entrenamientos
      .filter(e => club.esTorneo(e) && !e.cancelado && e.fecha <= hoy && club.fechaFin(e) >= jugador.fecha_alta && enPeriodo(e, periodo))
      .map(e => ({ e, fue: fue.has(e.id) }));
    return { torneos, fue: torneos.filter(t => t.fue).length, total: torneos.length };
  };
  club.textoTorneos = t => t.total ? `${t.fue} de ${t.total}` : '—';

  // --- Reclutas: meta de 50% en un periodo -----------------------
  club.META_RECLUTA = 0.5;
  // Periodo n (1-3) de un año, con su rango de fechas.
  club.rangoTetra = (anio, numero) => ({
    anio, numero,
    nombre: `${club.TETRAS[numero - 1].nombre} ${anio}`,
    meses: club.TETRAS[numero - 1].meses,
    desde: club.mesISO(anio, 4 * (numero - 1) + 1),
    hasta: club.aISO(new Date(anio, 4 * numero, 0))
  });
  club.tetraActual = () => club.rangoTetra(club.anioActual(), club.tetraDe(club.hoy()));
  club.tetraAnterior = t => t.numero > 1 ? club.rangoTetra(t.anio, t.numero - 1) : club.rangoTetra(t.anio - 1, 3);

  // Entrenamientos y asistencias entre dos fechas (sirve aunque cruce de año).
  club.cargarRango = async (desde, hasta) => {
    const entrenamientos = await Portal.nube.from('entrenamientos').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha');
    if (entrenamientos.error) throw new Error('No se pudieron cargar los entrenamientos.');
    const ids = entrenamientos.data.map(e => e.id);
    let asistencias = [];
    if (ids.length) {
      const r = await Portal.nube.from('asistencias').select('*').in('entrenamiento_id', ids);
      if (r.error) throw new Error('No se pudo cargar la asistencia.');
      asistencias = r.data;
    }
    return { entrenamientos: entrenamientos.data, asistencias, pagos: [] };
  };

  // Evaluación de un recluta:
  //   actual   periodo en curso: % hasta hoy y cuántos entrenamientos le faltan
  //   anterior periodo que acaba de terminar: ¿cumplió el 50%?
  //   puedeSubir = cumplió el 50% en el periodo anterior (ya terminado)
  // Solo cuenta desde su fecha de alta (si entró a mitad, igual puede lograrlo).
  club.evaluarRecluta = (datos, recluta) => {
    const hoy = club.hoy();
    const evaluar = t => {
      const participo = recluta.fecha_alta <= t.hasta;
      const r = club.resumenAsistencia(datos, recluta.id, { filtro: e => e.fecha >= t.desde && e.fecha <= t.hasta });
      return { ...t, participo, r, cumple: r.porcentaje != null && r.porcentaje >= club.META_RECLUTA };
    };
    const actual = evaluar(club.tetraActual());
    const anterior = evaluar(club.tetraAnterior(actual));

    // Entrenamientos que le quedan en el periodo (ya programados y sin lista suya).
    const conRegistro = new Set(datos.asistencias.filter(a => a.jugador_id === recluta.id).map(a => a.entrenamiento_id));
    actual.restantes = datos.entrenamientos.filter(e => !e.cancelado && !club.esTorneo(e) &&
      e.fecha >= hoy && e.fecha <= actual.hasta && e.fecha >= recluta.fecha_alta && !conRegistro.has(e.id)).length;
    const total = actual.r.asistio + actual.r.falta + actual.restantes;
    actual.necesita = Math.max(0, Math.ceil(total * club.META_RECLUTA) - actual.r.asistio);   // asistencias que le faltan
    actual.alcanzable = actual.necesita <= actual.restantes;

    return { actual, anterior, puedeSubir: anterior.participo && anterior.cumple };
  };
  // Barra de avance con una rayita en la meta del 50%.
  club.barraMeta = v => `<span class="barra-meta" aria-hidden="true">
      <i class="${(v || 0) >= club.META_RECLUTA ? 'cumple' : ''}" style="width:${Math.round((v || 0) * 100)}%"></i>
      <b style="left:${club.META_RECLUTA * 100}%"></b>
    </span>`;
  // Texto del avance del periodo en curso.
  club.textoAvanceRecluta = a => {
    if (a.necesita === 0) return a.r.asistio
      ? '✅ Con los entrenamientos programados, ya tiene asegurado el 50% de este periodo.'
      : 'Todavía no hay entrenamientos con lista.';
    if (a.alcanzable) return `Para cerrar el periodo con 50% necesita ir al menos a ${a.necesita} de los ${a.restantes} entrenamientos que quedan.`;
    return 'Ya no alcanza el 50% en este periodo. Se evalúa en el siguiente.';
  };

  // Color según el porcentaje (para tablas y calendario).
  club.tonoPorcentaje = v => v == null ? '' : v >= 0.8 ? 'alto' : v >= 0.6 ? 'medio' : 'bajo';

  // Tarjeta de un periodo (la usan el detalle del admin y el panel del jugador).
  // torneos (opcional) = resultado de resumenTorneos para ese periodo.
  club.tarjetaTetra = (t, r, actual = false, torneos = null) => `
    <div class="tetra ${actual ? 'actual' : ''}">
      <span>${t.nombre}<small>${t.meses}</small></span>
      <strong class="${club.tonoPorcentaje(r.porcentaje)}">${club.pct(r.porcentaje)}</strong>
      ${club.barra(r.porcentaje)}
      <small>${r.asistio} asistencias · ${r.falta} faltas${r.justificada ? ` · ${r.justificada} justificadas` : ''}</small>
      ${torneos?.fue ? `<small class="extra-torneo">🏆 +${torneos.fue} ${torneos.fue === 1 ? 'torneo' : 'torneos'} (extra)</small>` : ''}
    </div>`;

  // --- Calendario mensual (lunes a domingo) --------------------------
  // pintarDia(iso) devuelve el HTML de cada casilla con día.
  club.calendario = (anio, mes, pintarDia) => {
    const primero = new Date(anio, mes - 1, 1);
    const huecos = (primero.getDay() + 6) % 7;               // lunes = 0
    const dias = new Date(anio, mes, 0).getDate();
    const cabecera = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => `<div class="cal-semana">${d}</div>`).join('');
    const vacios = '<div class="cal-dia vacio"></div>'.repeat(huecos);
    const casillas = Array.from({ length: dias }, (_, i) => pintarDia(club.mesISO(anio, mes).slice(0, 8) + dos(i + 1))).join('');
    return cabecera + vacios + casillas;
  };
  // Motivo de cancelación (es opcional: puede venir vacío).
  club.motivo = e => (e.motivo_cancelacion || '').trim();
  club.esFinDeSemana = iso => [0, 6].includes(club.aFecha(iso).getDay());

  // Botones ‹ mes › limitados al año cargado. Devuelve la función para cambiar de mes.
  club.navegadorMes = (contenedor, alCambiar) => {
    let anio = club.anioActual(), mes = club.mesActual();
    const titulo = contenedor.querySelector('[data-cal-titulo]');
    const anterior = contenedor.querySelector('[data-cal-anterior]');
    const siguiente = contenedor.querySelector('[data-cal-siguiente]');
    const ir = (nuevoAnio, nuevoMes) => {
      anio = nuevoAnio; mes = nuevoMes;
      titulo.textContent = `${club.MESES[mes - 1]} ${anio}`;
      anterior.disabled = mes === 1;
      siguiente.disabled = mes === 12;
      alCambiar(anio, mes);
    };
    anterior.addEventListener('click', () => ir(anio, mes - 1));
    siguiente.addEventListener('click', () => ir(anio, mes + 1));
    // Al cambiar de año: si es el actual, abre el mes actual; si no, enero.
    return nuevoAnio => ir(nuevoAnio, nuevoAnio === anio ? mes : nuevoAnio === club.anioActual() ? club.mesActual() : 1);
  };

  // --- Green Card ----------------------------------------------------
  // Cada mes es una fila en pagos con su cuota (17-abonos.sql). Está pagado
  // cuando monto >= cuota; si no, es un ABONO (lo que sobró de otro pago).
  // Antes de instalar 17 no hay cuota: cualquier pago cuenta como completo.
  const cuotaDe = p => Number(p.cuota ?? p.monto);
  club.mesCompleto = p => Number(p.monto) >= cuotaDe(p);

  // Estado de cada mes del año:
  //   'pagado'    mes completo
  //   'debe'      mes ya iniciado (desde su alta) sin completar
  //   'proximo'   mes futuro sin completar (se puede pagar por adelantado)
  //   'no-aplica' antes de su fecha de alta
  // abono = lo que ya lleva pagado de un mes incompleto · falta = lo que le falta.
  club.estadoMeses = (datos, jugador) => {
    const [altaAnio, altaMes] = jugador.fecha_alta.split('-').map(Number);
    const hoyAnio = club.anioActual(), hoyMes = club.mesActual();
    return club.MESES.map((_, i) => {
      const mes = i + 1;
      const pago = datos.pagos.find(p => p.jugador_id === jugador.id && p.mes === club.mesISO(datos.anio, mes));
      if (pago && club.mesCompleto(pago)) return { mes, estado: 'pagado', pago };
      const abono = pago ? { pago, abono: Number(pago.monto), falta: cuotaDe(pago) - Number(pago.monto) } : { falta: club.monto };
      if (!pago && (datos.anio < altaAnio || (datos.anio === altaAnio && mes < altaMes))) return { mes, estado: 'no-aplica' };
      if (datos.anio < hoyAnio || (datos.anio === hoyAnio && mes <= hoyMes)) return { mes, estado: 'debe', ...abono };
      return { mes, estado: 'proximo', ...abono };
    });
  };
  club.mesesQueDebe = meses => meses.filter(m => m.estado === 'debe').length;
  // Cuánto debe en pesos (descontando abonos).
  club.adeudo = meses => meses.filter(m => m.estado === 'debe').reduce((suma, m) => suma + m.falta, 0);
  // ¿Debe la Green Card del mes de esa fecha? Sin el mes COMPLETO no se puede
  // marcar su llegada (16-asistencia-requiere-pago.sql). Pits no paga: nunca debe.
  club.debeMesDe = (pagos, cuenta, fecha) =>
    club.pagaGreenCard(cuenta) && !pagos.some(p => p.jugador_id === cuenta.id && p.mes === `${fecha.slice(0, 7)}-01` && club.mesCompleto(p));

  // Vista previa de cómo se reparte un pago desde un mes (igual que registrar_pago
  // en 17-abonos.sql): completa ese mes y lo que sobra pasa a los siguientes.
  // Devuelve [{ anio, mes, monto, completo, falta }].
  club.repartirPago = (pagos, jugadorId, anio, mes, monto) => {
    const reparto = [];
    let resto = monto;
    for (let vueltas = 0; resto > 0 && vueltas < 36; vueltas++) {
      const pago = pagos.find(p => p.jugador_id === jugadorId && p.mes === club.mesISO(anio, mes));
      const lleva = pago ? Number(pago.monto) : 0;
      const cuota = pago ? cuotaDe(pago) : club.monto;
      const aplica = Math.max(0, Math.min(resto, cuota - lleva));
      if (aplica > 0) reparto.push({ anio, mes, monto: aplica, completo: lleva + aplica >= cuota, falta: cuota - lleva - aplica });
      resto -= aplica;
      if (++mes > 12) { mes = 1; anio++; }
    }
    return reparto;
  };
  club.nombreMes = fecha => club.MESES[Number(fecha.slice(5, 7)) - 1].toLowerCase();
})();
