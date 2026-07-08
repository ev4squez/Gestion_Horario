import os
import fcntl
import tempfile
from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent

DB_PATH = BASE_DIR / "data" / "turnos.db"

print("Ruta DB:", DB_PATH)

DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(

    DATABASE_URL,

    # `check_same_thread=False` para que SQLAlchemy pueda usar la conexión
    # desde varios threads (FastAPI/Starlette con workers). `timeout` es el
    # busy_timeout de SQLite: cuánto espera una conexión por un lock antes
    # de tirar `OperationalError: database is locked`. 30s es generoso y
    # tolera picos de tráfico.
    connect_args={
        "check_same_thread": False,
        "timeout": 30,
    }

)

SessionLocal = sessionmaker(

    autocommit=False,

    autoflush=False,

    bind=engine

)

Base = declarative_base()


# Pragma por conexión: foreign_keys + busy_timeout. `journal_mode=WAL`
# NO se setea acá porque requiere un write-lock y al hacerlo en cada
# conexión nueva (varios uvicorn workers) genera contención innecesaria.
# En su lugar, lo seteamos una vez en la migración si la DB lo requiere.
@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.close()


# ---------------------------------------------------------------------------
# Lock a nivel de proceso para serializar operaciones críticas de arranque
# ---------------------------------------------------------------------------
# SQLite es monoescritor: si dos procesos (p. ej. varios uvicorn workers o
# el container reiniciando mientras el anterior aún no soltó la DB) intentan
# hacer ALTER TABLE / UPDATE al mismo tiempo, el segundo tira "database is
# locked". Para evitarlo, las operaciones de migración se ejecutan dentro de
# este lock a nivel de proceso. El lock vive en un archivo temporal al lado
# de la DB; si el proceso muere, el lock se libera automáticamente.
def file_lock(path: Path):
    """Context manager que toma un lock advisory sobre un archivo. No-op si
    no se puede (en plataformas sin `fcntl.flock`); igual seguimos y el
    caller puede detectar errores de SQLite por su cuenta."""
    class _Lock:
        def __init__(self, lock_path: Path):
            self.lock_path = lock_path
            self._fd = None

        def __enter__(self):
            try:
                self._fd = open(self.lock_path, "w")
                # Lock bloqueante: si otro proceso tiene el lock, esperamos a
                # que lo suelte. El SO libera el lock automáticamente si el
                # proceso muere (mientras el FD esté cerrado).
                fcntl.flock(self._fd.fileno(), fcntl.LOCK_EX)
            except Exception:
                # Si flock falla (p. ej. en Windows), seguimos sin lock.
                pass
            return self

        def __exit__(self, *exc):
            try:
                if self._fd is not None:
                    fcntl.flock(self._fd.fileno(), fcntl.LOCK_UN)
                    self._fd.close()
            except Exception:
                pass

    return _Lock(path)


def db_migration_lock():
    """Context manager: lock alrededor del archivo de DB, usado para serializar
    migraciones entre procesos."""
    lock_path = DB_PATH.with_suffix(DB_PATH.suffix + ".migration.lock")
    return file_lock(lock_path)


def ensure_sqlite_wal_mode():
    """Activa WAL mode en la DB si no lo está. WAL mejora la concurrencia
    (lectores concurrentes con escritor) y reduce los 'database is locked'.

    Es seguro llamarlo varias veces: si WAL ya está activo, no hace nada
    destructivo. Se ejecuta dentro del migration lock para serializar
    entre procesos."""
    try:
        with engine.begin() as conn:
            modo_actual = conn.execute(
                text("PRAGMA journal_mode")
            ).scalar()
            # `scalar()` puede devolver una tupla o string según la versión.
            if isinstance(modo_actual, (tuple, list)):
                modo_actual = modo_actual[0]
            if modo_actual and str(modo_actual).lower() != "wal":
                conn.execute(text("PRAGMA journal_mode=WAL"))
    except Exception:
        # Si falla (DB bloqueada, etc.), no es crítico — la app sigue
        # funcionando en modo normal de SQLite.
        pass