# Sistema de Planificación Mensual de Turnos

> Aplicación web SPA para planificar turnos mensuales de personal,
> optimizada para casinos y negocios con operación continua. Incluye
> motor de asignación automática con restricciones legales,
> exportación PDF con identidad corporativa, panel de administración
> multi-tenant y cobertura operativa configurable.

![Estado](https://img.shields.io/badge/estado-producción-success)
![Python](https://img.shields.io/badge/python-3.12-blue)
![Frontend](https://img.shields.io/badge/frontend-vanilla%20JS-yellow)
![Licencia](https://img.shields.io/badge/licencia-propietario-red)

---

## Tabla de contenidos

- [Resumen ejecutivo](#resumen-ejecutivo)
- [Capturas de pantalla](#capturas-de-pantalla)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura](#arquitectura)
- [Instalación y ejecución](#instalación-y-ejecución)
- [Despliegue con Docker](#despliegue-con-docker)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Modelo de datos](#modelo-de-datos)
- [API REST](#api-rest)
- [Motor de asignación automática](#motor-de-asignación-automática)
- [Cobertura operativa](#cobertura-operativa)
- [Reglas de negocio](#reglas-de-negocio)
- [Exportación PDF](#exportación-pdf)
- [Panel de administración SaaS](#panel-de-administración-saas)
- [Seguridad y autenticación](#seguridad-y-autenticación)
- [Tests](#tests)
- [Despliegue en producción](#despliegue-en-producción)
- [Roadmap](#roadmap)
- [Estructura de archivos detallada](#estructura-de-archivos-detallada)
- [Contribución](#contribución)
- [Licencia](#licencia)

---

## Resumen ejecutivo

**Problema:** coordinar turnos mensuales de cientos de colaboradores
cumpliendo restricciones laborales (descanso mínimo 12h, máximo de
horas semanales, días consecutivos, regla de domingos) y cobertura
operativa configurable por área y franja horaria. En el caso del
cliente inicial (Ovalle Casino Resort), significa planificar
~150 personas en un casino que opera 24/7.

**Solución:** SPA monolítica (sin frameworks de UI) + API REST en
FastAPI + base de datos SQLite. El frontend es HTML estático
servido por FastAPI. La inteligencia del sistema es un **motor de
asignación automática** que propone una planificación óptima
cumpliendo restricciones duras (legales) y optimizando objetivos
blandos (cobertura, equidad de horas, minimización de costo).

**Diferenciadores:**
- Motor de optimización con restricciones legales explícitas.
- Exportación PDF con identidad corporativa y formato profesional.
- Cobertura operativa configurable por Área/CECO, día de la semana
  y franja horaria con dotación mínima en inicio y fin.
- Multi-tenant (varias empresas, cada una con sus usuarios).
- Modo SaaS opcional para gestionar varias empresas desde una
  sola instalación.

**Estado:** en producción, usado activamente para planificación
mensual de turnos.

---

## Capturas de pantalla

> Las imágenes del mockup corporativo (cabecera navy, tarjetas
> blancas, leyenda con 4 chips, tabla con celdas de colores por tipo
> de turno, columna HRS con barra de progreso, footer monoespaciado)
> están disponibles en `docs/mockup-planificacion.png` o pueden
> regenerarse siguiendo el estilo descrito en [Exportación PDF](#exportación-pdf).

### Vista de planificación (frontend)

La SPA tiene 7 vistas principales accesibles desde el menú lateral:

| Vista | Ruta | Descripción |
|---|---|---|
| **Planificación** | `vista-planificacion` | Planificador mensual con grilla semanal y celdas editables |
| **Cobertura** | `vista-cobertura` | Configuración de cobertura operativa por Área/CECO |
| **Alertas** | `vista-alertas` | Panel de alertas de descansos, horas y cobertura |
| **Trabajadores** | `vista-trabajadores` | CRUD de colaboradores con turnos fijos |
| **Turnos Frecuentes** | `vista-turnos-frecuentes` | Catálogo de turnos reutilizables con inicio/fin/colación |
| **Usuarios** | `vista-usuarios` | CRUD de usuarios del sistema |
| **SaaS Admin** | `vista-saas-admin` | Multi-tenant: gestión de empresas |

### PDF exportado (mockup)

```
┌─────────────────────────────────────────────────────────────────┐
│ • OVALLE CASINO RESORT · GESTIÓN DE TURNOS                      │
│                                                                  │
│   Planificación Mensual                                          │
│   Julio 2026                                                     │
│   ─────────────────────────────────────────                      │
│   CARGO              ÁREA / CECO   GENERADO                       │
│   Asistente Sist...  Slots          14 jul 2026                   │
└─────────────────────────────────────────────────────────────────┘
┌────────────┬────────────┬────────────┐
│ COLABORAD. │ SEMANAS    │ CECO       │
│      6     │     5      │ Slots      │
└────────────┴────────────┴────────────┘
○ Libre  ○ Vacaciones  ○ Turno asig.  ○ Feriado
┌──────────────────────┐
│ [SEMANA 1]  Lunes 29 junio — Domingo 5 julio   7 días · turno 09:00-17:30 / 19:30-06:00 │
├────────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬────────┬────┐
│Colab.      │   LUN    │   MAR    │   MIÉ    │   JUE    │   VIE    │   SÁB    │   DOM   │HRS │
│            │  29/06   │  30/06   │  01/07   │  02/07   │  03/07   │  04/07   │  05/07  │    │
│            │San Pedro │          │          │          │          │          │        │    │
│            │  y Pablo │          │          │          │          │          │        │    │
├────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼────────┼────┤
│Rodrigo F.  │Libre  F  │Libre     │Libre     │Libre     │19:30-06:00│Libre    │Libre   │10h │░  │
│            │          │          │          │          │          │          │        │    │
... (filas por colaborador)
```

---

## Stack tecnológico

### Frontend
- **HTML5** con **TailwindCSS** (via CDN) — UI responsiva.
- **JavaScript Vanilla** (ES2020+) — sin React/Vue/Angular, todo a mano.
- **PDFMake 0.2.7** (via CDN) — generación de PDFs.
- **Flowbite** (componentes UI opcionales).
- **Google Fonts** — `Bricolage Grotesque` (display) + `Plus Jakarta Sans` (body) + `IBM Plex Mono` (mono).

### Backend
- **Python 3.12** — runtime.
- **FastAPI** — framework web async.
- **SQLAlchemy** (ORM).
- **Pydantic** — validación de schemas.
- **Uvicorn** — servidor ASGI.
- **hashlib + secrets** — autenticación con PBKDF2-SHA256 (200k iteraciones).

### Base de datos
- **SQLite** — single-file DB, ideal para una empresa mediana.
- Volumen Docker para persistencia.
- Migraciones versionadas en código (`_migrar_columna_*`).

### Despliegue
- **Docker** + **Docker Compose** — despliegue en 1 comando.
- **Caddy / nginx** (recomendado) — reverse proxy + HTTPS.

### Herramientas de desarrollo
- **Pylance / mypy** — type checking Python (opcional).
- **graphify** — grafo de conocimiento del código.
- **VSCode** — editor recomendado.

---

## Arquitectura

### Vista general

```
┌─────────────────────────────────────────────────────────────────────┐
│                         NAVEGADOR (cliente)                         │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  index.html (SPA monolítica)                                  │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │  │
│  │  │  7 vistas   │  │  TailwindCSS │  │  PDFMake CDN │          │  │
│  │  │  (SPA)      │  │              │  │              │          │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │  │
│  │  ┌──────────────────────────────────────────────────────┐    │  │
│  │  │ JavaScript Vanilla (frontend/js/*.js)                 │    │  │
│  │  │  - app.js        : planificador + UI principal         │    │  │
│  │  │  - api.js        : cliente HTTP fetch                 │    │  │
│  │  │  - cobertura.js  : configuración de cobertura         │    │  │
│  │  │  - motor_asignacion.js : algoritmo de optimización   │    │  │
│  │  │  - calendario.js : días feriados Chile                 │    │  │
│  │  │  - resumen.js    : cálculos (horas, descansos)         │    │  │
│  │  │  - pdf.js + pdf/ : exportación PDF (modular)            │    │  │
│  │  │  - admin/*.js   : CRUDs de administración              │    │  │
│  │  └──────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────┬──────────────────────────────┘
                                       │ HTTP REST + JSON
                                       │ (Authorization: Bearer <token>)
                                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       FASTAPI BACKEND (puerto 8000)                  │
│                                                                      │
│  backend/app.py       : endpoints REST (~40 rutas)                   │
│  backend/models.py    : SQLAlchemy ORM (10 modelos)                  │
│  backend/database.py  : sesión DB + engine + migraciones             │
│  backend/importar_excel.py : importador de trabajadores desde Excel  │
│  backend/feriados_seed.py  : sembrado de feriados del año             │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Autenticación: PBKDF2-SHA256, 200k iteraciones, token bearer  │  │
│  │ Multi-tenant: header `empresa_id` (opcional), filtrado auto   │  │
│  │ CORS: configurable via env var ALLOWED_ORIGINS                 │  │
│  │ Códigos de error: 400, 401, 403, 404, 409, 422                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────┬──────────────────────────────┘
                                       │ SQLAlchemy ORM
                                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       SQLite (data/turnos.db)                       │
│                                                                      │
│  10 tablas: empresas, trabajadores, planificacion,                   │
│  configuracion_cobertura, configuracion_colacion,                   │
│  turnos_frecuentes, trabajador_turnos_fijos, feriados,              │
│  usuarios, audit_log                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Diagrama de módulos JS (frontend)

```
index.html
   │
   ├─→ api.js          (cliente HTTP, fetch wrapper con auth)
   │
   ├─→ app.js          (orquestador: cargarSistema, planificador, eventos)
   │     │
   │     ├─→ calendario.js    (feriadosDe, días hábiles)
   │     ├─→ cobertura.js     (config de cobertura operativa)
   │     ├─→ resumen.js      (calcularHorasSemana, alertas, descansos)
   │     └─→ motor_asignacion.js  (algoritmo de optimización)
   │
   ├─→ admin/
   │     ├─→ auth.js              (login, logout, sesión)
   │     ├─→ crud.js              (helpers CRUD genéricos)
   │     ├─→ importar.js          (importar trabajadores Excel)
   │     ├─→ modal.js             (modales de administración)
   │     ├─→ saas-admin.js        (multi-tenant)
   │     ├─→ trabajadores.js      (CRUD trabajadores)
   │     ├─→ turnos-frecuentes.js (CRUD turnos del catálogo)
   │     └─→ usuarios.js          (CRUD usuarios)
   │
   └─→ pdf.js + pdf/
         ├─→ pdf/auxiliares.js    (obtenerNombreMes, obtenerIconoPDF)
         ├─→ pdf/cabecera.js      (cabecera con label corporativo)
         ├─→ pdf/leyenda.js       (3 stat cards + 5 chips)
         ├─→ pdf/tabla.js         (semanas + tabla con celdas)
         └─→ pdf.js (orquestador) (try/catch + pdfMake.createPdf().download())
```

---

## Instalación y ejecución

### Requisitos previos

- Python 3.12+
- pip
- Navegador moderno (Chrome, Edge, Firefox)
- (Opcional) Docker + Docker Compose

### Opción 1: Desarrollo local sin Docker

```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd gestion-horario

# 2. Crear un virtualenv
python3 -m venv venv
source venv/bin/activate   # Linux/Mac
# o: venv\Scripts\activate   # Windows

# 3. Instalar dependencias
pip install -r requirements.txt

# 4. Inicializar la base de datos (se crea data/turnos.db automáticamente)
cd backend
python -c "from backend.database import engine, Base; from backend import models; Base.metadata.create_all(engine); print('OK')"
cd ..

# 5. Iniciar el backend
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000

# 6. Abrir el frontend en otra terminal
# (opcional: servir frontend/ con un http server o usar el endpoint / de FastAPI)
python3 -m http.server 8080 --directory frontend

# 7. Abrir en el navegador:
# http://localhost:8000  (FastAPI sirve el frontend estático)
# o
# http://localhost:8080  (http server separado, requiere configurar CORS en backend)
```

**Credenciales iniciales:**
- **Slug de empresa:** `default`
- **Contraseña:** la definida en `ADMIN_PASSWORD` (default: `***` — cambiar en producción)

### Opción 2: Con Docker Compose (recomendado)

```bash
# 1. Clonar y configurar
git clone <url-del-repo>
cd gestion-horario

# 2. Editar docker-compose.yml y cambiar ADMIN_PASSWORD
nano docker-compose.yml

# 3. Construir y levantar
docker compose up -d --build

# 4. Ver logs
docker compose logs -f planificacion

# 5. Abrir en el navegador
# http://localhost:8000
```

La primera vez se crea la base de datos SQLite en el volumen `data/`.

---

## Despliegue con Docker

### docker-compose.yml

```yaml
version: '3.9'
services:
  planificacion:
    build: .
    container_name: planificacion_rrhh
    restart: unless-stopped
    ports:
      - "8000:8000"
    volumes:
      - ./frontend:/app/frontend
      - ./data:/app/data
    environment:
      - TZ=America/Santiago
      - ADMIN_PASSWORD=tu-contraseña-segura-aqui
      # CORS: dejar vacío = mismo origen (recomendado en producción)
      # - ALLOWED_ORIGINS=https://tu-dominio.cl
    # Reverse proxy: Caddy o nginx exponen HTTPS en 80/443
```

### Con Caddy como reverse proxy (recomendado para producción)

```caddy
# /etc/caddy/Caddyfile
tu-dominio.cl {
    reverse_proxy localhost:8000
    encode gzip
    log
}
```

### Verificación post-despliegue

```bash
# El backend responde en /health
curl http://localhost:8000/health

# Login funciona
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"slug": "default", "password": "tu-contraseña"}'
```

---

## Estructura del proyecto

```
gestion-horario/
├── backend/                        # FastAPI backend
│   ├── __init__.py
│   ├── app.py                      # ~2700 líneas: endpoints REST
│   ├── database.py                 # Sesión, engine, migraciones
│   ├── models.py                   # 10 modelos SQLAlchemy
│   ├── importar_excel.py           # Importador de trabajadores Excel
│   └── feriados_seed.py            # Sembrado de feriados del año
│
├── frontend/                       # SPA monolítica
│   ├── index.html                  # 2160 líneas: HTML + Tailwind
│   ├── css/
│   │   └── styles.css               # Estilos custom
│   └── js/
│       ├── app.js                  # Orquestador principal
│       ├── api.js                  # Cliente HTTP
│       ├── calendario.js           # Feriados y días hábiles
│       ├── cobertura.js            # Cobertura operativa
│       ├── motor_asignacion.js     # Algoritmo de optimización
│       ├── resumen.js              # Cálculos (horas, alertas)
│       ├── pdf.js                  # Orquestador de exportación PDF
│       ├── pdf/
│       │   ├── auxiliares.js       # obtenerNombreMes, obtenerIconoPDF
│       │   ├── cabecera.js         # Cabecera del documento
│       │   ├── leyenda.js          # 3 stats + 5 chips
│       │   └── tabla.js            # Semanas + tabla
│       └── admin/                  # Panel de administración
│           ├── auth.js             # Login/logout
│           ├── crud.js             # Helpers CRUD
│           ├── importar.js         # Importador Excel
│           ├── modal.js            # Modales
│           ├── saas-admin.js       # Multi-tenant
│           ├── trabajadores.js     # CRUD trabajadores
│           ├── turnos-frecuentes.js # CRUD turnos
│           └── usuarios.js         # CRUD usuarios
│
├── data/                           # Volumen Docker (ignorado en git)
│   └── turnos.db                   # SQLite database
│
├── tests/                          # Tests
│   └── test_turnos_frecuentes.py
│
├── docs/                           # Documentación
│   ├── PROYECTO.md
│   ├── PENDIENTE.md
│   ├── MEJORAS_PROPUESTAS.md
│   ├── motor_asignacion_turnos.md
│   └── SESIONES.md
│
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── .gitignore
├── AGENTS.md                       # Instrucciones para IAs
└── README.md                       # Este archivo
```

---

## Modelo de datos

Diagrama entidad-relación simplificado:

```
┌──────────┐         ┌──────────────┐         ┌──────────────┐
│ Empresa  │1────────∞│ Trabajador   │1────────∞│ Planificacion│
│──────────┤         │──────────────┤         │──────────────┤
│ id       │         │ id           │         │ id           │
│ slug     │         │ rut          │         │ trabajador_id│
│ nombre   │         │ nombre       │         │ responsable  │
│ activo   │         │ area         │         │ fecha        │
│ created  │         │ jornada      │         │ turno        │
└──────────┘         │ cargo        │         │ horas        │
                     │ responsable  │         └──────────────┘
                     │ ceco         │
                     │ activo       │         ┌────────────────────┐
                     │ turno_rotat. │1────────∞│TrabajadorTurnoFijo │
                     └──────────────┘         │────────────────────│
                                                │ id                 │
┌──────────────────┐                          │ trabajador_id      │
│ ConfiguracionCo- │                          │ dia_semana         │
│ bertura          │                          │ turno              │
│──────────────────│                          └────────────────────┘
│ id               │
│ empresa_id       │         ┌────────────────────┐
│ tipo (area/ceco) │         │ TurnoFrecuente       │
│ valor            │         │────────────────────│
│ dia_semana       │         │ id                 │
│ hora_inicio      │         │ empresa_id         │
│ hora_fin         │         │ inicio (HH:MM)     │
│ minimo_inicio    │         │ fin (HH:MM)        │
│ minimo_fin       │         │ duracion_horas     │
│ minimo_personas  │         │ es_nocturno        │
└──────────────────┘         │ cruza_medianoche   │
                             └────────────────────┘

┌──────────────────┐         ┌────────────────────┐
│ Feriado           │         │ Usuario             │
│──────────────────│         │────────────────────│
│ id               │         │ id                 │
│ empresa_id       │         │ empresa_id         │
│ fecha (YYYY-MM-DD)│        │ slug                │
│ nombre           │         │ nombre              │
│ tipo             │         │ password_hash       │
└──────────────────┘         │ rol                 │
                             │ email               │
┌──────────────────┐         │ activo              │
│ ConfiguracionCo- │         │ ultimo_login        │
│ lacion           │         │ created_at          │
│──────────────────│         └────────────────────┘
│ id               │
│ empresa_id       │         ┌────────────────────┐
│ ceco             │         │ AuditLog            │
│ minutos_colacion │         │────────────────────│
└──────────────────┘         │ id                 │
                             │ empresa_id         │
                             │ usuario_id         │
                             │ accion             │
                             │ entidad            │
                             │ entidad_id         │
                             │ datos_json         │
                             │ created_at         │
                             └────────────────────┘
```

---

## API REST

> Todos los endpoints (excepto `/health`, `/`, `/auth/login`) requieren
> header `Authorization: Bearer <token>`. Los endpoints `/planificacion/*`
> y `/cobertura/*` filtran automáticamente por `empresa_id` del token.

### Autenticación

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| `POST` | `/auth/login` | `{slug, password}` | `{token, user, empresa}` |
| `POST` | `/auth/logout` | — | `{ok: true}` |
| `GET` | `/me` | — | `{user, empresa}` |

### Trabajadores

| Método | Ruta | Body | Descripción |
|---|---|---|---|
| `GET` | `/trabajadores` | — | Lista todos los trabajadores de la empresa |
| `POST` | `/trabajadores` | `{rut, nombre, area, jornada, cargo, ceco, responsable, turno_rotativo, activo}` | Crea un trabajador |
| `PUT` | `/trabajadores/{id}` | (campos a actualizar) | Actualiza un trabajador |
| `DELETE` | `/trabajadores/{id}` | — | Soft-delete (marca `activo=false`) |
| `POST` | `/trabajadores/importar` | multipart/form-data con `.xlsx` | Importa desde Excel |
| `GET` | `/trabajadores/{id}/turnos-fijos` | — | Turnos fijos del trabajador |
| `PUT` | `/trabajadores/{id}/turnos-fijos` | `{items: [{dia_semana, turno}]}` | Reemplaza turnos fijos |

### Planificación

| Método | Ruta | Body | Descripción |
|---|---|---|---|
| `GET` | `/planificacion` | — | Todos los turnos del mes actual |
| `POST` | `/planificacion` | `{trabajador_id, fecha, turno, responsable, horas}` | Crea o actualiza 1 turno |
| `POST` | `/planificacion/lote` | `{asignaciones: [...]}` | Crea varios turnos en batch |

### Cobertura operativa

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/cobertura/config` | Lista reglas de cobertura |
| `POST` | `/cobertura/config` | Crea una regla |
| `PUT` | `/cobertura/config/{id}` | Actualiza una regla |
| `DELETE` | `/cobertura/config/{id}` | Elimina una regla |

Una regla de cobertura tiene la forma:
```json
{
  "tipo": "ceco",            // "ceco" o "area"
  "valor": "Slots",          // nombre del CECO o área
  "dia_semana": 5,           // 0=Dom, 1=Lun, ..., 6=Sáb
  "hora_inicio": "09:00",
  "hora_fin": "18:00",
  "minimo_inicio": 3,        // dotación mínima al inicio
  "minimo_fin": 2,           // dotación mínima al final
  "minimo_personas": 3        // (legacy, max(inicio, fin))
}
```

### Turnos frecuentes (catálogo)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/turnos-frecuentes` | Lista turnos del catálogo |
| `POST` | `/turnos-frecuentes` | Crea un turno (ej: "09:00-17:30") |
| `DELETE` | `/turnos-frecuentes/{id}` | Elimina un turno |

### Colación

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/colacion/config` | Minutos de colación por CECO |
| `POST` | `/colacion/config` | Configura colación de un CECO |
| `DELETE` | `/colacion/config/{id}` | Elimina la configuración |

### Usuarios y multi-tenant

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/usuarios` | Lista usuarios de la empresa |
| `POST` | `/usuarios` | Crea un usuario |
| `PUT` | `/usuarios/{id}` | Actualiza un usuario |
| `DELETE` | `/usuarios/{id}` | Elimina un usuario |
| `GET` | `/empresas` | Lista empresas (filtrado por permisos) |
| `GET` | `/superadmin/empresas` | Lista todas las empresas (solo superadmin) |
| `POST` | `/superadmin/empresas` | Crea una empresa |

### Ejemplo: login + obtener planificacion

```bash
# 1. Login
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"slug": "default", "password": "mi-password"}'
# Respuesta: {"token": "abc123...", "user": {...}, "empresa": {...}}

# 2. Guardar el token
TOKEN="abc123..."

# 3. Obtener planificación del mes
curl http://localhost:8000/planificacion \
  -H "Authorization: Bearer $TOKEN"

# 4. Guardar un turno
curl -X POST http://localhost:8000/planificacion \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "trabajador_id": 1,
    "fecha": "2026-07-15",
    "turno": "09:00-17:30",
    "horas": 8.0
  }'
```

---

## Motor de asignación automática

El motor de asignación es el componente más complejo del sistema.
Genera una propuesta de planificación que cumple las restricciones
legales duras y optimiza objetivos blandos.

### Restricciones duras (inviolables)

1. **Descanso mínimo de 12 horas** entre el fin de una jornada y
   el inicio de la siguiente.
2. **Máximo de horas semanales** según la jornada contractual
   del trabajador (ordinaria o extraordinaria).
3. **Descanso semanal garantizado** (al menos 1 día a la semana).
4. **Regla de domingos trabajados**: si una jornada de sábado
   termina después de las 00:00, cuenta como domingo.
5. **Cobertura mínima**: respetar las reglas de cobertura
   operativa configuradas.

### Objetivos de optimización (soft)

1. **Cobertura completa**: cubrir todas las brechas detectadas
   en la planificación.
2. **Equidad**: repartir equitativamente las horas totales y los
   domingos trabajados entre colaboradores.
3. **Respeto de turnos fijos**: si un trabajador tiene
   `dia_semana → turno` configurado, no modificarlo.
4. **Preferencia por responsable**: si un turno está marcado
   para un responsable, priorizar colaboradores bajo ese responsable.
5. **Minimización de cambios**: si ya existe planificación,
   reoptimizar modificando lo mínimo posible.

### Algoritmo

```
Entrada:  trabajadores[], planificacion_actual[], reglas_cobertura[]
Salida:   planificacion_propuesta[]

1. Calcular brechas de cobertura (calcularBrechasIntervalo)
2. Para cada brecha, generar candidatos de turno
3. Para cada candidato:
   a. Evaluar restricciones duras (descanso 12h, horas, domingos)
   b. Si pasa: puntuar según objetivos blandos
   c. Ordenar candidatos por score
4. Asignar mejor candidato a la brecha
5. Repetir hasta cubrir todas las brechas o agotar candidatos
6. Devolver propuesta con diff vs planificación actual
```

### Uso desde la UI

En la vista de planificación, click en el card "Generar
Planificación Automática" (header azul con icono `smart_toy`).
El motor devuelve una propuesta que se previsualiza en un modal
con los cambios resaltados, donde el usuario puede aprobar o
rechazar antes de aplicar.

### Configuración

El motor respeta:
- `Trabajador.jornada` (horas semanales contractuales)
- `Trabajador.cargo`, `Trabajador.ceco` (filtros)
- `Trabajador.responsable` (preferencia)
- `TrabajadorTurnoFijo` (días con turno fijo)
- `ConfiguracionCobertura` (mínimos por Área/CECO)
- `ConfiguracionColacion` (minutos de colación por CECO)
- `TurnoFrecuente` (catálogo de turnos disponibles)

---

## Cobertura operativa

Cada empresa puede definir reglas de cobertura que el motor y la
UI usan para detectar brechas.

**Modelo:** para cada (Área o CECO, día de la semana), se define
una franja horaria con dotación mínima al inicio y al final.

```json
{
  "tipo": "ceco",
  "valor": "Slots",
  "dia_semana": 5,           // Viernes
  "hora_inicio": "09:00",
  "hora_fin": "18:00",
  "minimo_inicio": 3,        // 3 personas a las 09:00
  "minimo_fin": 2,           // 2 personas a las 17:59
  "minimo_personas": 3        // legacy (max)
}
```

**Interpretación "solo dos puntos":** el mínimo se exige
exactamente en dos instantes (apertura y cierre de la franja).
En el resto de la franja NO se exige mínimo explícito (no hay
rampa ni escalón intermedio). Esto es una decisión de diseño
consciente — ver `docs/PENDIENTE.md` para la discusión completa.

**Cálculo de brechas:** `cobertura.js → calcularBrechasIntervalo`
recibe los turnos planificados y las reglas, y devuelve los
intervalos de tiempo donde la dotación es insuficiente.

---

## Reglas de negocio

### Descanso mínimo entre jornadas

- 12 horas obligatorias entre el fin de un turno y el inicio del
  siguiente.
- Sábado que termina después de 00:00 cuenta como domingo.

### Jornada laboral

- Cada trabajador tiene un campo `jornada` (horas semanales
  contractuales: típicamente 45).
- El motor y la UI calculan las horas de cada turno según
  `inicio` y `fin`, con descuento de colación configurable
  por CECO.

### Cargos y CECOs

- **Cargo** (ej: Cajero, Supervisor, Técnico): agrupa a
  trabajadores con roles similares, filtra el planificador.
- **CECO** (Centro de Costo, ej: Slots, Mesa, Bar): agrupa por
  ubicación física, define cobertura operativa.

### Domingos y feriados

- Los feriados se cargan por año (ver `backend/feriados_seed.py`).
- Una jornada que cruza la medianoche del domingo se cuenta
  como domingo trabajado.

---

## Exportación PDF

La exportación PDF usa **PDFMake 0.2.7** y sigue el diseño
corporativo del casino (paleta navy + gold).

### Paleta aplicada

| Elemento | Color | Hex |
|---|---|---|
| Cabecera fondo | navy-deep | `#0B1626` |
| Label corporativo (OVALLE CASINO RESORT) | gold | `#B08D3E` |
| Sub-título mes | gold-soft | `#E4D6AE` |
| Header día fondo | navy | `#12213B` |
| Header día fondo (feriado) | navy claro | `#2a3f6b` |
| Número del día (29/06) | gold-soft | `#E4D6AE` (15pt) |
| Celda Libre | libre + libre-text | `#EDF3ED` + `#4B7A5A` |
| Celda Vacaciones | vac + vac-text | `#FBF1DC` + `#A17A1F` |
| Celda Turno | turno + turno-text | `#F4F5F7` + `#1C2230` |
| Marca "F" en feriado | feriado-tag | `#C6742E` |
| Filas intercaladas | tbody even | `#FBFBFA` |
| Bordes | line | `#E3E1DC` |
| Nombre colaborador | navy | `#12213B` |
| Celda error (regresión) | — | `#9d174d` (rosa oscuro) |

### Arquitectura modular

```
pdf.js (orquestador, 392 líneas)
  │
  ├─→ pdf/auxiliares.js   obtenerNombreMes, obtenerIconoPDF
  ├─→ pdf/cabecera.js     Header con label + título + mes + cargo + área
  ├─→ pdf/leyenda.js      3 stat cards + 5 chips (Libre/Vac/Turno/Horas/Feriado)
  └─→ pdf/tabla.js        Bucle semanas + tabla con celdas coloreadas
```

`pdf.js` solo llama a los 4 módulos en orden, captura errores con
`try/catch` y muestra `alert()` al usuario si algo falla.

### Bugs resueltos durante el desarrollo

1. **`diasSemana.push(string)`** (string plano en vez de objeto):
   `obtenerTurnoGuardado(undefined)` siempre devolvía el primer
   registro. Fix: push de objetos `{label, fechaTexto, feriado}`.
2. **PDF "todo en Libre"**: mismo bug, manifestado como el
   primer turno de cada trabajador apareciendo en cada celda.
3. **`unsupported number: NaN` en vector.js**: el `canvas` con
   `type:'ellipse'` para el bullet dorado causaba NaN en el
   cálculo vectorial de pdfmake. Fix: bullet unicode inline (`•`).
4. **`semana is not defined` en refactor modular**: el
   `semanas.forEach()` se perdió al extraer el bucle. Fix:
   envolver el código con el forEach.
5. **Headers COLABORADOR y HRS invisibles**: no tenían `color`
   definido, usaban el default negro sobre fondo navy. Fix:
   `color:'white'`, `bold:true`.

---

## Panel de administración SaaS

El sistema soporta **multi-tenant** mediante:

1. **Tabla `empresas`**: cada empresa tiene un `slug` único.
2. **Columna `empresa_id`**: presente en casi todas las tablas.
3. **Filtro automático**: todos los endpoints filtran por
   `empresa_id` derivado del token.
4. **Modo SaaS**: activado cuando `SUPERADMIN_PASSWORD` está
   configurado. Permite gestionar todas las empresas desde una
   sola instalación.

### Casos de uso

- **Una empresa**: setup simple, sin multi-tenant.
- **Varias empresas independientes**: cada una con sus usuarios
  y datos aislados, un solo servidor.
- **SaaS multi-tenant**: un operador gestiona varias empresas
  (consultoría de RR.HH., holding con varios casinos).

---

## Seguridad y autenticación

### Hashing de contraseñas

- Algoritmo: **PBKDF2-HMAC-SHA256**.
- Iteraciones: 200,000 (configurable via `_ITERACIONES_PBKDF2`).
- Salt: 16 bytes aleatorios por usuario.
- Formato: `pbkdf2_sha256$200000$<salt_hex>$<hash_hex>`.

### Tokens de sesión

- Tokens bearer de 32 bytes aleatorios (en base64 URL-safe).
- Almacenados en `sessionStorage` del cliente.
- Sin expiración automática (sesión hasta logout explícito).
- Multi-tenant: el token se asocia a un `usuario_id` y un
  `empresa_id` derivado del login.

### CORS

Configurable via env var `ALLOWED_ORIGINS` (separados por coma).
Vacío = mismo origen (recomendado en producción con reverse proxy).

### Recomendaciones de producción

1. **HTTPS obligatorio** — usar Caddy o nginx como reverse proxy.
2. **Cambiar `ADMIN_PASSWORD`** del docker-compose antes de
   desplegar.
3. **Rotar tokens** periódicamente (funcionalidad futura).
4. **Limitar intentos de login** (rate limiting via nginx).
5. **Backups automáticos** de `data/turnos.db` (cron diario).
6. **No exponer el puerto 8000** directamente — usar proxy en 443.

---

## Tests

```bash
# Ejecutar todos los tests
python3 -m unittest discover -s tests -v

# O directamente
python3 -m unittest tests.test_turnos_frecuentes -v
```

### Tests actuales

- `tests/test_turnos_frecuentes.py`: validación del CRUD de
  turnos frecuentes (crear, listar, eliminar, validación de
  horas, cruce de medianoche).

### Tests pendientes (ver `docs/MEJORAS_PROPUESTAS.md`)

- [ ] Tests unitarios del motor de asignación
- [ ] Tests de cobertura operativa (cálculo de brechas)
- [ ] Tests de cálculo de horas y colación
- [ ] Tests de exportación PDF
- [ ] Tests de importación Excel
- [ ] Tests de descanso mínimo (12h)
- [ ] Tests de integración end-to-end

---

## Despliegue en producción

### Requisitos de servidor

- 2 vCPU mínimo (recomendado 4 vCPU para 100+ usuarios).
- 4 GB RAM mínimo.
- 20 GB de disco (la DB crece ~100 MB/año).
- Linux (Ubuntu 22.04 LTS recomendado).

### Pasos

```bash
# 1. Instalar Docker
curl -fsSL https://get.docker.com | sh

# 2. Clonar el repo
git clone <url> /opt/gestion-horario
cd /opt/gestion-horario

# 3. Configurar docker-compose.yml
#    - Cambiar ADMIN_PASSWORD
#    - Configurar ALLOWED_ORIGINS si hay frontend separado
#    - Cambiar TZ a America/Santiago

# 4. Construir y levantar
docker compose up -d --build

# 5. Verificar
docker compose ps
docker compose logs -f planificacion

# 6. Configurar Caddy como reverse proxy (HTTPS)
sudo nano /etc/caddy/Caddyfile
sudo systemctl reload caddy

# 7. Configurar backups
crontab -e
# Backup diario a las 02:00
0 2 * * * cp /opt/gestion-horario/data/turnos.db /backups/turnos-$(date +\%Y\%m\%d).db
```

### Monitoreo

- Health check: `GET /health` → `{"ok": true}`
- Logs: `docker compose logs -f planificacion`
- DB size: `ls -lh data/turnos.db`
- Disk: `df -h /opt/gestion-horario`

### Actualización

```bash
cd /opt/gestion-horario
git pull
docker compose down
docker compose up -d --build
# Verificar que las migraciones se aplicaron correctamente
docker compose logs planificacion | grep -i migration
```

---

## Roadmap

Ver `docs/PENDIENTE.md` y `docs/MEJORAS_PROPUESTAS.md` para la lista
completa. Highlights:

### Prioridad alta
- [ ] **Botón de sugerencia automática de turnos** (en desarrollo)
  con restricciones legales duras y objetivos blandos
- [ ] **Exportación Excel** en formato admitido por Defontana
  (sistema contable chileno)
- [ ] **Dashboard de KPIs** de utilización de personal

### Prioridad media
- [ ] **Auditoría y bitácora de cambios** (tabla `audit_log` ya existe,
      falta UI)
- [ ] **Migraciones versionadas** con Alembic
- [ ] **Roles y permisos** granulares
- [ ] **Backups automáticos** antes de cambios masivos

### Prioridad baja
- [ ] **App móvil** (PWA) para responsables de área
- [ ] **Notificaciones** por email/Slack cuando se publica planificación
- [ ] **Reportes automáticos** semanales de cobertura y horas extra
- [ ] **Integración con sistemas de reloj control** (importar marcaciones)

---

## Estructura de archivos detallada

```
gestion-horario/
├── backend/                              # FastAPI + SQLAlchemy
│   ├── __init__.py                        # Vacío (package marker)
│   ├── app.py                             # ~2700 líneas, 40+ endpoints
│   ├── database.py                        # Sesión, engine, migraciones, WAL mode
│   ├── models.py                          # 10 modelos SQLAlchemy
│   ├── importar_excel.py                 # Lector Excel con pandas
│   └── feriados_seed.py                   # Catálogo de feriados Chile
│
├── frontend/                             # SPA monolítica (vanilla JS)
│   ├── index.html                         # 2160 líneas, 7 vistas
│   ├── css/
│   │   └── styles.css                     # Estilos custom (no Tailwind)
│   └── js/
│       ├── app.js                         # 1542 líneas, orquestador
│       ├── api.js                         # 807 líneas, cliente HTTP
│       ├── calendario.js                  # 354 líneas, feriados Chile
│       ├── cobertura.js                   # 912 líneas, config cobertura
│       ├── motor_asignacion.js            # 2391 líneas, algoritmo optimización
│       ├── resumen.js                     # 1569 líneas, cálculos
│       ├── pdf.js                         # 392 líneas, orquestador PDF
│       ├── pdf/
│       │   ├── auxiliares.js              # 56 líneas, funciones puras
│       │   ├── cabecera.js                # 168 líneas, header del doc
│       │   ├── leyenda.js                 # 211 líneas, stats + chips
│       │   └── tabla.js                   # 585 líneas, semanas + tabla
│       └── admin/
│           ├── auth.js                    # 353 líneas, login/logout
│           ├── crud.js                    # 3 líneas (stub)
│           ├── importar.js                # 402 líneas, importador Excel
│           ├── modal.js                   # 663 líneas, modales admin
│           ├── saas-admin.js              # 774 líneas, multi-tenant
│           ├── trabajadores.js            # 534 líneas, CRUD trabajadores
│           ├── turnos-frecuentes.js       # 256 líneas, CRUD turnos
│           └── usuarios.js                # 214 líneas, CRUD usuarios
│
├── tests/
│   └── test_turnos_frecuentes.py          # Tests del CRUD de turnos
│
├── docs/
│   ├── PROYECTO.md                        # Visión general del proyecto
│   ├── PENDIENTE.md                       # Lista priorizada de pendientes
│   ├── MEJORAS_PROPUESTAS.md              # Mejoras opcionales de calidad
│   ├── motor_asignacion_turnos.md         # Diseño detallado del motor
│   └── SESIONES.md                        # Bitácora de sesiones de trabajo
│
├── data/                                  # Volumen Docker (gitignored)
│   └── turnos.db                          # SQLite (~330 KB base, ~100 MB/año)
│
├── AGENTS.md                              # Instrucciones para IAs que trabajan en el repo
├── CLAUDE.md                              # Notas de Claude (legado)
├── docker-compose.yml                     # Orquestación Docker
├── Dockerfile                             # Imagen Python 3.12-slim
├── requirements.txt                       # 5 deps: fastapi, uvicorn, sqlalchemy, pandas, openpyxl
├── .gitignore                             # Exclusiones: __pycache__, .hermes/, data/, etc
└── README.md                              # Este archivo
```

### Tamaños aproximados

- **Backend Python**: ~5500 líneas
- **Frontend JavaScript**: ~14,300 líneas (incluyendo admin y pdf/)
- **Frontend HTML/CSS**: ~2400 líneas
- **Tests**: ~390 líneas (1 archivo)
- **Total**: ~22,600 líneas

---

## Contribución

### Setup de desarrollo

```bash
# 1. Clonar e instalar deps
git clone <url>
cd gestion-horario
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. Crear DB
cd backend
python -c "from backend.database import engine, Base; from backend import models; Base.metadata.create_all(engine)"

# 3. Backend con autoreload
uvicorn backend.app:app --reload --port 8000

# 4. Frontend: editar archivos en frontend/ y refrescar el navegador
#    (no requiere build step)

# 5. Tests
python3 -m unittest discover -s tests -v
```

### Estilo de código

- **Python**: PEP 8, type hints cuando aporta claridad.
- **JavaScript**: ES2020+, no frameworks, indentación 4 espacios,
  comillas dobles, punto y coma al final.
- **Commits**: mensajes descriptivos en español, scope claro.

### Pull requests

1. Branch desde `master`.
2. Tests pasando.
3. Descripción del cambio + capturas si es visual.
4. Review de al menos 1 persona antes de merge.

---

## Licencia

**Propietario.** Software desarrollado para Ovalle Casino Resort.
Todos los derechos reservados.

Contacto: ver `AGENTS.md` o el registro del repositorio.

---

## Créditos

- **Frontend y backend**: Elvis Vasquez
- **Motor de asignación**: basado en investigación de
  optimización con restricciones, implementado a medida.
- **Diseño corporativo**: inspirado en el sistema de planificación
  de casinos y en guías de UI/UX modernas (Tailwind UI, Flowbite).
- **Iconos**: Material Symbols (Google).
- **Fuentes**: Google Fonts (Bricolage Grotesque, Plus Jakarta Sans,
  IBM Plex Mono).

---

**Última actualización:** 2026-07-15
