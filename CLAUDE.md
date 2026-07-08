# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Web app for planning monthly work shifts ("turnos") for casino HR. FastAPI + SQLite backend, no-build vanilla-JS frontend served by the same app. UI and comments are in Spanish — keep new code/comments in Spanish to match.

## Commands

Run everything from the **project root** — the backend is the `backend/` package, imported as `backend.app`, so module paths break if you `cd` into it.

```bash
# Local dev (auto-reload). Needs deps from requirements.txt.
uvicorn backend.app:app --reload          # serves API + frontend at http://localhost:8000

# Multi-tenant: definir la empresa por env vars (crea la empresa y el admin
# en el primer arranque). Para probar una segunda empresa en el mismo
# server, basta con cambiar COMPANY_SLUG y reiniciar (los datos están
# scopeados por empresa).
COMPANY_SLUG=casino-centro \
COMPANY_NAME="Casino Centro" \
ADMIN_USERNAME=admin \
ADMIN_PASSWORD=casino2026 \
uvicorn backend.app:app --reload

# Docker (production-like). Sets TZ, ADMIN_PASSWORD; mounts ./frontend and ./data.
docker-compose up --build

# One-off scripts (run as modules from root, not `python backend/x.py`):
python -m backend.init_db                 # create tables
python -m backend.importar_excel          # bulk-import workers from backend/uploads/trabajadores.xlsx
```

There are **no tests, linters, or build step**. The frontend loads Tailwind/Flowbite/pdfmake from CDNs at runtime.

## Architecture

**Single-origin app.** FastAPI serves both the JSON API and the static frontend (`backend/app.py` mounts `/js` and `/css`, serves `index.html` at `/`). Because of this, the frontend's `API_URL` is `""` (same origin) — there is no separate frontend server.

**Backend** (`backend/`):
- `database.py` — SQLite engine at `data/turnos.db` (path is relative to repo root). A `connect` event enables `PRAGMA foreign_keys=ON` per connection, since SQLite ignores FKs otherwise.
- `models.py` — tablas multi-tenant: `Empresa` (tenant) + `Trabajador` + `Planificacion` + `TrabajadorTurnoFijo` + `ConfiguracionCobertura` + `ConfiguracionColacion` + `Usuario`. Cada tabla operativa tiene `empresa_id` (FK con `ON DELETE CASCADE`). Los uniques pasan a ser por empresa: `(empresa_id, rut)` en `trabajadores`, `(empresa_id, ceco)` en `configuracion_colacion`, `(empresa_id, username)` en `usuarios`. La columna `rut` en `trabajadores` ya NO es `unique=True` globalmente (se valida por app).
- `app.py` — todos los endpoints. Tablas se crean al iniciar; `_migrar_empresa_y_empresa_id()` crea la empresa default y backfillea `empresa_id` en todas las tablas existentes (idempotente).

**Auth model** (multi-tenant + super-admin global):
- `LoginSchema.empresa` es opcional: si viene, login normal de empresa; si NO viene, el backend intenta login de super-admin global (username solo, exige `es_super_admin=True`).
- El token Bearer (en memoria, `_active_tokens`) carga un dict `{empresa_id, empresa_slug, empresa_nombre, usuario_id, username, es_super_admin}`. `require_token` devuelve ese dict; `get_empresa_id` es una dep convenience para extraer el `empresa_id`. `require_super_admin` rechaza con 403 a usuarios que no son super-admin.
- Variables de entorno para la primera empresa: `COMPANY_SLUG`, `COMPANY_NAME`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
- Variables de entorno para crear el super-admin inicial: `SUPER_ADMIN_USERNAME`, `SUPER_ADMIN_PASSWORD`. Si están configuradas, `_crear_super_admin_inicial` crea un Usuario con `empresa_id=NULL` y `es_super_admin=True`. No se ata a ninguna empresa.
- `POST /superadmin/*` (requieren `require_super_admin`): listar, crear, editar, activar/desactivar empresas.
- Todos los endpoints tenant-scoped (excepto `/login`, `/logout`, `/me`, `/superadmin/*`, `/empresas`) filtran por `empresa_id` automáticamente.

**Frontend** (`frontend/js/`) — vanilla JS, no modules/bundler. Scripts load in a fixed order in `index.html` and communicate through **globals** (`trabajadoresGlobal`, `planificacionGlobal`, `window.responsableSeleccionado`). Order matters: `api.js` → `calendario.js` → `resumen.js` → `app.js` → pdfmake → `pdf.js` → `admin/*`. Bootstrap now runs from `admin/auth.js`'s `inicializarSesion()` (DOMContentLoaded): it validates the token and only then calls `cargarSistema()` + `mostrarVistaPlanificacion()`. Without a valid session the app stays on the locked placeholder.
- `api.js` — fetch wrappers, token storage, `escaparHTML()` (used everywhere to build HTML via string concatenation — keep using it for any user data).
- `calendario.js` — week generation (weeks span Mon–Sun, include any week touching the month).
- `resumen.js` — **core domain logic** (see below).
- `app.js` — renders the planning grid, the custom turno dropdown, and `guardarTurno()`.
- `admin/` — `auth.js` holds the login modal flow and `actualizarBloqueoPlanificacion()` (toggles the locked placeholder vs. the real grid + right panel); `trabajadores.js` has the live worker CRUD + modal logic; `crud.js` and `modal.js` hold table/filter rendering. Note `crud.js` is now a near-empty stub kept only to preserve script load order — don't add logic there.

## Domain logic (in `resumen.js` / `app.js`)

Turnos are free-text strings matched by regex `(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})`, e.g. `"16:30 - 03:00"`. Special non-numeric values: `"Libre"` (day off) and `"Saliente"` (post-night-shift), both worth 0 hours. Empty input is normalized to `"Libre"`. The canonical turno list lives in the single `<datalist id="turnos">` in `index.html`; the custom dropdown reads from it as the source of truth (the native datalist was abandoned because Chrome filtered/hid options unreliably).

- **Hours** (`calcularHorasSemana`): end < start means the shift crosses midnight, so add 24. A **colación** (meal break) is subtracted per worked shift: 1h if `ceco === "seguridad"`, else 0.5h (`colacionPorCeco`).
- **Sundays worked** (`calcularDomingosTrabajados`): a Sunday counts as worked if the worker has a non-Libre shift that day, OR the **Saturday** shift crosses midnight into Sunday (salida < inicio).
- **Rest alerts** (`calcularAlertasDescanso`): flags < 12h between consecutive shifts — `warning` under 12h, `danger` under 10h. Correctly accounts for shifts crossing midnight when computing the gap.

## Roadmap context

`docs/PROYECTO.md` tracks the roadmap. The next planned feature is an **automatic shift-suggestion button**: legal limits (12h rest, weekly-hour max, weekly rest, max consecutive days) are **hard constraints**; coverage/fairness/cost are objectives optimized *within* those limits; the result is **previewed for approval before being applied** to the schedule.
