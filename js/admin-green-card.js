// =====================================================================
// Pestaña "Green Card": quién pagó cada mes, adeudos y registro de pagos.
// Dos vistas:
//   "Por mes"      lista de jugadores con botón grande (cómoda en el celular).
//   "Todo el año"  tabla jugador × 12 meses (cómoda en la computadora).
// =====================================================================
(() => {
  const { club, admin } = Portal;
  const tarjeta = document.getElementById('gc-tarjeta');
  const metricas = document.getElementById('gc-metricas');
  const cabecera = document.getElementById('gc-cabecera');
  const cuerpo = document.getElementById('gc-cuerpo');
  const listaMes = document.getElementById('gc-lista-mes');
  const resumenMes = document.getElementById('gc-resumen-mes');
  const botonesVista = tarjeta.querySelectorAll('[data-gc-vista]');
  const ETIQUETA = { pagado: '✓', debe: 'Debe', proximo: '·' };
  const METODO = { efectivo: 'Efectivo', transferencia: 'Transferencia', otro: 'Otro' };

  document.getElementById('gc-monto').textContent = club.dinero(club.monto);

  // En el celular se abre "Por mes"; en la computadora, "Todo el año".
  let vista = window.matchMedia('(max-width: 700px)').matches ? 'mes' : 'anio';
  function mostrarVista() {
    botonesVista.forEach(b => { const activa = b.dataset.gcVista === vista; b.classList.toggle('activa', activa); b.setAttribute('aria-pressed', String(activa)); });
    document.getElementById('gc-vista-mes').hidden = vista !== 'mes';
    document.getElementById('gc-vista-anio').hidden = vista !== 'anio';
  }
  botonesVista.forEach(b => b.addEventListener('click', () => { vista = b.dataset.gcVista; mostrarVista(); }));
  mostrarVista();

  const filasJugadores = () => admin.pagan().map(j => ({ j, meses: club.estadoMeses(admin.datos, j) }));

  // "Pagaron octubre: 1 de 40" (año actual: el mes en curso, que es el que pide la
  // asistencia). Otros años: cuántos quedaron al corriente.
  function metricaPagaron(filas, conAdeudo) {
    if (admin.datos.anio !== club.anioActual()) {
      const alCorriente = filas.length - conAdeudo.length;
      return club.metrica('Al corriente', `${alCorriente} de ${filas.length}`, '', conAdeudo.length ? 'alerta' : 'bien');
    }
    const mes = club.mesActual();
    const cuentan = filas.filter(f => f.meses[mes - 1].estado !== 'no-aplica');
    const pagaron = cuentan.filter(f => f.meses[mes - 1].estado === 'pagado').length;
    const faltan = cuentan.length - pagaron;
    return club.metrica(`Pagaron ${club.MESES[mes - 1].toLowerCase()}`, `${pagaron} de ${cuentan.length}`, '', faltan ? 'alerta' : 'bien');
  }

  // --- Todo se repinta al cargar datos -------------------------------
  admin.vistas.greenCard = function () {
    const datos = admin.datos;
    const filas = filasJugadores();
    const conAdeudo = filas.filter(f => club.mesesQueDebe(f.meses) > 0);
    const adeudoTotal = conAdeudo.reduce((suma, f) => suma + club.adeudo(f.meses), 0);
    const cobrado = datos.pagos.reduce((suma, p) => suma + Number(p.monto), 0);

    metricas.innerHTML = [
      club.metrica(`Cobrado en ${datos.anio}`, club.dinero(cobrado)),
      metricaPagaron(filas, conAdeudo),
      club.metrica('Adeudo total', club.dinero(adeudoTotal))
    ].join('');

    pintarAnio(filas);
    irAnio(datos.anio);   // repinta la vista por mes
  };

  // --- Vista "Todo el año" ------------------------------------------
  function pintarAnio(filas) {
    cabecera.innerHTML = `<tr><th>Jugador</th>${club.MESES_CORTOS.map(m => `<th>${m}</th>`).join('')}<th>Debe</th></tr>`;
    cuerpo.innerHTML = filas.length
      ? filas.map(({ j, meses }) => {
          const debe = club.adeudo(meses);
          return `<tr>
            <th scope="row">${Portal.esc(j.nombre_completo)}</th>
            ${meses.map(m => `<td>${celda(j, m)}</td>`).join('')}
            <td class="${debe ? 'texto-rojo' : ''}"><strong>${debe ? club.dinero(debe) : '—'}</strong></td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="14" class="vacio">No hay jugadores activos.</td></tr>';
  }

  // "Abonó $300 · faltan $400"
  const textoAbono = m => `Abonó ${club.dinero(m.abono)} · faltan ${club.dinero(m.falta)}`;

  function titulo(m) {
    if (m.abono) return textoAbono(m);
    return {
      pagado: () => `Pagado ${club.dinero(m.pago.monto)} el ${club.fechaCorta(m.pago.fecha_pago)}`,
      debe: () => 'Pendiente de pago',
      proximo: () => 'Mes futuro: se puede pagar por adelantado',
      'no-aplica': () => 'Antes de su alta'
    }[m.estado]();
  }

  function celda(jugador, m) {
    if (m.estado === 'no-aplica') return '<span class="celda no-aplica" title="Antes de su alta">—</span>';
    const t = titulo(m);
    return `<button type="button" class="celda ${m.estado} ${m.abono ? 'abono' : ''}" data-jugador="${jugador.id}" data-mes="${m.mes}"
      title="${t}" aria-label="${club.MESES[m.mes - 1]}: ${t}">${m.abono ? club.dinero(m.abono) : ETIQUETA[m.estado]}</button>`;
  }

  // --- Vista "Por mes" ----------------------------------------------
  const irAnio = club.navegadorMes(document.getElementById('gc-vista-mes'), (anio, mes) => {
    if (!admin.datos || admin.datos.anio !== anio) return;
    const filas = filasJugadores().map(f => ({ j: f.j, m: f.meses[mes - 1] })).filter(f => f.m.estado !== 'no-aplica');
    const pagaron = filas.filter(f => f.m.estado === 'pagado');
    const faltan = filas.filter(f => f.m.estado !== 'pagado');
    const porCobrar = faltan.reduce((suma, f) => suma + f.m.falta, 0);
    resumenMes.textContent = filas.length
      ? `Pagaron ${pagaron.length} de ${filas.length}${faltan.length ? ` · faltan ${club.dinero(porCobrar)}` : ' · ¡todos al corriente!'}`
      : '';

    // Primero quienes deben, luego quienes ya pagaron.
    listaMes.innerHTML = filas.length
      ? [...faltan, ...pagaron].map(({ j, m }) => `<li>
          <div>
            <span class="nombre">${Portal.esc(j.nombre_completo)}</span>
            ${m.estado === 'pagado'
              ? `<span class="chip activo">✓ Pagado · ${club.fechaCorta(m.pago.fecha_pago)}</span>`
              : m.abono ? `<span class="chip abono">${textoAbono(m)}</span>`
              : m.estado === 'debe' ? '<span class="chip inactivo">Pendiente</span>' : '<span class="chip">Mes futuro</span>'}
          </div>
          ${m.estado === 'pagado'
            ? `<button type="button" class="secundario" data-jugador="${j.id}" data-mes="${m.mes}">Ver pago</button>`
            : `<button type="button" class="primario" data-jugador="${j.id}" data-mes="${m.mes}">💵 ${m.abono ? 'Completar pago' : 'Registrar pago'}</button>`}
        </li>`).join('')
      : '<li class="vacio">No hay jugadores activos este mes.</li>';
  });

  // --- Ventana de pago (la abren ambas vistas) ----------------------
  const dialogo = document.getElementById('dialogo-pago');
  const form = document.getElementById('form-pago');
  const error = form.querySelector('.error');
  const campos = document.getElementById('pago-campos');
  const detalle = document.getElementById('pago-detalle');
  const botonGuardar = document.getElementById('pago-guardar');
  const botonEliminar = document.getElementById('pago-eliminar');
  let seleccion = null;   // { jugador, mes, pago }
  let alGuardar = null;   // qué hacer después de registrar el pago (lo usa Pasar lista)

  // Abrir "Registrar pago" desde otra pantalla (p. ej. Pasar lista).
  admin.abrirPago = (jugador, mes, despues) => {
    const pago = admin.datos.pagos.find(p => p.jugador_id === jugador.id && p.mes === club.mesISO(admin.datos.anio, mes));
    seleccion = { jugador, mes, pago };
    alGuardar = despues;
    abrirPago();
  };

  tarjeta.addEventListener('click', e => {
    const boton = e.target.closest('[data-jugador]');
    if (!boton) return;
    const jugador = admin.cuentas.find(c => c.id === boton.dataset.jugador);
    const mes = Number(boton.dataset.mes);
    const pago = admin.datos.pagos.find(p => p.jugador_id === jugador.id && p.mes === club.mesISO(admin.datos.anio, mes));
    seleccion = { jugador, mes, pago };
    alGuardar = null;
    abrirPago();
  });

  // Tres casos: sin pago (formulario), con abono (detalle + formulario para
  // completar) y completo (solo detalle).
  function abrirPago() {
    const { jugador, mes, pago } = seleccion;
    const completo = pago && club.mesCompleto(pago);
    const falta = pago ? Number(pago.cuota ?? pago.monto) - Number(pago.monto) : club.monto;
    form.reset(); error.textContent = '';
    document.getElementById('pago-titulo').textContent = completo ? 'Pago registrado' : pago ? 'Completar pago' : 'Registrar pago';
    document.getElementById('pago-texto').innerHTML =
      `${club.nombreMembresia} de <strong>${Portal.esc(jugador.nombre_completo)}</strong><br>
       <span class="pago-mes">📅 ${club.MESES[mes - 1]} ${admin.datos.anio}</span>`;

    campos.hidden = campos.disabled = !!completo;
    detalle.hidden = !pago;
    botonGuardar.hidden = !!completo;
    botonEliminar.hidden = !pago;
    if (pago) {
      detalle.innerHTML = `
        <dt>${completo ? 'Monto' : 'Abonado'}</dt><dd>${club.dinero(pago.monto)}${completo ? '' : ` de ${club.dinero(pago.cuota)} · <strong class="texto-rojo">faltan ${club.dinero(falta)}</strong>`}</dd>
        <dt>Fecha de pago</dt><dd>${club.fechaLarga(pago.fecha_pago)}</dd>
        <dt>Método</dt><dd>${METODO[pago.metodo] || pago.metodo}</dd>
        <dt>Nota</dt><dd>${Portal.esc(pago.nota || '—')}</dd>`;
    }
    if (!completo) {
      form.elements.monto.value = falta;
      form.elements.fecha_pago.value = club.hoy();
    }
    pintarReparto();
    dialogo.showModal();
  }

  // "Se aplica: octubre $700 ✓ · noviembre $300 (abono, faltan $400)"
  const reparto = document.getElementById('pago-reparto');
  function pintarReparto() {
    const monto = Number(form.elements.monto.value);
    const partes = monto > 0 && !campos.hidden
      ? club.repartirPago(admin.datos.pagos, seleccion.jugador.id, admin.datos.anio, seleccion.mes, monto) : [];
    reparto.hidden = partes.length < 2 && (!partes[0] || partes[0].completo);
    reparto.innerHTML = `<strong>Se aplica:</strong> ` + partes.map(p =>
      `${club.MESES[p.mes - 1].toLowerCase()}${p.anio !== admin.datos.anio ? ` ${p.anio}` : ''} ${club.dinero(p.monto)} ${p.completo ? '✓' : `(abono, faltan ${club.dinero(p.falta)})`}`
    ).join(' · ');
  }
  form.elements.monto.addEventListener('input', pintarReparto);

  form.querySelector('[data-cerrar]').addEventListener('click', () => dialogo.close());

  // El pago se guarda con registrar_pago (17-abonos.sql): completa el mes y
  // lo que sobra pasa a los siguientes.
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const { jugador, mes } = seleccion;
    botonGuardar.disabled = true; error.textContent = 'Guardando…';
    const { error: errorBD } = await Portal.nube.rpc('registrar_pago', {
      p_jugador: jugador.id,
      p_desde: club.mesISO(admin.datos.anio, mes),
      p_monto: Number(form.elements.monto.value),
      p_cuota: club.monto,
      p_fecha: form.elements.fecha_pago.value,
      p_metodo: form.elements.metodo.value,
      p_nota: form.elements.nota.value.trim()
    });
    botonGuardar.disabled = false;
    if (errorBD) {
      error.textContent = errorBD.code === 'PGRST202' ? 'Falta instalar 17-abonos.sql en Supabase.' : 'No se pudo registrar el pago.';
      return;
    }
    dialogo.close();
    await admin.recargar();
    const despues = alGuardar; alGuardar = null;
    despues?.();
  });

  botonEliminar.addEventListener('click', async () => {
    const { jugador, mes, pago } = seleccion;
    if (!confirm(`¿Eliminar el pago de ${club.MESES[mes - 1]} de ${jugador.nombre_completo}? El mes volverá a quedar pendiente.`)) return;
    const { error: errorBD } = await Portal.nube.from('pagos').delete().eq('id', pago.id);
    if (errorBD) { error.textContent = 'No se pudo eliminar el pago.'; return; }
    dialogo.close();
    await admin.recargar();
  });
})();
