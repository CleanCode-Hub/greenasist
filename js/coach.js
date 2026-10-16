// =====================================================================
// Coach: ve su panel de jugador (Green Card, asistencia, categoría) y
// además las ESTADÍSTICAS del equipo, solo para ver (no cambia nada).
// Reutiliza la pestaña Estadísticas del administrador; las demás pestañas
// se ocultan. Los permisos reales están en la base de datos (10-coach-pits.sql):
// el coach puede leer, pero no escribir.
// =====================================================================
(() => {
  const nav = document.getElementById('nav-coach');
  const botones = nav.querySelectorAll('[data-coach]');
  const panelJugador = document.getElementById('panel-jugador');
  const panelEquipo = document.getElementById('panel-admin');

  Portal.mostrarCoach = async function () {
    nav.hidden = false;
    panelEquipo.classList.add('modo-coach');
    await Portal.mostrarJugador();
    await Portal.mostrarAdmin();                                       // carga los datos del equipo
    panelEquipo.querySelector('[data-pestana="estadisticas"]').click(); // solo esa pestaña
    enfocarMiCategoria();
    ver('jugador');
  };

  // Las estadísticas se abren filtradas en la (primera) categoría que ENTRENA, con un aviso.
  // Ojo: es la que entrena, no donde juega (eso puede ser otra categoría).
  function enfocarMiCategoria() {
    const admin = Portal.admin;
    const entrena = admin.categorias ? admin.categoriasQueEntrena(Portal.perfil.id) : [];
    const aviso = document.getElementById('aviso-coach');
    aviso.hidden = !entrena.length;
    if (!entrena.length) return;
    // La primera que tenga integrantes (si todas están vacías, la primera).
    const enfocada = entrena.find(id => admin.jugadoresActivos().some(j => admin.categoriaDe(j.id) === id)) || entrena[0];
    const filtro = document.getElementById('est-categoria');
    filtro.value = String(enfocada);
    filtro.dispatchEvent(new Event('change'));
    const nombres = entrena.map(id => `<strong>${Portal.esc(admin.nombreCategoria(id))}</strong>`).join(' y ');
    aviso.innerHTML = `🧢 Eres coach de ${nombres}. La tabla muestra a los jugadores de ${Portal.esc(admin.nombreCategoria(enfocada))}; cambia el filtro "Categoría" para ver otras.`;
  }

  function ver(cual) {
    panelJugador.hidden = cual !== 'jugador';
    panelEquipo.hidden = cual !== 'equipo';
    botones.forEach(b => {
      const activo = b.dataset.coach === cual;
      b.classList.toggle('activa', activo);
      b.setAttribute('aria-selected', String(activo));
    });
  }
  botones.forEach(b => b.addEventListener('click', () => ver(b.dataset.coach)));
})();
