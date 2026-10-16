// =====================================================================
// Pestaña "Reclutas": avance de cada recluta contra la meta de 50%.
//   - Tetramestre en curso: % hasta hoy y cuántas asistencias le faltan.
//   - Tetramestre que acaba de terminar: ¿cumplió el 50%?
//   - "⬆️ Subir a jugador" solo se activa si cumplió en un tetramestre terminado.
// Usa los datos de HOY (no el año elegido arriba): el tetramestre anterior
// puede ser del año pasado. Las reglas están en club.evaluarRecluta.
// =====================================================================
(() => {
  const { club, admin } = Portal;
  const resumen = document.getElementById('reclutas-resumen');
  const lista = document.getElementById('reclutas-lista');
  let evaluaciones = new Map();   // recluta_id → evaluación

  admin.reclutaPuedeSubir = id => evaluaciones.get(id)?.puedeSubir === true;

  admin.vistas.reclutas = () => { cargar(); };

  async function cargar() {
    const reclutas = admin.conAsistencia().filter(c => c.rol === 'recluta');
    try {
      if (reclutas.length) {
        const actual = club.tetraActual();
        const datos = await club.cargarRango(club.tetraAnterior(actual).desde, actual.hasta);
        evaluaciones = new Map(reclutas.map(r => [r.id, club.evaluarRecluta(datos, r)]));
      } else evaluaciones = new Map();
      pintar(reclutas);
    } catch (err) {
      lista.innerHTML = `<div class="tarjeta"><p class="vacio">${Portal.esc(err.message)}</p></div>`;
    }
  }

  // --- Pintar -------------------------------------------------------
  function pintar(reclutas) {
    const actual = club.tetraActual();
    const listos = reclutas.filter(r => evaluaciones.get(r.id)?.puedeSubir).length;
    resumen.innerHTML = [
      club.metrica('Reclutas', reclutas.length),
      club.metrica('Pueden subir a jugador', listos, listos ? 'cumplieron el 50%' : '', listos ? 'bien' : ''),
      club.metrica('Tetramestre en curso', actual.nombre.replace(` ${actual.anio}`, ''), `termina el ${club.fechaLarga(actual.hasta)}`)
    ].join('');

    lista.innerHTML = reclutas.length
      ? reclutas.map(r => tarjeta(r, evaluaciones.get(r.id))).join('')
      : '<div class="tarjeta"><p class="vacio">No hay reclutas. Toca “+ Nuevo recluta” para agregar uno.</p></div>';
  }

  function tarjeta(recluta, ev) {
    const { actual, anterior, puedeSubir } = ev;
    const pct = actual.r.porcentaje;

    let resultadoAnterior;
    if (!anterior.participo) resultadoAnterior = '<span class="tenue">Todavía no era recluta</span>';
    else if (anterior.r.porcentaje == null) resultadoAnterior = '<span class="tenue">Sin entrenamientos con lista</span>';
    else resultadoAnterior = anterior.cumple
      ? `<strong class="alto">✅ Cumplió: ${club.pct(anterior.r.porcentaje)}</strong> <small>(${anterior.r.asistio} de ${anterior.r.asistio + anterior.r.falta})</small>`
      : `<strong class="bajo">❌ No cumplió: ${club.pct(anterior.r.porcentaje)}</strong> <small>(${anterior.r.asistio} de ${anterior.r.asistio + anterior.r.falta})</small>`;

    const razon = puedeSubir ? '' : !anterior.participo
      ? `Entró en este tetramestre: podrá subir cuando termine el ${actual.nombre} si llega al 50%.`
      : `No llegó al 50% en el ${anterior.nombre}. Debe lograrlo en el ${actual.nombre}.`;

    return `<div class="tarjeta recluta-tarjeta ${puedeSubir ? 'listo' : ''}">
      <h2>${Portal.esc(recluta.nombre_completo)} <small>🔰 Recluta desde ${club.fechaLarga(recluta.fecha_alta)}</small></h2>

      <div class="recluta-periodo">
        <span>${actual.nombre} · <em>en curso</em></span>
        <strong class="${club.tonoPorcentaje(pct)}">${club.pct(pct)}</strong>
        ${club.barraMeta(pct)}
        <small>${actual.r.asistio} de ${actual.r.asistio + actual.r.falta} entrenamientos. ${club.textoAvanceRecluta(actual)}</small>
      </div>

      <div class="recluta-periodo">
        <span>${anterior.nombre} · <em>terminado</em></span>
        <p>${resultadoAnterior}</p>
      </div>

      <button type="button" class="primario grande ancho" data-subir="${recluta.id}" ${puedeSubir ? '' : 'disabled'}>⬆️ Subir a jugador</button>
      ${razon ? `<p class="nota">${razon}</p>` : ''}
    </div>`;
  }

  // --- Subir a jugador ----------------------------------------------
  lista.addEventListener('click', async e => {
    const boton = e.target.closest('[data-subir]');
    if (!boton || boton.disabled) return;
    const recluta = admin.cuentas.find(c => c.id === boton.dataset.subir);
    if (!admin.reclutaPuedeSubir(recluta.id)) return;
    if (!confirm(`¿Subir a ${recluta.nombre_completo} a JUGADOR?\n\nDespués asígnale su categoría en 👥 Roster.`)) return;
    boton.disabled = true;
    try {
      await Portal.gestionarCuenta({
        accion: 'editar', idCuenta: recluta.id, nombre: recluta.nombre_completo,
        usuario: recluta.usuario, rol: 'jugador', fechaAlta: recluta.fecha_alta
      });
      alert(`¡Listo! ${recluta.nombre_completo} ya es jugador. Asígnale su categoría en 👥 Roster.`);
      await admin.recargar();
    } catch (err) {
      alert(err.message);
      boton.disabled = false;
    }
  });

  document.getElementById('btn-nuevo-recluta').addEventListener('click', () => admin.abrirNuevaCuenta('recluta'));
})();
