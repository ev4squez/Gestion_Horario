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

    connect_args={
        "check_same_thread": False
    }

)

SessionLocal = sessionmaker(

    autocommit=False,

    autoflush=False,

    bind=engine

)

Base = declarative_base()


# SQLite no aplica las claves foráneas (ON DELETE CASCADE) salvo que
# se active explícitamente por conexión.
@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()