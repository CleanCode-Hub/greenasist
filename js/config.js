// =====================================================================
// Configuración del proyecto de Supabase (Project Settings > API).
// La clave publicable puede estar en la página: la seguridad real está en
// los permisos (RLS) y en la función gestionar-cuenta.
// NUNCA pongas aquí la clave secreta (service_role).
// =====================================================================
window.PORTAL_CONFIG = {
  supabaseUrl: 'https://jskatelskjpvphhrdytb.supabase.co',
  supabaseClave: 'sb_publishable_kcP-j7S7L5QTqTFOkY02GA_QdeEtJyA',
  // Los usuarios inician sesión con "usuario"; internamente es usuario@dominio.
  // Debe coincidir con DOMINIO_USUARIOS de la función (por defecto jugadores.local).
  dominioUsuarios: 'jugadores.local',

  // Link público del portal (cuando se publique, ej. GitHub Pages).
  // El QR de llegada abre este link en el celular del jugador.
  // Si se deja vacío, se usa la dirección desde donde se abrió la página.
  urlPublica: 'https://cleancode-hub.github.io/greenasist/',

  // Contraseña temporal que se pone por defecto al crear una cuenta o al
  // restablecerla. Al entrar por primera vez, el portal obliga a cambiarla.
  contrasenaTemporal: 'GreenDevils',

  // Membresía mensual. Si cambia el precio, cámbialo aquí: los pagos ya
  // registrados conservan el monto con el que se cobraron.
  greenCard: { nombre: 'Green Card', monto: 700 }
};
