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
test('selecciona un cargo desde todos, cuenta solo activos y recuerda selección',()=>{
    const {c,doc,change,enviar,fila,aperturas}=contexto();c.abrirSelectorCargosPlanificacion();
    assert.equal(doc.querySelectorAll('.cargo-picker').length,1);c.abrirSelectorCargosPlanificacion();assert.equal(doc.querySelectorAll('.cargo-picker').length,1);
    assert(fila('Técnico').textContent.includes('2 activos'));
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
    assert(doc.querySelector('[data-todos]').checked);
});
test('sin personal activo permite ver todos y no ofrece cargos inactivos',()=>{
    const {c,doc,enviar}=contexto();c.trabajadoresGlobal=[{cargo:'Técnico',activo:false}];c.abrirSelectorCargosPlanificacion();
    assert.equal(doc.querySelectorAll('.cargo-picker-option').length,0);assert.equal(doc.querySelector('[type=submit]').disabled,false);enviar();assert.equal(c.window.cargosSeleccionados.length,0);
});
