const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const {JSDOM}=require(process.env.JSDOM_PATH || 'jsdom');
function contexto(){
    const dom=new JSDOM('<button id="origen">Planificación</button><input id="busqueda-planificacion" value="Persona anterior">',{url:'http://localhost'});
    dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};
    dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'))};
    const c=vm.createContext({window:{cargosSeleccionados:[],busquedaPlanificacion:'Persona anterior'},document:dom.window.document,localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage});
    for(const f of ['api','selector-cargos']) vm.runInContext(fs.readFileSync(`frontend/js/${f}.js`,'utf8'),c);
    c.trabajadoresGlobal=[{cargo:'Técnico',activo:true},{cargo:'Técnico',activo:false},{cargo:'Ingeniero',activo:true},{cargo:'Técnico',activo:true}];
    c.guardarEmpresa({id:1});c.guardarNombreUsuario('Ana');
    let apertura=0;c.cargarCargos=()=>{};c.mostrarVistaPlanificacion=seleccionar=>{assert.equal(seleccionar,false);apertura++};
    const change=el=>el.dispatchEvent(new dom.window.Event('change'));
    const enviar=()=>dom.window.document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
    const fila=nombre=>[...dom.window.document.querySelectorAll('.cargo-picker-option')].find(e=>e.textContent.includes(nombre));
    return {c,doc:dom.window.document,dom,change,enviar,fila,aperturas:()=>apertura};
}
test('exige seleccionar cargos antes de continuar, cuenta solo activos y recuerda selección',()=>{
    const {c,doc,change,enviar,fila,aperturas}=contexto();c.abrirSelectorCargosPlanificacion();
    assert.equal(doc.querySelectorAll('.cargo-picker').length,1);c.abrirSelectorCargosPlanificacion();assert.equal(doc.querySelectorAll('.cargo-picker').length,1);
    assert(fila('Técnico').textContent.includes('2 activos'));
    assert.equal(doc.querySelector('[data-todos]').checked,false);
    assert.equal(doc.querySelector('[type=submit]').disabled,true);
    enviar();assert.equal(aperturas(),0);
    const input=fila('Técnico').querySelector('input');input.checked=true;change(input);enviar();
    assert.equal(c.window.cargosSeleccionados.length,1);assert.equal(c.window.cargosSeleccionados[0],'Técnico');assert.equal(aperturas(),1);
    assert.equal(doc.getElementById('busqueda-planificacion').value,'');
    c.abrirSelectorCargosPlanificacion();assert(fila('Técnico').querySelector('input').checked);
});
test('búsqueda conserva selección múltiple y cancelar no cambia filtro',()=>{
    const {c,doc,dom,change,fila}=contexto();c.window.cargosSeleccionados=['Técnico'];c.abrirSelectorCargosPlanificacion();
    const input=fila('Ingeniero').querySelector('input');input.checked=true;change(input);
    const buscar=doc.querySelector('[type=search]');buscar.value='tecnico';buscar.dispatchEvent(new dom.window.Event('input'));
    assert.equal(fila('Técnico').hidden,false);assert.equal(fila('Ingeniero').hidden,true);
    assert(fila('Ingeniero').querySelector('input').checked);doc.querySelector('.cargo-picker-cancel').click();
    assert.equal(c.window.cargosSeleccionados.length,1);assert.equal(c.window.busquedaPlanificacion,'Persona anterior');
});
test('preferencias separadas por empresa y cargos eliminados no se convierten en todos',()=>{
    const {c,doc}=contexto();c.window.cargosSeleccionados=['Eliminado'];c.guardarPreferenciaCargos();c.abrirSelectorCargosPlanificacion();
    assert(doc.querySelector('[type=submit]').disabled);assert.equal(doc.querySelector('[data-todos]').checked,false);
    doc.querySelector('.cargo-picker-close').click();c.guardarEmpresa({id:2});c.window.cargosSeleccionados=[];c.abrirSelectorCargosPlanificacion();
    assert.equal(doc.querySelector('[data-todos]').checked,false);
    assert.equal(doc.querySelector('[type=submit]').disabled,true);
});
test('sin cargos con personal activo no permite continuar ni ofrece cargos inactivos',()=>{
    const {c,doc,enviar,aperturas}=contexto();c.trabajadoresGlobal=[{cargo:'Técnico',activo:false},{cargo:'',activo:true}];c.abrirSelectorCargosPlanificacion();
    assert.equal(doc.querySelectorAll('.cargo-picker-option').length,0);assert.equal(doc.querySelector('[type=submit]').disabled,true);enviar();assert.equal(aperturas(),0);
});

test('Todos requiere una acción explícita y guarda los cargos concretos elegidos',()=>{
    const {c,doc,change,enviar,aperturas}=contexto();c.abrirSelectorCargosPlanificacion();
    const todos=doc.querySelector('[data-todos]');todos.checked=true;change(todos);enviar();
    assert.equal(aperturas(),1);
    assert.deepEqual(Array.from(c.window.cargosSeleccionados).sort(),['Ingeniero','Técnico']);
});

test('entrar a planificación no revela ni renderiza la vista antes de confirmar cargos',()=>{
    const {c,doc,change,enviar,fila}=contexto();
    for(const id of ['vista-planificacion','vista-trabajadores','right-panel','main-content']){
        const el=doc.createElement('div');el.id=id;el.classList.add('hidden');doc.body.appendChild(el);
    }
    vm.runInContext(fs.readFileSync('frontend/js/admin/modal.js','utf8'),c);
    c.adminAutorizado=true;c.obtenerToken=()=> 'sesion-de-prueba';
    let renders=0;c.actualizarVistaPlanificacion=()=>{renders++};
    c.mostrarVistaPlanificacion();
    assert.equal(renders,0);assert(doc.getElementById('vista-planificacion').classList.contains('hidden'));
    const input=fila('Técnico').querySelector('input');input.checked=true;change(input);enviar();
    assert.equal(renders,1);assert.equal(doc.getElementById('vista-planificacion').classList.contains('hidden'),false);
});

test('cancelar o pulsar Escape en la selección obligatoria sale a Colaboradores sin abrir planificación',()=>{
    for(const escape of [false,true]){
        const {c,doc,dom,aperturas}=contexto();let salidas=0;
        c.mostrarVistaTrabajadores=()=>{salidas++};
        c.abrirSelectorCargosPlanificacion(true);
        if(escape) doc.querySelector('dialog').dispatchEvent(new dom.window.Event('cancel',{cancelable:true}));
        else doc.querySelector('.cargo-picker-cancel').click();
        assert.equal(aperturas(),0);assert.equal(salidas,1);assert.equal(doc.querySelector('dialog'),null);
    }
});

test('no guarda turnos sin seleccionar cargos ni para un cargo fuera de la selección',async()=>{
    const {c,doc}=contexto();
    vm.runInContext(fs.readFileSync('frontend/js/app.js','utf8'),c);
    vm.runInContext('trabajadoresGlobal=[{id:7,cargo:"Técnico",ceco:"TI"}]',c);
    const fila=doc.createElement('div');fila.className='fila-trabajador';fila.dataset.trabajadorId='7';
    const input=doc.createElement('input');input.value='09:00 - 17:30';input.dataset.fecha='2026-11-19';fila.appendChild(input);doc.body.appendChild(fila);
    c.adminAutorizado=true;c.obtenerToken=()=> 'sesion-de-prueba';
    c.console={log(){}};c.colacionPorCeco=()=>0.5;c.calcularHorasSemana=()=>8;
    let peticiones=0,solicitudes=0;
    c.guardarPlanificacion=async()=>{peticiones++;return {ok:false,status:400,json:async()=>({})}};
    c.alert=()=>{};
    c.abrirSelectorCargosPlanificacion=obligatorio=>{assert.equal(obligatorio,true);solicitudes++};
    for(const cargos of [[],['Ingeniero']]){
        c.window.cargosSeleccionados=cargos;
        await c.guardarTurno(input);
    }
    assert.equal(peticiones,0);assert.equal(solicitudes,2);
    c.window.cargosSeleccionados=['Técnico'];
    await c.guardarTurno(input);
    assert.equal(peticiones,1);
});

test('confirmar retira el diálogo inmediatamente aunque el evento close sea diferido',()=>{
    const {c,doc,dom,fila,change,enviar}=contexto();
    dom.window.HTMLDialogElement.prototype.close=function(){this.open=false};
    c.abrirSelectorCargosPlanificacion();
    const input=fila('Técnico').querySelector('input');input.checked=true;change(input);enviar();
    assert.equal(doc.querySelector('dialog'),null);
    c.abrirSelectorCargosPlanificacion(true);
    assert.equal(doc.querySelector('dialog').open,true);
});

test('Alertas reutiliza el mismo modal con selección única y sin opción Todos',()=>{
    const {c,doc,change,enviar,fila,aperturas}=contexto();
    c.window.cargosSeleccionados=['Técnico','Ingeniero'];c.guardarPreferenciaCargos();
    let alertas=0;c.mostrarVistaAlertas=seleccionar=>{assert.equal(seleccionar,false);alertas++};
    c.abrirSelectorCargosPlanificacion(true,'alertas');
    assert.equal(doc.querySelector('dialog').id,'selector-cargos-planificacion');
    assert.equal(doc.querySelector('[data-todos]'),null);
    assert.equal(doc.querySelectorAll('.cargo-picker-option input[type=radio]').length,2);
    assert(doc.getElementById('cargo-picker-title').textContent.includes('consultar'));
    assert.equal(doc.querySelector('[type=submit]').textContent,'Ver alertas');
    assert.equal(doc.querySelector('[type=submit]').disabled,true);
    enviar();assert.equal(alertas,0);
    for(const nombre of ['Técnico','Ingeniero']){
        const input=fila(nombre).querySelector('input');input.checked=true;change(input);
        assert.equal(doc.querySelectorAll('.cargo-picker-option input:checked').length,1);
    }
    enviar();
    assert.equal(alertas,1);assert.equal(aperturas(),0);
    assert.deepEqual(Array.from(c.window.cargosSeleccionados),['Ingeniero']);
    assert.equal(doc.getElementById('busqueda-planificacion').value,'');
    assert.equal(doc.querySelector('dialog'),null);
});

test('cancelar el modal de Alertas conserva el cargo actual y no navega a Planificación',()=>{
    const {c,doc,change,fila,aperturas}=contexto();
    c.window.cargosSeleccionados=['Técnico'];
    c.localStorage.setItem(c.clavePreferenciaCargos(),JSON.stringify(['Técnico','Ingeniero']));
    let alertas=0;c.mostrarVistaAlertas=()=>{alertas++};
    c.abrirSelectorCargosPlanificacion(false,'alertas');
    assert.equal(fila('Técnico').querySelector('input').checked,true);
    const input=fila('Ingeniero').querySelector('input');input.checked=true;change(input);
    doc.querySelector('.cargo-picker-cancel').click();
    assert.deepEqual(Array.from(c.window.cargosSeleccionados),['Técnico']);
    assert.equal(alertas,0);assert.equal(aperturas(),0);
});

test('el menú Alertas exige confirmar un cargo en el modal compartido antes de consultar',()=>{
    const {c,doc,change,enviar,fila}=contexto();
    for(const id of ['vista-alertas','vista-trabajadores','main-content']){
        const el=doc.createElement('div');el.id=id;el.classList.add('hidden');doc.body.appendChild(el);
    }
    vm.runInContext(fs.readFileSync('frontend/js/admin/modal.js','utf8'),c);
    c.adminAutorizado=true;c.obtenerToken=()=> 'sesion-de-prueba';
    let renders=0;c.renderizarAlertasVista=()=>{renders++};
    c.mostrarVistaAlertas();
    assert.equal(renders,0);assert(doc.getElementById('vista-alertas').classList.contains('hidden'));
    assert.equal(doc.querySelector('[type=submit]').textContent,'Ver alertas');
    const input=fila('Técnico').querySelector('input');input.checked=true;change(input);enviar();
    assert.equal(renders,1);assert.equal(doc.getElementById('vista-alertas').classList.contains('hidden'),false);
    assert.equal(doc.getElementById('vista-alertas').parentElement,doc.getElementById('main-content'));
});

test('ambos módulos reutilizan una selección válida sin volver a abrir el modal',()=>{
    for(const [vista,cargos] of [
        ['Planificacion',['Técnico']],
        ['Planificacion',['Técnico','Ingeniero']],
        ['Alertas',['Técnico']]
    ]){
        const {c,doc}=contexto();
        for(const id of ['vista-planificacion','vista-alertas','vista-trabajadores','right-panel','main-content']){
            const el=doc.createElement('div');el.id=id;el.classList.add('hidden');doc.body.appendChild(el);
        }
        vm.runInContext(fs.readFileSync('frontend/js/admin/modal.js','utf8'),c);
        c.adminAutorizado=true;c.obtenerToken=()=> 'sesion-de-prueba';
        c.window.cargosSeleccionados=cargos;
        let renders=0;c.actualizarVistaPlanificacion=()=>{renders++};c.renderizarAlertasVista=()=>{renders++};
        c[`mostrarVista${vista}`]();
        assert.equal(doc.querySelector('dialog'),null,`${vista} no debe volver a pedir los cargos`);
        assert.equal(renders,1);
        assert.deepEqual(Array.from(c.window.cargosSeleccionados),cargos);
        assert.equal(c.window.busquedaPlanificacion,'Persona anterior');
        assert.equal(doc.getElementById(`vista-${vista.toLowerCase()}`).classList.contains('hidden'),false);
    }
});

test('una selección vacía, eliminada o inactiva exige modal; Alertas también rechaza varios cargos',()=>{
    const casos=[
        ['Planificacion',[]],['Planificacion',['Eliminado']],['Planificacion',['Técnico','Eliminado']],
        ['Planificacion',['Inactivo']],['Planificacion',['']],
        ['Alertas',[]],['Alertas',['Técnico','Ingeniero']],['Alertas',['Eliminado']],
        ['Alertas',['Inactivo']],['Alertas',['']]
    ];
    for(const [vista,cargos] of casos){
        const {c,doc}=contexto();
        c.trabajadoresGlobal.push({cargo:'Inactivo',activo:false});
        vm.runInContext(fs.readFileSync('frontend/js/admin/modal.js','utf8'),c);
        c.adminAutorizado=true;c.obtenerToken=()=> 'sesion-de-prueba';
        c.window.cargosSeleccionados=cargos;
        let renders=0;c.actualizarVistaPlanificacion=()=>{renders++};c.renderizarAlertasVista=()=>{renders++};
        c[`mostrarVista${vista}`](false);
        assert.equal(renders,0,`${vista} no debe consultar una selección inválida: ${cargos}`);
        assert.equal(doc.getElementById('selector-cargos-planificacion')?.open,true);
    }
});
