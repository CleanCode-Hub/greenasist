// =====================================================================
// 🔔 Avisos (para jugadores, coaches, pits y reclutas).
//   - ❌ Se canceló un entrenamiento o torneo (próximos 30 días).
//   - ✅ Siempre sí: un día cancelado se reactivó.
//   - 🏆 Torneo nuevo (próximos 60 días).
// La campana muestra cuántos avisos no ha visto. Lo "ya visto" se guarda
// en ese celular (no necesita base de datos). En 🏠 Inicio, además, sale un
// aviso grande si algo de los próximos 7 días está cancelado.
// =====================================================================
(() => {
  const { club } = Portal;
  const boton = document.getElementById('btn-avisos');
  const globo = boton.querySelector('.globo');
  const dialogo = document.getElementById('dialogo-avisos');
  const lista = document.getElementById('lista-avisos');
  const avisoInicio = document.getElementById('aviso-proximos');
  let avisos = [];

  // --- Lo ya visto, guardado en este celular -------------------------
  const clave = () => `green-devils-avisos-${Portal.perfil.id}`;
  const leerVistos = () => { try { return new Set(JSON.parse(localStorage.getItem(clave()) || '[]')); } catch (_) { return new Set(); } };
  const guardarVistos = vistos => { try { localStorage.setItem(clave(), JSON.stringify([...vistos].slice(-300))); } catch (_) {} };

  // --- Armar los avisos a partir del calendario ----------------------
  // Cada aviso tiene una "llave" que cambia si cambia el estado del día
  // (ej. 15:cancelado → 15:activo), así un cambio nuevo vuelve a avisar.
  function armarAvisos(entrenamientos) {
    const hoy = club.hoy(), vistos = leerVistos();
    const en30 = club.sumarDias(hoy, 30), en60 = club.sumarDias(hoy, 60);
    const lista = [];
    for (const e of entrenamientos) {
      if (club.fechaFin(e) < hoy) continue;                 // ya pasó
      const cuando = club.esTorneo(e) ? `${Portal.esc(e.nota || '')} · ${club.rangoCorto(e)}`.replace(/^ · /, '') : club.fechaLarga(e.fecha);
      if (e.cancelado && e.fecha <= en30) {
        lista.push({
          llave: `${e.id}:cancelado`, fecha: e.fecha, tipo: 'cancelado',
          texto: `❌ Se canceló ${club.esTorneo(e) ? 'el torneo' : 'el entrenamiento del'} ${cuando}${club.motivo(e) ? ` · <strong>${Portal.esc(club.motivo(e))}</strong>` : ''}`
        });
      } else if (!e.cancelado && vistos.has(`${e.id}:cancelado`) && e.fecha <= en30) {
        // Lo vio cancelado y ahora ya no: el admin lo reactivó.
        lista.push({ llave: `${e.id}:reactivado`, fecha: e.fecha, tipo: 'reactivado', texto: `✅ Siempre sí hay ${club.esTorneo(e) ? 'torneo' : 'entrenamiento'}: ${cuando}` });
      } else if (!e.cancelado && club.esTorneo(e) && e.fecha <= en60) {
        lista.push({ llave: `${e.id}:torneo`, fecha: e.fecha, tipo: 'torneo', texto: `🏆 Torneo: ${cuando}` });
      }
    }
    return lista.sort((a, b) => a.fecha.localeCompare(b.fecha)).map(a => ({ ...a, nuevo: !vistos.has(a.llave) }));
  }

  // --- Pintar campana y aviso de Inicio (lo llama jugador.js) --------
  Portal.actualizarAvisos = function (entrenamientos) {
    if (Portal.perfil.rol === 'admin') return;
    avisos = armarAvisos(entrenamientos);
    const nuevos = avisos.filter(a => a.nuevo).length;
    boton.hidden = false;
    globo.hidden = !nuevos;
    globo.textContent = nuevos > 9 ? '9+' : nuevos;
    boton.setAttribute('aria-label', nuevos ? `Avisos: ${nuevos} nuevos` : 'Avisos');

    // Aviso grande en Inicio: cancelaciones de los próximos 7 días.
    const pronto = avisos.filter(a => a.tipo === 'cancelado' && a.fecha <= club.sumarDias(club.hoy(), 7));
    avisoInicio.hidden = !pronto.length;
    avisoInicio.innerHTML = pronto.map(a => `<p>${a.texto}</p>`).join('');
  };

  // --- Ventana de avisos ---------------------------------------------
  boton.addEventListener('click', () => {
    lista.innerHTML = avisos.length
      ? avisos.map(a => `<li class="aviso-item ${a.tipo} ${a.nuevo ? 'nuevo' : ''}">${a.nuevo ? '<span class="chip inactivo">Nuevo</span> ' : ''}${a.texto}</li>`).join('')
      : '<li class="vacio">No hay avisos por ahora. 👍</li>';
    dialogo.showModal();
    // Al abrirla, todo queda como visto (se conservan las llaves de "cancelado" para detectar reactivaciones).
    const vistos = leerVistos();
    avisos.forEach(a => vistos.add(a.llave));
    guardarVistos(vistos);
    avisos = avisos.map(a => ({ ...a, nuevo: false }));
    globo.hidden = true;
  });
  dialogo.querySelector('[data-cerrar]').addEventListener('click', () => dialogo.close());
})();
