-- Santé ERP — estructura de la base D1.
-- No hace falta ejecutarla a mano: el Worker crea estas tablas en el primer uso.
-- Se deja como referencia y para recrear la base si alguna vez se necesita.

-- Todos los registros del negocio, por colección (productos, clientes, compras,
-- ventas, movcaja, ajustes, activos, cotizaciones, pedidos). "data" es JSON.
CREATE TABLE IF NOT EXISTS docs (
  col     TEXT NOT NULL,
  id      TEXT NOT NULL,
  data    TEXT NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (col, id)
);

-- Versión de cada colección: la aplicación solo descarga lo que cambió.
CREATE TABLE IF NOT EXISTS meta (
  col TEXT PRIMARY KEY,
  ver INTEGER NOT NULL DEFAULT 0
);

-- Usuarios. La contraseña nunca se guarda: solo su hash PBKDF2-SHA256 con sal.
CREATE TABLE IF NOT EXISTS users (
  id       TEXT PRIMARY KEY,
  usuario  TEXT NOT NULL UNIQUE,
  nombre   TEXT NOT NULL,
  rol      TEXT NOT NULL,              -- 'admin' | 'vendedor'
  vendedor TEXT NOT NULL DEFAULT '',   -- nombre que aparece en pedidos y ventas
  salt     TEXT NOT NULL,
  hash     TEXT NOT NULL,
  activo   INTEGER NOT NULL DEFAULT 1,
  intentos INTEGER NOT NULL DEFAULT 0,
  bloqueo  INTEGER NOT NULL DEFAULT 0,
  creado   TEXT NOT NULL
);

-- Sesiones abiertas (se guarda el hash del token, no el token).
CREATE TABLE IF NOT EXISTS sessions (
  token   TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expira  INTEGER NOT NULL
);
