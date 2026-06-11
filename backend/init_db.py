from .database import engine, Base

# IMPORTANTE
from .models import Planificacion

print(Planificacion.__tablename__)

print("Creando tablas...")

Base.metadata.create_all(bind=engine)

print("Tablas creadas correctamente")
print(Base.metadata.tables.keys())