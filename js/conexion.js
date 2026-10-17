// =====================================================================
// Conexión a Supabase y utilidades que usan todos los demás archivos.
// =====================================================================
const Portal = window.Portal = {
  nube: window.supabase.createClient(window.PORTAL_CONFIG.supabaseUrl, window.PORTAL_CONFIG.supabaseClave),
  perfil: null   // Perfil de quien inició sesión (se llena en sesion.js)
};

// --- Usuarios (sin correo) -------------------------------------------
// El usuario puede ser cualquier texto (espacios, acentos, símbolos).
// Supabase necesita un correo por dentro, así que se arma así:
//   usuario sencillo ("chima", "juan.perez")  -> chima@jugadores.local
//   cualquier otro ("El Chino", "Toño #7")    -> u.<código>@jugadores.local
// La misma regla está en la función gestionar-cuenta: si cambias una, cambia la otra.
Portal.USUARIO_MAX = 100;

Portal.normalizarUsuario = function (usuario) {
  return String(usuario || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
};

// Buscadores: ¿la persona coincide con lo escrito? Busca en el nombre y en el usuario,
// sin importar mayúsculas ni espacios de más (y "jose" encuentra "José").
Portal.normalizarBusqueda = texto => Portal.normalizarUsuario(texto).normalize('NFD').replace(/[̀-ͯ]/g, '');
Portal.textoBusqueda = persona =>
  `${Portal.normalizarBusqueda(persona.nombre_completo)} ${Portal.normalizarBusqueda(persona.usuario)}`;
Portal.coincideBusqueda = (persona, texto) => {
  const buscado = Portal.normalizarBusqueda(texto);
  return !buscado || Portal.textoBusqueda(persona).includes(buscado);
};

Portal.correoDeUsuario = async function (usuario) {
  const limpio = Portal.normalizarUsuario(usuario);
  if (!limpio) return '';
  const dominio = window.PORTAL_CONFIG.dominioUsuarios;
  if (limpio.length <= 64 && /^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/.test(limpio)) return `${limpio}@${dominio}`;
  const huella = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(limpio));
  const codigo = Array.from(new Uint8Array(huella), b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
  return `u.${codigo}@${dominio}`;
};

// Cierra la sesión aunque la red falle: también borra la copia local del navegador.
Portal.cerrarSesion = async function (alcance = 'global') {
  try { await Promise.race([Portal.nube.auth.signOut({ scope: alcance }), new Promise(r => setTimeout(r, 4000))]); } catch (_) {}
  try { for (const k of Object.keys(localStorage)) if (/^sb-.+-auth-token/.test(k)) localStorage.removeItem(k); } catch (_) {}
};

// Llama a la función "gestionar-cuenta" y devuelve su respuesta o lanza el error en español.
Portal.gestionarCuenta = async function (datos) {
  const { data, error } = await Portal.nube.functions.invoke('gestionar-cuenta', { body: datos });
  if (error) {
    let mensaje = 'No se pudo completar la operación.';
    try { mensaje = (await error.context?.json())?.error || mensaje; } catch (_) {}
    throw new Error(mensaje);
  }
  if (data?.error) throw new Error(data.error);
  return data;
};

// --- Contraseñas -----------------------------------------------------
Portal.CONTRASENA_MIN = 8;
Portal.CONTRASENA_MAX = 72;   // límite de Supabase Auth

// Contraseña temporal fácil de dictar (9 caracteres, ej. "Kp7m-Xq4r"):
// sin letras/números que se confunden (0/O, 1/l/I).
Portal.generarTemporal = function () {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const azar = crypto.getRandomValues(new Uint32Array(8));
  const texto = Array.from(azar, n => letras[n % letras.length]).join('');
  return `${texto.slice(0, 4)}-${texto.slice(4)}`;
};

// Ver u ocultar lo escrito en un campo de contraseña.
// Íconos de línea: ojo (mostrar) y ojo tachado (ocultar).
const ICONO_OJO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICONO_OJO_TACHADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.4 3.3M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/></svg>';
Portal.verContrasena = function (input, visible) {
  input.type = visible ? 'text' : 'password';
  const boton = input.parentElement.querySelector('.ver-contrasena');
  if (!boton) return;
  boton.innerHTML = visible ? ICONO_OJO_TACHADO : ICONO_OJO;
  boton.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
  boton.setAttribute('aria-pressed', String(visible));
};
// Cada campo de contraseña de la página recibe su botón de ojo a la derecha.
// Al limpiar el formulario se vuelve a ocultar.
document.querySelectorAll('input[type="password"]').forEach(input => {
  const caja = document.createElement('span');
  caja.className = 'campo-contrasena';
  input.replaceWith(caja);
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'ver-contrasena';
  caja.append(input, boton);
  Portal.verContrasena(input, false);
  boton.addEventListener('click', () => Portal.verContrasena(input, input.type === 'password'));
  input.form?.addEventListener('reset', () => Portal.verContrasena(input, false));
});

// Botón ✕ (data-cerrar-x) de cualquier ventana: la cierra.
document.addEventListener('click', e => {
  if (e.target.closest('[data-cerrar-x]')) e.target.closest('dialog')?.close();
});

// Escapa texto antes de meterlo en HTML.
Portal.esc = function (valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
};

Portal.fecha = function (valor) {
  return valor ? new Date(valor).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
};
