const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const persona = {id:1,nombre:'Caja',ceco:'Caja',cargo:'Cajero',area:'Operaciones',jornada:40,turno_rotativo:true};
const otra = {id:2,nombre:'Seguridad',ceco:'Seguridad',cargo:'Guardia',area:'Seguridad',jornada:40};
const registro = (id,fecha,turno) => ({trabajador_id:id,fecha,turno});
const regla = {id:1,tipo:'ceco',valor:'Caja',activo:true,dia_semana:0,hora_inicio:'09:00',hora_fin:'17:00',minimo_inicio:1,minimo_fin:1};
function contexto(plan=[], reglas=[regla]){
    const boton={disabled:false,textContent:'',style:{}};
    const c=vm.createContext({window:{cargosSeleccionados:[]}, document:{addEventListener(){},getElementById:()=>boton}, alert(){}, adminAutorizado:true});
    for(const f of ['api','calendario','resumen','cobertura','app','motor_diagnostico','motor_jornada','motor_asignacion']){
        vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js',f+'.js'),'utf8'),c);
    }
    Object.assign(c,{planPrueba:plan,reglasPrueba:reglas,personasPrueba:[persona,otra]});
    vm.runInContext(`mesActual=9;anioActual=2026;trabajadoresGlobal=personasPrueba;planificacionGlobal=planPrueba;coberturaConfigGlobal=reglasPrueba;turnosFrecuentesGlobal=[{ceco:'Caja',turno:'09:00 - 17:00'}];`,c);
    c.obtenerToken=()=> 'prueba';
    return {c,boton};
}

test('vacaciones y salientes no se reemplazan en cobertura ni al completar jornada',()=>{
    const {c}=contexto();
    for(const estado of ['Vacaciones','Saliente']){
        const r=registro(1,'2026-10-12',estado);
        const mapa=new Map([['1|2026-10-12',r]]);
        assert.equal(c.motorCandidatoValido(mapa,persona,r.fecha,'09:00 - 17:00'),false);
        assert.equal(c.motorSeleccionarCandidato(mapa,[persona],['09:00 - 17:00'],r.fecha),null);
        assert.equal(mapa.get('1|2026-10-12'),r);
    }
});

test('horas semanales incluyen lunes y aceptan fecha ISO sin duplicar la hora',()=>{
    const {c}=contexto([registro('1','2026-10-12','09:00 - 17:00'),registro(1,'2026-10-13','09:00 - 17:00')]);
    const mapa=c.motorMapaPlanificacionActual();
    assert.equal(c.motorInicioSemana('2026-10-12T00:00:00'),'2026-10-12');
    assert.equal(c.motorHorasSemana(mapa,persona,'2026-10-12'),15);
    assert.equal(c.motorHorasFaltantesSemana(mapa,persona,'2026-10-12T00:00:00'),25);
    assert.equal(c.motorHorasSemana(mapa,persona,'2026-10-12','09:00 - 13:00'),11);
});

test('personal de otro CECO, cargo o área no cierra la brecha de Caja',()=>{
    const {c}=contexto([registro(2,'2026-10-12','09:00 - 18:00')]);
    const mapa=c.motorMapaPlanificacionActual();
    for(const r of [regla,{...regla,tipo:'cargo',valor:'Cajero'},{...regla,tipo:'area',valor:'Operaciones'}]){
        assert.equal(c.motorTurnoCubreSlotSubcubierto(mapa,'09:00 - 17:00','2026-10-12',[r]),true);
    }
    mapa.set('1|2026-10-12',registro(1,'2026-10-12','09:00 - 17:00'));
    assert.equal(c.motorTurnoCubreSlotSubcubierto(mapa,'09:00 - 18:00','2026-10-12',[regla]),false);
});

test('cierre usa el último minuto y mínimos heredados, también tras medianoche',()=>{
    const {c}=contexto();
    assert.equal(c.motorTurnoCubreSlotSubcubierto(new Map(),'09:00 - 17:00','2026-10-12',[{...regla,minimo_inicio:0,minimo_fin:1}]),true);
    assert.equal(c.motorTurnoCubreSlotSubcubierto(new Map(),'22:00 - 06:00','2026-10-12',[{...regla,hora_inicio:'22:00',hora_fin:'06:00',minimo_inicio:undefined,minimo_fin:undefined,minimo_personas:1}]),true);
});

test('generar mantiene vacaciones y no modifica la planificación en memoria',()=>{
    const plan=[registro(1,'2026-10-12','Vacaciones')];
    const {c}=contexto(plan);
    const antes=JSON.stringify(plan);
    const p=c.construirPropuestaPlanificacionAutomatica();
    assert.equal(JSON.stringify(plan),antes);
    assert(!p.asignaciones.some(a=>a.trabajador_id===1 && a.fecha==='2026-10-12'));
    assert(p.conflictos.some(a=>a.fecha==='2026-10-12'));
});

test('resumen final elimina brechas ya cubiertas y mide semanas completas sin omitir lunes',()=>{
    const plan=Array.from({length:5},(_,i)=>registro(1,`2026-10-${12+i}`,'09:00 - 17:30'));
    const {c}=contexto(plan);
    const r=c.motorEvaluarResultadoFinal(c.motorMapaPlanificacionActual(),[persona],['2026-10-12'],[regla]);
    assert.equal(r.conflictos.length,0);
    assert.equal(r.reglasEvaluadas,1);
    assert.equal(r.semanasAlcanzadas,1);
    assert.equal(r.semanasTotales,1);
    assert.equal(c.motorResumenSuficiencia(31,0,[]).personal_suficiente,false);
});

test('no diagnostica sin días a una persona con planificación ya existente',()=>{
    const plan=Array.from({length:31},(_,i)=>registro(1,`2026-10-${String(i+1).padStart(2,'0')}`,'09:00 - 10:00'));
    const {c}=contexto(plan);
    const p=c.construirPropuestaPlanificacionAutomatica();
    assert(!p.suficiencia.diagnostico.sin_dias.some(t=>t.id===1));
});

function propuesta(c){
    c.propuestaPrueba={estado:'PENDIENTE_APROBACION',mes:9,anio:2026,cargos:[],trabajadores_ids:[1],suficiencia:{},conflictos:[],asignaciones:[{...registro(1,'2026-10-12','09:00 - 17:00'),horas:7.5,responsable:'Supervisión'}]};
    vm.runInContext('propuestaPlanificacionAutomatica=propuestaPrueba',c);
    return c.propuestaPrueba;
}

test('aprobación guarda una sola vez y el resumen usa lo recargado del servidor',async()=>{
    const {c,boton}=contexto();const p=propuesta(c);
    let finalizar,envios=0,refrescos=0,render;
    c.guardarPlanificacionAutomatica=()=>{envios++;return new Promise(r=>finalizar=r)};
    c.obtenerPlanificacion=async()=>[registro(1,'2026-10-12','Vacaciones')];
    c.actualizarVistaPlanificacion=()=>refrescos++;
    c.motorRenderizarPropuesta=valor=>render=valor;
    const aplicando=c.aprobarPlanificacionAutomatica();
    await c.aprobarPlanificacionAutomatica();assert.equal(envios,1);assert.equal(p.estado,'APLICANDO');
    finalizar({ok:true});await aplicando;
    assert.equal(p.estado,'APROBADA');assert.equal(refrescos,1);assert.equal(render,p);
    assert(p.conflictos.some(a=>a.fecha==='2026-10-12'));
    assert.equal(p.suficiencia.reglas_sin_cubrir,4);
    assert.equal(boton.disabled,true);
});

test('fallo de guardado conserva propuesta pendiente; fallo de recarga conserva aplicación confirmada',async()=>{
    const {c}=contexto();const p=propuesta(c);let envios=0;
    c.guardarPlanificacionAutomatica=async()=>{envios++;return {ok:false,status:500,json:async()=>({detail:'Error de prueba'})}};
    await c.aprobarPlanificacionAutomatica();assert.equal(p.estado,'PENDIENTE_APROBACION');
    assert.equal(c.motorMapaPlanificacionActual().size,0);
    c.guardarPlanificacionAutomatica=async()=>{envios++;return {ok:true}};
    c.obtenerPlanificacion=async()=>{throw new Error('Sin red')};
    c.actualizarVistaPlanificacion=()=>{};c.motorRenderizarPropuesta=()=>{};
    await c.aprobarPlanificacionAutomatica();
    assert.equal(p.estado,'APROBADA');assert(p.aviso_recarga.includes('fueron guardados'));
    assert.equal(c.motorMapaPlanificacionActual().get('1|2026-10-12').turno,'09:00 - 17:00');
    await c.aprobarPlanificacionAutomatica();assert.equal(envios,2);
});

test('las correcciones mantienen descanso, límite semanal y máximo de días consecutivos',()=>{
    const casos=[
        {plan:[registro(1,'2026-10-12','16:00 - 00:00')],fecha:'2026-10-13',turno:'08:00 - 16:00'},
        {plan:Array.from({length:4},(_,i)=>registro(1,`2026-10-${12+i}`,'09:00 - 19:00')),fecha:'2026-10-16',turno:'09:00 - 17:00'},
        {plan:Array.from({length:6},(_,i)=>registro(1,`2026-10-${12+i}`,'09:00 - 10:00')),fecha:'2026-10-18',turno:'09:00 - 10:00'}
    ];
    for(const caso of casos){
        const {c}=contexto(caso.plan);
        assert.equal(c.motorCandidatoValido(c.motorMapaPlanificacionActual(),persona,caso.fecha,caso.turno),false);
    }
});

test('diagnóstico distingue falta de dotación de ausencia y turnos incompatibles',()=>{
    const {c}=contexto([],[{...regla,minimo_inicio:3,minimo_fin:3}]);
    const r=c.motorEvaluarResultadoFinal(new Map(),[persona],['2026-10-12'],[{...regla,minimo_inicio:3,minimo_fin:3}]);
    assert.equal(r.personal.estado,'falta-dotacion');
    assert.equal(r.personal.adicionales_minimos,2);
    assert.equal(r.personal.brechas.length,1);
    const {c:ausencia}=contexto([registro(1,'2026-10-12','Vacaciones')]);
    const a=ausencia.motorEvaluarResultadoFinal(ausencia.motorMapaPlanificacionActual(),[persona],['2026-10-12'],[regla]);
    assert.equal(a.personal.estado,'falta-disponibilidad');
    assert.equal(a.personal.adicionales_minimos,0);
    assert.equal(a.personal.brechas[0].motivos[0].motivo,'Vacaciones');
    const {c:catalogo}=contexto();
    vm.runInContext("turnosFrecuentesGlobal=[{ceco:'Caja',turno:'18:00 - 23:00'}]",catalogo);
    const b=catalogo.motorEvaluarResultadoFinal(new Map(),[persona],['2026-10-12'],[regla]);
    assert.equal(b.personal.estado,'revisar-turnos');
    assert.equal(b.personal.brechas[0].motivos[0].motivo,'Sin turno compatible en el catálogo');
});

test('dotación suficiente se informa solo cuando la cobertura resultante cumple',()=>{
    const {c}=contexto([registro(1,'2026-10-12','09:00 - 17:00')]);
    const r=c.motorEvaluarResultadoFinal(c.motorMapaPlanificacionActual(),[persona],['2026-10-12'],[regla]);
    assert.equal(r.personal.estado,'cubierto');
    assert.equal(r.personal.brechas.length,0);
    assert.equal(c.motorResumenPersonal([],0).estado,'sin-reglas');
    assert(c.motorRenderPersonal(r.personal).includes('toda la franja configurada'));
});

test('una revisión obsoleta no puede reaplicarse y exige volver a generar',async()=>{
    const {c}=contexto();const p=propuesta(c);let render;
    c.guardarPlanificacionAutomatica=async()=>({ok:false,status:409,json:async()=>({detail:'Cambió la planificación'})});
    c.motorRenderizarPropuesta=valor=>render=valor;
    await c.aprobarPlanificacionAutomatica();
    assert.equal(p.estado,'OBSOLETA');assert.equal(render,p);assert.equal(c.motorMapaPlanificacionActual().size,0);
    let generadas=0;c.generarPlanificacionAutomatica=async()=>generadas++;
    await c.aprobarPlanificacionAutomatica();assert.equal(generadas,1);
});

test('generación usa un contexto actual del servidor y adjunta su revisión',async()=>{
    const {c}=contexto();let refrescos=0;let render;
    c.obtenerContextoAutomatico=async()=>({revision:'a'.repeat(64),trabajadores:[persona],planificacion:[registro(1,'2026-10-12','Vacaciones')],cobertura:[regla],colacion:[],turnos:[{ceco:'Caja',turno:'09:00 - 17:00'}]});
    c.actualizarVistaPlanificacion=()=>refrescos++;c.motorRenderizarPropuesta=p=>render=p;
    await c.generarPlanificacionAutomatica();
    assert.equal(render.revision,'a'.repeat(64));assert.equal(refrescos,1);
    assert(!render.asignaciones.some(a=>a.fecha==='2026-10-12'));
});

test('no propone reaplicar turnos ya guardados sin cambios reales',()=>{
    const plan=['05','12','19','26'].map(d=>({...registro(1,`2026-10-${d}`,'09:00 - 17:00'),horas:7.5,responsable:''}));
    const {c}=contexto(plan,[{...regla,minimo_inicio:2,minimo_fin:2}]);
    const p=c.construirPropuestaPlanificacionAutomatica();
    assert(!p.asignaciones.some(a=>a.trabajador_id===1 && plan.some(previo=>previo.fecha===a.fecha)));
    assert(p.asignaciones.some(a=>a.trabajador_id===1));
    assert.equal(p.suficiencia.personal.estado,'falta-dotacion');
});

test('completa cinco jornadas aunque exista una sola regla de cobertura el lunes',()=>{
    const {c}=contexto();
    vm.runInContext("trabajadoresGlobal=[personasPrueba[0]];turnosFrecuentesGlobal=[{ceco:'Caja',turno:'09:00 - 17:30'}]",c);
    const p=c.construirPropuestaPlanificacionAutomatica();
    const semana=p.asignaciones.filter(a=>a.fecha>='2026-10-12' && a.fecha<='2026-10-18');
    assert.equal(semana.length,5);
    assert.equal(semana.reduce((n,a)=>n+a.horas,0),40);
    assert(semana.some(a=>a.fecha==='2026-10-12'));
    assert.equal(p.suficiencia.reglas_sin_cubrir,0);
});

test('busca combinación completa en lugar de quedar corto eligiendo siempre el turno más largo',()=>{
    const {c}=contexto();
    vm.runInContext("trabajadoresGlobal=[personasPrueba[0]];turnosFrecuentesGlobal=[{ceco:'Caja',turno:'09:00 - 18:30'},{ceco:'Caja',turno:'09:00 - 17:30'}]",c);
    const p=c.construirPropuestaPlanificacionAutomatica();
    const semana=p.asignaciones.filter(a=>a.fecha>='2026-10-12' && a.fecha<='2026-10-18');
    assert.equal(semana.length,5);
    assert.equal(semana.reduce((n,a)=>n+a.horas,0),40);
    assert(semana.every(a=>a.turno==='09:00 - 17:30'));
});

test('completa jornadas sin reglas de cobertura y conserva vacaciones y horarios manuales',()=>{
    const plan=[registro(1,'2026-10-12','Vacaciones'),registro(1,'2026-10-13','09:00 - 17:30')];
    const {c}=contexto(plan,[]);
    vm.runInContext("trabajadoresGlobal=[personasPrueba[0]];turnosFrecuentesGlobal=[{ceco:'Caja',turno:'09:00 - 17:30'}]",c);
    const p=c.construirPropuestaPlanificacionAutomatica();
    const nuevas=p.asignaciones.filter(a=>a.fecha>='2026-10-12' && a.fecha<='2026-10-18');
    assert.equal(nuevas.length,4);
    assert(!nuevas.some(a=>['2026-10-12','2026-10-13'].includes(a.fecha)));
    assert.equal(nuevas.reduce((n,a)=>n+a.horas,0)+8,40);
});

test('los fijos completan sus días configurados aunque solo se exija cobertura un día',()=>{
    const {c}=contexto();
    vm.runInContext("trabajadoresGlobal=[{...personasPrueba[0],turno_rotativo:false,turnos_fijos:Array.from({length:5},(_,dia)=>({dia_semana:dia,turno:'09:00 - 17:30'}))}]",c);
    const p=c.construirPropuestaPlanificacionAutomatica();
    const semana=p.asignaciones.filter(a=>a.fecha>='2026-10-12' && a.fecha<='2026-10-18');
    assert.equal(semana.length,5);assert.equal(semana.reduce((n,a)=>n+a.horas,0),40);
    assert(!semana.some(a=>['2026-10-17','2026-10-18'].includes(a.fecha)));
});

test('explica las horas restantes cuando el catálogo no permite alcanzar la jornada exacta',()=>{
    const {c}=contexto();vm.runInContext('trabajadoresGlobal=[personasPrueba[0]]',c);
    const p=c.construirPropuestaPlanificacionAutomatica();
    const pendiente=p.suficiencia.jornadas_pendientes.find(j=>j.semana==='2026-10-12');
    assert.equal(pendiente.horas,37.5);assert.equal(pendiente.faltan,2.5);
    assert(pendiente.motivo.includes('catálogo'));
});

test('turnos de personal inactivo no cubren la demanda ni ocultan falta de dotación',()=>{
    const {c}=contexto([registro(1,'2026-10-12','09:00 - 18:00')]);
    vm.runInContext('trabajadoresGlobal[0]={...trabajadoresGlobal[0],activo:false}',c);
    const resultado=c.motorEvaluarResultadoFinal(c.motorMapaPlanificacionActual(),[],['2026-10-12'],[regla]);
    assert.equal(resultado.personal.estado,'falta-dotacion');
    assert.equal(resultado.personal.brechas[0].asignados,0);
    assert.equal(resultado.personal.adicionales_minimos,1);
    assert.equal(c.intervalosTrabajadosParaRegla(regla,'2026-10-12').length,0);
});

test('una regla de cargo seleccionado sigue evaluándose después de eliminar su último trabajador',()=>{
    const {c}=contexto();
    const r={...regla,tipo:'cargo',valor:'Cargo eliminado'};
    const resultado=c.motorEvaluarResultadoFinal(new Map(),[],['2026-10-12'],[r],['Cargo eliminado']);
    assert.equal(resultado.reglasEvaluadas,1);
    assert.equal(resultado.personal.estado,'falta-dotacion');
});

test('un horario inválido nunca permite concluir que el equipo cubre la demanda',()=>{
    const {c}=contexto();
    const resultado=c.motorEvaluarResultadoFinal(new Map(),[persona],['2026-10-12'],[{...regla,hora_inicio:'inválida'}]);
    assert.notEqual(resultado.personal.estado,'cubierto');
});

test('detecta un hueco intermedio aunque apertura y cierre estén cubiertos',()=>{
    const {c}=contexto([registro(1,'2026-10-12','09:00 - 12:00'),registro(2,'2026-10-12','14:00 - 17:00')]);
    vm.runInContext("trabajadoresGlobal[1]={...trabajadoresGlobal[1],ceco:'Caja'}",c);
    const brechas=c.motorBrechasRegla(c.motorMapaPlanificacionActual(),vm.runInContext('trabajadoresGlobal',c),regla,'2026-10-12');
    assert.equal(brechas.length,1);assert.equal(c.etiquetaPuntoBrecha(brechas[0]),'12:00–14:00');
    assert.equal(brechas[0].faltan,1);
    const resultado=c.motorEvaluarResultadoFinal(c.motorMapaPlanificacionActual(),[persona],['2026-10-12'],[regla]);
    assert.notEqual(resultado.personal.estado,'cubierto');
});

test('relevo sin huecos y turnos de días vecinos cubren una franja nocturna',()=>{
    const {c}=contexto([registro(1,'2026-10-12','22:00 - 02:00'),registro(2,'2026-10-13','02:00 - 06:00')]);
    vm.runInContext("trabajadoresGlobal[1]={...trabajadoresGlobal[1],ceco:'Caja'}",c);
    const r={...regla,hora_inicio:'22:00',hora_fin:'06:00'};
    assert.equal(c.motorBrechasRegla(c.motorMapaPlanificacionActual(),vm.runInContext('trabajadoresGlobal',c),r,'2026-10-12').length,0);
    assert.equal(c.calcularBrechasIntervalo(c.intervaloDesdeHora(new Date('2026-10-12T00:00:00'),'22:00','06:00'),c.intervalosTrabajadosParaRegla(r,'2026-10-12'),1,1).length,0);
});

test('conserva mínimos distintos en extremos y usa el menor en el interior',()=>{
    const {c}=contexto();
    const requerido=c.intervaloDesdeHora(new Date('2026-10-12T00:00:00'),'09:00','17:00');
    const intervalos=[c.intervaloDesdeTurno('2026-10-12','09:00 - 17:00')];
    const brechas=c.calcularBrechasIntervalo(requerido,intervalos,2,1);
    assert.equal(brechas.length,1);assert.equal(brechas[0].punto,'inicio');assert.equal(brechas[0].minimo,2);
});

test('completar horas no puede sustituir un turno por otro que abra un hueco intermedio',()=>{
    const {c}=contexto();
    assert.equal(c.motorConservaPuntosCubiertos(persona,'2026-10-12','10:00 - 15:00','09:00 - 12:00'),false);
    assert.equal(c.motorConservaPuntosCubiertos(persona,'2026-10-12','10:00 - 15:00','09:00 - 17:00'),true);
});

test('automatizador rellena el hueco intermedio sin cambiar los relevos manuales',()=>{
    const {c}=contexto([registro(1,'2026-10-12','09:00 - 12:00'),registro(2,'2026-10-12','14:00 - 17:00')]);
    vm.runInContext("trabajadoresGlobal[1]={...trabajadoresGlobal[1],ceco:'Caja'}; trabajadoresGlobal.push({id:3,nombre:'Refuerzo',cargo:'Cajero',ceco:'Caja',jornada:40,turno_rotativo:true})",c);
    const propuesta=c.construirPropuestaPlanificacionAutomatica();
    const refuerzo=propuesta.asignaciones.find(a=>a.trabajador_id===3 && a.fecha==='2026-10-12');
    assert(refuerzo);
    const intervalo=c.intervaloDesdeTurno(refuerzo.fecha,refuerzo.turno);
    assert(intervalo.inicio<=new Date('2026-10-12T12:00:00') && intervalo.fin>=new Date('2026-10-12T14:00:00'));
    assert(!propuesta.asignaciones.some(a=>[1,2].includes(a.trabajador_id) && a.fecha==='2026-10-12'));
});
