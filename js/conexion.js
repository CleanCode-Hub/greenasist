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
