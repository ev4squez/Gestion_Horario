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
