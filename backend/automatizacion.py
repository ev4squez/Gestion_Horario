"""Validación de propuestas automáticas sobre la planificación resultante."""
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
import math
import re
import unicodedata

from fastapi import HTTPException

ZONA = ZoneInfo("America/Santiago")

HORARIO = re.compile(r"^([01]\d|2[0-3]):([0-5]\d) - ([01]\d|2[0-3]):([0-5]\d)$")


def intervalo(fecha, turno):
    texto = str(turno or "").strip()
    if texto.lower() in {"", "libre", "saliente", "vacaciones"}:
        return None
    m = HORARIO.fullmatch(texto)
    if not m:
        raise ValueError("Formato de turno inválido: use HH:MM - HH:MM")
    h1, m1, h2, m2 = map(int, m.groups())
    inicio = datetime.combine(date.fromisoformat(fecha), time(h1, m1), ZONA)
    fin = datetime.combine(date.fromisoformat(fecha), time(h2, m2), ZONA)
    if fin <= inicio:
        fin += timedelta(days=1)
    return inicio, fin


def minutos_colacion(trabajador, contexto):
    ceco = str(trabajador.get("ceco") or "").strip().lower()
    return next((c["minutos"] for c in contexto["colacion"] if c["ceco"].strip().lower() == ceco), 60 if ceco == "seguridad" else 30)


def horas_netas(periodo, minutos):
    return max(0, (periodo[1].replace(tzinfo=None) - periodo[0].replace(tzinfo=None)).total_seconds() / 3600 - minutos / 60) if periodo else 0


def turno_de_catalogo(trabajador, turno, contexto):
    def normalizar(valor):
        return "".join(c for c in unicodedata.normalize("NFD", str(valor or "")) if unicodedata.category(c) != "Mn").strip().lower()
    ceco = normalizar(trabajador.get("ceco"))
    propios = [t["turno"] for t in contexto["turnos"] if normalizar(t["ceco"]) == ceco]
    catalogo = propios or ["09:00 - 18:30", "09:00 - 17:30", "16:30 - 03:00", "17:30 - 04:00", "18:30 - 05:00", "19:30 - 06:00"]
    return turno in catalogo


def validar_propuesta(asignaciones, contexto, mes, anio):
    """No modifica el contexto. Devuelve asignaciones con horas recalculadas."""
    trabajadores = {t["id"]: t for t in contexto["trabajadores"]}
    mapa = {(p["trabajador_id"], p["fecha"][:10]): dict(p) for p in contexto["planificacion"]}
    claves = set()
    nuevas = []
    for a in asignaciones:
        datos = a.model_dump() if hasattr(a, "model_dump") else dict(a)
        tid, fecha = datos["trabajador_id"], datos["fecha"]
        try:
            dia = date.fromisoformat(fecha)
            if dia.isoformat() != fecha or dia.month != mes or dia.year != anio:
                raise ValueError("Fecha fuera del mes de la propuesta")
            periodo = intervalo(fecha, datos["turno"])
            if periodo is None:
                raise ValueError("La propuesta automática debe contener horarios de trabajo")
        except ValueError as exc:
            raise HTTPException(422, detail=f"{fecha}: {exc}") from exc
        clave = (tid, fecha)
        if clave in claves:
            raise HTTPException(400, detail="La propuesta contiene asignaciones duplicadas")
        claves.add(clave)
        t = trabajadores.get(tid)
        if not t:
            raise HTTPException(404, detail="Uno o más trabajadores no existen en esta empresa")
        if not t["activo"]:
            raise HTTPException(422, detail=f"{t['nombre']}: el colaborador está inactivo")
        if not t["turno_rotativo"]:
            fijo = next((f["turno"] for f in t["turnos_fijos"] if f["dia_semana"] == dia.weekday()), None)
            if fijo != datos["turno"]:
                raise HTTPException(422, detail=f"{t['nombre']}, {fecha}: el turno no coincide con su configuración fija")
        aporta = False
        for r in contexto["cobertura"]:
            campo = r["tipo"]
            if not r["activo"] or r["dia_semana"] != dia.weekday() or str(t.get(campo) or "").strip().lower() != str(r["valor"]).strip().lower():
                continue
            try:
                hi, mi = map(int, r["hora_inicio"].split(":"))
                hf, mf = map(int, r["hora_fin"].split(":"))
                inicio = datetime.combine(dia, time(hi, mi), ZONA)
                fin = datetime.combine(dia, time(hf, mf), ZONA)
                if fin <= inicio:
                    fin += timedelta(days=1)
            except (ValueError, TypeError):
                continue
            aporta = periodo[0] < fin and periodo[1] > inicio
            if aporta:
                break
        # Completar la jornada también puede superar la dotación mínima o
        # usar días sin regla: debe ser un turno del catálogo o su turno fijo.
        if not aporta and t["turno_rotativo"] and not turno_de_catalogo(t, datos["turno"], contexto):
            raise HTTPException(422, detail=f"{t['nombre']}, {fecha}: el turno no pertenece al catálogo ni aporta a una regla de cobertura activa")
        anterior = mapa.get(clave)
        if anterior and str(anterior["turno"]).strip().lower() in {"vacaciones", "saliente"}:
            raise HTTPException(422, detail=f"{t['nombre']}, {fecha}: no se puede reemplazar {anterior['turno']}")
        datos["horas"] = math.floor(horas_netas(periodo, minutos_colacion(t, contexto)) * 10 + .5) / 10
        mapa[clave] = datos
        nuevas.append(datos)

    # Evaluar las semanas y jornadas afectadas, incluyendo los meses vecinos.
    for tid in {a["trabajador_id"] for a in nuevas}:
        t = trabajadores[tid]
        periodos = []
        afectadas = [date.fromisoformat(a["fecha"]) for a in nuevas if a["trabajador_id"] == tid]
        desde = (min(afectadas) - timedelta(days=7)).isoformat()
        hasta = (max(afectadas) + timedelta(days=7)).isoformat()
        for (persona, fecha), p in mapa.items():
            if persona != tid or not desde <= fecha <= hasta:
                continue
            try:
                periodo = intervalo(fecha, p["turno"])
            except ValueError as exc:
                raise HTTPException(422, detail=f"{t['nombre']}, {fecha}: corrige el turno existente antes de automatizar") from exc
            if periodo:
                periodos.append((fecha, periodo))
        fechas_trabajadas = {date.fromisoformat(f) for f, _ in periodos}
        objetivo = int(t["jornada"] or 42)
        minutos = minutos_colacion(t, contexto)
        for nueva in (a for a in nuevas if a["trabajador_id"] == tid):
            dia = date.fromisoformat(nueva["fecha"])
            lunes = dia - timedelta(days=dia.weekday())
            total = sum(horas_netas(p, minutos) for f, p in periodos if lunes <= date.fromisoformat(f) < lunes + timedelta(days=7))
            total = math.floor(total * 10 + .5) / 10
            if total > objetivo:
                raise HTTPException(422, detail=f"{t['nombre']}: semana del {lunes}, {total}h exceden su jornada de {objetivo}h")
            actual = intervalo(nueva["fecha"], nueva["turno"])
            for fecha, otro in periodos:
                if fecha == nueva["fecha"]:
                    continue
                if actual[0] < otro[1] and actual[1] > otro[0]:
                    raise HTTPException(422, detail=f"{t['nombre']}: los turnos del {nueva['fecha']} y {fecha} se superponen")
                descanso = (actual[0].timestamp() - otro[1].timestamp() if otro[1] <= actual[0] else otro[0].timestamp() - actual[1].timestamp()) / 3600
                if descanso < 12:
                    raise HTTPException(422, detail=f"{t['nombre']}: descanso de {descanso:g}h entre {nueva['fecha']} y {fecha}; mínimo configurado 12h")
            consecutivos = 1
            for direccion in (-1, 1):
                vecino = dia + timedelta(days=direccion)
                while vecino in fechas_trabajadas:
                    consecutivos += 1
                    vecino += timedelta(days=direccion)
            if consecutivos > 6:
                raise HTTPException(422, detail=f"{t['nombre']}: la propuesta genera {consecutivos} días consecutivos; máximo configurado 6")
    return nuevas
