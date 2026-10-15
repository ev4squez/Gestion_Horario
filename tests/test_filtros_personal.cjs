const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {JSDOM}=require(process.env.JSDOM_PATH || 'jsdom');
function contexto(){
    const dom=new JSDOM(`<input id="busqueda-trabajadores"><select id="filtro-estado"><option value="activo" selected>Activo</option></select>${['cargo','responsable','area','ceco'].map(k=>`<select id="filtro-${k}"><option value=""></option></select>`).join('')}<tbody></tbody><table><tbody id="tabla-trabajadores-body"></tbody></table>`);
    const c=vm.createContext({document:dom.window.document,window:{},console,confirm:()=>true});
    c.trabajadoresGlobal=[{id:1,nombre:'Ana',activo:true,area:'Sistemas',cargo:'Técnico',ceco:'TI',responsable:'Jefa'},{id:2,nombre:'Luis',activo:true,area:'Otra',cargo:'Otro',ceco:'Otro',responsable:'Jefe'}];
    c.escaparHTML=v=>String(v??'');
    c.normalizarTexto=v=>String(v??'').trim().toLowerCase();
    for(const f of ['modal','trabajadores']) vm.runInContext(fs.readFileSync(`frontend/js/admin/${f}.js`,'utf8'),c);
    c.cargarFiltrosTrabajadores();
    return {c,doc:dom.window.document};
}
test('volver a dibujar tras cambiar estado mantiene filtros de área y búsqueda',()=>{
    const {c,doc}=contexto();
    doc.getElementById('filtro-area').value='Sistemas';
    doc.getElementById('busqueda-trabajadores').value='Ana';
    c.trabajadoresGlobal[0].activo=false;
    c.cargarFiltrosTrabajadores();c.renderizarTrabajadoresCRUD();
    assert.equal(c.filtrarTrabajadoresCRUD(c.trabajadoresGlobal).length,0);
    assert(!doc.getElementById('tabla-trabajadores-body').textContent.includes('Luis'));
    assert.equal(doc.getElementById('filtro-area').value,'Sistemas');
    assert.equal(doc.getElementById('filtro-estado').value,'activo');
});
test('eliminar el último integrante no borra el filtro del grupo seleccionado',async()=>{
    const {c,doc}=contexto();doc.getElementById('filtro-area').value='Sistemas';
    c.eliminarTrabajador=async()=>({ok:true,status:200});
    c.obtenerTrabajadores=async()=>[c.trabajadoresGlobal[1]];
    c.cargarCargos=()=>{};
    await c.eliminarTrabajadorCRUD(1);
    assert.equal(doc.getElementById('filtro-area').value,'Sistemas');
    assert.equal(c.filtrarTrabajadoresCRUD(c.trabajadoresGlobal).length,0);
    assert(!doc.getElementById('tabla-trabajadores-body').textContent.includes('Luis'));
});

test('volver a planificación refleja el estado actualizado sin cambiar cargo, búsqueda ni período',()=>{
    const {c,doc}=contexto();
    for(const id of ['vista-planificacion','right-panel','main-content','filtro-cargo-panel']){
        const el=doc.createElement('div');el.id=id;doc.body.appendChild(el);
    }
    const input=doc.createElement('input');input.id='busqueda-planificacion';input.value='Ana';doc.body.appendChild(input);
    const personas=c.trabajadoresGlobal;
    vm.runInContext(fs.readFileSync('frontend/js/app.js','utf8'),c);
    c.personas=personas;
    vm.runInContext('trabajadoresGlobal=personas; mesActual=9; anioActual=2026;',c);
    c.window.cargosSeleccionados=['Técnico'];
    c.adminAutorizado=true;c.obtenerToken=()=> 'token';
    let visibles;
    c.renderizarTrabajadores=lista=>{visibles=lista.filter(t=>t.activo!==false).map(t=>t.nombre)};
    c.renderizarResumenDomingos=()=>{};c.renderizarAlertas=()=>{};
    c.mostrarVistaPlanificacion();assert.deepEqual(visibles,['Ana']);
    vm.runInContext('trabajadoresGlobal=trabajadoresGlobal.map(t=>({...t,activo:t.id===1?false:t.activo}))',c);
    c.mostrarVistaPlanificacion();assert.equal(visibles.length,0);
    vm.runInContext('trabajadoresGlobal=trabajadoresGlobal.map(t=>({...t,activo:true}))',c);
    c.mostrarVistaPlanificacion();assert.equal(visibles[0],'Ana');
    assert.equal(c.window.cargosSeleccionados[0],'Técnico');
    assert.equal(input.value,'Ana');assert.equal(c.mesActual,9);assert.equal(c.anioActual,2026);
});
