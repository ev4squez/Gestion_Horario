import os
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.app import (
    TurnoFrecuenteSchema,
    crear_turno_frecuente,
    eliminar_turno_frecuente,
    obtener_turnos_frecuentes,
)
from backend.database import Base
from backend.models import Empresa, Trabajador


ROOT = Path(__file__).resolve().parents[1]


class TurnosFrecuentesBackendTest(unittest.TestCase):

    def setUp(self):
        fd, nombre = tempfile.mkstemp(
            prefix="hermes-turnos-frecuentes-",
            suffix=".db",
        )
        os.close(fd)
        self.db_path = Path(nombre)
        self.engine = create_engine(
            f"sqlite:///{self.db_path}",
            connect_args={"check_same_thread": False},
        )

        @event.listens_for(self.engine, "connect")
        def activar_foreign_keys(dbapi_connection, _):
            dbapi_connection.execute("PRAGMA foreign_keys=ON")

        self.Session = sessionmaker(bind=self.engine)
        Base.metadata.create_all(bind=self.engine)
        self.db = self.Session()

        self.empresa_uno = Empresa(slug="uno", nombre="Uno", activo=True)
        self.empresa_dos = Empresa(slug="dos", nombre="Dos", activo=True)
        self.db.add_all([self.empresa_uno, self.empresa_dos])
        self.db.commit()
        self.db.refresh(self.empresa_uno)
        self.db.refresh(self.empresa_dos)

        self.db.add(Trabajador(
            empresa_id=self.empresa_uno.id,
            rut="11111111-1",
            nombre="Cajero Caja",
            jornada=45,
            responsable="",
            ceco="caja",
        ))
        self.db.add(Trabajador(
            empresa_id=self.empresa_uno.id,
            rut="22222222-2",
            nombre="Cajero Sin CECO",
            jornada=45,
            responsable="",
            ceco="",
        ))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        self.db_path.unlink(missing_ok=True)

    def test_crud_is_scoped_to_authenticated_company(self):
        creado = crear_turno_frecuente(
            TurnoFrecuenteSchema(ceco="caja", turno="09:00 - 18:30"),
            self.db,
            self.empresa_uno.id,
        )
        self.assertEqual(creado["ceco"], "caja")
        self.assertEqual(
            obtener_turnos_frecuentes(self.db, self.empresa_uno.id),
            [creado],
        )
        self.assertEqual(
            obtener_turnos_frecuentes(self.db, self.empresa_dos.id),
            [],
        )

        with self.assertRaises(HTTPException) as contexto:
            eliminar_turno_frecuente(
                creado["id"], self.db, self.empresa_dos.id,
            )
        self.assertEqual(contexto.exception.status_code, 404)

        eliminar_turno_frecuente(
            creado["id"], self.db, self.empresa_uno.id,
        )
        self.assertEqual(
            obtener_turnos_frecuentes(self.db, self.empresa_uno.id),
            [],
        )

    def test_duplicate_turn_is_rejected_inside_the_same_ceco(self):
        datos = TurnoFrecuenteSchema(ceco="caja", turno="09:00 - 18:30")
        crear_turno_frecuente(datos, self.db, self.empresa_uno.id)
        with self.assertRaises(HTTPException) as contexto:
            crear_turno_frecuente(datos, self.db, self.empresa_uno.id)
        self.assertEqual(contexto.exception.status_code, 409)

    def test_invalid_shift_format_is_rejected(self):
        with self.assertRaises(HTTPException) as contexto:
            crear_turno_frecuente(
                TurnoFrecuenteSchema(ceco="caja", turno="9 a 18"),
                self.db, self.empresa_uno.id,
            )
        self.assertEqual(contexto.exception.status_code, 422)

    def test_ceco_must_belong_to_authenticated_company(self):
        with self.assertRaises(HTTPException) as contexto:
            crear_turno_frecuente(
                TurnoFrecuenteSchema(ceco="ceco-fantasma", turno="09:00 - 18:30"),
                self.db, self.empresa_uno.id,
            )
        self.assertEqual(contexto.exception.status_code, 422)
        self.assertEqual(
            obtener_turnos_frecuentes(self.db, self.empresa_uno.id),
            [],
        )

    def test_ceco_matching_is_case_insensitive(self):
        # El CECO almacenado en la base está en MAYÚSCULAS; el admin puede
        # tipearlo en cualquier mezcla y debe aceptarse.
        creado = crear_turno_frecuente(
            TurnoFrecuenteSchema(ceco="Caja", turno="09:00 - 18:30"),
            self.db, self.empresa_uno.id,
        )
        self.assertEqual(creado["ceco"], "caja")
        # Y al re-listar también debe aparecer con la key en minúsculas.
        self.assertEqual(
            obtener_turnos_frecuentes(self.db, self.empresa_uno.id),
            [creado],
        )

    def test_ceco_is_lowercased_for_consistent_matching(self):
        creado = crear_turno_frecuente(
            TurnoFrecuenteSchema(ceco="  CAJA ", turno="09:00 - 18:30"),
            self.db, self.empresa_uno.id,
        )
        self.assertEqual(creado["ceco"], "caja")

    def test_ceco_matching_ignores_diacritics(self):
        # Bug reproducido: el CECO almacenado venía con acento MAYÚSCULO
        # (p.ej. "GESTIÓN"), mientras el admin lo reenvía con acento
        # MINÚSCULO tras .lower() (GESTIÓN -> gestión). El .ilike
        # nativo de SQLite es byte-level y "ó" != "Ó". La validación
        # debe colapsar acentos en el último fallback y aceptar el match.
        self.db.add(Trabajador(
            empresa_id=self.empresa_uno.id,
            rut="33333333-3",
            nombre="Contador Senior",
            jornada=45,
            responsable="",
            ceco="CONTABILIDAD/FINANZAS Y CONTROL DE GESTIÓN",
        ))
        self.db.commit()

        creado = crear_turno_frecuente(
            TurnoFrecuenteSchema(
                ceco="CONTABILIDAD/FINANZAS Y CONTROL DE GESTIóN",
                turno="08:00 - 18:00",
            ),
            self.db, self.empresa_uno.id,
        )
        self.assertEqual(creado["ceco"], "contabilidad/finanzas y control de gestión")
        # Acento MINÚSCULO vs. SIN acento en el input también debe matchear.
        creado_2 = crear_turno_frecuente(
            TurnoFrecuenteSchema(
                ceco="contabilidad/finanzas y control de gestion",
                turno="09:00 - 18:30",
            ),
            self.db, self.empresa_uno.id,
        )
        self.assertEqual(creado_2["ceco"], "contabilidad/finanzas y control de gestion")

    def test_ceco_real_typo_still_rejected_after_diacritic_fallback(self):
        # El fallback accent-insensitive NO debe aceptar typos reales.
        self.db.add(Trabajador(
            empresa_id=self.empresa_uno.id,
            rut="44444444-4",
            nombre="Contador",
            jornada=45,
            responsable="",
            ceco="HABITACIONES",
        ))
        self.db.commit()

        with self.assertRaises(HTTPException) as contexto:
            crear_turno_frecuente(
                TurnoFrecuenteSchema(ceco="HABITACIONE", turno="09:00 - 18:30"),
                self.db, self.empresa_uno.id,
            )
        self.assertEqual(contexto.exception.status_code, 422)


class TurnosFrecuentesFrontendTest(unittest.TestCase):

    def test_management_view_and_ceco_filtered_suggestions_are_wired(self):
        index = (ROOT / "frontend/index.html").read_text(encoding="utf-8")
        app = (ROOT / "frontend/js/app.js").read_text(encoding="utf-8")
        turnos = (ROOT / "frontend/js/admin/turnos-frecuentes.js").read_text(
            encoding="utf-8"
        )
        api = (ROOT / "frontend/js/api.js").read_text(encoding="utf-8")
        auth = (ROOT / "frontend/js/admin/auth.js").read_text(encoding="utf-8")
        modal = (ROOT / "frontend/js/admin/modal.js").read_text(encoding="utf-8")

        self.assertIn('id="menu-turnos-frecuentes"', index)
        self.assertIn('id="vista-turnos-frecuentes"', index)
        self.assertIn('id="turno-frecuente-ceco"', index)
        self.assertIn('id="turno-frecuente-inicio"', index)
        self.assertIn('id="turno-frecuente-fin"', index)
        self.assertIn('src="js/admin/turnos-frecuentes.js"', index)

        self.assertIn("function obtenerTurnosDisponibles(ceco = null)", app)
        self.assertIn("hayCatalogoParaCeco", app)
        self.assertIn("obtenerCecoDesdeInputTurno(input)", app)
        self.assertIn("obtenerTurnosDisponibles(ceco)", app)
        self.assertIn('"Libre", "Saliente", "Vacaciones"', app)
        self.assertIn("await obtenerTurnosFrecuentes()", app)

        self.assertIn("async function mostrarVistaTurnosFrecuentes()", turnos)
        self.assertIn("async function guardarTurnoFrecuente()", turnos)
        self.assertIn("async function eliminarTurnoFrecuenteCRUD(id)", turnos)
        self.assertIn('if(resultado === null){', turnos)

        self.assertIn("async function obtenerTurnosFrecuentes()", api)
        self.assertIn("if(response.status === 401){", api)
        self.assertIn("async function crearTurnoFrecuente(data)", api)
        self.assertIn("async function eliminarTurnoFrecuente(id)", api)
        self.assertIn('mostrar("menu-turnos-frecuentes", adminAutorizado)', auth)
        self.assertIn('"vista-turnos-frecuentes"', modal)


class CatalogoPorCecoTest(unittest.TestCase):
    """Reproduce el bug de regresión detectado en code-review."""

    JS_SOURCE = (ROOT / "frontend/js/app.js").read_text(encoding="utf-8")

    def _invocar(self, turnos):
        import subprocess
        import textwrap

        script = textwrap.dedent(f"""
            const vm = require('vm')
            const turnosFrecuentesGlobal = {turnos!r}
            const trabajadoresGlobal = []
            function normalizarTexto(v){{return String(v||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim()}}
            const context = {{turnosFrecuentesGlobal, trabajadoresGlobal, normalizarTexto}}
            vm.createContext(context)
            const src = {self.JS_SOURCE!r}
            const start = src.indexOf('function obtenerTurnosDisponibles')
            const end = src.indexOf('let dropdownTurnos', start)
            vm.runInContext(src.slice(start, end), context)
            console.log(JSON.stringify(context.obtenerTurnosDisponibles('Caja')))
        """)
        salida = subprocess.check_output(
            ["node", "-e", script],
            cwd=str(ROOT),
        )
        import json
        return json.loads(salida.decode("utf-8").strip())

    def test_sin_catalogo_se_muestran_los_horarios_default(self):
        resultado = self._invocar([])
        self.assertIn("09:00 - 18:30", resultado)
        self.assertIn("19:30 - 06:00", resultado)
        self.assertIn("Libre", resultado)

    def test_ceco_sin_catalogo_personal_mantiene_los_defaults(self):
        # Empresa tiene catálogo SOLO para "Seguridad"; un CECO distinto
        # ("Caja") no debe perder los defaults legacy.
        resultado = self._invocar([
            {"id": 1, "ceco": "Seguridad", "turno": "19:30 - 06:00"},
        ])
        self.assertIn("09:00 - 18:30", resultado)
        self.assertIn("19:30 - 06:00", resultado)

    def test_ceco_con_catalogo_propio_no_muestra_defaults(self):
        resultado = self._invocar([
            {"id": 1, "ceco": "Caja", "turno": "08:00 - 16:00"},
        ])
        self.assertIn("08:00 - 16:00", resultado)
        self.assertNotIn("09:00 - 18:30", resultado)
        self.assertNotIn("19:30 - 06:00", resultado)


class TurnosFrecuentesAgrupadosTest(unittest.TestCase):
    """
    Reproduce el agrupado colapsable de turnos frecuentes por CECO.

    Mismas mecánica que ``renderizarReglasCobertura``: filas-cabecera
    colapsables con chevron + badge de conteo, estado de colapso
    persistido entre renders, listener delegado al tbody.
    """

    JS_SOURCE = (
        ROOT / "frontend/js/admin/turnos-frecuentes.js"
    ).read_text(encoding="utf-8")

    def _invocar(self, turnos):
        import subprocess
        import textwrap

        script = textwrap.dedent(f"""
            const {{ JSDOM }} = require('/tmp/hermes-jsdom-stub/node_modules/jsdom')
            const dom = new JSDOM('<!DOCTYPE html><html><body>'
                + '<table><tbody id="tabla-turnos-frecuentes-body"></tbody></table>'
                + '</body></html>')
            const document = dom.window.document
            const window = dom.window
            const turnosFrecuentesGlobal = {turnos!r}
            function escaparHTML(s){{return String(s == null ? '' : s)
                .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                .replace(/"/g,'&quot;').replace(/'/g,'&#39;')}}
            const context = {{
                document, window,
                turnosFrecuentesGlobal,
                escaparHTML,
                eliminarTurnoFrecuenteCRUD: function(){{}}
            }}
            const vm = require('vm')
            vm.createContext(context)
            vm.runInContext({self.JS_SOURCE!r}, context)
            // El archivo sólo define funciones; las invocamos manualmente
            // para que el tbody se rellene.
            vm.runInContext('renderizarTurnosFrecuentes()', context)
            // Capturamos tbody.innerHTML una vez rendereado.
            console.log(JSON.stringify(document.getElementById(
                'tabla-turnos-frecuentes-body').innerHTML))
        """)
        salida = subprocess.check_output(
            ["node", "-e", script],
            cwd=str(ROOT),
        )
        import json
        return json.loads(salida.decode("utf-8").strip())

    def test_agrupa_por_ceco_y_emite_fila_cabecera_por_grupo(self):
        # Tres turnos en "Caja" + dos en "Cocina" => 2 cabeceras + 5 filas.
        html = self._invocar([
            {"id": 1, "ceco": "Caja", "turno": "08:00 - 16:00"},
            {"id": 2, "ceco": "Caja", "turno": "09:00 - 18:30"},
            {"id": 3, "ceco": "Cocina", "turno": "06:00 - 14:00"},
            {"id": 4, "ceco": "Caja", "turno": "10:00 - 19:00"},
            {"id": 5, "ceco": "Cocina", "turno": "14:00 - 22:00"},
        ])
        self.assertEqual(html.count("data-grupo-ceco-toggle"), 2)
        self.assertEqual(html.count("data-grupo-ceco-fila"), 5)
        # Cabeceras con el conteo correcto.
        self.assertIn("3 turnos", html)
        self.assertIn("2 turnos", html)
        # Filas-cabecera ordenadas alfabéticamente: Caja antes que Cocina.
        caja_idx = html.find("data-grupo-ceco-toggle=\"caja\"")
        cocina_idx = html.find("data-grupo-ceco-toggle=\"cocina\"")
        self.assertGreater(cocina_idx, caja_idx)
        self.assertGreater(caja_idx, 0)
        self.assertGreater(cocina_idx, 0)

    def test_cada_fila_hijo_conserva_el_turno_y_boton_eliminar(self):
        html = self._invocar([
            {"id": 7, "ceco": "Caja", "turno": "09:00 - 18:30"},
        ])
        # El turno debe aparecer dentro de una fila-hijo.
        self.assertIn("09:00 - 18:30", html)
        # Y el botón de eliminar apunta al id correcto.
        self.assertIn("eliminarTurnoFrecuenteCRUD(7)", html)
        # El CECO aparece SOLO en la cabecera, no repetido en cada fila.
        self.assertEqual(html.count("Caja"), 1)

    def test_renderizado_vacio_muestra_mensaje(self):
        html = self._invocar([])
        self.assertIn("Aún no hay turnos frecuentes configurados.", html)
        self.assertEqual(html.count("data-grupo-ceco-toggle"), 0)


if __name__ == "__main__":
    unittest.main()
