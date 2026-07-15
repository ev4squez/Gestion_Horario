from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from .database import Base
from datetime import datetime, timezone


def _now():
    return datetime.now(timezone.utc)


# ============================================================================
# MULTI-TENANT: Empresa
# ============================================================================
# Una Empresa es un "casino" / cliente del sistema. Toda la data operativa
# (trabajadores, planificación, cobertura, colación, usuarios) está scopada
# a una empresa. Los endpoints filtran automáticamente por el `empresa_id` del
# token de sesión. Una empresa se identifica por un `slug` único (URL-safe)
# que se usa en el login.
class Empresa(Base):

    __tablename__ = "empresas"

    id = Column(Integer, primary_key=True, index=True)

    # Identificador URL-safe único (ej. "casino-centro"). Se usa en el login
    # para que el usuario indique a qué empresa pertenece.
    slug = Column(String, unique=True, nullable=False, index=True)

    # Nombre legible para mostrar en la UI.
    nombre = Column(String, nullable=False)

    # RUT opcional de la empresa.
    rut = Column(String, nullable=True)

    activo = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=_now, nullable=False)


# Si `turno_rotativo` es False y el trabajador tiene al menos un registro
# en `trabajador_turnos_fijos`, el motor asigna el turno del día
# correspondiente en los días con reglas de cobertura aplicables,
# respetando minimo_inicio/fin. Si no tiene ninguno, queda excluido.
class Trabajador(Base):

    __tablename__ = "trabajadores"

    id = Column(Integer, primary_key=True, index=True)

    # Tenant. Filtrado en todos los queries via token.
    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    rut = Column(String, nullable=False, index=True)
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

    # Trabajador activo. Los inactivos no aparecen en el planificador para
    # asignarles horario, pero se conservan en la administración.
    activo = Column(Boolean, default=True)

    # Si es True (default) el planificador automático puede asignarle o rotarle
    # turnos. Si es False el trabajador queda fuera del motor: el auto-planner
    # no le asigna ni le modifica nada, preservando sus turnos manuales.
    turno_rotativo = Column(Boolean, default=True)

    # Relación 1-a-N con los turnos fijos por día de la semana. Cada fila
    # representa (dia_semana, turno). Permite que un fijo tenga un turno
    # distinto según el día (lunes "09:00 - 18:30", martes "16:30 - 03:00", …).
    turnos_fijos = relationship(
        "TrabajadorTurnoFijo",
        back_populates="trabajador",
        cascade="all, delete-orphan",
        order_by="TrabajadorTurnoFijo.dia_semana",
    )


# Índice único por (empresa, rut) para garantizar que un RUT es único
# dentro de la empresa (puede repetirse entre empresas).
Index(
    "uq_trabajadores_empresa_rut",
    Trabajador.__table__.c.empresa_id,
    Trabajador.__table__.c.rut,
    unique=True,
)


class TrabajadorTurnoFijo(Base):

    __tablename__ = "trabajador_turnos_fijos"
    __table_args__ = (
        UniqueConstraint(
            "trabajador_id",
            "dia_semana",
            name="uq_trabajador_turno_fijo_dia",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Tenant denormalizado para queries rápidos. Se mantiene sincronizado
    # con el de su trabajador al insertar/actualizar.
    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    trabajador_id = Column(
        Integer,
        ForeignKey("trabajadores.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # 0=Lunes ... 6=Domingo (mismo orden que el calendario visual).
    dia_semana = Column(Integer, nullable=False)

    # Turno en formato "HH:MM - HH:MM" (mismo formato que `planificacion`).
    turno = Column(String, nullable=False)

    created_at = Column(DateTime, default=_now)
    updated_at = Column(
        DateTime,
        default=_now,
        onupdate=_now,
    )

    trabajador = relationship("Trabajador", back_populates="turnos_fijos")


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

    # Tenant denormalizado (se mantiene en sync con el del trabajador).
    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

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

    # Tenant.
    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # "ceco" o "area". Define contra qué campo del trabajador se evalúa.
    tipo = Column(String, nullable=False)

    # Valor exacto del CECO o área que debe cubrirse.
    valor = Column(String, nullable=False)

    # 0=Lunes ... 6=Domingo, igual que el calendario visual del sistema.
    dia_semana = Column(Integer, nullable=False)

    hora_inicio = Column(String, nullable=False)

    hora_fin = Column(String, nullable=False)

    # Dotación mínima exigida en la apertura (hora_inicio) y en el cierre
    # (hora_fin) de la franja. La interpretación es "solo dos puntos": el
    # mínimo se exige en esos dos instantes, no en el tramo intermedio.
    minimo_inicio = Column(Integer, default=1, nullable=False)

    minimo_fin = Column(Integer, default=1, nullable=False)

    # Se conserva por compatibilidad hacia atrás (lectores/alertas legadas).
    # Se mantiene poblado como max(minimo_inicio, minimo_fin).
    minimo_personas = Column(Integer, default=1, nullable=False)

    activo = Column(Boolean, default=True)

    created_at = Column(DateTime, default=_now)

    updated_at = Column(
        DateTime,
        default=_now,
        onupdate=_now,
    )


class Usuario(Base):

    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)

    # Tenant. NULL solo para super-admins globales (que no están atados a
    # ninguna empresa y gestionan TODAS las empresas). Para usuarios de
    # empresa siempre vale.
    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Super-admin global: puede ver/gestionar todas las empresas. No está
    # atado a ninguna empresa (empresa_id=NULL). Solo el bootstrap con las
    # env vars SUPER_ADMIN_USERNAME/PASSWORD puede crearlos.
    es_super_admin = Column(Boolean, default=False, nullable=False)

    # Nombre de usuario para iniciar sesión. Único por empresa para usuarios
    # normales; único global para super-admins (la constraint compuesta ya
    # cubre ambos casos: NULL se considera distinto en SQLite).
    username = Column(String, nullable=False, index=True)

    # Contraseña hasheada con PBKDF2 (formato pbkdf2_sha256$iter$salt$hash).
    # Nunca se guarda la contraseña en texto plano.
    password_hash = Column(String, nullable=False)

    # Nombre para mostrar (opcional).
    nombre = Column(String)

    # Permite deshabilitar un usuario sin borrarlo.
    activo = Column(Boolean, default=True)

    created_at = Column(DateTime, default=_now)


# Username único por empresa (no global) — el RUT del estilo "admin" puede
# existir en varias empresas a la vez con contraseñas distintas.
Index(
    "uq_usuarios_empresa_username",
    Usuario.__table__.c.empresa_id,
    Usuario.__table__.c.username,
    unique=True,
)


class ConfiguracionColacion(Base):

    __tablename__ = "configuracion_colacion"

    id = Column(Integer, primary_key=True, index=True)

    # Tenant.
    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # CECO al que aplica esta colación. Único por empresa (un CECO tiene
    # un solo valor dentro de la empresa).
    ceco = Column(String, nullable=False, index=True)

    # Minutos de colación a descontar por cada turno trabajado de ese CECO.
    minutos = Column(Integer, default=30, nullable=False)

    created_at = Column(DateTime, default=_now)

    updated_at = Column(
        DateTime,
        default=_now,
        onupdate=_now,
    )


# CECO único por empresa.
Index(
    "uq_colacion_empresa_ceco",
    ConfiguracionColacion.__table__.c.empresa_id,
    ConfiguracionColacion.__table__.c.ceco,
    unique=True,
)


class TurnoFrecuente(Base):
    """Turno sugerido para un CECO dentro de una empresa."""

    __tablename__ = "turnos_frecuentes"

    id = Column(Integer, primary_key=True, index=True)

    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    ceco = Column(String, nullable=False, index=True)

    # Horario normalizado en formato "HH:MM - HH:MM".
    turno = Column(String, nullable=False)

    created_at = Column(DateTime, default=_now, nullable=False)


Index(
    "uq_turnos_frecuentes_empresa_ceco_turno",
    TurnoFrecuente.__table__.c.empresa_id,
    TurnoFrecuente.__table__.c.ceco,
    TurnoFrecuente.__table__.c.turno,
    unique=True,
)


class AuditLog(Base):
    """Registro simple de acciones realizadas por el super-admin global.

    No es una réplica de un sistema de logs profesional: es un
    historial ligero persistido en la misma SQLite para que el
    panel SaaS Admin pueda mostrar 'qué hice recientemente'.
    No tiene empresa_id obligatorio porque hay acciones que no
    aplican a una empresa concreta (p.ej. crear la primera empresa)."""

    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)

    # Quién lo hizo (username del super-admin). NULL si fue generado
    # automáticamente (p.ej. el bootstrap inicial).
    actor_username = Column(String, nullable=True, index=True)

    # Qué acción: crear_empresa, toggle_empresa, actualizar_empresa,
    # crear_usuario, actualizar_usuario, eliminar_usuario.
    accion = Column(String, nullable=False, index=True)

    # Empresa afectada (NULL si no aplica).
    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Texto libre con contexto (username creado, campo cambiado, etc.).
    detalle = Column(String, nullable=True)

    created_at = Column(DateTime, default=_now, nullable=False, index=True)


# ============================================================================
# FERIADOS
# ============================================================================
# Un Feriado es una fecha especial para una Empresa. La lista por defecto
# (Chile 2025/2026/2027) se siembra idempotentemente en startup si la tabla
# esta vacia para la empresa. Cada empresa puede agregar/borrar feriados
# propios (puentes regionales, eventos internos) por API.
#
# `fecha` se guarda como ISO "YYYY-MM-DD". `tipo` es libre ("civil",
# "religioso", "regional", "empresa"); el frontend lo usa solo para ordenar
# chips, no para validacion.
class Feriado(Base):

    __tablename__ = "feriados"
    __table_args__ = (
        UniqueConstraint(
            "empresa_id",
            "fecha",
            name="uq_feriados_empresa_fecha",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ISO YYYY-MM-DD. Sin zona horaria: el frontend interpreta segun mes/anio.
    fecha = Column(String, nullable=False, index=True)

    # Nombre legible, p. ej. "Dia del Trabajador".
    nombre = Column(String, nullable=False)

    # "civil" | "religioso" | "regional" | "empresa". Solo para UI.
    tipo = Column(String, default="civil", nullable=False)

    created_at = Column(DateTime, default=_now, nullable=False)


# Indice compuesto para la consulta mas frecuente del frontend:
#   WHERE empresa_id = ? AND substr(fecha, 1, 4) = ?
# Un indice por empresa_id + fecha ya cubre el lookup por anio completo.
Index(
    "idx_feriados_empresa_fecha",
    Feriado.__table__.c.empresa_id,
    Feriado.__table__.c.fecha,
)
