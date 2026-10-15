import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app import (obtener_contexto_automatico, aplicar_planificacion_automatica,
    PlanificacionAutomaticaSchema, guardar_planificacion, PlanificacionSchema)
from backend.database import Base
from backend.models import Empresa, Trabajador, Planificacion, ConfiguracionCobertura, ConfiguracionColacion, TrabajadorTurnoFijo, TurnoFrecuente


class AutomatizacionTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.engine = create_engine(f"sqlite:///{Path(self.temp.name) / 'test.db'}")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        e = Empresa(slug="prueba", nombre="Prueba", activo=True)
        e2 = Empresa(slug="otra", nombre="Otra", activo=True)
        self.db.add_all([e, e2]); self.db.commit()
        self.empresa = e.id
        self.otra = e2.id
        self.t = Trabajador(empresa_id=e.id,rut="1",nombre="Caja",jornada=40,ceco="Caja",activo=True,turno_rotativo=True,responsable="Supervisión")
        self.db.add(self.t); self.db.commit(); self.tid = self.t.id
        for d in range(7):
            self.db.add(ConfiguracionCobertura(empresa_id=e.id,tipo="ceco",valor="Caja",dia_semana=d,hora_inicio="00:00",hora_fin="23:59",minimo_inicio=1,minimo_fin=1,minimo_personas=1,activo=True))
        self.db.commit()

    def tearDown(self):
        self.db.close(); self.engine.dispose(); self.temp.cleanup()

    def contexto(self):
        return obtener_contexto_automatico(self.db,self.empresa)

    def asignacion(self, fecha="2026-10-12", turno="00:00 - 08:00", **kwargs):
        return dict(trabajador_id=self.tid,responsable="Supervisión",fecha=fecha,turno=turno,horas=999,**kwargs)

    def propuesta(self, asignaciones=None, revision=None):
        return PlanificacionAutomaticaSchema(asignaciones=asignaciones or [self.asignacion()],revision=revision or self.contexto()["revision"],mes=10,anio=2026)

    def agregar(self, fecha, turno):
        self.db.add(Planificacion(empresa_id=self.empresa,trabajador_id=self.tid,fecha=fecha,turno=turno,horas=0,responsable="Supervisión")); self.db.commit()

    def rechaza(self, data, status):
        with self.assertRaises(HTTPException) as exc:
            aplicar_planificacion_automatica(data,self.db,self.empresa)
        self.assertEqual(exc.exception.status_code,status)
        return exc.exception.detail

    def test_turno_a_medida_puede_cubrir_solo_una_brecha_intermedia(self):
        regla = self.db.query(ConfiguracionCobertura).filter_by(dia_semana=0).one()
        regla.hora_inicio = "09:00"
        regla.hora_fin = "17:00"
        self.db.commit()
        resultado = aplicar_planificacion_automatica(
            self.propuesta([self.asignacion(turno="12:00 - 14:00")]), self.db, self.empresa)
        self.assertEqual(resultado["asignaciones_guardadas"], 1)
        self.assertEqual(self.db.query(Planificacion).one().turno, "12:00 - 14:00")

    def test_guardado_recalcula_horas_y_es_atomico(self):
        resultado = aplicar_planificacion_automatica(self.propuesta(),self.db,self.empresa)
        self.assertEqual(resultado["asignaciones_guardadas"],1)
        self.assertEqual(self.db.query(Planificacion).one().horas,7.5)

    def test_cambio_manual_entre_generacion_y_aprobacion_se_rechaza(self):
        propuesta = self.propuesta()
        with self.Session() as otra:
            guardar_planificacion(PlanificacionSchema(**self.asignacion(turno="Libre")),otra,self.empresa)
        self.assertIn("Vuelve a generar",self.rechaza(propuesta,409))
        self.assertEqual(self.db.query(Planificacion).one().turno,"Libre")

    def test_cambio_de_configuracion_invalida_la_revision(self):
        propuesta=self.propuesta()
        self.db.add(ConfiguracionColacion(empresa_id=self.empresa,ceco="Caja",minutos=60));self.db.commit()
        self.rechaza(propuesta,409)

    def test_no_reemplaza_vacaciones_ni_saliente(self):
        for i, estado in enumerate(["Vacaciones","Saliente"]):
            fecha=f"2026-10-{12+i}"
            self.agregar(fecha,estado)
            self.assertIn("no se puede reemplazar",self.rechaza(self.propuesta([self.asignacion(fecha)]),422))

    def test_no_guarda_parcialmente_si_un_turno_falla(self):
        self.agregar("2026-10-13","Vacaciones")
        p=self.propuesta([self.asignacion(),self.asignacion("2026-10-13")])
        self.rechaza(p,422)
        self.assertEqual(self.db.query(Planificacion).count(),1)

    def test_limite_semanal_y_descanso_incluyen_mes_vecino(self):
        self.agregar("2026-09-30","16:00 - 00:00")
        mensaje=self.rechaza(self.propuesta([self.asignacion("2026-10-01","00:00 - 08:00")]),422)
        self.assertIn("descanso",mensaje)
        lote=[self.asignacion(f"2026-10-{12+i}") for i in range(6)]
        self.assertIn("exceden",self.rechaza(self.propuesta(lote),422))

    def test_maximo_seis_dias_consecutivos(self):
        lote=[self.asignacion(f"2026-10-{12+i}","00:00 - 01:00") for i in range(7)]
        self.assertIn("consecutivos",self.rechaza(self.propuesta(lote),422))

    def test_no_admite_turno_incompatible_fechas_fuera_de_mes_ni_duplicados(self):
        regla = self.db.query(ConfiguracionCobertura).filter_by(dia_semana=0).one()
        regla.hora_fin = "08:00"
        self.db.commit()
        self.rechaza(self.propuesta([self.asignacion(turno="09:00 - 17:00")]),422)
        self.rechaza(self.propuesta([self.asignacion("2026-11-01")]),422)
        self.rechaza(self.propuesta([self.asignacion(),self.asignacion()]),400)

    def test_contexto_y_propuesta_se_limitan_a_la_empresa(self):
        ctx=obtener_contexto_automatico(self.db,self.otra)
        self.assertEqual(ctx["trabajadores"],[])
        data=self.propuesta(revision=ctx["revision"])
        with self.assertRaises(HTTPException) as exc:
            aplicar_planificacion_automatica(data,self.db,self.otra)
        self.assertEqual(exc.exception.status_code,404)

    def test_colaborador_inactivo_no_recibe_turnos(self):
        self.t.activo = False
        self.db.commit()
        self.assertIn("inactivo", self.rechaza(self.propuesta(), 422))

    def test_fijo_solo_admite_su_horario_configurado(self):
        self.t.turno_rotativo = False
        self.db.add(TrabajadorTurnoFijo(empresa_id=self.empresa, trabajador_id=self.tid, dia_semana=0, turno="00:00 - 08:00"))
        self.db.commit()
        self.assertIn("configuración fija", self.rechaza(self.propuesta([self.asignacion(turno="00:00 - 07:00")]), 422))
        aplicar_planificacion_automatica(self.propuesta(), self.db, self.empresa)
        self.assertEqual(self.db.query(Planificacion).one().turno, "00:00 - 08:00")

    def test_completa_semana_con_turnos_de_catalogo_fuera_de_los_dias_con_cobertura(self):
        self.db.query(ConfiguracionCobertura).filter(ConfiguracionCobertura.dia_semana != 0).delete(synchronize_session=False)
        lunes = self.db.query(ConfiguracionCobertura).one()
        lunes.hora_inicio = "09:00"
        lunes.hora_fin = "17:00"
        self.db.add(TurnoFrecuente(empresa_id=self.empresa,ceco="Caja",turno="09:00 - 17:30"))
        self.db.commit()
        lote = [self.asignacion(f"2026-10-{12+i}", "09:00 - 17:30") for i in range(5)]
        resultado = aplicar_planificacion_automatica(self.propuesta(lote), self.db, self.empresa)
        self.assertEqual(resultado["asignaciones_guardadas"], 5)
        self.assertEqual(sum(p.horas for p in self.db.query(Planificacion).all()), 40)

    def test_misma_propuesta_no_se_aplica_dos_veces(self):
        p=self.propuesta()
        aplicar_planificacion_automatica(p,self.db,self.empresa)
        self.rechaza(p,409)
        self.assertEqual(self.db.query(Planificacion).count(),1)


if __name__ == '__main__':
    unittest.main()
