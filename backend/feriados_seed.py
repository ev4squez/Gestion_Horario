# ============================================================================
# FERIADOS CHILE 2025 / 2026 / 2027
# ============================================================================
# Lista oficial de feriados civiles y religiosos para Chile, hardcodeada
# en codigo para no depender de paquetes externos. Las fechas son IRRENUNCIABLES
# segun el articulo 38 del Codigo del Trabajo y el calendario oficial publicado
# por la Direccion del Trabajo.
#
# Si el usuario quiere feriados custom por empresa (puentes regionales, eventos
# internos), eso se maneja via POST /feriados a nivel empresa, NO aqui. Este
# modulo solo define el seed de feriados nacionales por defecto.
#
# Formato: (YYYY-MM-DD, nombre, tipo). `tipo` es "civil" o "religioso" segun
# corresponda; se usa solo en UI.
# ============================================================================

FERIADOS_POR_ANIO = {
    2025: [
        ("2025-01-01", "Ano Nuevo",                          "civil"),
        ("2025-04-18", "Viernes Santo",                      "religioso"),
        ("2025-04-19", "Sabado Santo",                       "religioso"),
        ("2025-05-01", "Dia del Trabajador",                 "civil"),
        ("2025-05-21", "Dia de las Glorias Navales",         "civil"),
        ("2025-06-29", "San Pedro y San Pablo",              "religioso"),
        ("2025-07-16", "Virgen del Carmen",                  "religioso"),
        ("2025-08-15", "Asuncion de la Virgen",              "religioso"),
        ("2025-09-18", "Fiestas Patrias",                    "civil"),
        ("2025-09-19", "Dia de las Glorias del Ejercito",    "civil"),
        ("2025-10-12", "Encuentro de Dos Mundos",            "civil"),
        ("2025-10-31", "Dia de las Iglesias Evangelicas",    "religioso"),
        ("2025-11-01", "Dia de Todos los Santos",            "religioso"),
        ("2025-12-08", "Inmaculada Concepcion",              "religioso"),
        ("2025-12-25", "Navidad",                            "civil"),
    ],
    2026: [
        ("2026-01-01", "Ano Nuevo",                          "civil"),
        ("2026-04-03", "Viernes Santo",                      "religioso"),
        ("2026-04-04", "Sabado Santo",                       "religioso"),
        ("2026-05-01", "Dia del Trabajador",                 "civil"),
        ("2026-05-21", "Dia de las Glorias Navales",         "civil"),
        ("2026-06-29", "San Pedro y San Pablo",              "religioso"),
        ("2026-07-16", "Virgen del Carmen",                  "religioso"),
        ("2026-08-15", "Asuncion de la Virgen",              "religioso"),
        ("2026-09-18", "Fiestas Patrias",                    "civil"),
        ("2026-09-19", "Dia de las Glorias del Ejercito",    "civil"),
        ("2026-10-12", "Encuentro de Dos Mundos",            "civil"),
        ("2026-11-01", "Dia de Todos los Santos",            "religioso"),
        ("2026-12-08", "Inmaculada Concepcion",              "religioso"),
        ("2026-12-25", "Navidad",                            "civil"),
    ],
    2027: [
        ("2027-01-01", "Ano Nuevo",                          "civil"),
        ("2027-03-26", "Viernes Santo",                      "religioso"),
        ("2027-03-27", "Sabado Santo",                       "religioso"),
        ("2027-05-01", "Dia del Trabajador",                 "civil"),
        ("2027-05-21", "Dia de las Glorias Navales",         "civil"),
        ("2027-06-28", "San Pedro y San Pablo",              "religioso"),
        ("2027-07-16", "Virgen del Carmen",                  "religioso"),
        ("2027-08-15", "Asuncion de la Virgen",              "religioso"),
        ("2027-09-17", "Fiestas Patrias (trasladado)",      "civil"),
        ("2027-09-18", "Dia de las Glorias del Ejercito",    "civil"),
        ("2027-10-11", "Encuentro de Dos Mundos (trasladado)","civil"),
        ("2027-11-01", "Dia de Todos los Santos",            "religioso"),
        ("2027-12-08", "Inmaculada Concepcion",              "religioso"),
        ("2027-12-25", "Navidad",                            "civil"),
    ],
}


def feriados_para_anio(anio: int):
    """Devuelve la tupla (fecha, nombre, tipo) para el anio dado."""
    return FERIADOS_POR_ANIO.get(anio, [])
