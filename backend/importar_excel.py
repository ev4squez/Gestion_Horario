import pandas as pd

from .database import SessionLocal
from .models import Trabajador

db = SessionLocal()

archivo = "uploads/trabajadores.xlsx"

# LEER EXCEL
df = pd.read_excel(archivo)

# RENOMBRAR COLUMNAS
df.columns = [
    "rut",
    "nombre",
    "area",
    "jornada",
    "responsable",
    "ceco"
]

# LIMPIAR
df = df.dropna(subset=["rut"])

df = df[df["rut"] != "RUT"]

df = df[pd.to_numeric(df["jornada"], errors="coerce").notnull()]

# NORMALIZAR RUT
df["rut"] = df["rut"].astype(str).str.strip()

# ELIMINAR DUPLICADOS EN EXCEL
df = df.drop_duplicates(subset=["rut"])

# INSERTAR
for _, row in df.iterrows():

    rut = row["rut"]

    existe = db.query(Trabajador)\
        .filter_by(rut=rut)\
        .first()

    if existe:
        continue

    trabajador = Trabajador(

        rut=rut,

        nombre=str(row["nombre"]).strip(),

        area=str(row["area"]).strip(),

        jornada=int(row["jornada"]),

        responsable=str(row["responsable"]).strip(),

        ceco=str(row["ceco"]).strip()

    )

    db.add(trabajador)

# GUARDAR
db.commit()

print("Importación completada")