# Santé ERP — Cervecería Artesanal

Aplicación de gestión comercial y administrativa para **Santé Cervecería Artesanal**: ventas, inventario, CRM, productos, órdenes de compra, cartera, cotizaciones, flujo de caja, inversión inicial, activos y solicitud de pedidos para el equipo de ventas. Funciona en computador y celular (PWA instalable).

Corre 100 % en Cloudflare: **Worker + Static Assets + D1 (SQLite)**. Sin servidores propios ni dependencias de ejecución.

## Estructura

```
sante-app/
├── src/worker.js            API, autenticación, roles y acceso a D1
├── public/                  Frontend estático
│   ├── index.html
│   ├── css/app.css
│   ├── js/app.js
│   ├── assets/              Logo, etiquetas, iconos
│   ├── manifest.webmanifest PWA (instalable en celular)
│   └── _headers             Cabeceras de seguridad y caché
├── schema.sql               Referencia del esquema (el Worker lo crea solo)
├── wrangler.jsonc           Configuración de Cloudflare
├── package.json
└── .github/workflows/deploy.yml   Despliegue automático (opcional)
```

## Roles

| Rol | Acceso |
|---|---|
| **Administrador** | Todo: Dashboard, Comercial, Administrativo, Usuarios y Copia de seguridad. |
| **Vendedor** | Ventas, CRM, Productos, Cotizaciones y Solicitud de pedidos. **No** ve costos, compras, caja, cartera ni activos (se filtra en el servidor, no solo en pantalla). |

## Reglas de negocio implementadas

- Los pedidos **no tienen estados**: al registrarlos se crea la venta automáticamente.
- Pedido de **contado**: queda pagado y entra al Flujo de caja como Efectivo.
- Pedido a **crédito**: pasa a Cartera con su plazo; allí se registran abonos y saldo.
- Solo se vende lo que hay en inventario (órdenes de compra recibidas); el sistema bloquea el exceso.
- El historial de compras de cada cliente se ve en el CRM.

## Despliegue en Cloudflare (paso a paso)

Requisitos: cuenta de Cloudflare y Node.js 20+.

1. **Instalar dependencias**
   ```bash
   npm install
   npx wrangler login
   ```
2. **Crear la base de datos D1**
   ```bash
   npx wrangler d1 create sante-erp-db
   ```
   Copie el `database_id` que muestra el comando y péguelo en `wrangler.jsonc`, reemplazando el valor actual.
3. **(Recomendado) Clave de instalación** para que nadie más pueda crear el primer administrador:
   ```bash
   npx wrangler secret put SETUP_KEY
   ```
   Si se define, la pantalla de primer ingreso pedirá esa clave.
4. **Desplegar**
   ```bash
   npx wrangler deploy
   ```
   Cloudflare entrega una URL `https://sante-erp.<su-subdominio>.workers.dev`.
5. **Primer ingreso:** abra la URL; la app pedirá crear el **administrador** (usuario y contraseña de mínimo 8 caracteres). Luego, en *Usuarios*, cree a Santiago y a los demás vendedores.
6. **Instalar en el celular:** abrir la URL en Chrome (Android) o Safari (iPhone) → *Agregar a pantalla de inicio*.

Las tablas se crean automáticamente la primera vez que se usa la app; no hay que ejecutar migraciones.

### Alternativa: despliegue desde GitHub (sin terminal)

En Cloudflare: *Workers & Pages → Create → Import a repository* → seleccionar este repositorio. Comando de build: vacío. Comando de despliegue: `npx wrangler deploy`. Cada `push` a `main` redespliega.
(Antes debe estar el `database_id` real en `wrangler.jsonc`.)

### Alternativa: GitHub Actions

El archivo `.github/workflows/deploy.yml` despliega en cada push a `main`. Requiere dos *secrets* en el repositorio (*Settings → Secrets and variables → Actions*):
- `CLOUDFLARE_API_TOKEN` (plantilla «Edit Cloudflare Workers» con permiso D1 Edit)
- `CLOUDFLARE_ACCOUNT_ID`

Use **solo uno** de los dos métodos automáticos para evitar despliegues dobles.

## Migrar los datos del prototipo (Artifact de Claude)

En el prototipo: *Copia de seguridad → Descargar*. En esta app (como administrador): *Copia de seguridad → Restaurar* y seleccionar ese archivo `.json`. El formato es compatible.

## Desarrollo local

```bash
npm install
npx wrangler dev        # http://127.0.0.1:8787 con D1 local
```

## Seguridad

- Contraseñas con PBKDF2-SHA256 (100 000 iteraciones) y sal por usuario; nunca se guardan en claro.
- Sesiones con token aleatorio guardado como hash; cookie `HttpOnly`, `Secure`, `SameSite=Lax`, 30 días.
- Bloqueo de 10 minutos tras 5 intentos fallidos.
- Verificación de origen en toda petición que modifica datos.
- Cabeceras `X-Frame-Options: DENY`, `nosniff` y política de referrer (ver `public/_headers`).
- El primer administrador solo se puede crear una vez (`/api/setup` responde 409 después).

## Limitaciones conocidas

- La sincronización entre dispositivos es por consulta cada 5 segundos (no en tiempo real instantáneo).
- Inventario, caja y cartera se calculan en el navegador a partir de los registros; con volúmenes muy grandes (decenas de miles de movimientos) convendría moverlos al servidor.
- Se recomienda descargar una **copia de seguridad semanal** desde el módulo correspondiente.
- No hay recuperación automática de contraseña: el administrador restablece la clave de un usuario desde *Usuarios → Editar*.

## Archivos binarios (imágenes)

La carpeta `public/assets/` debe contener: `logo.png`, `botella-ambar.jpg`, `etiqueta-ambar.jpg`, `etiqueta-roja.jpg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` y `apple-touch-icon.png`. Si no aparecen en el repositorio, súbalos desde GitHub (*Add file → Upload files*) antes de desplegar.

## Despliegue en Cloudflare Pages (alternativa)

El repositorio también funciona con **Pages** (URL `*.pages.dev`) gracias a `public/_worker.js`, copia de `src/worker.js` (si modifica el servidor, ejecute `npm run sync-pages`).
- Build command: *(vacío)* · Build output directory: `public`
- En *Settings → Bindings → D1 database*: variable `DB` → `sante-erp-db` (para Production y Preview).
- Opcional: *Settings → Variables and Secrets* → `SETUP_KEY`.
