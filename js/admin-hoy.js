// =====================================================================
// Pestaña "Hoy": lo que el administrador usa en el campo.
//   - Si hay entrenamiento hoy: botón grande "Pasar lista" y
//     "¿Llueve? Cancelar entrenamiento".
//   - Si se canceló: el motivo y opción de reactivar.
//   - Si no hay: cuándo es el próximo.
//   - Abajo: entrenamientos pasados que se quedaron sin lista.
// =====================================================================
(() => {
  const { club, admin } = Portal;
  const principal = document.getElementById('hoy-principal');
  const pendientes = document.getElementById('hoy-pendientes');

  const mayuscula = texto => texto[0].toUpperCase() + texto.slice(1);

  admin.vistas.hoy = function () {
    const datos = admin.datos, hoy = club.hoy();
    const encabezado = `<p class="hoy-etiqueta">Hoy</p><h2 class="hoy-fecha">${mayuscula(club.fechaLarga(hoy))}</h2>`;

    // --- Tarjeta principal ---
    if (datos.anio !== club.anioActual()) {
      principal.innerHTML = `${encabezado}<p class="hoy-estado">Estás viendo el año ${datos.anio}. Cambia el año a ${club.anioActual()} (arriba) para ver lo de hoy.</p>`;
    } else {
      const e = club.eventoEn(datos.entrenamientos, hoy);   // incluye torneos de varios días
      if (e && !e.cancelado) {
        const lista = datos.asistencias.filter(a => a.entrenamiento_id === e.id);
        const llegaron = lista.filter(a => a.estado === 'asistio').length;
        const marcados = new Set(lista.map(a => a.jugador_id));
        const total = admin.cuentas.filter(c => club.llevaAsistencia(c) && ((c.activo && c.fecha_alta <= hoy) || marcados.has(c.id))).length;
        principal.innerHTML = `${encabezado}
          <p class="hoy-estado">${club.esTorneo(e)
            ? `🏆 Hoy hay torneo${e.nota ? ` · <strong>${Portal.esc(e.nota)}</strong>` : ''}<br><small>Asistencia extra: suma, faltar no cuenta en contra.</small>`
            : `✅ Hay entrenamiento${e.nota ? ` · ${Portal.esc(e.nota)}` : ''}`}</p>
          ${lista.length ? `<p class="hoy-contador">${llegaron} de ${total} ${club.esTorneo(e) ? 'fueron' : 'llegaron'}</p>` : ''}
          <div class="acciones">
            <button type="button" class="primario enorme" data-hoy-qr="${e.id}">📱 Mostrar QR de llegada</button>
            <button type="button" class="secundario grande" data-hoy-lista="${e.id}">📋 ${lista.length ? 'Ver o corregir la lista' : 'Pasar lista a mano'}</button>
            <button type="button" class="secundario grande" data-hoy-dia="${hoy}">🌧️ ¿Llueve? Cancelar entrenamiento</button>
          </div>`;
      } else if (e?.cancelado) {
        principal.innerHTML = `${encabezado}
          <p class="hoy-estado">❌ Entrenamiento cancelado${club.motivo(e) ? `<br><strong>${Portal.esc(club.motivo(e))}</strong>` : ''}</p>
          <div class="acciones">
            <button type="button" class="secundario grande" data-hoy-dia="${hoy}">Ver o reactivar</button>
          </div>`;
      } else {
        const proximo = datos.entrenamientos.find(x => x.fecha > hoy && !x.cancelado);
        principal.innerHTML = `${encabezado}
          <p class="hoy-estado">Hoy no hay entrenamiento.</p>
          ${proximo ? `<p>Próximo: <strong>${club.fechaLarga(proximo.fecha)}</strong></p>` : ''}
          <div class="acciones">
            <button type="button" class="secundario grande" data-hoy-dia="${hoy}">➕ Programar entrenamiento hoy</button>
          </div>`;
      }
    }

    // --- Listas pendientes (ya pasaron, no cancelados y sin ningún registro) ---
    const conLista = new Set(datos.asistencias.map(a => a.entrenamiento_id));
    const faltan = datos.entrenamientos
      .filter(e => !e.cancelado && club.fechaFin(e) < hoy && !conLista.has(e.id))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    pendientes.innerHTML = faltan.length
      ? faltan.map(e => `<li>
          <span><strong>${mayuscula(club.rangoLargo(e))}</strong>${club.esTorneo(e) ? `<br><span class="chip torneo">${Portal.esc(club.nombreEvento(e))}</span>` : ''}</span>
          <button type="button" class="secundario" data-hoy-lista="${e.id}">Pasar lista</button>
        </li>`).join('')
      : '<li class="vacio">✓ Todo al día: no hay listas pendientes.</li>';
  };

  document.querySelector('[data-vista="hoy"]').addEventListener('click', e => {
    const qr = e.target.closest('[data-hoy-qr]');
    if (qr) { admin.abrirQR(Number(qr.dataset.hoyQr)); return; }
    const lista = e.target.closest('[data-hoy-lista]');
    if (lista) { admin.abrirLista(Number(lista.dataset.hoyLista)); return; }
    const dia = e.target.closest('[data-hoy-dia]');
    if (dia) admin.abrirDia(dia.dataset.hoyDia);
  });
})();
