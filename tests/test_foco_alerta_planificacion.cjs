const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require(process.env.JSDOM_PATH || 'jsdom');

function contexto(){
    const dom=new JSDOM(fs.readFileSync('frontend/index.html','utf8'));
    const doc=dom.window.document;
    const c=vm.createContext({document:doc,window:dom.window,console});
    const permitidos=new Set(['api','calendario','resumen','cobertura','app','planificacion-alerta','alertas-dashboard','selector-cargos','admin/modal']);
    for(const script of doc.querySelectorAll('script[src]')){
        const archivo=script.getAttribute('src').split('?')[0].replace(/^js\//,'').replace(/\.js$/,'');
        if(permitidos.has(archivo)) vm.runInContext(fs.readFileSync(`frontend/js/${archivo}.js`,'utf8'),c);
    }
    c.personas=Array.from({length:8},(_,i)=>({id:i+1,nombre:`Persona ${i+1}`,cargo:'Operador',ceco:'Caja',jornada:42,activo:true}));
    vm.runInContext(`mesActual=9;anioActual=2026;trabajadoresGlobal=personas;
        planificacionGlobal=[{trabajador_id:7,fecha:'2026-10-08',turno:'16:00 - 00:00'},{trabajador_id:7,fecha:'2026-10-09',turno:'08:00 - 16:00'}];`,c);
    c.adminAutorizado=true;c.obtenerToken=()=> 'sesion-de-prueba';c.obtenerEsSuperAdmin=()=>false;
    c.feriadoDe=()=>null;
    c.inicializarSelectores();
    return {c,doc};
}

function abrirDesdeTarjeta(c,doc,alerta){
    const contenedor=doc.createElement('div');contenedor.innerHTML=c.renderAlertaCard(alerta);
    c.botonDePrueba=contenedor.querySelector('.alerts-row-action');
    vm.runInContext(`(function(){${c.botonDePrueba.getAttribute('onclick')}}).call(botonDePrueba)`,c);
}

const descanso={kind:'descanso',tipo:'danger',trabajador_id:7,trabajador:'Persona 7',fecha1:'2026-10-08',fecha2:'2026-10-09',descanso:8};

test('la tarjeta de descanso lleva al colaborador y marca las dos fechas, sin editar un turno',()=>{
    const {c,doc}=contexto();
    const antes=vm.runInContext('JSON.stringify(planificacionGlobal)',c);
    abrirDesdeTarjeta(c,doc,descanso);
    const marcadas=[...doc.querySelectorAll('.planning-alert-target')];
    assert.equal(marcadas.length,2,'Deben destacarse los dos turnos que originan el descanso');
    assert.deepEqual(marcadas.map(el=>el.querySelector('.turno-input').dataset.fecha),['2026-10-08','2026-10-09']);
    assert(marcadas.every(el=>el.closest('.fila-trabajador').dataset.trabajadorId==='7'));
    assert.equal(doc.activeElement,marcadas[1]);
    assert(!doc.activeElement.matches('.turno-input'));
    const aviso=doc.getElementById('planificacion-alerta-contexto');
    assert(aviso.textContent.includes('Persona 7'));
    assert(aviso.textContent.includes('Descanso'));
    assert(aviso.textContent.includes('08/10/2026'));
    assert(aviso.textContent.includes('09/10/2026'));
    assert.equal(doc.querySelectorAll('.planning-alert-marker').length,2);
    assert.equal(vm.runInContext('JSON.stringify(planificacionGlobal)',c),antes);
});

test('la alerta de horas marca el total del colaborador en la semana exacta',()=>{
    const {c,doc}=contexto();
    vm.runInContext("planificacionGlobal.push({trabajador_id:7,fecha:'2026-10-15',turno:'09:00 - 17:00'})",c);
    const alerta=c.calcularTodasAlertas(c.personas).find(a=>a.kind==='horas' && a.trabajador_id===7 && a.semana===3);
    assert(alerta,'La tarjeta debe proceder de una alerta calculada por el sistema');
    abrirDesdeTarjeta(c,doc,alerta);
    const marcadas=[...doc.querySelectorAll('.planning-alert-target')];
    assert.equal(marcadas.length,1);
    assert(marcadas[0].classList.contains('schedule-hours'));
    assert.equal(marcadas[0].closest('.fila-trabajador').dataset.trabajadorId,'7');
    assert.equal(marcadas[0].closest('.schedule-scroll').dataset.semana,'2026-10-12');
    assert.equal(doc.activeElement,marcadas[0]);
    assert.equal(marcadas[0].querySelector('.planning-alert-marker').textContent,'Revisar horas');
    const aviso=doc.getElementById('planificacion-alerta-contexto');
    assert(aviso.textContent.includes('Semana 3'));
    assert(aviso.textContent.includes('12/10/2026'));
    assert(aviso.textContent.includes('18/10/2026'));
    assert(aviso.textContent.includes(`${Number(alerta.horas).toFixed(1)} h asignadas`));
});

test('feriados y guardados conservan la marca sin volver a desplazar ni quitar el borrador en edición',()=>{
    const {c,doc}=contexto();
    const desplazar=c.desplazarFocoAlertaPlanificacion;
    let saltos=0;c.desplazarFocoAlertaPlanificacion=el=>{saltos++;desplazar(el)};
    abrirDesdeTarjeta(c,doc,descanso);
    const scroll=doc.activeElement.closest('.schedule-scroll');scroll.scrollTop=123;scroll.scrollLeft=45;
    c.renderizarTrabajadores(c.personas);
    assert.equal(saltos,1);
    assert(doc.activeElement.classList.contains('planning-alert-target'));
    assert.equal(doc.activeElement.closest('.schedule-scroll').scrollTop,123);
    assert.equal(doc.querySelectorAll('#planificacion-alerta-contexto').length,1);
    const input=doc.activeElement.closest('.schedule-scroll').querySelector('[data-trabajador-id="8"] .turno-input');
    input.focus();input.value='09:00 - 18:';input.setSelectionRange(8,11);
    c.renderizarTrabajadores(c.personas);
    assert.equal(doc.activeElement.closest('.fila-trabajador').dataset.trabajadorId,'8');
    assert.equal(doc.activeElement.value,'09:00 - 18:');
    assert.equal(doc.activeElement.selectionStart,8);assert.equal(doc.activeElement.selectionEnd,11);
    assert.equal(saltos,1);assert.equal(doc.querySelectorAll('.planning-alert-target').length,2);
});

test('descansos entre semanas o meses marcan solo las fechas visibles sin cambiar al mes equivocado',()=>{
    for(const [fecha1,fecha2,esperadas] of [
        ['2026-10-04','2026-10-05',['2026-10-04','2026-10-05']],
        ['2026-09-27','2026-09-28',['2026-09-28']]
    ]){
        const {c,doc}=contexto();
        abrirDesdeTarjeta(c,doc,{...descanso,fecha1,fecha2});
        assert.deepEqual([...doc.querySelectorAll('.planning-alert-target .turno-input')].map(el=>el.dataset.fecha),esperadas);
        assert.equal(vm.runInContext('mesActual',c),9);
        assert.equal(doc.activeElement.querySelector('.turno-input').dataset.fecha,fecha2);
    }
});

test('la tarjeta conserva su período de origen aunque el selector haya cambiado después de dibujarla',()=>{
    const {c,doc}=contexto();
    const tarjeta=doc.createElement('div');tarjeta.innerHTML=c.renderAlertaCard(descanso);
    c.botonDePrueba=tarjeta.querySelector('button');
    vm.runInContext('mesActual=10;anioActual=2027',c);
    vm.runInContext(`(function(){${c.botonDePrueba.getAttribute('onclick')}}).call(botonDePrueba)`,c);
    assert.equal(vm.runInContext('mesActual',c),9);assert.equal(vm.runInContext('anioActual',c),2026);
    assert.equal(doc.getElementById('mes-selector').value,'9');assert.equal(doc.getElementById('anio-selector').value,'2026');
    assert.equal(doc.querySelectorAll('.planning-alert-target').length,2);
});

test('quitar la marca o cambiar el período limpia todo el contexto sin tocar turnos',()=>{
    const {c,doc}=contexto();
    abrirDesdeTarjeta(c,doc,descanso);
    doc.querySelector('[data-quitar-marca]').click();
    assert.equal(doc.querySelector('.planning-alert-target,.planning-alert-marker,.planning-alert-row,#planificacion-alerta-contexto'),null);
    assert.equal(c.window.focoAlertaPlanificacion,null);
    abrirDesdeTarjeta(c,doc,descanso);
    vm.runInContext('mesActual=10',c);c.renderizarTrabajadores(c.personas);
    assert.equal(doc.getElementById('planificacion-alerta-contexto'),null);
    assert.equal(c.window.focoAlertaPlanificacion,null);
});

test('el contexto usa texto seguro y Volver a alertas conserva el cargo sin abrir otro modal',()=>{
    const {c,doc}=contexto();
    c.personas[6].nombre='<img src=x onerror=alert(1)>';
    abrirDesdeTarjeta(c,doc,{...descanso,trabajador:c.personas[6].nombre});
    const aviso=doc.getElementById('planificacion-alerta-contexto');
    assert.equal(aviso.querySelector('img,script'),null);
    assert(aviso.textContent.includes('<img'));
    aviso.querySelector('[data-volver-alertas]').click();
    assert.equal(doc.getElementById('vista-alertas').classList.contains('hidden'),false);
    assert.equal(doc.getElementById('selector-cargos-planificacion'),null);
    assert.deepEqual(Array.from(c.window.cargosSeleccionados),['Operador']);
});

test('fechas o semanas inválidas no señalan otra celda por aproximación',()=>{
    const {c,doc}=contexto();
    for(const datos of [
        {alertaKind:'descanso',fecha1:'2026-02-30',fecha2:'2026-10-09'},
        {alertaKind:'descanso',fecha1:'2026-10-08',fecha2:'2026-10-08'},
        {alertaKind:'horas',semana:'3-invalida'},
        {alertaKind:'horas',semana:'99'},
        {alertaKind:'horas',semana:'0'},
        {alertaKind:'horas',semana:'2',mes:''}
    ]){
        c.mostrarPlanificacionDesdeAlerta('7',{mes:'9',anio:'2026',...datos});
        assert.equal(doc.querySelector('.planning-alert-target'),null);
        assert.equal(c.window.focoAlertaPlanificacion,null);
    }
});

test('filtrar o desactivar el colaborador no deja una marca de otro equipo',()=>{
    const {c,doc}=contexto();
    abrirDesdeTarjeta(c,doc,descanso);
    doc.getElementById('busqueda-planificacion').value='Persona 8';
    c.actualizarVistaPlanificacion();
    assert.equal(doc.querySelector('.planning-alert-target,#planificacion-alerta-contexto'),null);
    assert.equal(c.window.focoAlertaPlanificacion,null);
    abrirDesdeTarjeta(c,doc,descanso);
    c.personas[6].activo=false;c.actualizarVistaPlanificacion();
    assert.equal(doc.querySelector('.planning-alert-target,#planificacion-alerta-contexto'),null);
    assert.equal(c.window.focoAlertaPlanificacion,null);
});

test('sin sesión o como superadmin el enlace no activa marcas ni cambia el período',()=>{
    for(const superadmin of [false,true]){
        const {c,doc}=contexto();
        c.adminAutorizado=superadmin;c.obtenerToken=()=>superadmin ? 'sesion-de-prueba' : '';
        c.obtenerEsSuperAdmin=()=>superadmin;
        let login=0,saas=0;c.iniciarSesion=()=>{login++};c.mostrarVistaSaasAdmin=()=>{saas++};
        abrirDesdeTarjeta(c,doc,descanso);
        assert.equal(login,superadmin ? 0 : 1);assert.equal(saas,superadmin ? 1 : 0);
        assert.equal(doc.querySelector('.planning-alert-target'),null);
        assert.equal(c.window.focoAlertaPlanificacion,undefined);
        assert.equal(vm.runInContext('mesActual',c),9);
    }
});
