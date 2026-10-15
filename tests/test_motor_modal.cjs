const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH || 'jsdom');

function contexto(){
    const dom=new JSDOM('<button id="origen">Generar</button>');
    dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};
    dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'))};
    const c=vm.createContext({window:{cargosSeleccionados:[]},document:dom.window.document});
    for(const f of ['api','calendario','resumen','cobertura','app','motor_diagnostico','motor_jornada','motor_asignacion','pdf/auxiliares','motor_modal']){
        vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js',f+'.js'),'utf8'),c);
    }
    vm.runInContext(`mesActual=9;anioActual=2026;trabajadoresGlobal=[{id:1,nombre:'Caja prueba',ceco:'Caja',cargo:'Cajero',responsable:'Supervisión',jornada:40,turno_rotativo:true}];planificacionGlobal=[{trabajador_id:1,fecha:'2026-10-12',turno:'Vacaciones'}];turnosFrecuentesGlobal=[{ceco:'Caja',turno:'09:00 - 17:00'}];coberturaConfigGlobal=[{id:1,tipo:'ceco',valor:'Caja',activo:true,dia_semana:0,hora_inicio:'09:00',hora_fin:'17:00',minimo_inicio:3,minimo_fin:3}];propuestaPlanificacionAutomatica=construirPropuestaPlanificacionAutomatica();`,c);
    const p=vm.runInContext('propuestaPlanificacionAutomatica',c);
    c.motorRenderizarPropuesta(p);
    return {c,p,doc:dom.window.document};
}

test('resumen compacto y pestañas no cambian la propuesta',()=>{
    const {c,p,doc}=contexto();const antes=JSON.stringify(p.asignaciones);
    assert.equal(doc.querySelectorAll('[role="tab"]').length,3);
    assert.equal(doc.querySelector('[role="tab"][aria-selected="true"]').id,'motor-tab-resumen');
    assert.equal(doc.getElementById('motor-panel-turnos').hidden,true);
    assert(doc.getElementById('motor-panel-resumen').textContent.includes('Ninguna de las 5 semanas'));
    assert.equal(doc.getElementById('btn-aprobar-planificacion-automatica').textContent,`Aplicar ${p.asignaciones.length} cambios`);
    c.motorCambiarPestana('problemas');assert.equal(doc.getElementById('motor-panel-problemas').hidden,false);
    assert.equal(JSON.stringify(p.asignaciones),antes);
});

test('revisar brecha muestra sector y semana resultantes incluidos los estados protegidos',()=>{
    const {c,p,doc}=contexto();const antes=JSON.stringify(p.asignaciones);
    const index=p.suficiencia.personal.brechas.findIndex(b=>b.fecha==='2026-10-12');
    c.motorRevisarBrecha(index);
    assert.equal(p.pestana,'turnos');assert.equal(doc.querySelectorAll('#tbody-propuesta-asignaciones tr').length,7);
    assert(doc.getElementById('tbody-propuesta-asignaciones').textContent.includes('Vacaciones'));
    assert(doc.getElementById('motor-contexto-turnos').textContent.includes('Semana del 2026-10-12'));
    doc.getElementById('busqueda-propuesta-automatica').value='2026-10-12';c.motorFiltrarPropuestaAutomatica();
    assert.equal(doc.getElementById('contador-propuesta-asignaciones').textContent,'1 de 7');
    c.motorVerCambiosPropuestos();assert.equal(doc.querySelectorAll('#tbody-propuesta-asignaciones tr').length,p.asignaciones.length);
    assert.equal(JSON.stringify(p.asignaciones),antes);
});

test('búsqueda de problemas conserva los índices para revisar la brecha correcta',()=>{
    const {c,doc}=contexto();doc.getElementById('motor-busqueda-problemas').value='Vacaciones';c.motorFiltrarProblemas();
    const cards=doc.querySelectorAll('#contenedor-propuesta-conflictos .motor-issue');assert.equal(cards.length,1);
    for(const card of cards) assert(card.textContent.includes('2026-10-12'));
    const index=Number(cards[0].querySelector('button').getAttribute('onclick').match(/\d+/)[0]);
    c.motorRevisarBrecha(index);assert(doc.getElementById('motor-contexto-turnos').textContent.includes('2026-10-12'));
});

test('pestañas responden al teclado y los estados aplicados u obsoletos muestran acciones correctas',()=>{
    const {c,p,doc}=contexto();let prevenido=false;
    c.motorTecladoPestanas({target:doc.getElementById('motor-tab-resumen'),key:'ArrowRight',preventDefault(){prevenido=true}});
    assert(prevenido);assert.equal(doc.activeElement.id,'motor-tab-turnos');
    p.estado='APROBADA';p.pestana='resumen';c.motorRenderizarPropuesta(p);
    assert(doc.getElementById('btn-aprobar-planificacion-automatica').hidden);
    assert.equal(doc.getElementById('btn-cerrar-propuesta-automatica').textContent,'Cerrar resumen');
    p.estado='OBSOLETA';c.motorRenderizarPropuesta(p);
    assert.equal(doc.getElementById('btn-aprobar-planificacion-automatica').textContent,'Volver a generar');
    assert.equal(doc.getElementById('btn-aprobar-planificacion-automatica').disabled,false);
});
