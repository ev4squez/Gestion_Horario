import os
import pandas as pd

from .database import SessionLocal
from .models import Empresa
from .models import Trabajador

db = SessionLocal()

archivo = "uploads/trabajadores.xlsx"

# Resolver la empresa destino desde el env (mismo criterio que el bootstrap).
slug = os.getenv("COMPANY_SLUG", "default").strip() or "default"
nombre = os.getenv("COMPANY_NAME", "Mi Empresa").strip() or "Mi Empresa"

empresa = db.query(Empresa).filter(Empresa.slug == slug).first()
if not empresa:
    empresa = Empresa(slug=slug, nombre=nombre, activo=True)
    db.add(empresa)
    db.commit()
    db.refresh(empresa)

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
        .filter_by(empresa_id=empresa.id, rut=rut)\
        .first()

    if existe:
        continue

    trabajador = Trabajador(

        empresa_id=empresa.id,

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

print(f"Importación completada en empresa '{empresa.nombre}' (id={empresa.id})")