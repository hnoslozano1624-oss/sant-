/**
 * Santé ERP — Worker de Cloudflare
 * Sirve la aplicación (carpeta /public) y expone la API en /api/*.
 * Datos en D1 (binding DB). Autenticación con usuario y contraseña propios.
 */

const COLS = ['productos', 'clientes', 'compras', 'ventas', 'movcaja', 'ajustes', 'activos', 'cotizaciones', 'pedidos'];
// Lo que puede leer y escribir un usuario con rol "vendedor".
const VEND_READ = ['productos', 'clientes', 'compras', 'ventas', 'ajustes', 'cotizaciones', 'pedidos'];
const VEND_WRITE = ['clientes', 'ventas', 'cotizaciones', 'pedidos'];

const COOKIE = 'sante_s';
const SESSION_DAYS = 30;
const MAX_BODY = 1_500_000; // bytes por documento
const PBKDF2_ITER = 100_000;
const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 10;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (col, id))`,
  `CREATE TABLE IF NOT EXISTS meta (col TEXT PRIMARY KEY, ver INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, usuario TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL, rol TEXT NOT NULL, vendedor TEXT NOT NULL DEFAULT '', salt TEXT NOT NULL, hash TEXT NOT NULL, activo INTEGER NOT NULL DEFAULT 1, intentos INTEGER NOT NULL DEFAULT 0, bloqueo INTEGER NOT NULL DEFAULT 0, creado TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expira INTEGER NOT NULL)`,
];

// Productos de referencia del manual de marca; se cargan una sola vez, al crear el administrador.
const SEED_PRODUCTOS = {
  amber: { abv: 5.4, costo: 0, desc: 'Referencia con etiqueta ámbar del manual de marca. Renombre el producto y complete costo y precio.', estilo: 'American Amber Lager', etiqueta: 'ambar', ibu: 18, ingredientes: 'Malta, lúpulo y levadura, sin ninguna adición', ml: 330, nombre: 'Santé Amber Lager · Etiqueta ámbar', precio: 0, stockMin: 0, temp: 15 },
  roja: { abv: 5.4, costo: 0, desc: 'Referencia con etiqueta roja del manual de marca. Renombre el producto y complete costo y precio.', estilo: 'American Amber Lager', etiqueta: 'roja', ibu: 18, ingredientes: 'Malta, lúpulo y levadura, sin ninguna adición', ml: 330, nombre: 'Santé Amber Lager · Etiqueta roja', precio: 0, stockMin: 0, temp: 15 },
};

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
  schemaReady = true;
}

/* ---------- utilidades ---------- */
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const fail = (status, code, error) => json({ code, error }, status);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/.{2}/g).map((h) => parseInt(h, 16)));
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const now = () => Math.floor(Date.now() / 1000);
const validId = (s) => typeof s === 'string' && /^[A-Za-z0-9_\-.~:@+]{1,120}$/.test(s);

async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
async function hashPassword(clave, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: PBKDF2_ITER }, key, 256);
  return hex(bits);
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw Object.assign(new Error('grande'), { status: 413, code: 'muy_grande', msg: 'El registro es demasiado grande.' });
  try {
    const v = JSON.parse(text || '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw 0;
    return v;
  } catch (e) {
    throw Object.assign(new Error('json'), { status: 400, code: 'json_invalido', msg: 'Solicitud inválida.' });
  }
}
const publicUser = (u) => ({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, vendedor: u.vendedor, activo: !!u.activo });
const cleanUsuario = (s) => String(s || '').trim().toLowerCase();
function checkClave(clave) {
  if (typeof clave !== 'string' || clave.length < 8) throw Object.assign(new Error('clave'), { status: 400, code: 'clave_corta', msg: 'La contraseña debe tener al menos 8 caracteres.' });
  if (clave.length > 200) throw Object.assign(new Error('clave'), { status: 400, code: 'clave_larga', msg: 'La contraseña es demasiado larga.' });
}

/* ---------- sesiones ---------- */
function cookieHeader(token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function readCookie(request) {
  const c = request.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-f0-9]{64})'));
  return m ? m[1] : null;
}
async function currentUser(request, env) {
  const token = readCookie(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expira > ? AND u.activo = 1`
  ).bind(await sha256(token), now()).first();
  return row || null;
}
async function openSession(env, userId) {
  const token = randomHex(32);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM sessions WHERE expira <= ?`).bind(now()),
    env.DB.prepare(`INSERT INTO sessions (token, user_id, expira) VALUES (?, ?, ?)`).bind(await sha256(token), userId, now() + SESSION_DAYS * 86400),
  ]);
  return cookieHeader(token, SESSION_DAYS * 86400);
}
async function vendedores(env) {
  const r = await env.DB.prepare(`SELECT vendedor FROM users WHERE activo = 1 AND vendedor != '' ORDER BY creado`).all();
  return [...new Set(r.results.map((x) => x.vendedor))];
}

/* ---------- permisos y filtrado por rol ---------- */
const canRead = (user, col) => user.rol === 'admin' || VEND_READ.includes(col);
const canWrite = (user, col) => user.rol === 'admin' || VEND_WRITE.includes(col);
// Un vendedor no recibe costos ni datos de compra: solo lo necesario para conocer el inventario disponible.
function forRole(user, col, data) {
  if (user.rol === 'admin') return data;
  if (col === 'productos') { const { costo, ...rest } = data; return rest; }
  if (col === 'compras') {
    return { n: data.n, fecha: data.fecha, estado: data.estado, fechaRecibo: data.fechaRecibo, items: (data.items || []).map((i) => ({ pid: i.pid, comp: i.comp, cant: i.cant, val: 0 })) };
  }
  return data;
}

/* ---------- API ---------- */
async function handleApi(request, env, url) {
  await ensureSchema(env);
  const method = request.method;
  const path = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);

  // Protección básica contra peticiones desde otros sitios.
  if (method !== 'GET') {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== url.host) return fail(403, 'origen', 'Origen no permitido.');
  }

  const user = await currentUser(request, env);

  /* --- estado, configuración inicial y sesión --- */
  if (path[0] === 'estado' && method === 'GET') {
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first();
    return json({ setup: n.n === 0, llave: n.n === 0 && !!env.SETUP_KEY, user: user ? publicUser(user) : null, vendedores: user ? await vendedores(env) : [] });
  }

  if (path[0] === 'setup' && method === 'POST') {
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first();
    if (n.n > 0) return fail(409, 'ya_configurado', 'La aplicación ya tiene un administrador.');
    const b = await readJson(request);
    if (env.SETUP_KEY && !safeEqual(String(b.llave || ''), String(env.SETUP_KEY))) return fail(403, 'llave', 'La llave de configuración no es correcta.');
    const usuario = cleanUsuario(b.usuario), nombre = String(b.nombre || '').trim();
    if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) return fail(400, 'usuario', 'El usuario debe tener entre 3 y 40 caracteres (letras, números, punto o guion).');
    if (!nombre) return fail(400, 'nombre', 'Indique el nombre.');
    checkClave(b.clave);
    const id = randomHex(8), salt = randomHex(16);
    const stmts = [env.DB.prepare(`INSERT INTO users (id, usuario, nombre, rol, vendedor, salt, hash, creado) VALUES (?, ?, ?, 'admin', ?, ?, ?, ?)`)
      .bind(id, usuario, nombre, String(b.vendedor || nombre).trim(), salt, await hashPassword(b.clave, salt), new Date().toISOString())];
    const docs = await env.DB.prepare(`SELECT COUNT(*) AS n FROM docs`).first();
    if (docs.n === 0) {
      for (const [pid, data] of Object.entries(SEED_PRODUCTOS)) stmts.push(env.DB.prepare(`INSERT INTO docs (col, id, data, updated) VALUES ('productos', ?, ?, ?)`).bind(pid, JSON.stringify(data), now()));
      stmts.push(env.DB.prepare(`INSERT INTO meta (col, ver) VALUES ('productos', 1) ON CONFLICT(col) DO UPDATE SET ver = ver + 1`));
    }
    await env.DB.batch(stmts);
    const u = await env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first();
    return json({ user: publicUser(u), vendedores: await vendedores(env) }, 200, { 'set-cookie': await openSession(env, id) });
  }

  if (path[0] === 'login' && method === 'POST') {
    const b = await readJson(request);
    const u = await env.DB.prepare(`SELECT * FROM users WHERE usuario = ?`).bind(cleanUsuario(b.usuario)).first();
    const bad = () => fail(401, 'credenciales', 'Usuario o contraseña incorrectos.');
    if (!u || !u.activo) { await hashPassword(String(b.clave || ''), '00'.repeat(16)); return bad(); }
    if (u.bloqueo > now()) return fail(429, 'bloqueado', `Demasiados intentos. Intente de nuevo en ${Math.ceil((u.bloqueo - now()) / 60)} minutos.`);
    const ok = safeEqual(await hashPassword(String(b.clave || ''), u.salt), u.hash);
    if (!ok) {
      const intentos = u.intentos + 1;
      await env.DB.prepare(`UPDATE users SET intentos = ?, bloqueo = ? WHERE id = ?`).bind(intentos >= MAX_INTENTOS ? 0 : intentos, intentos >= MAX_INTENTOS ? now() + BLOQUEO_MIN * 60 : 0, u.id).run();
      return bad();
    }
    await env.DB.prepare(`UPDATE users SET intentos = 0, bloqueo = 0 WHERE id = ?`).bind(u.id).run();
    return json({ user: publicUser(u), vendedores: await vendedores(env) }, 200, { 'set-cookie': await openSession(env, u.id) });
  }

  if (path[0] === 'logout' && method === 'POST') {
    const token = readCookie(request);
    if (token) await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': cookieHeader('x', 0) });
  }

  if (!user) return fail(401, 'sin_sesion', 'Inicie sesión.');

  /* --- cambio de la propia contraseña --- */
  if (path[0] === 'clave' && method === 'POST') {
    const b = await readJson(request);
    if (!safeEqual(await hashPassword(String(b.actual || ''), user.salt), user.hash)) return fail(403, 'clave_actual', 'La contraseña actual no es correcta.');
    checkClave(b.nueva);
    const salt = randomHex(16);
    const token = readCookie(request);
    await env.DB.batch([
      env.DB.prepare(`UPDATE users SET salt = ?, hash = ? WHERE id = ?`).bind(salt, await hashPassword(b.nueva, salt), user.id),
      env.DB.prepare(`DELETE FROM sessions WHERE user_id = ? AND token != ?`).bind(user.id, await sha256(token)),
    ]);
    return json({ ok: true });
  }

  /* --- datos: sincronización --- */
  if (path[0] === 'datos' && method === 'GET') {
    let known = {};
    try { known = JSON.parse(url.searchParams.get('k') || '{}') || {}; } catch (e) { known = {}; }
    const metas = await env.DB.prepare(`SELECT col, ver FROM meta`).all();
    const ver = {}; const data = {};
    const allowed = COLS.filter((c) => canRead(user, c));
    for (const c of allowed) ver[c] = 0;
    for (const m of metas.results) if (m.col in ver) ver[m.col] = m.ver;
    for (const c of allowed) {
      if (known[c] === ver[c]) continue;
      const rows = await env.DB.prepare(`SELECT id, data FROM docs WHERE col = ?`).bind(c).all();
      data[c] = rows.results.map((r) => ({ id: r.id, data: forRole(user, c, JSON.parse(r.data)) }));
    }
    return json({ ver, data, cols: allowed, vendedores: await vendedores(env) });
  }

  /* --- datos: escritura --- */
  if (path[0] === 'docs' && path.length === 3) {
    const [, col, id] = path;
    if (!COLS.includes(col) || !validId(id)) return fail(400, 'ruta', 'Registro inválido.');
    if (!canWrite(user, col)) return fail(403, 'sin_permiso', 'Su usuario no tiene permiso para este cambio.');
    const bump = env.DB.prepare(`INSERT INTO meta (col, ver) VALUES (?, 1) ON CONFLICT(col) DO UPDATE SET ver = ver + 1`).bind(col);
    if (method === 'PUT') {
      const body = await readJson(request);
      await env.DB.batch([env.DB.prepare(`INSERT INTO docs (col, id, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, updated = excluded.updated`).bind(col, id, JSON.stringify(body), now()), bump]);
      return json({ ok: true });
    }
    if (method === 'PATCH') {
      const body = await readJson(request);
      const row = await env.DB.prepare(`SELECT data FROM docs WHERE col = ? AND id = ?`).bind(col, id).first();
      if (!row) return fail(404, 'no_existe', 'El registro ya no existe.');
      await env.DB.batch([env.DB.prepare(`UPDATE docs SET data = ?, updated = ? WHERE col = ? AND id = ?`).bind(JSON.stringify({ ...JSON.parse(row.data), ...body }), now(), col, id), bump]);
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await env.DB.batch([env.DB.prepare(`DELETE FROM docs WHERE col = ? AND id = ?`).bind(col, id), bump]);
      return json({ ok: true });
    }
  }

  /* --- usuarios (solo administrador) --- */
  if (path[0] === 'usuarios') {
    if (user.rol !== 'admin') return fail(403, 'sin_permiso', 'Solo el administrador gestiona usuarios.');
    const admins = async (exceptId) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE rol = 'admin' AND activo = 1 AND id != ?`).bind(exceptId || '').first()).n;
    if (method === 'GET' && path.length === 1) {
      const r = await env.DB.prepare(`SELECT * FROM users ORDER BY creado`).all();
      return json({ usuarios: r.results.map(publicUser) });
    }
    if (method === 'POST' && path.length === 1) {
      const b = await readJson(request);
      const usuario = cleanUsuario(b.usuario), nombre = String(b.nombre || '').trim(), rol = b.rol === 'admin' ? 'admin' : 'vendedor';
      if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) return fail(400, 'usuario', 'El usuario debe tener entre 3 y 40 caracteres (letras, números, punto o guion).');
      if (!nombre) return fail(400, 'nombre', 'Indique el nombre.');
      checkClave(b.clave);
      if (await env.DB.prepare(`SELECT 1 FROM users WHERE usuario = ?`).bind(usuario).first()) return fail(409, 'existe', 'Ya existe un usuario con ese nombre de usuario.');
      const id = randomHex(8), salt = randomHex(16);
      await env.DB.prepare(`INSERT INTO users (id, usuario, nombre, rol, vendedor, salt, hash, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, usuario, nombre, rol, String(b.vendedor || '').trim(), salt, await hashPassword(b.clave, salt), new Date().toISOString()).run();
      return json({ ok: true, id });
    }
    if (method === 'PUT' && path.length === 2) {
      const target = await env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(path[1]).first();
      if (!target) return fail(404, 'no_existe', 'El usuario no existe.');
      const b = await readJson(request);
      const nombre = String(b.nombre || '').trim() || target.nombre, rol = b.rol === 'admin' ? 'admin' : 'vendedor', activo = b.activo === false ? 0 : 1;
      if (target.rol === 'admin' && target.activo && (rol !== 'admin' || !activo) && (await admins(target.id)) === 0) return fail(409, 'ultimo_admin', 'Debe quedar al menos un administrador activo.');
      const stmts = [env.DB.prepare(`UPDATE users SET nombre = ?, rol = ?, vendedor = ?, activo = ?, intentos = 0, bloqueo = 0 WHERE id = ?`).bind(nombre, rol, String(b.vendedor || '').trim(), activo, target.id)];
      if (b.clave) {
        checkClave(b.clave);
        const salt = randomHex(16);
        stmts.push(env.DB.prepare(`UPDATE users SET salt = ?, hash = ? WHERE id = ?`).bind(salt, await hashPassword(b.clave, salt), target.id));
        if (target.id !== user.id) stmts.push(env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(target.id));
      }
      if (!activo) stmts.push(env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(target.id));
      await env.DB.batch(stmts);
      return json({ ok: true });
    }
  }

  return fail(404, 'no_encontrado', 'Ruta no encontrada.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (e) {
        if (e && e.status) return fail(e.status, e.code || 'error', e.msg || 'Error.');
        console.error('api_error', e && e.stack ? e.stack : String(e));
        return fail(500, 'error_servidor', 'Error interno del servidor.');
      }
    }
    return env.ASSETS.fetch(request);
  },
};
