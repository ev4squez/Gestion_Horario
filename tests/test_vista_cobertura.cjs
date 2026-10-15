const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {JSDOM}=require(process.env.JSDOM_PATH || 'jsdom');
function contexto(){
    const dom=new JSDOM(fs.readFileSync('frontend/index.html','utf8'));
    const c=vm.createContext({document:dom.window.document,window:{},console});
    for(const f of ['api','cobertura']) vm.runInContext(fs.readFileSync(`frontend/js/${f}.js`,'utf8'),c);
    const reglas=Array.from({length:23},(_,i)=>({id:i+1,tipo:'ceco',valor:i<15?'TI':'Sala',dia_semana:i%7,hora_inicio:'09:00',hora_fin:'18:00',minimo_inicio:1,minimo_fin:2,activo:i%2===0}));
    c.reglas=reglas;vm.runInContext('coberturaConfigGlobal=reglas;trabajadoresGlobal=[{ceco:"TI"},{ceco:"Sala"}]',c);
    const filas=()=>dom.window.document.querySelectorAll('[data-grupo-fila]');
    return {c,doc:dom.window.document,filas};
}
test('pagina reglas manteniendo agrupación y sin omitir registros',()=>{
    const {c,doc,filas}=contexto();assert.equal(doc.getElementById('tabla-cobertura-body').closest('details'),null);c.renderizarReglasCobertura();assert.equal(filas().length,10);
    const ids=[];
    for(let p=0;p<3;p++){
        ids.push(...[...filas()].map(f=>f.querySelector('button').getAttribute('onclick')));
        if(p<2)c.cambiarPaginaCobertura(1);
    }
    assert.equal(ids.length,23);assert.equal(new Set(ids).size,23);assert(doc.getElementById('cobertura-siguiente').disabled);
    c.cambiarTamanoPaginaCobertura(20);assert.equal(filas().length,20);assert.equal(c.window.paginaCobertura,1);
});
test('combina búsqueda, día y estado; conserva página al editar y la ajusta al borrar',()=>{
    const {c,doc,filas}=contexto();c.renderizarReglasCobertura();c.cambiarPaginaCobertura(2);c.renderizarReglasCobertura();assert.equal(c.window.paginaCobertura,3);
    vm.runInContext('coberturaConfigGlobal=coberturaConfigGlobal.slice(0,10)',c);c.renderizarReglasCobertura();assert.equal(c.window.paginaCobertura,1);
    doc.getElementById('buscar-reglas-cobertura').value='TI';doc.getElementById('dia-reglas-cobertura').value='0';doc.getElementById('estado-reglas-cobertura').value='activas';c.renderizarReglasCobertura();
    assert.equal(filas().length,1);assert.equal(doc.getElementById('cobertura-resultados').textContent,'Mostrando 1–1 de 1 regla');
    doc.getElementById('buscar-reglas-cobertura').value='Sin coincidencia';c.renderizarReglasCobertura();assert.equal(filas().length,0);assert(doc.getElementById('cobertura-anterior').disabled && doc.getElementById('cobertura-siguiente').disabled);
});
test('editar abre el formulario plegado y carga la regla elegida',()=>{
    const {c,doc}=contexto();assert.equal(doc.getElementById('cobertura-formulario').open,false);c.editarReglaCobertura(1);
    assert.equal(doc.getElementById('cobertura-formulario').open,true);assert.equal(doc.getElementById('cobertura-id').value,'1');assert.equal(doc.getElementById('cobertura-valor').value,'TI');
    c.abrirFormularioCobertura(true);assert.equal(doc.getElementById('cobertura-id').value,'');
});
