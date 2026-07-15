import os
import re
import hmac
import hashlib
import secrets
import unicodedata

from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from pydantic import BaseModel
from typing import Optional

from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .database import SessionLocal, engine, Base, db_migration_lock, ensure_sqlite_wal_mode

from .models import Trabajador
from .models import TrabajadorTurnoFijo
from .models import Planificacion
from .models import ConfiguracionCobertura
from .models import ConfiguracionColacion
from .models import TurnoFrecuente
from .models import Usuario
from .models import Empresa
from .models import AuditLog
from .models import Feriado

from .feriados_seed import feriados_para_anio

from pathlib import Path


app = FastAPI()


# =========================
# CREAR TABLAS AL INICIAR
# =========================

@app.on_event("startup")
def crear_tablas():
    # La inicialización es IDEMPOTENTE a nivel SQL: cada paso chequea si
    # ya está hecho (columnas/tablas/índices con IF NOT EXISTS, UPDATEs con
    # WHERE IS NULL, admin con "exists?" antes de crear). Eso permite que dos
    # workers arranquen en paralelo sin coordinación. SQLite igual serializa
    # los writes; el primero en obtener el lock hace todo y los demás no-op.
    #
    # Anteriormente intentamos serializar con un file lock (fcntl.flock)
    # pero daba problemas: si un proceso muere con el lock tomado, el kernel
    # normalmente lo libera, pero en escenarios con volumes Docker el
    # comportamiento es impredecible y el siguiente container se cuelga
    # indefinidamente. Mejor la idempotencia pura.
    Base.metadata.create_all(bind=engine)
    _migrar_columna_es_responsable()
    _migrar_columna_cargo()
    _migrar_columna_activo()
    _migrar_columna_turno_rotativo()
    _migrar_columna_turno_fijo()
    _migrar_columnas_cobertura()
    _migrar_columna_es_super_admin()
    _migrar_empresa_id_nullable_usuarios()
    _migrar_empresa_y_empresa_id()
    ensure_sqlite_wal_mode()
    _crear_admin_inicial()
    _crear_super_admin_inicial()
    _seed_feriados_chile()


# ============================================================================
# MIGRACIÓN: Empresa + empresa_id en cada tabla tenant-scoped
# ============================================================================
# En orden:
#   1. Crear la tabla `empresas` (Base.metadata.create_all ya lo hace si la
#      tabla no existía, pero lo hacemos explícito por orden).
#   2. Insertar la empresa "default" (la del env, o "default" como fallback).
#   3. Para cada tabla tenant-scoped: ADD COLUMN empresa_id (nullable),
#      UPDATE con el id de la empresa default, recrear el unique index
#      para que sea (empresa_id, ...) en lugar de global.
#   Idempotente: si la columna ya existe, no hace nada.
def _migrar_empresa_y_empresa_id():

    inspector = inspect(engine)
    tablas = inspector.get_table_names()

    # Si la tabla `empresas` no existe, la creamos acá mismo. Esto permite
    # que la migración sea autocontenida: se puede llamar sin que las tablas
    # estén creadas previamente (la inicialización de tablas puede haber
    # fallado o el proceso puede haber arrancado en medio de un create_all).
    if "empresas" not in tablas:
        try:
            Empresa.__table__.create(bind=engine, checkfirst=True)
            tablas = inspector.get_table_names()
        except Exception:
            return

    # Toda la migración es idempotente a nivel SQL: cada paso chequea si ya
    # está hecho (columnas/índices con IF NOT EXISTS, UPDATEs con WHERE
    # IS NULL, admin con "exists?" antes de crear). Eso permite que dos
    # workers arranquen en paralelo sin coordinación: el primero en obtener
    # el lock de SQLite hace todo y los demás ven "ya está hecho" y no-op.

    # 1. Empresa default (la del bootstrap).
    db = SessionLocal()
    try:
        slug_default = (
            os.getenv("COMPANY_SLUG", "default").strip() or "default"
        )
        nombre_default = (
            os.getenv("COMPANY_NAME", "Mi Empresa").strip() or "Mi Empresa"
        )

        empresa_default = db.query(Empresa).filter(
            Empresa.slug == slug_default
        ).first()

        if not empresa_default:
            empresa_default = Empresa(
                slug=slug_default,
                nombre=nombre_default,
                activo=True,
            )
            db.add(empresa_default)
            try:
                db.commit()
                db.refresh(empresa_default)
            except Exception:
                # Otro proceso la creó en paralelo: la recuperamos.
                db.rollback()
                empresa_default = db.query(Empresa).filter(
                    Empresa.slug == slug_default
                ).first()
    finally:
        db.close()

    if not empresa_default:
        return

    empresa_id_default = empresa_default.id

    # 2. Añadir empresa_id a cada tabla tenant-scoped y backfillear.
    #    Después crear el índice único compuesto si corresponde.
    tablas_tenant = [
        ("usuarios", "uq_usuarios_empresa_username", ["empresa_id", "username"]),
        ("trabajadores", "uq_trabajadores_empresa_rut", ["empresa_id", "rut"]),
        ("planificacion", None, ["empresa_id"]),
        ("configuracion_cobertura", None, ["empresa_id"]),
        ("configuracion_colacion", "uq_colacion_empresa_ceco", ["empresa_id", "ceco"]),
        ("trabajador_turnos_fijos", None, ["empresa_id"]),
    ]

    # Una sola transacción para todas las modificaciones. Si algo falla,
    # SQLite hace rollback y la siguiente corrida lo intenta de nuevo.
    try:
        with engine.begin() as conn:

            for tabla, idx_unico, cols_idx in tablas_tenant:

                if tabla not in tablas:
                    continue

                columnas = {c["name"] for c in inspector.get_columns(tabla)}

                # 2a. ALTER TABLE (idempotente: solo si la columna no existe).
                if "empresa_id" not in columnas:
                    conn.execute(
                        text(
                            f"ALTER TABLE {tabla} "
                            f"ADD COLUMN empresa_id INTEGER"
                        )
                    )

                # 2b. Backfill: asignar todos los registros existentes a la
                #     empresa default. Si la tabla está vacía, no hace nada.
                conn.execute(
                    text(
                        f"UPDATE {tabla} "
                        f"SET empresa_id = :eid "
                        f"WHERE empresa_id IS NULL"
                    ),
                    {"eid": empresa_id_default},
                )

                # 2c. Índice (FK implícita vía la columna).
                try:
                    conn.execute(
                        text(
                            f"CREATE INDEX IF NOT EXISTS "
                            f"ix_{tabla}_empresa_id "
                            f"ON {tabla}(empresa_id)"
                        )
                    )
                except Exception:
                    pass

                # 2d. Índice único compuesto (donde aplique).
                if idx_unico:
                    try:
                        conn.execute(
                            text(
                                f"CREATE UNIQUE INDEX IF NOT EXISTS "
                                f"{idx_unico} "
                                f"ON {tabla}({', '.join(cols_idx)})"
                            )
                        )
                    except Exception:
                        pass

            # 3. Asegurar que planificacion y trabajador_turnos_fijos hereden
            #    empresa_id de su trabajador. Esto se hace aquí dentro de la
            #    misma transacción.
            conn.execute(text(
                "UPDATE trabajador_turnos_fijos "
                "SET empresa_id = (SELECT empresa_id FROM trabajadores "
                "                    WHERE trabajadores.id = "
                "                          trabajador_turnos_fijos.trabajador_id) "
                "WHERE empresa_id IS NULL OR empresa_id = 0"
            ))
            conn.execute(text(
                "UPDATE planificacion "
                "SET empresa_id = (SELECT empresa_id FROM trabajadores "
                "                  WHERE trabajadores.id = "
                "                        planificacion.trabajador_id) "
                "WHERE empresa_id IS NULL OR empresa_id = 0"
            ))
    except Exception:
        # Si la transacción falla (otro worker ganó la carrera, deadlocks
        # en SQLite, etc.) salimos silenciosamente: en la próxima corrida
        # los chequeos idempotentes detectan el estado y completan lo que
        # falte. La app sigue funcionando sin la migración completa.
        pass


def _crear_super_admin_inicial():
    """Crea el super-admin inicial si SUPER_ADMIN_USERNAME/PASSWORD
    están configurados como env vars. No se ata a ninguna empresa. Si el
    usuario ya existe, no hace nada (idempotente)."""
    user = os.getenv("SUPER_ADMIN_USERNAME", "").strip()
    pwd = os.getenv("SUPER_ADMIN_PASSWORD", "").strip()
    if not user or not pwd:
        return

    db = SessionLocal()
    try:
        existente = db.query(Usuario).filter(
            Usuario.username == user,
            Usuario.es_super_admin == True,
        ).first()
        if existente:
            return
        db.add(Usuario(
            empresa_id=None,
            es_super_admin=True,
            username=user,
            password_hash=_hash_password(pwd),
            nombre="Super Admin",
            activo=True,
        ))
        try:
            db.commit()
        except Exception:
            # Carrera: otro worker creó el mismo super-admin. OK.
            db.rollback()
    finally:
        db.close()


# ============================================================================
# AUTENTICACIÓN
# ============================================================================
# Multi-tenant: el usuario inicia sesión con (empresa, username, password).
# El backend valida que el (empresa.slug, username) exista y que la contraseña
# sea correcta. Se emite un token aleatorio guardado en memoria que mapea a
# un dict con {empresa_id, empresa_slug, usuario_id, username}. Todos los
# endpoints protegidos extraen ese dict y filtran por empresa_id.


def _migrar_columna_es_responsable():
    """Añade la columna es_responsable a bases de datos creadas antes de que
    existiera. create_all() no altera tablas ya existentes, así que se agrega
    a mano si falta."""

    inspector = inspect(engine)

    if "trabajadores" not in inspector.get_table_names():
        return

    columnas = {c["name"] for c in inspector.get_columns("trabajadores")}

    if "es_responsable" not in columnas:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE trabajadores "
                    "ADD COLUMN es_responsable BOOLEAN DEFAULT 0"
                )
            )


def _migrar_columna_cargo():
    """Añade la columna cargo a bases de datos creadas antes de que existiera
    (mismo patrón que es_responsable, ya que create_all() no altera tablas)."""

    inspector = inspect(engine)

    if "trabajadores" not in inspector.get_table_names():
        return

    columnas = {c["name"] for c in inspector.get_columns("trabajadores")}

    if "cargo" not in columnas:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE trabajadores "
                    "ADD COLUMN cargo TEXT DEFAULT 'Sin cargo'"
                )
            )


def _migrar_columna_es_super_admin():
    """Añade la columna es_super_admin a bases de datos previas. Por defecto
    todos los usuarios existentes quedan con es_super_admin=0 (no son
    super-admins)."""

    inspector = inspect(engine)

    if "usuarios" not in inspector.get_table_names():
        return

    columnas = {c["name"] for c in inspector.get_columns("usuarios")}

    if "es_super_admin" not in columnas:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE usuarios "
                    "ADD COLUMN es_super_admin BOOLEAN DEFAULT 0 NOT NULL"
                )
            )


def _migrar_empresa_id_nullable_usuarios():
    """Hace empresa_id NULLable en usuarios para permitir super-admins
    globales (no atados a ninguna empresa). Si la columna ya es NULLable,
    no hace nada."""

    inspector = inspect(engine)

    if "usuarios" not in inspector.get_table_names():
        return

    with engine.begin() as conn:
        info = conn.execute(text("PRAGMA table_info(usuarios)")).fetchall()
        # (cid, name, type, notnull, dflt_value, pk)
        for row in info:
            if row[1] == "empresa_id" and row[3] == 1:
                # notnull=1 → hay que hacerlo NULLable. SQLite no soporta
                # ALTER COLUMN, así que recreamos la tabla preservando datos.
                conn.execute(text("PRAGMA foreign_keys=OFF"))
                conn.execute(text(
                    "CREATE TABLE usuarios_new ("
                    "  id INTEGER PRIMARY KEY, "
                    "  empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE, "
                    "  es_super_admin BOOLEAN NOT NULL DEFAULT 0, "
                    "  username TEXT NOT NULL, "
                    "  password_hash TEXT NOT NULL, "
                    "  nombre TEXT, "
                    "  activo BOOLEAN NOT NULL DEFAULT 1, "
                    "  created_at TEXT NOT NULL"
                    ")"
                ))
                conn.execute(text(
                    "INSERT INTO usuarios_new "
                    "(id, empresa_id, es_super_admin, username, password_hash, "
                    " nombre, activo, created_at) "
                    "SELECT id, empresa_id, es_super_admin, username, password_hash, "
                    "nombre, activo, created_at FROM usuarios"
                ))
                conn.execute(text("DROP TABLE usuarios"))
                conn.execute(text("ALTER TABLE usuarios_new RENAME TO usuarios"))
                # Re-crear índices que existían antes.
                conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_usuarios_empresa_id "
                    "ON usuarios(empresa_id)"
                ))
                conn.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_empresa_username "
                    "ON usuarios(empresa_id, username)"
                ))
                conn.execute(text("PRAGMA foreign_keys=ON"))
                break


def _migrar_columna_activo():
    """Añade la columna activo a bases de datos creadas antes de que existiera
    (mismo patrón que cargo). Por defecto todos quedan activos (1)."""

    inspector = inspect(engine)

    if "trabajadores" not in inspector.get_table_names():
        return

    columnas = {c["name"] for c in inspector.get_columns("trabajadores")}

    if "activo" not in columnas:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE trabajadores "
                    "ADD COLUMN activo BOOLEAN DEFAULT 1"
                )
            )


def _migrar_columna_turno_rotativo():
    """Añade la columna turno_rotativo a bases de datos previas. Por defecto
    todos los trabajadores quedan como rotativos (1) para no cambiar el
    comportamiento del planificador automático sobre datos existentes."""

    inspector = inspect(engine)

    if "trabajadores" not in inspector.get_table_names():
        return

    columnas = {c["name"] for c in inspector.get_columns("trabajadores")}

    if "turno_rotativo" not in columnas:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE trabajadores "
                    "ADD COLUMN turno_rotativo BOOLEAN DEFAULT 1"
                )
            )


def _migrar_columna_turno_fijo():
    """Añade la columna turno_fijo (texto, nullable) para que un trabajador
    con turno_rotativo=False pueda tener un turno específico que el motor
    asigna de forma estricta. Sin valor, el fijo sigue excluido del motor."""

    inspector = inspect(engine)

    if "trabajadores" not in inspector.get_table_names():
        return

    columnas = {c["name"] for c in inspector.get_columns("trabajadores")}

    if "turno_fijo" not in columnas:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE trabajadores "
                    "ADD COLUMN turno_fijo TEXT"
                )
            )


def _migrar_columnas_cobertura():
    """Añade minimo_inicio/minimo_fin a la config de cobertura en bases creadas
    antes de que existieran (mismo patrón que las demás migraciones). Las reglas
    antiguas se backfillean con el minimo_personas actual, de modo que exigen el
    mismo mínimo en apertura y cierre y su comportamiento no cambia."""

    inspector = inspect(engine)

    if "configuracion_cobertura" not in inspector.get_table_names():
        return

    columnas = {
        c["name"] for c in inspector.get_columns("configuracion_cobertura")
    }

    with engine.begin() as conn:
        if "minimo_inicio" not in columnas:
            conn.execute(
                text(
                    "ALTER TABLE configuracion_cobertura "
                    "ADD COLUMN minimo_inicio INTEGER DEFAULT 1"
                )
            )
            conn.execute(
                text(
                    "UPDATE configuracion_cobertura "
                    "SET minimo_inicio = minimo_personas"
                )
            )

        if "minimo_fin" not in columnas:
            conn.execute(
                text(
                    "ALTER TABLE configuracion_cobertura "
                    "ADD COLUMN minimo_fin INTEGER DEFAULT 1"
                )
            )
            conn.execute(
                text(
                    "UPDATE configuracion_cobertura "
                    "SET minimo_fin = minimo_personas"
                )
            )


# =========================
# CORS
# =========================
# El frontend se sirve desde la misma app, así que basta con permitir el
# propio origen. Se puede ampliar vía la variable de entorno ALLOWED_ORIGINS
# (lista separada por comas). No se usa allow_credentials con "*" porque es
# una combinación inválida que los navegadores rechazan.

_origins_env = os.getenv("ALLOWED_ORIGINS", "").strip()
allowed_origins = (
    [o.strip() for o in _origins_env.split(",") if o.strip()]
    if _origins_env
    else ["*"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# DB SESSION (dependencia)
# =========================

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =========================
# AUTENTICACIÓN (usuarios + token)
# =========================
# Los usuarios viven en la tabla `usuarios` con la contraseña hasheada (PBKDF2,
# stdlib, sin dependencias extra). Al iniciar sesión con usuario + contraseña se
# entrega un token aleatorio guardado en memoria (mapeado al username); los
# endpoints protegidos lo exigen en la cabecera Authorization: Bearer ...
# Reiniciar el servidor invalida los tokens existentes (aceptable para una
# herramienta interna).

# token -> contexto de sesión (empresa_id, usuario_id, etc.)
# Estructura: {
#   "empresa_id":   int,
#   "empresa_slug": str,
#   "usuario_id":   int,
#   "username":     str,
# }
_active_tokens: dict[str, dict] = {}

_ITERACIONES_PBKDF2 = 200_000


def _hash_password(password: str) -> str:
    """Devuelve el hash en formato pbkdf2_sha256$iteraciones$salt$hash."""
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, _ITERACIONES_PBKDF2
    )
    return f"pbkdf2_sha256${_ITERACIONES_PBKDF2}${salt.hex()}${dk.hex()}"


def _verify_password(password: str, almacenado: str) -> bool:
    """Compara una contraseña con el hash almacenado (tiempo constante)."""
    try:
        algoritmo, iteraciones, salt_hex, hash_hex = almacenado.split("$")
        if algoritmo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iteraciones),
        )
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


def _crear_admin_inicial():
    """Crea el admin inicial y su empresa por defecto si no existen. Lee:
    - COMPANY_SLUG / COMPANY_NAME → empresa.
    - ADMIN_USERNAME / ADMIN_PASSWORD → usuario admin de esa empresa.
    Idempotente: si la empresa o el admin ya existen, no hace nada. Si dos
    workers arrancan a la vez y ambos intentan crear el admin, el segundo
    recibe IntegrityError y sale silenciosamente (el admin ya está creado).
    """
    db = SessionLocal()
    try:
        slug = os.getenv("COMPANY_SLUG", "default").strip() or "default"
        nombre = os.getenv("COMPANY_NAME", "Mi Empresa").strip() or "Mi Empresa"
        admin_user = os.getenv("ADMIN_USERNAME", "admin").strip() or "admin"
        admin_pass = os.getenv("ADMIN_PASSWORD", "casino2026")

        empresa = db.query(Empresa).filter(Empresa.slug == slug).first()
        if not empresa:
            empresa = Empresa(slug=slug, nombre=nombre, activo=True)
            db.add(empresa)
            try:
                db.commit()
                db.refresh(empresa)
            except Exception:
                # Otro worker la creó en paralelo: la recuperamos.
                db.rollback()
                empresa = db.query(Empresa).filter(
                    Empresa.slug == slug
                ).first()
                if not empresa:
                    return

        existe_admin = db.query(Usuario).filter(
            Usuario.empresa_id == empresa.id,
            Usuario.username == admin_user,
        ).first()

        if not existe_admin:
            db.add(
                Usuario(
                    empresa_id=empresa.id,
                    username=admin_user,
                    password_hash=_hash_password(admin_pass),
                    nombre="Administrador",
                    activo=True,
                )
            )
            try:
                db.commit()
            except Exception:
                # Carrera: otro worker insertó el mismo admin. OK, ya está.
                db.rollback()
    finally:
        db.close()


class LoginSchema(BaseModel):
    # Opcional: si no se envía, el backend intenta login de super-admin
    # (es_super_admin=True) por username solo. Si se envía, login normal
    # de empresa + username.
    empresa: Optional[str] = None
    username: str
    password: str


def require_token(authorization: str = Header(default="")) -> dict:
    """Valida el token Bearer y devuelve el contexto de sesión (dict con
    empresa_id, empresa_slug, usuario_id, username, es_super_admin)."""
    scheme, _, token = authorization.partition(" ")

    if scheme.lower() != "bearer" or token not in _active_tokens:
        raise HTTPException(
            status_code=401,
            detail="No autorizado",
        )

    return _active_tokens[token]


def get_empresa_id(ctx: dict = Depends(require_token)) -> int:
    """Dependencia conveniente para extraer el `empresa_id` del token."""
    return ctx["empresa_id"]


def require_super_admin(ctx: dict = Depends(require_token)) -> dict:
    """Dependencia: solo super-admins globales pueden pasar."""
    if not ctx.get("es_super_admin"):
        raise HTTPException(
            status_code=403,
            detail="Requiere permisos de super-admin",
        )
    return ctx


def _serializar_empresa(e) -> dict:
    return {
        "id": e.id,
        "slug": e.slug,
        "nombre": e.nombre,
        "rut": e.rut,
        "activo": bool(e.activo),
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


@app.post("/login")
def login(data: LoginSchema, db: Session = Depends(get_db)):

    username = data.username.strip()

    if not username:
        raise HTTPException(
            status_code=401,
            detail="Usuario y contraseña son obligatorios",
        )

    empresa_slug = (data.empresa or "").strip().lower()

    if empresa_slug:
        # Flujo normal: usuario de empresa.
        empresa = db.query(Empresa).filter(
            Empresa.slug == empresa_slug
        ).first()

        if not empresa or not empresa.activo:
            raise HTTPException(
                status_code=401,
                detail="Empresa, usuario o contraseña incorrectos",
            )

        usuario = db.query(Usuario).filter(
            Usuario.empresa_id == empresa.id,
            Usuario.username == username,
        ).first()
    else:
        # Login de super-admin: username debe corresponder a un
        # es_super_admin=True global (no atado a empresa).
        usuario = db.query(Usuario).filter(
            Usuario.username == username,
            Usuario.es_super_admin == True,
        ).first()

    if (
        not usuario
        or not usuario.activo
        or not _verify_password(data.password, usuario.password_hash)
    ):
        raise HTTPException(
            status_code=401,
            detail="Usuario o contraseña incorrectos",
        )

    # Carga la empresa asociada (NULL para super-admins).
    empresa = (
        db.query(Empresa).filter(Empresa.id == usuario.empresa_id).first()
        if usuario.empresa_id else None
    )

    token = secrets.token_urlsafe(32)
    _active_tokens[token] = {
        "empresa_id": usuario.empresa_id,
        "empresa_slug": empresa.slug if empresa else None,
        "empresa_nombre": empresa.nombre if empresa else None,
        "usuario_id": usuario.id,
        "username": usuario.username,
        "es_super_admin": bool(usuario.es_super_admin),
    }

    return {
        "token": token,
        "username": usuario.username,
        "nombre": usuario.nombre or usuario.username,
        "es_super_admin": bool(usuario.es_super_admin),
        "empresa": _serializar_empresa(empresa) if empresa else None,
    }


@app.post("/logout")
def logout(authorization: str = Header(default="")):
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() == "bearer":
        _active_tokens.pop(token, None)
    return {"message": "Sesión cerrada"}


@app.get("/me")
def me(ctx: dict = Depends(require_token)):
    return {
        "username": ctx["username"],
        "empresa": {
            "id": ctx["empresa_id"],
            "slug": ctx["empresa_slug"],
            "nombre": ctx["empresa_nombre"],
        }
    }


# =========================
# SCHEMAS
# =========================

class PlanificacionSchema(BaseModel):

    trabajador_id: int

    responsable: str

    fecha: str

    turno: str

    horas: float


class PlanificacionLoteSchema(BaseModel):

    asignaciones: list[PlanificacionSchema]


class TrabajadorSchema(BaseModel):

    rut: str

    nombre: str

    area: Optional[str] = None

    jornada: Optional[int] = None

    responsable: Optional[str] = None

    ceco: Optional[str] = None

    cargo: Optional[str] = None

    es_responsable: Optional[bool] = False

    activo: Optional[bool] = True

    turno_rotativo: Optional[bool] = True


# Schema para PUT /trabajadores/{id}/turnos-fijos. Reemplaza por completo
# la lista: el frontend envía el set completo cada vez, así no hay que
# trackear diffs de inserts/updates/deletes.
class TrabajadorTurnoFijoItem(BaseModel):

    dia_semana: int

    turno: str


class TrabajadorTurnoFijoLoteSchema(BaseModel):

    turnos: list[TrabajadorTurnoFijoItem]


class CoberturaSchema(BaseModel):

    tipo: str

    valor: str

    dia_semana: int

    hora_inicio: str

    hora_fin: str

    minimo_inicio: int = 1

    minimo_fin: int = 1

    activo: Optional[bool] = True


def _serializar_trabajador(t: Trabajador) -> dict:
    return {
        "id": t.id,
        "rut": t.rut,
        "nombre": t.nombre,
        "area": t.area,
        "jornada": t.jornada,
        "responsable": t.responsable,
        "ceco": t.ceco,
        "cargo": t.cargo or "Sin cargo",
        "es_responsable": bool(t.es_responsable),
        "activo": True if t.activo is None else bool(t.activo),
        "turno_rotativo": True if t.turno_rotativo is None else bool(t.turno_rotativo),
        "turnos_fijos": [
            {
                "dia_semana": tf.dia_semana,
                "turno": tf.turno
            }
            for tf in (t.turnos_fijos or [])
        ],
    }


def _normalizar_cobertura(data: CoberturaSchema) -> dict:
    tipo = data.tipo.strip().lower()

    if tipo not in {"ceco", "area", "cargo"}:
        raise HTTPException(
            status_code=422,
            detail="El tipo debe ser 'ceco', 'area' o 'cargo'",
        )

    valor = data.valor.strip()

    if not valor:
        raise HTTPException(
            status_code=422,
            detail="Debe indicar el área, CECO o cargo a cubrir",
        )

    if data.dia_semana < 0 or data.dia_semana > 6:
        raise HTTPException(
            status_code=422,
            detail="El día debe estar entre 0 (lunes) y 6 (domingo)",
        )

    if data.minimo_inicio < 1 or data.minimo_fin < 1:
        raise HTTPException(
            status_code=422,
            detail="Los mínimos de inicio y fin deben ser mayores a cero",
        )

    patron_hora = re.compile(r"^([01]?\d|2[0-3]):[0-5]\d$")

    if (
        not patron_hora.match(data.hora_inicio.strip())
        or not patron_hora.match(data.hora_fin.strip())
    ):
        raise HTTPException(
            status_code=422,
            detail="Las horas deben tener formato HH:MM",
        )

    return {
        "tipo": tipo,
        "valor": valor,
        "dia_semana": data.dia_semana,
        "hora_inicio": data.hora_inicio.strip(),
        "hora_fin": data.hora_fin.strip(),
        "minimo_inicio": data.minimo_inicio,
        "minimo_fin": data.minimo_fin,
        # Se conserva por compatibilidad: refleja el mayor de ambos puntos.
        "minimo_personas": max(data.minimo_inicio, data.minimo_fin),
        "activo": bool(data.activo),
    }


def _serializar_cobertura(c: ConfiguracionCobertura) -> dict:
    return {
        "id": c.id,
        "tipo": c.tipo,
        "valor": c.valor,
        "dia_semana": c.dia_semana,
        "hora_inicio": c.hora_inicio,
        "hora_fin": c.hora_fin,
        "minimo_inicio": c.minimo_inicio,
        "minimo_fin": c.minimo_fin,
        "minimo_personas": c.minimo_personas,
        "activo": bool(c.activo),
    }


class ColacionSchema(BaseModel):

    ceco: str

    minutos: int = 30


def _normalizar_colacion(data: ColacionSchema) -> dict:
    ceco = (data.ceco or "").strip()

    if not ceco:
        raise HTTPException(
            status_code=422,
            detail="Debe indicar el CECO al que aplica la colación",
        )

    if data.minutos < 0 or data.minutos > 480:
        raise HTTPException(
            status_code=422,
            detail="Los minutos de colación deben estar entre 0 y 480",
        )

    return {"ceco": ceco, "minutos": data.minutos}


def _serializar_colacion(c: ConfiguracionColacion) -> dict:
    return {
        "id": c.id,
        "ceco": c.ceco,
        "minutos": c.minutos,
    }


class TurnoFrecuenteSchema(BaseModel):

    ceco: str

    turno: str


def _normalizar_turno_frecuente(data: TurnoFrecuenteSchema) -> dict:
    ceco = (data.ceco or "").strip().lower()
    turno = (data.turno or "").strip()

    if not ceco:
        raise HTTPException(
            status_code=422,
            detail="Debe indicar el CECO al que aplica el turno",
        )

    if not re.fullmatch(
        r"([01]\d|2[0-3]):[0-5]\d - ([01]\d|2[0-3]):[0-5]\d",
        turno,
    ):
        raise HTTPException(
            status_code=422,
            detail="El turno debe tener formato HH:MM - HH:MM",
        )

    return {"ceco": ceco, "turno": turno}


def _serializar_turno_frecuente(turno: TurnoFrecuente) -> dict:
    return {
        "id": turno.id,
        "ceco": turno.ceco,
        "turno": turno.turno,
    }


# =========================
# GET TRABAJADORES
# =========================

@app.get("/trabajadores")
def obtener_trabajadores(
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):

    trabajadores = db.query(Trabajador).filter(
        Trabajador.empresa_id == empresa_id
    ).all()

    return [_serializar_trabajador(t) for t in trabajadores]


# =========================
# CREAR TRABAJADOR
# =========================

@app.post("/trabajadores")
def crear_trabajador(
    data: TrabajadorSchema,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):

    nuevo = Trabajador(
        empresa_id=empresa_id,
        rut=data.rut.strip(),
        nombre=data.nombre.strip(),
        area=(data.area or "").strip(),
        jornada=data.jornada,
        responsable=(data.responsable or "").strip(),
        ceco=(data.ceco or "").strip(),
        cargo=(data.cargo or "").strip() or "Sin cargo",
        es_responsable=bool(data.es_responsable),
        activo=True if data.activo is None else bool(data.activo),
        turno_rotativo=True if data.turno_rotativo is None else bool(data.turno_rotativo),
    )

    db.add(nuevo)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ya existe un trabajador con ese RUT en esta empresa",
        )

    db.refresh(nuevo)

    return _serializar_trabajador(nuevo)


# =========================
# IMPORTAR TRABAJADORES (carga masiva)
# =========================
# Recibe una lista de trabajadores (típicamente parseada desde un CSV en el
# frontend) y crea solo los que no existan. La validación es por RUT (único):
# los RUT ya presentes en la base —o repetidos dentro del mismo archivo— se
# omiten y se devuelven aparte para informarlos.


@app.post("/trabajadores/importar")
def importar_trabajadores(
    data: list[TrabajadorSchema],
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):

    ruts_existentes = {
        (t.rut or "").strip()
        for t in db.query(Trabajador).filter(
            Trabajador.empresa_id == empresa_id
        ).all()
    }

    creados = []
    omitidos = []
    vistos_en_archivo = set()

    for fila in data:

        rut = (fila.rut or "").strip()

        # Sin RUT o nombre no se puede crear; se omite.
        if not rut or not (fila.nombre or "").strip():
            omitidos.append(rut)
            continue

        # RUT ya en la base o duplicado dentro del mismo archivo.
        if rut in ruts_existentes or rut in vistos_en_archivo:
            omitidos.append(rut)
            continue

        vistos_en_archivo.add(rut)

        db.add(
            Trabajador(
                empresa_id=empresa_id,
                rut=rut,
                nombre=fila.nombre.strip(),
                area=(fila.area or "").strip(),
                jornada=fila.jornada,
                responsable=(fila.responsable or "").strip(),
                ceco=(fila.ceco or "").strip(),
                cargo=(fila.cargo or "").strip() or "Sin cargo",
                es_responsable=bool(fila.es_responsable),
                turno_rotativo=True if fila.turno_rotativo is None else bool(fila.turno_rotativo),
            )
        )

        creados.append(rut)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Error de integridad al importar trabajadores",
        )

    return {
        "creados": len(creados),
        "omitidos": len(omitidos),
        "ruts_creados": creados,
        "ruts_omitidos": omitidos,
    }


# =========================
# ACTUALIZAR TRABAJADOR
# =========================

@app.put("/trabajadores/{trabajador_id}")
def actualizar_trabajador(
    trabajador_id: int,
    data: TrabajadorSchema,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):

    trabajador = db.query(Trabajador).filter(
        Trabajador.id == trabajador_id,
        Trabajador.empresa_id == empresa_id,
    ).first()

    if not trabajador:
        raise HTTPException(
            status_code=404,
            detail="Trabajador no encontrado",
        )

    trabajador.rut = data.rut.strip()
    trabajador.nombre = data.nombre.strip()
    trabajador.area = (data.area or "").strip()
    trabajador.jornada = data.jornada
    trabajador.responsable = (data.responsable or "").strip()
    trabajador.ceco = (data.ceco or "").strip()
    trabajador.cargo = (data.cargo or "").strip() or "Sin cargo"
    trabajador.es_responsable = bool(data.es_responsable)

    if data.activo is not None:
        trabajador.activo = bool(data.activo)

    if data.turno_rotativo is not None:
        trabajador.turno_rotativo = bool(data.turno_rotativo)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ya existe un trabajador con ese RUT en esta empresa",
        )

    db.refresh(trabajador)

    return _serializar_trabajador(trabajador)


# =========================
# ELIMINAR TRABAJADOR
# =========================

@app.delete("/trabajadores/{trabajador_id}")
def eliminar_trabajador(
    trabajador_id: int,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):

    trabajador = db.query(Trabajador).filter(
        Trabajador.id == trabajador_id,
        Trabajador.empresa_id == empresa_id,
    ).first()

    if not trabajador:
        raise HTTPException(
            status_code=404,
            detail="Trabajador no encontrado",
        )

    # Borra también su planificación. Se hace explícito porque las bases de
    # datos creadas antes de añadir la FK no aplican el ON DELETE CASCADE.
    db.query(Planificacion).filter(
        Planificacion.trabajador_id == trabajador_id
    ).delete(synchronize_session=False)

    db.delete(trabajador)
    db.commit()

    return {"message": "Trabajador eliminado"}


# =========================
# TURNOS FIJOS POR DÍA
# =========================
# Un trabajador fijo puede tener un turno distinto según el día de la semana
# (lunes "09:00 - 18:30", martes "16:30 - 03:00", …). El modelo es 1-a-N en
# `trabajador_turnos_fijos`: el frontend hace PUT con la lista completa y el
# backend reemplaza los registros (no hay diffs de insert/update/delete).

_PATRON_TURNO = re.compile(
    r"^([01]\d|2[0-3]):[0-5]\d\s-\s([01]\d|2[0-3]):[0-5]\d$"
)

_DIAS_SEMANA_VALIDOS = {0, 1, 2, 3, 4, 5, 6}


def _validar_turno_fijo(item: TrabajadorTurnoFijoItem):

    if item.dia_semana not in _DIAS_SEMANA_VALIDOS:
        raise HTTPException(
            status_code=422,
            detail=f"día_semana inválido: {item.dia_semana} "
                   "(debe ser 0=Lunes … 6=Domingo)",
        )

    turno = (item.turno or "").strip()

    if turno and not _PATRON_TURNO.match(turno):
        raise HTTPException(
            status_code=422,
            detail=f"turno inválido para el día {item.dia_semana}: "
                   f"'{item.turno}'. Use el formato 'HH:MM - HH:MM'.",
        )

    return turno or None


@app.get("/trabajadores/{trabajador_id}/turnos-fijos")
def obtener_turnos_fijos_trabajador(
    trabajador_id: int,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):

    trabajador = db.query(Trabajador).filter(
        Trabajador.id == trabajador_id,
        Trabajador.empresa_id == empresa_id,
    ).first()

    if not trabajador:
        raise HTTPException(
            status_code=404,
            detail="Trabajador no encontrado",
        )

    return [
        {
            "dia_semana": tf.dia_semana,
            "turno": tf.turno
        }
        for tf in trabajador.turnos_fijos
    ]


@app.put("/trabajadores/{trabajador_id}/turnos-fijos")
def reemplazar_turnos_fijos_trabajador(
    trabajador_id: int,
    data: TrabajadorTurnoFijoLoteSchema,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):

    trabajador = db.query(Trabajador).filter(
        Trabajador.id == trabajador_id,
        Trabajador.empresa_id == empresa_id,
    ).first()

    if not trabajador:
        raise HTTPException(
            status_code=404,
            detail="Trabajador no encontrado",
        )

    # Normaliza y valida cada item; descartar entradas con turno vacío para
    # soportar "limpiar el día" desde la UI.
    nuevos = []

    for item in data.turnos:

        turno_norm = _validar_turno_fijo(item)

        if not turno_norm:
            continue

        nuevos.append({
            "dia_semana": item.dia_semana,
            "turno": turno_norm
        })

    # Reemplazo completo: borramos los existentes y creamos los nuevos. El
    # cascade="all, delete-orphan" de la relationship también los eliminaría
    # al resetear la colección, pero hacerlo explícito es más claro.
    db.query(TrabajadorTurnoFijo).filter(
        TrabajadorTurnoFijo.trabajador_id == trabajador_id
    ).delete(synchronize_session=False)

    for item in nuevos:
        db.add(
            TrabajadorTurnoFijo(
                empresa_id=empresa_id,
                trabajador_id=trabajador_id,
                dia_semana=item["dia_semana"],
                turno=item["turno"],
            )
        )

    db.commit()

    return {
        "turnos_fijos": nuevos
    }


# =========================
# POST PLANIFICACION
# =========================

@app.post("/planificacion")
def guardar_planificacion(
    data: PlanificacionSchema,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):

    # Verifica que el trabajador pertenece a la empresa.
    trab = db.query(Trabajador).filter(
        Trabajador.id == data.trabajador_id,
        Trabajador.empresa_id == empresa_id,
    ).first()
    if not trab:
        raise HTTPException(
            status_code=404,
            detail="Trabajador no encontrado",
        )

    registro = db.query(Planificacion).filter(
        Planificacion.trabajador_id == data.trabajador_id,
        Planificacion.fecha == data.fecha,
    ).first()

    if registro:

        registro.turno = data.turno
        registro.horas = data.horas
        registro.empresa_id = empresa_id  # sincroniza por si quedó NULL

    else:

        nuevo = Planificacion(
            empresa_id=empresa_id,
            trabajador_id=data.trabajador_id,
            responsable=data.responsable,
            fecha=data.fecha,
            turno=data.turno,
            horas=data.horas,
        )

        db.add(nuevo)

    try:
        db.commit()
    except IntegrityError:
        # Carrera entre dos guardados simultáneos: reintenta como update.
        db.rollback()
        registro = db.query(Planificacion).filter(
            Planificacion.trabajador_id == data.trabajador_id,
            Planificacion.fecha == data.fecha,
        ).first()
        if registro:
            registro.turno = data.turno
            registro.horas = data.horas
            db.commit()

    return {"message": "Guardado correctamente"}


@app.post("/planificacion/lote")
def guardar_planificacion_lote(
    data: PlanificacionLoteSchema,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):

    claves = [
        (asignacion.trabajador_id, asignacion.fecha)
        for asignacion in data.asignaciones
    ]

    if len(claves) != len(set(claves)):
        raise HTTPException(
            status_code=400,
            detail="La propuesta contiene asignaciones duplicadas",
        )

    # Verifica que todos los trabajadores pertenezcan a la empresa.
    trabajadores_ids = {a.trabajador_id for a in data.asignaciones}
    existentes = {
        t.id for t in
        db.query(Trabajador).filter(
            Trabajador.empresa_id == empresa_id,
            Trabajador.id.in_(trabajadores_ids),
        ).all()
    }
    if not existentes.issuperset(trabajadores_ids):
        raise HTTPException(
            status_code=404,
            detail="Uno o más trabajadores no existen en esta empresa",
        )

    for asignacion in data.asignaciones:

        registro = db.query(Planificacion).filter(
            Planificacion.trabajador_id == asignacion.trabajador_id,
            Planificacion.fecha == asignacion.fecha,
        ).first()

        if registro:
            registro.responsable = asignacion.responsable
            registro.turno = asignacion.turno
            registro.horas = asignacion.horas
            registro.empresa_id = empresa_id
        else:
            db.add(
                Planificacion(
                    empresa_id=empresa_id,
                    trabajador_id=asignacion.trabajador_id,
                    responsable=asignacion.responsable,
                    fecha=asignacion.fecha,
                    turno=asignacion.turno,
                    horas=asignacion.horas,
                )
            )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="La planificación cambió mientras se aprobaba la propuesta",
        )

    return {
        "message": "Propuesta aplicada correctamente",
        "asignaciones_guardadas": len(data.asignaciones),
    }


# =========================
# GET PLANIFICACION
# =========================

@app.get("/planificacion")
def obtener_planificacion(
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):

    registros = db.query(Planificacion).filter(
        Planificacion.empresa_id == empresa_id
    ).all()

    return [
        {
            "trabajador_id": r.trabajador_id,
            "responsable": r.responsable,
            "fecha": r.fecha,
            "turno": r.turno,
            "horas": r.horas,
        }
        for r in registros
    ]


# =========================
# CONFIGURACIÓN COBERTURA
# =========================

@app.get("/cobertura/config")
def obtener_configuracion_cobertura(
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):

    reglas = db.query(ConfiguracionCobertura).filter(
        ConfiguracionCobertura.empresa_id == empresa_id
    ).order_by(
        ConfiguracionCobertura.tipo,
        ConfiguracionCobertura.valor,
        ConfiguracionCobertura.dia_semana,
        ConfiguracionCobertura.hora_inicio,
    ).all()

    return [_serializar_cobertura(r) for r in reglas]


@app.post("/cobertura/config")
def crear_configuracion_cobertura(
    data: CoberturaSchema,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):

    valores = _normalizar_cobertura(data)
    valores["empresa_id"] = empresa_id

    regla = ConfiguracionCobertura(**valores)

    db.add(regla)
    db.commit()
    db.refresh(regla)

    return _serializar_cobertura(regla)


@app.put("/cobertura/config/{regla_id}")
def actualizar_configuracion_cobertura(
    regla_id: int,
    data: CoberturaSchema,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):

    regla = db.query(ConfiguracionCobertura).filter(
        ConfiguracionCobertura.id == regla_id,
        ConfiguracionCobertura.empresa_id == empresa_id,
    ).first()

    if not regla:
        raise HTTPException(
            status_code=404,
            detail="Regla de cobertura no encontrada",
        )

    valores = _normalizar_cobertura(data)

    for campo, valor in valores.items():
        setattr(regla, campo, valor)

    db.commit()
    db.refresh(regla)

    return _serializar_cobertura(regla)


@app.delete("/cobertura/config/{regla_id}")
def eliminar_configuracion_cobertura(
    regla_id: int,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):

    regla = db.query(ConfiguracionCobertura).filter(
        ConfiguracionCobertura.id == regla_id,
        ConfiguracionCobertura.empresa_id == empresa_id,
    ).first()

    if not regla:
        raise HTTPException(
            status_code=404,
            detail="Regla de cobertura no encontrada",
        )

    db.delete(regla)
    db.commit()

    return {"message": "Regla eliminada"}


# =========================
# CONFIGURACIÓN COLACIÓN
# =========================
# Minutos de colación a descontar por CECO. Si un CECO no está configurado,
# el frontend cae a su regla por defecto (60 min seguridad / 30 min resto).


@app.get("/colacion/config")
def obtener_configuracion_colacion(
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):

    reglas = db.query(ConfiguracionColacion).filter(
        ConfiguracionColacion.empresa_id == empresa_id
    ).order_by(
        ConfiguracionColacion.ceco,
    ).all()

    return [_serializar_colacion(r) for r in reglas]


@app.post("/colacion/config")
def guardar_configuracion_colacion(
    data: ColacionSchema,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):

    valores = _normalizar_colacion(data)
    valores["empresa_id"] = empresa_id

    # Un CECO tiene un solo valor: si ya existe se actualiza (upsert).
    regla = db.query(ConfiguracionColacion).filter(
        ConfiguracionColacion.empresa_id == empresa_id,
        ConfiguracionColacion.ceco == valores["ceco"],
    ).first()

    if regla:
        regla.minutos = valores["minutos"]
    else:
        regla = ConfiguracionColacion(**valores)
        db.add(regla)

    db.commit()
    db.refresh(regla)

    return _serializar_colacion(regla)


@app.delete("/colacion/config/{regla_id}")
def eliminar_configuracion_colacion(
    regla_id: int,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):

    regla = db.query(ConfiguracionColacion).filter(
        ConfiguracionColacion.id == regla_id,
        ConfiguracionColacion.empresa_id == empresa_id,
    ).first()

    if not regla:
        raise HTTPException(
            status_code=404,
            detail="Configuración de colación no encontrada",
        )

    db.delete(regla)
    db.commit()

    return {"message": "Configuración eliminada"}


# =========================
# TURNOS FRECUENTES POR CECO
# =========================

@app.get("/turnos-frecuentes")
def obtener_turnos_frecuentes(
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):
    turnos = db.query(TurnoFrecuente).filter(
        TurnoFrecuente.empresa_id == empresa_id
    ).order_by(
        TurnoFrecuente.ceco,
        TurnoFrecuente.turno,
    ).all()

    return [_serializar_turno_frecuente(turno) for turno in turnos]


@app.post("/turnos-frecuentes")
def crear_turno_frecuente(
    data: TurnoFrecuenteSchema,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):
    valores = _normalizar_turno_frecuente(data)

    ceco_existe = db.query(Trabajador.id).filter(
        Trabajador.empresa_id == empresa_id,
        Trabajador.ceco == valores["ceco"],
    ).first()

    if not ceco_existe:
        # Comparación retrocompatible: la base puede tener CECO en cualquier
        # capitalización (HABITACIONES, Restaurante 5 (Patay), etc.). Si el
        # admin lo escribe con otra mezcla de mayúsculas pero coincide
        # ignorando case, lo aceptamos. Igual seguimos rechazando typos reales
        # (CECO que no está en ningún trabajador de la empresa).
        ceco_lower = valores["ceco"].lower()
        ceco_existe = db.query(Trabajador.id).filter(
            Trabajador.empresa_id == empresa_id,
            Trabajador.ceco.ilike(ceco_lower),
        ).first()

    if not ceco_existe:
        # Último fallback: comparar ignorando acentos. SQLite no trae
        # `unaccent` built-in y PyInstaller/uvicorn no garantizan ICU
        # cargado, así que bajamos los candidatos por `LOWER(ceco) == ?`
        # (que ya captura mismo case tras .lower()) y validamos en Python
        # colapsando marcas diacríticas. Esto cubre el caso clásico en
        # planillas importadas: CECO almacenado como "CONTABILIDAD/FINANZAS
        # Y CONTROL DE GESTIÓN" (Ó mayúscula acentuada) mientras el admin
        # lo reenvía como "CONTABILIDAD/FINANZAS Y CONTROL DE GESTIÓN" o
        # "contabilidad/finanzas y control de gestión".
        def _colapsar(texto):
            return "".join(
                caracter
                for caracter in unicodedata.normalize("NFD", texto.lower())
                if unicodedata.category(caracter) != "Mn"
            ).strip()

        ceco_objetivo = _colapsar(valores["ceco"])
        candidatos = db.query(Trabajador.ceco).filter(
            Trabajador.empresa_id == empresa_id,
            Trabajador.ceco.isnot(None),
        ).all()
        ceco_existe = any(
            _colapsar(fila[0]) == ceco_objetivo for fila in candidatos
        )

    if not ceco_existe:
        raise HTTPException(
            status_code=422,
            detail="El CECO no existe entre los trabajadores de la empresa",
        )

    nuevo = TurnoFrecuente(
        empresa_id=empresa_id,
        **valores,
    )
    db.add(nuevo)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ese turno ya está configurado para el CECO",
        )

    db.refresh(nuevo)
    return _serializar_turno_frecuente(nuevo)


@app.delete("/turnos-frecuentes/{turno_id}")
def eliminar_turno_frecuente(
    turno_id: int,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):
    turno = db.query(TurnoFrecuente).filter(
        TurnoFrecuente.id == turno_id,
        TurnoFrecuente.empresa_id == empresa_id,
    ).first()

    if not turno:
        raise HTTPException(
            status_code=404,
            detail="Turno frecuente no encontrado",
        )

    db.delete(turno)
    db.commit()
    return {"message": "Turno frecuente eliminado"}


# =========================
# USUARIOS (gestión, requiere sesión)
# =========================


class UsuarioCrearSchema(BaseModel):
    username: str
    password: str
    nombre: Optional[str] = None
    activo: Optional[bool] = True


class UsuarioActualizarSchema(BaseModel):
    nombre: Optional[str] = None
    activo: Optional[bool] = None
    # Si viene, se cambia la contraseña; si no, se conserva.
    password: Optional[str] = None


def _serializar_usuario(u: Usuario) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "nombre": u.nombre or u.username,
        "activo": bool(u.activo),
    }


@app.get("/usuarios")
def listar_usuarios(
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):
    usuarios = db.query(Usuario).filter(
        Usuario.empresa_id == empresa_id
    ).order_by(Usuario.username).all()
    return [_serializar_usuario(u) for u in usuarios]


@app.post("/usuarios")
def crear_usuario(
    data: UsuarioCrearSchema,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):
    username = data.username.strip()

    if not username or not data.password:
        raise HTTPException(
            status_code=422,
            detail="Usuario y contraseña son obligatorios",
        )

    nuevo = Usuario(
        empresa_id=empresa_id,
        username=username,
        password_hash=_hash_password(data.password),
        nombre=(data.nombre or "").strip() or username,
        activo=bool(data.activo),
    )

    db.add(nuevo)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ya existe un usuario con ese nombre en esta empresa",
        )

    db.refresh(nuevo)

    return _serializar_usuario(nuevo)


@app.put("/usuarios/{usuario_id}")
def actualizar_usuario(
    usuario_id: int,
    data: UsuarioActualizarSchema,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):
    usuario = db.query(Usuario).filter(
        Usuario.id == usuario_id,
        Usuario.empresa_id == empresa_id,
    ).first()

    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if data.nombre is not None:
        usuario.nombre = data.nombre.strip() or usuario.username

    if data.activo is not None:
        usuario.activo = bool(data.activo)

    if data.password:
        usuario.password_hash = _hash_password(data.password)

    db.commit()
    db.refresh(usuario)

    return _serializar_usuario(usuario)


@app.delete("/usuarios/{usuario_id}")
def eliminar_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):
    usuario = db.query(Usuario).filter(
        Usuario.id == usuario_id,
        Usuario.empresa_id == empresa_id,
    ).first()

    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Evita quedarse sin ningún usuario (bloqueo total de la empresa).
    count_empresa = db.query(Usuario).filter(
        Usuario.empresa_id == empresa_id
    ).count()
    if count_empresa <= 1:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar el último usuario de la empresa",
        )

    db.delete(usuario)
    db.commit()

    return {"message": "Usuario eliminado"}


# =========================
# SERVIR FRONTEND
# =========================

frontend_path = Path(__file__).parent.parent / "frontend"

# Lista de empresas activas (público, sin auth, para poblar el select del
# login). Expone solo slug + nombre — sin info sensible.
@app.get("/empresas")
def listar_empresas_activas(db: Session = Depends(get_db)):

    empresas = db.query(Empresa).filter(
        Empresa.activo == True
    ).order_by(Empresa.nombre).all()

    return [
        {
            "id": e.id,
            "slug": e.slug,
            "nombre": e.nombre,
        }
        for e in empresas
    ]


# ============================================================================
# SUPER-ADMIN: gestión multi-empresa
# ============================================================================
# Solo accesible a usuarios con `es_super_admin=True` (no atados a ninguna
# empresa). Permite listar, crear, editar y activar/desactivar empresas.
# NO da acceso a datos de otras empresas (no impersona usuarios).

def _generar_password_aleatoria(longitud: int = 16) -> str:
    """Genera una contraseña aleatoria segura (16 chars por defecto).

    Usa `secrets.choice` sobre un alfabeto sin caracteres ambiguos
    (sin 0/O, 1/l/I) para que sea legible de dictar o transcribir.
    El retorno es la contraseña en claro: el backend la hashea antes
    de persistir y la devuelve UNA sola vez al super-admin para que
    se la entregue al cliente."""
    alfabeto = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alfabeto) for _ in range(longitud))


class EmpresaCreateSchema(BaseModel):
    slug: str
    nombre: str
    rut: Optional[str] = None
    activo: bool = True
    # Credenciales del primer administrador de la empresa. Si no se
    # envían, se autogeneran y se devuelven en la respuesta para que
    # el super-admin se las entregue al cliente. Esto resuelve el
    # problema de "creé la empresa pero no puedo entrar a administrarla".
    admin_username: Optional[str] = None
    admin_password: Optional[str] = None
    admin_nombre: Optional[str] = None


class EmpresaUpdateSchema(BaseModel):
    nombre: Optional[str] = None
    rut: Optional[str] = None
    activo: Optional[bool] = None


@app.get("/superadmin/empresas")
def listar_todas_empresas(
    db: Session = Depends(get_db),
    _: dict = Depends(require_super_admin),
):

    empresas = db.query(Empresa).order_by(Empresa.nombre).all()
    return [_serializar_empresa(e) for e in empresas]


@app.post("/superadmin/empresas")
def crear_empresa(
    data: EmpresaCreateSchema,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_super_admin),
):

    slug = data.slug.strip().lower()
    if not slug:
        raise HTTPException(status_code=422, detail="slug es obligatorio")

    if db.query(Empresa).filter(Empresa.slug == slug).first():
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe una empresa con slug '{slug}'",
        )

    nueva = Empresa(
        slug=slug,
        nombre=data.nombre.strip(),
        rut=(data.rut or "").strip() or None,
        activo=bool(data.activo),
    )
    db.add(nueva)

    # Resolvemos credenciales del primer administrador. Si el cliente
    # no las manda, las autogeneramos. La contraseña en claro se
    # devuelve UNA sola vez en la respuesta.
    admin_username = (data.admin_username or "").strip() or f"admin-{slug}"
    admin_password = (data.admin_password or "").strip() or _generar_password_aleatoria()
    admin_nombre = (data.admin_nombre or "").strip() or "Administrador"

    try:
        db.flush()  # obtiene nueva.id antes de crear el Usuario (FK)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Error de unicidad al crear")

    # Validamos unicidad POR EMPRESA (el índice unique es compuesto
    # (empresa_id, username)). Como la empresa es nueva, ningún usuario
    # puede existir todavía para ella — la verificación es por defensa.
    username_en_uso = db.query(Usuario).filter(
        Usuario.empresa_id == nueva.id,
        Usuario.username == admin_username,
    ).first()
    if username_en_uso:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=(
                f"Ya existe un usuario con username '{admin_username}' "
                f"en esta empresa."
            ),
        )

    nuevo_admin = Usuario(
        empresa_id=nueva.id,
        username=admin_username,
        password_hash=_hash_password(admin_password),
        nombre=admin_nombre,
        activo=True,
        es_super_admin=False,
    )
    db.add(nuevo_admin)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Error de unicidad al crear")
    db.refresh(nueva)

    respuesta = _serializar_empresa(nueva)
    # Devolvemos las credenciales en claro SOLO en esta respuesta.
    # El backend nunca más las vuelve a emitir: si se pierden, el
    # super-admin debe resetear la contraseña desde el panel de
    # usuarios de esa empresa.
    respuesta["admin"] = {
        "username": admin_username,
        "password_generada": admin_password,
        "nombre": admin_nombre,
        "entregada": data.admin_password is None,
    }

    _registrar_audit(
        db,
        actor=ctx,
        accion="crear_empresa",
        empresa_id=nueva.id,
        detalle=f"slug='{slug}' admin='{admin_username}'",
    )

    return respuesta


@app.patch("/superadmin/empresas/{empresa_id}")
def actualizar_empresa(
    empresa_id: int,
    data: EmpresaUpdateSchema,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_super_admin),
):

    e = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    cambios = []
    if data.nombre is not None:
        e.nombre = data.nombre.strip()
        cambios.append("nombre")
    if data.rut is not None:
        e.rut = data.rut.strip() or None
        cambios.append("rut")
    if data.activo is not None:
        e.activo = bool(data.activo)
        cambios.append(f"activo={e.activo}")

    db.commit()
    db.refresh(e)

    if cambios:
        _registrar_audit(
            db,
            actor=ctx,
            accion="actualizar_empresa",
            empresa_id=empresa_id,
            detalle=f"cambios=[{', '.join(cambios)}]",
        )

    return _serializar_empresa(e)


@app.post("/superadmin/empresas/{empresa_id}/toggle-activo")
def toggle_empresa_activa(
    empresa_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_super_admin),
):

    e = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    e.activo = not bool(e.activo)
    db.commit()
    db.refresh(e)

    _registrar_audit(
        db,
        actor=ctx,
        accion="toggle_empresa",
        empresa_id=empresa_id,
        detalle=f"activo={e.activo}",
    )

    return _serializar_empresa(e)


# =====================================================
# SUPERADMIN: borrar la base de trabajadores de una empresa
# =====================================================
# Acción DESTRUCTIVA: elimina TODOS los trabajadores de una empresa,
# junto con sus turnos fijos y turnos planificados (las FK tienen
# `ondelete=CASCADE`, así que la base queda limpia en una sola
# sentencia). La empresa y sus usuarios NO se tocan.
#
# Pensado para el caso "cargué el CSV equivocado" o "el cliente quiere
# empezar de cero". Por eso el endpoint exige confirmación en el
# frontend (el super-admin debe escribir el slug) y deja huella en
# el audit log con la cantidad eliminada.

@app.delete("/superadmin/empresas/{empresa_id}/trabajadores")
def eliminar_trabajadores_empresa(
    empresa_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_super_admin),
):

    e = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    # Contamos antes de borrar para devolver cuántas filas se eliminaron
    # y dejar el detalle exacto en el audit log.
    n_trabajadores = db.query(Trabajador).filter(
        Trabajador.empresa_id == empresa_id,
    ).count()

    if n_trabajadores == 0:
        # No es error: la empresa existe pero ya no tiene trabajadores.
        # Devolvemos 200 con eliminados=0 para que el frontend no alarme.
        return {"ok": True, "eliminados": 0, "empresa_id": empresa_id}

    # Borrado en bloque. El ORM traduce esto a un DELETE ... WHERE
    # empresa_id = :id, y las FK con ondelete="CASCADE" se encargan de
    # trabajador_turnos_fijos y planificacion.
    db.query(Trabajador).filter(
        Trabajador.empresa_id == empresa_id,
    ).delete(synchronize_session=False)
    db.commit()

    _registrar_audit(
        db,
        actor=ctx,
        accion="borrar_trabajadores_empresa",
        empresa_id=empresa_id,
        detalle=f"eliminados={n_trabajadores}",
    )

    return {
        "ok": True,
        "eliminados": n_trabajadores,
        "empresa_id": empresa_id,
    }


# =====================================================
# SUPERADMIN: stats por empresa + gestión de usuarios
# =====================================================
# Endpoints adicionales para que el panel SaaS Admin pueda:
#   - Ver estadísticas rápidas por empresa (cantidad de usuarios,
#     trabajadores, turnos fijos).
#   - Gestionar los usuarios de cualquier empresa SIN tener que
#     entrar a la empresa (login con esa empresa + gestión).
#   - Consultar el audit log reciente del propio super-admin.
#
# Todos requieren require_super_admin (no impersonan usuarios).


@app.get("/superadmin/empresas/{empresa_id}/stats")
def stats_empresa(
    empresa_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(require_super_admin),
):

    e = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    n_usuarios = db.query(Usuario).filter(Usuario.empresa_id == empresa_id).count()
    n_usuarios_activos = db.query(Usuario).filter(
        Usuario.empresa_id == empresa_id,
        Usuario.activo == True,
    ).count()
    n_trabajadores = db.query(Trabajador).filter(Trabajador.empresa_id == empresa_id).count()
    n_trabajadores_activos = db.query(Trabajador).filter(
        Trabajador.empresa_id == empresa_id,
        Trabajador.activo == True,
    ).count()
    n_turnos_fijos = db.query(TrabajadorTurnoFijo).filter(
        TrabajadorTurnoFijo.empresa_id == empresa_id,
    ).count()

    return {
        "empresa_id": empresa_id,
        "usuarios": n_usuarios,
        "usuarios_activos": n_usuarios_activos,
        "trabajadores": n_trabajadores,
        "trabajadores_activos": n_trabajadores_activos,
        "turnos_fijos": n_turnos_fijos,
    }


# --------- Gestión de usuarios por empresa desde superadmin ---------

class UsuarioEmpresaCreateSchema(BaseModel):
    username: str
    password: str
    nombre: Optional[str] = None
    activo: bool = True


class UsuarioEmpresaUpdateSchema(BaseModel):
    nombre: Optional[str] = None
    activo: Optional[bool] = None
    # Si viene, se cambia la contraseña.
    password: Optional[str] = None


def _serializar_usuario_saas(u: Usuario) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "nombre": u.nombre or u.username,
        "activo": bool(u.activo),
        "empresa_id": u.empresa_id,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


@app.get("/superadmin/empresas/{empresa_id}/usuarios")
def listar_usuarios_empresa(
    empresa_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(require_super_admin),
):

    e = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    usuarios = db.query(Usuario).filter(
        Usuario.empresa_id == empresa_id,
    ).order_by(Usuario.username).all()
    return [_serializar_usuario_saas(u) for u in usuarios]


@app.post("/superadmin/empresas/{empresa_id}/usuarios")
def crear_usuario_en_empresa(
    empresa_id: int,
    data: UsuarioEmpresaCreateSchema,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_super_admin),
):

    e = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    username = data.username.strip()
    if not username or not data.password:
        raise HTTPException(
            status_code=422,
            detail="Usuario y contraseña son obligatorios",
        )

    # Verificamos unicidad POR EMPRESA (no global).
    if db.query(Usuario).filter(
        Usuario.empresa_id == empresa_id,
        Usuario.username == username,
    ).first():
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe un usuario '{username}' en esta empresa",
        )

    nuevo = Usuario(
        empresa_id=empresa_id,
        username=username,
        password_hash=_hash_password(data.password),
        nombre=(data.nombre or "").strip() or username,
        activo=bool(data.activo),
        es_super_admin=False,
    )
    db.add(nuevo)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Error de unicidad al crear")
    db.refresh(nuevo)

    _registrar_audit(
        db,
        actor=ctx,
        accion="crear_usuario",
        empresa_id=empresa_id,
        detalle=f"usuario='{username}'",
    )

    return _serializar_usuario_saas(nuevo)


@app.patch("/superadmin/empresas/{empresa_id}/usuarios/{usuario_id}")
def actualizar_usuario_en_empresa(
    empresa_id: int,
    usuario_id: int,
    data: UsuarioEmpresaUpdateSchema,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_super_admin),
):

    u = db.query(Usuario).filter(
        Usuario.id == usuario_id,
        Usuario.empresa_id == empresa_id,
    ).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado en esta empresa")

    if u.es_super_admin:
        # Defensa: un super-admin global nunca debería aparecer aquí.
        raise HTTPException(status_code=403, detail="No se puede editar un super-admin desde acá")

    cambios = []
    if data.nombre is not None:
        u.nombre = data.nombre.strip() or u.username
        cambios.append("nombre")
    if data.activo is not None:
        u.activo = bool(data.activo)
        cambios.append(f"activo={u.activo}")
    if data.password:
        u.password_hash = _hash_password(data.password)
        cambios.append("password")

    db.commit()
    db.refresh(u)

    _registrar_audit(
        db,
        actor=ctx,
        accion="actualizar_usuario",
        empresa_id=empresa_id,
        detalle=f"usuario='{u.username}' cambios=[{', '.join(cambios) or 'nada'}]",
    )

    return _serializar_usuario_saas(u)


@app.delete("/superadmin/empresas/{empresa_id}/usuarios/{usuario_id}")
def eliminar_usuario_en_empresa(
    empresa_id: int,
    usuario_id: int,
    db: Session = Depends(get_db),
    ctx: dict = Depends(require_super_admin),
):

    u = db.query(Usuario).filter(
        Usuario.id == usuario_id,
        Usuario.empresa_id == empresa_id,
    ).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado en esta empresa")

    if u.es_super_admin:
        raise HTTPException(status_code=403, detail="No se puede eliminar un super-admin desde acá")

    username = u.username
    db.delete(u)
    db.commit()

    _registrar_audit(
        db,
        actor=ctx,
        accion="eliminar_usuario",
        empresa_id=empresa_id,
        detalle=f"usuario='{username}'",
    )

    return {"ok": True}


# --------- Audit log ---------
# El modelo `AuditLog` está definido en backend/models.py. Aquí solo
# tenemos el helper para escribir y el endpoint para leer.


def _registrar_audit(
    db: Session,
    actor: Optional[dict],
    accion: str,
    empresa_id: Optional[int] = None,
    detalle: Optional[str] = None,
):
    """Helper para insertar una fila en audit_log. Falla silenciosa: si
    la tabla no existe (DB anterior a esta migración), no rompe el flujo
    principal."""
    try:
        actor_user = (actor or {}).get("username") if isinstance(actor, dict) else None
        fila = AuditLog(
            actor_username=actor_user,
            accion=accion,
            empresa_id=empresa_id,
            detalle=detalle,
        )
        db.add(fila)
        db.commit()
    except Exception:
        # No queremos que un fallo de audit bloquee la operación principal.
        db.rollback()


def _serializar_audit(fila: AuditLog) -> dict:
    return {
        "id": fila.id,
        "actor": fila.actor_username,
        "accion": fila.accion,
        "empresa_id": fila.empresa_id,
        "detalle": fila.detalle,
        "created_at": fila.created_at.isoformat() if fila.created_at else None,
    }


@app.get("/superadmin/audit")
def listar_audit(
    limit: int = 50,
    db: Session = Depends(get_db),
    _: dict = Depends(require_super_admin),
):
    """Últimas N acciones del super-admin, más recientes primero."""
    filas = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(max(1, min(limit, 200))).all()
    return [_serializar_audit(f) for f in filas]


# --------- Hooks de audit en endpoints existentes ---------
# Para no romper los handlers ya escritos (que devuelven modelos
# Pydantic), instrumentamos las acciones clave con _registrar_audit
# dentro de los propios endpoints. Como ya están definidos arriba,
# los "envolvemos" mediante monkey-patch liviano: redefinimos los
# endpoints para que, además de su lógica original, llamen a
# _registrar_audit. Pero FastAPI no permite redefinir @app.post
# dos veces para la misma ruta. Solución: parchear las funciones
# de los endpoints al arrancar la app. Ver bloque al final de este
# módulo.

@app.get("/")
async def get_index():
    return FileResponse(str(frontend_path / "index.html"))

app.mount("/js", StaticFiles(directory=str(frontend_path / "js")), name="js")
app.mount("/css", StaticFiles(directory=str(frontend_path / "css")), name="css")


# ============================================================================
# FERIADOS
# ============================================================================
# Tabla `feriados` por empresa. El seed inicial (Chile 2025/2026/2027) se
# siembra idempotentemente en _seed_feriados_chile si la tabla esta vacia
# para la empresa. Despues los admins pueden agregar/borrar feriados custom
# por empresa via POST/DELETE /feriados.

class FeriadoSchema(BaseModel):

    # ISO YYYY-MM-DD.
    fecha: str

    nombre: str

    # "civil" | "religioso" | "regional" | "empresa". Solo para UI; la API
    # no valida contra una lista cerrada.
    tipo: str = "empresa"


def _validar_fecha_iso(fecha: str) -> bool:
    """Chequeo rapido del formato YYYY-MM-DD; el seed usa este mismo
    patron asi que cualquier valor invalido falla aca."""
    if not isinstance(fecha, str) or len(fecha) != 10:
        return False
    try:
        from datetime import datetime
        datetime.strptime(fecha, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def _serializar_feriado(f: "Feriado") -> dict:
    return {
        "fecha": f.fecha,
        "nombre": f.nombre,
        "tipo": f.tipo,
    }


@app.get("/feriados")
def obtener_feriados(
    anio: int,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):
    """Lista los feriados de la empresa para el anio dado. El frontend
    cachea el resultado por anio."""

    prefijo = f"{anio:04d}-"
    feriados = db.query(Feriado).filter(
        Feriado.empresa_id == empresa_id,
        Feriado.fecha.startswith(prefijo),
    ).order_by(
        Feriado.fecha,
    ).all()

    return [_serializar_feriado(f) for f in feriados]


@app.post("/feriados")
def crear_o_actualizar_feriado(
    data: FeriadoSchema,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):
    """Upsert por (empresa_id, fecha). Si ya existe un feriado en esa
    fecha para esta empresa, se actualizan nombre y tipo."""

    if not _validar_fecha_iso(data.fecha):
        raise HTTPException(
            status_code=400,
            detail="Fecha invalida. Usa formato YYYY-MM-DD.",
        )

    nombre = (data.nombre or "").strip()
    if not nombre:
        raise HTTPException(
            status_code=400,
            detail="El nombre es obligatorio.",
        )

    tipo = (data.tipo or "empresa").strip().lower()
    if tipo not in ("civil", "religioso", "regional", "empresa"):
        tipo = "empresa"

    existente = db.query(Feriado).filter(
        Feriado.empresa_id == empresa_id,
        Feriado.fecha == data.fecha,
    ).first()

    if existente:
        existente.nombre = nombre
        existente.tipo = tipo
    else:
        db.add(Feriado(
            empresa_id=empresa_id,
            fecha=data.fecha,
            nombre=nombre,
            tipo=tipo,
        ))

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ya existe un feriado en esa fecha.",
        )

    registro = db.query(Feriado).filter(
        Feriado.empresa_id == empresa_id,
        Feriado.fecha == data.fecha,
    ).first()
    return _serializar_feriado(registro)


@app.delete("/feriados/{fecha}")
def eliminar_feriado(
    fecha: str,
    db: Session = Depends(get_db),
    empresa_id: int = Depends(get_empresa_id),
):
    """Borra el feriado de la empresa para esa fecha. Idempotente: si
    no existe, devuelve 204 igual."""

    if not _validar_fecha_iso(fecha):
        raise HTTPException(
            status_code=400,
            detail="Fecha invalida. Usa formato YYYY-MM-DD.",
        )

    feriado = db.query(Feriado).filter(
        Feriado.empresa_id == empresa_id,
        Feriado.fecha == fecha,
    ).first()

    if feriado:
        db.delete(feriado)
        db.commit()

    return {"ok": True}


# ============================================================================
# SEED: feriados oficiales Chile 2025/2026/2027
# ============================================================================
# Se ejecuta una vez al startup. Para cada empresa ya creada, si NO tiene
# ningun feriado sembrado todavia (count == 0) le insertamos la lista
# correspondiente al anio. Es idempotente: si la empresa ya tiene
# feriados custom o el seed ya se sembro, no hace nada.
def _seed_feriados_chile():

    try:
        inspector = inspect(engine)
        if "feriados" not in inspector.get_table_names():
            return
    except Exception:
        return

    with db_migration_lock():
        db = SessionLocal()
        try:
            empresas = db.query(Empresa).filter(
                Empresa.activo == True  # noqa: E712 (SQLAlchemy ORM)
            ).all()

            for empresa in empresas:
                cantidad = db.query(Feriado).filter(
                    Feriado.empresa_id == empresa.id,
                ).count()
                if cantidad > 0:
                    continue

                for anio_actual in (2025, 2026, 2027):
                    for fecha, nombre, tipo in feriados_para_anio(anio_actual):
                        db.add(Feriado(
                            empresa_id=empresa.id,
                            fecha=fecha,
                            nombre=nombre,
                            tipo=tipo,
                        ))

            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
