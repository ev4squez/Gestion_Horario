from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    UniqueConstraint,
)
from .database import Base
from datetime import datetime, timezone


def _now():
    return datetime.now(timezone.utc)


class Trabajador(Base):

    __tablename__ = "trabajadores"

    id = Column(Integer, primary_key=True, index=True)

    rut = Column(String, unique=True, nullable=False)
    nombre = Column(String, nullable=False)

    area = Column(String)
    jornada = Column(Integer)

    responsable = Column(String)
    ceco = Column(String)

    # Cargo/puesto del trabajador (p. ej. "Cajero", "Supervisor"). Sirve para
    # agrupar y filtrar trabajadores por su rol en el casino.
    cargo = Column(String, default="Sin cargo")

    # Marca si este trabajador puede actuar como responsable de otros; al
    # activarse, su nombre aparece en el pool de responsables seleccionables.
    es_responsable = Column(Boolean, default=False)


class Planificacion(Base):

    __tablename__ = "planificacion"

    # Evita duplicados (trabajador, fecha) a nivel de base de datos.
    __table_args__ = (
        UniqueConstraint(
            "trabajador_id",
            "fecha",
            name="uq_trabajador_fecha",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    trabajador_id = Column(
        Integer,
        ForeignKey("trabajadores.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    responsable = Column(String, nullable=False)

    fecha = Column(String, nullable=False)

    turno = Column(String, nullable=False)

    horas = Column(Float, default=0)

    observacion = Column(String, nullable=True)

    created_at = Column(DateTime, default=_now)

    updated_at = Column(
        DateTime,
        default=_now,
        onupdate=_now,
    )


class ConfiguracionCobertura(Base):

    __tablename__ = "configuracion_cobertura"

    id = Column(Integer, primary_key=True, index=True)

    # "ceco" o "area". Define contra qué campo del trabajador se evalúa.
    tipo = Column(String, nullable=False)

    # Valor exacto del CECO o área que debe cubrirse.
    valor = Column(String, nullable=False)

    # 0=Lunes ... 6=Domingo, igual que el calendario visual del sistema.
    dia_semana = Column(Integer, nullable=False)

    hora_inicio = Column(String, nullable=False)

    hora_fin = Column(String, nullable=False)

    minimo_personas = Column(Integer, default=1, nullable=False)

    activo = Column(Boolean, default=True)

    created_at = Column(DateTime, default=_now)

    updated_at = Column(
        DateTime,
        default=_now,
        onupdate=_now,
    )
