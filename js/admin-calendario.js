// =====================================================================
// Pestaña "Entrenamientos" · Calendario del administrador.
// Al tocar un día se puede: programar entrenamiento (obligatorio) o torneo
// (asistencia extra, de 1 a 3 días), cancelarlo (motivo opcional),
// reactivarlo, pasar lista o eliminarlo.
// Un torneo de varios días se pinta en todos sus días, pero es UN evento:
// tocar cualquiera de sus días abre el mismo torneo.
// =====================================================================
(() => {
  const { club, admin } = Portal;
  const tarjeta = document.getElementById('admin-calendario');
  const dias = document.getElementById('admin-cal-dias');
  let anio = club.anioActual(), mes = club.mesActual();

  // --- Calendario ---------------------------------------------------
  const irAnio = club.navegadorMes(tarjeta, (a, m) => { anio = a; mes = m; pintar(); });
  admin.vistas.calendario = () => irAnio(admin.datos.anio);

  function pintar() {
    if (!admin.datos || admin.datos.anio !== anio) return;
    const { entrenamientos, asistencias } = admin.datos;
    const hoy = club.hoy();

    dias.innerHTML = club.calendario(anio, mes, iso => {
      const e = club.eventoEn(entrenamientos, iso);
      const lista = e ? asistencias.filter(a => a.entrenamiento_id === e.id) : [];
      const fueron = lista.filter(a => a.estado === 'asistio').length;
      const diaDelTorneo = e && iso !== e.fecha ? ` · día ${club.diasDe({ fecha: e.fecha, fecha_fin: iso })}` : '';
      let clase = '', etiqueta = '';
      if (e?.cancelado) { clase = 'cancelado'; etiqueta = club.motivo(e) || 'Cancelado'; }
      else if (club.esTorneo(e)) { clase = 'torneo'; etiqueta = (lista.length && !diaDelTorneo ? `🏆 ${fueron} fueron` : `🏆 ${e.nota || 'Torneo'}`) + diaDelTorneo; }
      else if (lista.length) { clase = 'con-lista'; etiqueta = `✓ ${fueron} vinieron`; }
      else if (e && e.fecha < hoy) { clase = 'pendiente'; etiqueta = 'Sin lista'; }
      else if (e) { clase = 'programado'; etiqueta = e.nota || (e.hora_inicio ? club.horaCorta(e.hora_inicio) : 'Entreno'); }
      return `<button type="button" class="cal-dia ${clase} ${club.esFinDeSemana(iso) ? 'finde' : ''} ${iso === hoy ? 'hoy' : ''}"
        data-fecha="${iso}" aria-label="${club.fechaLarga(iso)}${etiqueta ? `: ${Portal.esc(etiqueta)}` : ''}">
        <span class="cal-num">${Number(iso.slice(8))}</span>${etiqueta ? `<small>${Portal.esc(etiqueta)}</small>` : ''}
      </button>`;
    });
  }

  dias.addEventListener('click', e => {
    const dia = e.target.closest('[data-fecha]');
    if (dia) admin.abrirDia(dia.dataset.fecha);
  });

  // --- Ventana del día ----------------------------------------------
  const dialogo = document.getElementById('dialogo-dia');
  const form = document.getElementById('form-dia');
  const error = form.querySelector('.error');
  const seccion = {
    opciones: document.getElementById('dia-opciones'),
    programar: document.getElementById('dia-btn-programar'),
    botonHora: document.getElementById('dia-btn-hora'),
    entreno: document.getElementById('dia-entreno'),
    botonComisionado: document.getElementById('dia-btn-comisionado'),
    comisionado: document.getElementById('dia-comisionado'),
    botonTorneo: document.getElementById('dia-btn-torneo'),
    editarTorneo: document.getElementById('dia-btn-editar-torneo'),
    lista: document.getElementById('dia-btn-lista'),
    cancelado: document.getElementById('dia-btn-cancelado'),
    cancelar: document.getElementById('dia-cancelar'),
    torneo: document.getElementById('dia-torneo'),
    reactivar: document.getElementById('dia-reactivar'),
    eliminar: document.getElementById('dia-eliminar')
  };
  const textoDias = document.getElementById('torneo-dias-texto');
  let fecha = null, entrenamiento = null;

  // Paso 1 (elegir) ↔ paso 2 ('entreno': hora · 'cancelar': motivo · 'torneo': nombre y días).
  // null = volver al paso 1.
  function mostrarPaso(paso) {
    seccion.opciones.hidden = !!paso;
    seccion.entreno.hidden = paso !== 'entreno';
    seccion.comisionado.hidden = paso !== 'comisionado';
    seccion.cancelar.hidden = paso !== 'cancelar';
    seccion.torneo.hidden = paso !== 'torneo';
    if (paso === 'torneo') explicarDias();
  }

  // Opciones del comisionado: "Nadie (voy yo)" + las cuentas activas de Pits.
  function llenarComisionados() {
    const pits = admin.cuentas.filter(c => c.rol === 'pits' && c.activo);
    const select = form.elements.comisionado;
    select.innerHTML = '<option value="">Nadie (voy yo)</option>' +
      pits.map(c => `<option value="${c.id}">🔧 ${Portal.esc(c.nombre_completo)}</option>`).join('');
    select.value = pits.some(c => c.id === entrenamiento?.comisionado_id) ? entrenamiento.comisionado_id : '';
    if (!pits.length) error.textContent = 'No hay cuentas de Pits activas. Crea una en 👤 Cuentas.';
  }

  // Hora sugerida: la del entrenamiento (si ya tiene) o la del último programado; si no, 9:00.
  function horaSugerida() {
    if (entrenamiento?.hora_inicio) return entrenamiento.hora_inicio.slice(0, 5);
    const conHora = admin.datos.entrenamientos.filter(e => e.hora_inicio && !club.esTorneo(e));
    return conHora.length ? conHora[conHora.length - 1].hora_inicio.slice(0, 5) : '09:00';
  }

  // "Sábado 28 y domingo 29 de noviembre"
  function explicarDias() {
    const fin = club.sumarDias(fecha, Number(form.elements.dias.value) - 1);
    textoDias.textContent = fin === fecha ? `Solo el ${club.fechaLarga(fecha)}.` : `Del ${club.fechaLarga(fecha)} al ${club.fechaLarga(fin)}.`;
  }
  form.elements.dias.addEventListener('change', explicarDias);

  admin.abrirDia = function (iso) {
    // Si el día cae dentro de un torneo de varios días, se abre ese torneo.
    entrenamiento = club.eventoEn(admin.datos.entrenamientos, iso) || null;
    fecha = entrenamiento ? entrenamiento.fecha : iso;
    const lista = entrenamiento ? admin.datos.asistencias.filter(a => a.entrenamiento_id === entrenamiento.id) : [];
    form.reset(); error.textContent = '';

    const titulo = entrenamiento ? club.rangoLargo(entrenamiento) : club.fechaLarga(iso);
    document.getElementById('dia-titulo').textContent = titulo[0].toUpperCase() + titulo.slice(1);

    const torneo = club.esTorneo(entrenamiento);
    const fueron = lista.filter(a => a.estado === 'asistio').length;
    const duracion = torneo && club.diasDe(entrenamiento) > 1 ? ` · ${club.diasDe(entrenamiento)} días` : '';
    const hora = !torneo && entrenamiento?.hora_inicio ? ` · ${club.horaTexto(entrenamiento.hora_inicio)}` : '';
    const nombre = torneo ? `<span class="chip torneo">🏆 Torneo${duracion}</span> ${Portal.esc(entrenamiento.nota || '')}` : `<span class="chip activo">Hay entrenamiento${hora}</span>`;
    let estado;
    if (!entrenamiento) estado = club.esFinDeSemana(iso) ? 'No hay nada programado.' : 'No hay nada programado. Ojo: no es sábado ni domingo.';
    else if (entrenamiento.cancelado) estado = `<span class="chip cancelado">${torneo ? 'Torneo cancelado' : 'Cancelado'}</span> ${Portal.esc(club.motivo(entrenamiento))}`;
    else if (lista.length) estado = `${nombre} ${fueron} de ${lista.length} ${torneo ? 'fueron' : 'asistieron'}.`;
    else estado = `${nombre} ${torneo ? '' : Portal.esc(entrenamiento.nota || '')}`;
    const comisionado = admin.cuentas.find(c => c.id === entrenamiento?.comisionado_id);
    if (comisionado && !entrenamiento.cancelado) estado += `<br><span class="chip comisionado">👤 Comisionado: ${Portal.esc(comisionado.nombre_completo)}</span>`;
    document.getElementById('dia-estado').innerHTML = estado;

    const cancelado = !!entrenamiento?.cancelado;
    mostrarPaso(null);
    seccion.opciones.hidden = cancelado;
    seccion.programar.hidden = !!entrenamiento;
    seccion.botonHora.hidden = !entrenamiento || torneo || cancelado;
    seccion.botonComisionado.hidden = !entrenamiento || cancelado || club.fechaFin(entrenamiento) < club.hoy();
    seccion.botonComisionado.textContent = comisionado ? '👤 Cambiar comisionado' : '👤 Asignar comisionado';
    seccion.botonHora.textContent = entrenamiento?.hora_inicio ? '🕘 Cambiar hora' : '🕘 Poner hora';
    document.getElementById('dia-confirmar-entreno').textContent = entrenamiento ? 'Guardar hora' : 'Confirmar entrenamiento';
    seccion.botonTorneo.hidden = !!entrenamiento;
    seccion.editarTorneo.hidden = !torneo || cancelado;
    seccion.lista.hidden = !entrenamiento || cancelado;
    seccion.cancelado.textContent = entrenamiento ? (torneo ? '❌ Cancelar el torneo' : '❌ Cancelar este día') : '❌ Cancelado';
    seccion.reactivar.hidden = !cancelado;
    seccion.reactivar.querySelector('button').textContent = torneo ? '🏆 Siempre sí hay torneo' : '✅ Siempre sí hay entrenamiento';
    seccion.eliminar.hidden = !entrenamiento;
    if (!seccion.lista.hidden) seccion.lista.textContent = lista.length ? '📋 Ver o corregir la lista' : '📋 Pasar lista';

    // Paso del torneo: nuevo (2 días por defecto) o editar el existente.
    form.elements.torneo.value = torneo ? entrenamiento.nota || '' : '';
    form.elements.dias.value = String(torneo ? Math.min(club.diasDe(entrenamiento), 3) : 2);
    dialogo.showModal();
  };

  form.querySelector('[data-cerrar]').addEventListener('click', () => dialogo.close());

  // Los días extra del torneo no pueden tener otra cosa programada.
  function choquesDelTorneo(fin) {
    const choques = [];
    for (let dia = club.sumarDias(fecha, 1); dia <= fin; dia = club.sumarDias(dia, 1)) {
      const otro = club.eventoEn(admin.datos.entrenamientos, dia);
      if (otro && otro.id !== entrenamiento?.id) choques.push(club.fechaLarga(dia));
    }
    return choques;
  }

  // Cada botón [data-dia] hace una acción y recarga.
  const acciones = {
    // Programar entrenamiento nuevo, o cambiarle la hora a uno ya programado.
    async programar() {
      const hora = form.elements.hora.value;
      if (!hora) { alert('Elige a qué hora empieza.'); return null; }
      return entrenamiento
        ? Portal.nube.from('entrenamientos').update({ hora_inicio: hora }).eq('id', entrenamiento.id)
        : Portal.nube.from('entrenamientos').insert({ fecha, tipo: 'entrenamiento', hora_inicio: hora });
    },
    async torneo() {
      const fin = club.sumarDias(fecha, Number(form.elements.dias.value) - 1);
      const choques = choquesDelTorneo(fin);
      if (choques.length) { alert(`Esos días ya tienen algo programado:\n\n• ${choques.join('\n• ')}\n\nElimínalo primero o elige menos días.`); return null; }
      const datos = { tipo: 'torneo', nota: form.elements.torneo.value.trim() || null, fecha_fin: fin === fecha ? null : fin };
      return entrenamiento
        ? Portal.nube.from('entrenamientos').update(datos).eq('id', entrenamiento.id)   // cambiar nombre o días
        : Portal.nube.from('entrenamientos').insert({ fecha, ...datos });
    },
    async cancelar() {
      // Motivo y detalle son opcionales: "Lluvia — se inundó", "Lluvia", "se inundó" o nada.
      const motivo = [form.elements.motivo.value, form.elements.detalle.value.trim()].filter(Boolean).join(' — ') || null;
      const tieneLista = entrenamiento && admin.datos.asistencias.some(a => a.entrenamiento_id === entrenamiento.id);
      if (tieneLista && !confirm('Ya tiene lista tomada. Al cancelarlo, esa asistencia dejará de contar en las estadísticas. ¿Continuar?')) return null;
      // Si el día no tenía nada, se registra ya cancelado para que todos lo vean.
      return entrenamiento
        ? Portal.nube.from('entrenamientos').update({ cancelado: true, motivo_cancelacion: motivo }).eq('id', entrenamiento.id)
        : Portal.nube.from('entrenamientos').insert({ fecha, cancelado: true, motivo_cancelacion: motivo });
    },
    // Comisionado: alguien de Pits que va en lugar del admin (19-comisionado.sql).
    async comisionado() {
      return Portal.nube.from('entrenamientos').update({ comisionado_id: form.elements.comisionado.value || null }).eq('id', entrenamiento.id);
    },
    async reactivar() {
      return Portal.nube.from('entrenamientos').update({ cancelado: false, motivo_cancelacion: null }).eq('id', entrenamiento.id);
    },
    async eliminar() {
      if (!confirm(`¿Eliminar del calendario: ${club.rangoLargo(entrenamiento)}? También se borra su lista de asistencia.`)) return null;
      return Portal.nube.from('entrenamientos').delete().eq('id', entrenamiento.id);
    }
  };

  form.addEventListener('click', async e => {
    const boton = e.target.closest('[data-dia]');
    if (!boton) return;
    const accion = boton.dataset.dia;
    if (accion === 'lista') { dialogo.close(); admin.abrirLista(entrenamiento.id); return; }
    if (accion === 'mostrar-entreno') { form.elements.hora.value = horaSugerida(); mostrarPaso('entreno'); return; }
    if (accion === 'mostrar-comisionado') { llenarComisionados(); mostrarPaso('comisionado'); return; }
    if (accion === 'mostrar-cancelar') { mostrarPaso('cancelar'); return; }
    if (accion === 'mostrar-torneo') { mostrarPaso('torneo'); return; }
    if (accion === 'volver') { mostrarPaso(null); return; }

    const botones = form.querySelectorAll('button');
    botones.forEach(b => b.disabled = true); error.textContent = 'Guardando…';
    const resultado = await acciones[accion]();
    botones.forEach(b => b.disabled = false);
    if (!resultado) { error.textContent = ''; return; }          // la persona dijo que no
    if (resultado.error) {
      error.textContent = resultado.error.code === '23505' ? 'Ese día ya tiene algo programado.'
        : resultado.error.code === 'PGRST204' ? 'Falta instalar en Supabase el último archivo SQL (18 o 19).'
        : 'No se pudo guardar. Intenta nuevamente.';
      return;
    }
    dialogo.close();
    await admin.recargar();
  });
})();
