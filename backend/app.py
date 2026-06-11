import os
import secrets

from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from pydantic import BaseModel
from typing import Optional

from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .database import SessionLocal, engine, Base

from .models import Trabajador
from .models import Planificacion

from pathlib import Path


app = FastAPI()


# =========================
# CREAR TABLAS AL INICIAR
# =========================

@app.on_event("startup")
def crear_tablas():
    Base.metadata.create_all(bind=engine)
    _migrar_columna_es_responsable()


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
# AUTENTICACIÓN (token simple)
# =========================
# La contraseña vive en el backend (variable de entorno ADMIN_PASSWORD).
# Al hacer login se entrega un token aleatorio guardado en memoria; los
# endpoints de escritura lo exigen en la cabecera Authorization: Bearer ...
# Reiniciar el servidor invalida los tokens existentes (aceptable para una
# herramienta interna).

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "casino2026")

_active_tokens: set[str] = set()


class LoginSchema(BaseModel):
    password: str


def require_token(authorization: str = Header(default="")):
    scheme, _, token = authorization.partition(" ")

    if scheme.lower() != "bearer" or token not in _active_tokens:
        raise HTTPException(
            status_code=401,
            detail="No autorizado",
        )

    return token


@app.post("/login")
def login(data: LoginSchema):

    if not secrets.compare_digest(data.password, ADMIN_PASSWORD):
        raise HTTPException(
            status_code=401,
            detail="Contraseña incorrecta",
        )

    token = secrets.token_urlsafe(32)

    _active_tokens.add(token)

    return {"token": token}


# =========================
# SCHEMAS
# =========================

class PlanificacionSchema(BaseModel):

    trabajador_id: int

    responsable: str

    fecha: str

    turno: str

    horas: float


class TrabajadorSchema(BaseModel):

    rut: str

    nombre: str

    area: Optional[str] = None

    jornada: Optional[int] = None

    responsable: Optional[str] = None

    ceco: Optional[str] = None

    es_responsable: Optional[bool] = False


def _serializar_trabajador(t: Trabajador) -> dict:
    return {
        "id": t.id,
        "rut": t.rut,
        "nombre": t.nombre,
        "area": t.area,
        "jornada": t.jornada,
        "responsable": t.responsable,
        "ceco": t.ceco,
        "es_responsable": bool(t.es_responsable),
    }


# =========================
# GET TRABAJADORES
# =========================

@app.get("/trabajadores")
def obtener_trabajadores(db: Session = Depends(get_db)):

    trabajadores = db.query(Trabajador).all()

    return [_serializar_trabajador(t) for t in trabajadores]


# =========================
# CREAR TRABAJADOR
# =========================

@app.post("/trabajadores")
def crear_trabajador(
    data: TrabajadorSchema,
    db: Session = Depends(get_db),
    _: str = Depends(require_token),
):

    nuevo = Trabajador(
        rut=data.rut.strip(),
        nombre=data.nombre.strip(),
        area=(data.area or "").strip(),
        jornada=data.jornada,
        responsable=(data.responsable or "").strip(),
        ceco=(data.ceco or "").strip(),
        es_responsable=bool(data.es_responsable),
    )

    db.add(nuevo)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ya existe un trabajador con ese RUT",
        )

    db.refresh(nuevo)

    return _serializar_trabajador(nuevo)


# =========================
# ACTUALIZAR TRABAJADOR
# =========================

@app.put("/trabajadores/{trabajador_id}")
def actualizar_trabajador(
    trabajador_id: int,
    data: TrabajadorSchema,
    db: Session = Depends(get_db),
    _: str = Depends(require_token),
):

    trabajador = db.query(Trabajador).filter(
        Trabajador.id == trabajador_id
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
    trabajador.es_responsable = bool(data.es_responsable)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ya existe un trabajador con ese RUT",
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
    _: str = Depends(require_token),
):

    trabajador = db.query(Trabajador).filter(
        Trabajador.id == trabajador_id
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
# POST PLANIFICACION
# =========================

@app.post("/planificacion")
def guardar_planificacion(
    data: PlanificacionSchema,
    db: Session = Depends(get_db),
):

    registro = db.query(Planificacion).filter(
        Planificacion.trabajador_id == data.trabajador_id,
        Planificacion.fecha == data.fecha,
    ).first()

    if registro:

        registro.turno = data.turno
        registro.horas = data.horas

    else:

        nuevo = Planificacion(
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


# =========================
# GET PLANIFICACION
# =========================

@app.get("/planificacion")
def obtener_planificacion(db: Session = Depends(get_db)):

    registros = db.query(Planificacion).all()

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
# SERVIR FRONTEND
# =========================

frontend_path = Path(__file__).parent.parent / "frontend"

@app.get("/")
async def get_index():
    return FileResponse(str(frontend_path / "index.html"))

app.mount("/js", StaticFiles(directory=str(frontend_path / "js")), name="js")
app.mount("/css", StaticFiles(directory=str(frontend_path / "css")), name="css")
