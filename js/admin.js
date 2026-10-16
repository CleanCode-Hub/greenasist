// =====================================================================
// Panel del administrador: pestañas, año seleccionado y datos compartidos.
// Cada pestaña vive en su propio archivo admin-*.js y se registra en
// Portal.admin.vistas; aquí solo se cargan los datos y se repintan todas.
// =====================================================================
(() => {
  const panel = document.getElementById('panel-admin');
  const selectorAnio = document.getElementById('anio-admin');
  const pestanas = panel.querySelectorAll('[data-pestana]');

  const admin = Portal.admin = {
    cuentas: [],   // todos los perfiles
    datos: null,   // entrenamientos, asistencias y pagos del año (Portal.club.cargarAnio)
    categorias: null, // divisiones del roster (null = falta instalar 09-roster.sql)
    historial: [],    // cambios de categoría [{ jugador_id, desde, categoria_id }]
    coaches: null,    // quién entrena cada categoría [{ categoria_id, coach_id }] (null = falta instalar 14)
    vistas: {},    // { cuentas: fn, entrenamientos: fn, ... } funciones que pintan cada pestaña
    // Jugadores y coaches activos: pagan Green Card y van en el roster.
    jugadoresActivos: () => admin.cuentas.filter(c => Portal.club.vaEnRoster(c) && c.activo),
    // Todos los que llevan asistencia (jugadores, coaches, pits y reclutas).
    conAsistencia: () => admin.cuentas.filter(c => Portal.club.llevaAsistencia(c) && c.activo),
    // Los que pagan Green Card (jugadores, coaches y reclutas).
    pagan: () => admin.cuentas.filter(c => Portal.club.pagaGreenCard(c) && c.activo),
    // Reclutas: ¿ya puede subir a jugador? (lo llena admin-reclutas.js)
    reclutaPuedeSubir: () => false
  };
  admin.nombreCategoria = id => Portal.club.nombreCategoria(admin.categorias, id);
  // Categoría de un jugador en una fecha (por defecto: hoy, o el fin del año elegido si es pasado).
  admin.categoriaDe = (jugadorId, fecha = Portal.club.fechaReferencia(admin.datos.anio)) =>
    Portal.club.categoriaEn(admin.historial, jugadorId, fecha);
  // Coaches que ENTRENAN una categoría (14-coaches-por-categoria.sql). Es aparte de
  // dónde juegan. Sin la tabla instalada, se usa la categoría donde juega el coach.
  const coachesActivos = () => admin.cuentas.filter(c => c.rol === 'coach' && c.activo);
  admin.coachesDe = categoriaId => admin.coaches
    ? coachesActivos().filter(c => admin.coaches.some(a => a.coach_id === c.id && a.categoria_id === categoriaId))
    : coachesActivos().filter(c => admin.categoriaDe(c.id) === categoriaId);
  // Categorías que entrena un coach (ids, en el orden del roster).
  admin.categoriasQueEntrena = coachId => (admin.categorias || [])
    .filter(c => admin.coachesDe(c.id).some(k => k.id === coachId)).map(c => c.id);

  // Vuelve a leer todo y repinta las pestañas. Se llama después de cada cambio.
  admin.recargar = async function () {
    try {
      const anio = Number(selectorAnio.value);
      const [cuentas, datos, categorias, historial, coaches] = await Promise.all([
        Portal.nube.from('perfiles').select('*').order('nombre_completo'),
        Portal.club.cargarAnio(anio),
        Portal.club.cargarCategorias(),
        Portal.club.cargarHistorialCategorias(),
        Portal.club.cargarCoaches()
      ]);
      if (cuentas.error) throw new Error('No se pudieron cargar las cuentas.');
      admin.cuentas = cuentas.data;
      admin.datos = datos;
      admin.categorias = historial ? categorias : null;   // sin historial = falta instalar 09
      admin.historial = historial || [];
      admin.coaches = coaches;   // null = falta instalar 14-coaches-por-categoria.sql
      Object.values(admin.vistas).forEach(pintar => pintar());
    } catch (err) {
      alert(err.message);
    }
  };

  Portal.mostrarAdmin = async function () {
    panel.hidden = false;
    Portal.club.llenarAnios(selectorAnio);
    await admin.recargar();
  };

  pestanas.forEach(boton => boton.addEventListener('click', () => {
    pestanas.forEach(b => {
      b.classList.toggle('activa', b === boton);
      b.setAttribute('aria-selected', String(b === boton));
    });
    panel.querySelectorAll('[data-vista]').forEach(vista => { vista.hidden = vista.dataset.vista !== boton.dataset.pestana; });
  }));

  selectorAnio.addEventListener('change', admin.recargar);
})();
