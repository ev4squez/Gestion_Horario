import os
import re
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
from .models import ConfiguracionCobertura

from pathlib import Path


app = FastAPI()


# =========================
# CREAR TABLAS AL INICIAR
# =========================

@app.on_event("startup")
def crear_tablas():
    Base.metadata.create_all(bind=engine)
    _migrar_columna_es_responsable()
    _migrar_columna_cargo()


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

    cargo: Optional[str] = None

    es_responsable: Optional[bool] = False


class CoberturaSchema(BaseModel):

    tipo: str

    valor: str

    dia_semana: int

    hora_inicio: str

    hora_fin: str

    minimo_personas: int = 1

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
    }


def _normalizar_cobertura(data: CoberturaSchema) -> dict:
    tipo = data.tipo.strip().lower()

    if tipo not in {"ceco", "area"}:
        raise HTTPException(
            status_code=422,
            detail="El tipo debe ser 'ceco' o 'area'",
        )

    valor = data.valor.strip()

    if not valor:
        raise HTTPException(
            status_code=422,
            detail="Debe indicar el área o CECO a cubrir",
        )

    if data.dia_semana < 0 or data.dia_semana > 6:
        raise HTTPException(
            status_code=422,
            detail="El día debe estar entre 0 (lunes) y 6 (domingo)",
        )

    if data.minimo_personas < 1:
        raise HTTPException(
            status_code=422,
            detail="El mínimo de personas debe ser mayor a cero",
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
        "minimo_personas": data.minimo_personas,
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
        "minimo_personas": c.minimo_personas,
        "activo": bool(c.activo),
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
        cargo=(data.cargo or "").strip() or "Sin cargo",
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
    trabajador.cargo = (data.cargo or "").strip() or "Sin cargo"
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
# CONFIGURACIÓN COBERTURA
# =========================

@app.get("/cobertura/config")
def obtener_configuracion_cobertura(db: Session = Depends(get_db)):

    reglas = db.query(ConfiguracionCobertura).order_by(
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
    _: str = Depends(require_token),
):

    valores = _normalizar_cobertura(data)

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
    _: str = Depends(require_token),
):

    regla = db.query(ConfiguracionCobertura).filter(
        ConfiguracionCobertura.id == regla_id
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
    _: str = Depends(require_token),
):

    regla = db.query(ConfiguracionCobertura).filter(
        ConfiguracionCobertura.id == regla_id
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
# SERVIR FRONTEND
# =========================

frontend_path = Path(__file__).parent.parent / "frontend"

@app.get("/")
async def get_index():
    return FileResponse(str(frontend_path / "index.html"))

app.mount("/js", StaticFiles(directory=str(frontend_path / "js")), name="js")
app.mount("/css", StaticFiles(directory=str(frontend_path / "css")), name="css")
