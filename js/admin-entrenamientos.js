// =====================================================================
// Pestaña "Entrenamientos": lista del año y agregar sábados de un mes.
// (El calendario está en admin-calendario.js; pasar lista en admin-lista.js.)
// =====================================================================
(() => {
  const { club, admin } = Portal;
  const contenedor = document.getElementById('lista-entrenamientos');
  const formSabados = document.getElementById('form-sabados');

  // --- Lista agrupada por periodo -------------------------------
  admin.vistas.entrenamientos = function () {
    const { entrenamientos, asistencias } = admin.datos;
    if (!entrenamientos.length) {
      contenedor.innerHTML = `<p class="vacio">Aún no hay entrenamientos ni torneos en ${admin.datos.anio}.</p>`;
      return;
    }
    const hoy = club.hoy();
    contenedor.innerHTML = club.TETRAS.map(t => {
      const delTetra = entrenamientos.filter(e => club.tetraDe(e.fecha) === t.numero);
      if (!delTetra.length) return '';
      const cancelados = delTetra.filter(e => e.cancelado).length;
      const torneos = delTetra.filter(e => club.esTorneo(e) && !e.cancelado).length;
      const entrenos = delTetra.length - cancelados - torneos;
      return `<h3 class="subtitulo">${t.nombre} <small>${t.meses} · ${entrenos} entrenamientos${torneos ? ` · 🏆 ${torneos} torneos` : ''}${cancelados ? ` · ${cancelados} cancelados` : ''}</small></h3>
        <div class="tabla-contenedor"><table class="tabla apilable">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Lista</th><th>Acciones</th></tr></thead>
          <tbody>${delTetra.map(e => fila(e, asistencias.filter(a => a.entrenamiento_id === e.id), hoy)).join('')}</tbody>
        </table></div>`;
    }).join('');
  };

  function fila(e, lista, hoy) {
    let estado;
    const tipo = club.esTorneo(e) ? `<span class="chip torneo">${Portal.esc(club.nombreEvento(e))}</span>` : 'Entrenamiento';
    if (e.cancelado) estado = `<span class="chip cancelado">Cancelado${club.motivo(e) ? ` · ${Portal.esc(club.motivo(e))}` : ''}</span>`;
    else if (lista.length) estado = `<span class="chip activo">${lista.filter(a => a.estado === 'asistio').length} de ${lista.length} ${club.esTorneo(e) ? 'fueron' : 'asistieron'}</span>`;
    else if (e.fecha > hoy) estado = '<span class="chip">Próximo</span>';
    else estado = '<span class="chip inactivo">Lista pendiente</span>';
    return `<tr class="${e.cancelado ? 'fila-cancelada' : ''}">
      <td data-etiqueta="Fecha"><strong>${club.rangoCorto(e)}</strong></td>
      <td data-etiqueta="Tipo">${tipo}</td>
      <td data-etiqueta="Lista">${estado}</td>
      <td data-etiqueta="Acciones"><div class="acciones">
        <button class="secundario" data-dia-abrir="${e.fecha}">Abrir</button>
        ${e.cancelado ? '' : `<button class="secundario" data-lista="${e.id}">${lista.length ? 'Editar lista' : 'Pasar lista'}</button>`}
      </div></td>
    </tr>`;
  }

  contenedor.addEventListener('click', e => {
    const botonLista = e.target.closest('[data-lista]');
    if (botonLista) admin.abrirLista(Number(botonLista.dataset.lista));
    const botonDia = e.target.closest('[data-dia-abrir]');
    if (botonDia) admin.abrirDia(botonDia.dataset.diaAbrir);
  });

  // --- Agregar todos los sábados de un mes --------------------------
  formSabados.elements.mes.value = club.hoy().slice(0, 7);

  formSabados.addEventListener('submit', async e => {
    e.preventDefault();
    const [anio, mes] = formSabados.elements.mes.value.split('-').map(Number);
    const primero = club.mesISO(anio, mes);
    const ultimo = club.aISO(new Date(anio, mes, 0));

    // Lo que ya hay ese mes (incluye torneos que empiezan hasta 6 días antes y lo abarcan).
    const { data: existentes, error: errorLeer } = await Portal.nube.from('entrenamientos')
      .select('id, fecha, fecha_fin, tipo').gte('fecha', club.sumarDias(primero, -6)).lte('fecha', ultimo);
    if (errorLeer) { alert('No se pudieron revisar las fechas del mes.'); return; }

    const sabados = [];
    for (let d = new Date(anio, mes - 1, 1); d.getMonth() === mes - 1; d.setDate(d.getDate() + 1))
      if (d.getDay() === 6) sabados.push(club.aISO(d));
    const ocupados = sabados.filter(f => club.eventoEn(existentes, f));   // ya tienen entrenamiento o caen en un torneo
    const fechas = sabados.filter(f => !ocupados.includes(f)).map(fecha => ({ fecha }));

    let agregados = 0;
    if (fechas.length) {
      const { data, error } = await Portal.nube.from('entrenamientos')
        .upsert(fechas, { onConflict: 'fecha', ignoreDuplicates: true }).select();
      if (error) { alert('No se pudieron agregar los sábados.'); return; }
      agregados = data.length;
    }
    alert(`Se agregaron ${agregados} sábados de ${club.MESES[mes - 1].toLowerCase()}.${ocupados.length ? ` (${ocupados.length} ya tenían algo o caen en un torneo)` : ''}`);
    await admin.recargar();
  });

})();
