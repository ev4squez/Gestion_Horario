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

test('guardar conserva grupo, día, horarios y mínimos para seguir cargando, además de los filtros del listado',async()=>{
    const {c,doc}=contexto();
    c.renderizarResultadoCobertura=()=>{};c.renderizarColacion=()=>{};
    c.obtenerConfiguracionCobertura=async()=>c.reglas;
    const enviados=[];
    c.crearConfiguracionCobertura=async data=>{enviados.push({...data});return {ok:true,status:200}};
    c.abrirFormularioCobertura(true);
    doc.getElementById('cobertura-valor').value='TI';
    doc.getElementById('cobertura-dia').value='3';
    doc.getElementById('cobertura-inicio').value='11:00';
    doc.getElementById('cobertura-fin').value='23:30';
    doc.getElementById('cobertura-minimo-inicio').value='3';
    doc.getElementById('cobertura-minimo-fin').value='4';
    doc.getElementById('cobertura-activo').checked=false;
    doc.getElementById('buscar-reglas-cobertura').value='TI';
    doc.getElementById('estado-reglas-cobertura').value='inactivas';
    doc.getElementById('dia-reglas-cobertura').value='3';
    await c.guardarReglaCobertura();
    const esperados={tipo:'ceco',valor:'TI',dia:'3',inicio:'11:00',fin:'23:30','minimo-inicio':'3','minimo-fin':'4'};
    for(const [campo,valor] of Object.entries(esperados)) assert.equal(doc.getElementById(`cobertura-${campo}`).value,valor,campo);
    assert.equal(doc.getElementById('cobertura-activo').checked,false);
    assert.equal(doc.getElementById('cobertura-formulario').open,true);
    assert.equal(doc.getElementById('buscar-reglas-cobertura').value,'TI');
    assert.equal(doc.getElementById('estado-reglas-cobertura').value,'inactivas');
    assert.equal(doc.getElementById('dia-reglas-cobertura').value,'3');
    doc.getElementById('cobertura-dia').value='4';
    await c.guardarReglaCobertura();
    assert.equal(enviados.length,2);
    assert.equal(enviados[1].valor,'TI');assert.equal(enviados[1].dia_semana,4);
});

test('refrescar conserva el valor por tipo; cambiar de tipo y Limpiar sí reinician la selección',()=>{
    const {c,doc}=contexto();
    vm.runInContext('trabajadoresGlobal=[{ceco:"TI",area:"TI",cargo:"TI"}]',c);
    c.renderizarResultadoCobertura=()=>{};c.renderizarColacion=()=>{};
    for(const tipo of ['ceco','area','cargo']){
        doc.getElementById('cobertura-tipo').value=tipo;
        c.poblarValoresCobertura();
        assert.equal(doc.getElementById('cobertura-valor').value,'');
        doc.getElementById('cobertura-valor').value='TI';
        c.renderizarCobertura();c.renderizarCobertura();
        assert.equal(doc.getElementById('cobertura-valor').value,'TI');
    }
    c.limpiarFormularioCobertura();
    assert.equal(doc.getElementById('cobertura-tipo').value,'ceco');
    assert.equal(doc.getElementById('cobertura-valor').value,'');
    assert.equal(doc.getElementById('cobertura-dia').value,'0');
    doc.getElementById('cobertura-valor').value='TI';
    vm.runInContext('trabajadoresGlobal=[]',c);
    c.poblarValoresCobertura();
    assert.equal(doc.getElementById('cobertura-valor').value,'');
});

test('guardar una edición conserva página y grupo pero quita el ID para crear la siguiente regla',async()=>{
    const {c,doc}=contexto();
    c.renderizarResultadoCobertura=()=>{};c.renderizarColacion=()=>{};
    c.obtenerConfiguracionCobertura=async()=>c.reglas;
    const actualizados=[],creados=[];
    c.actualizarConfiguracionCobertura=async(id,data)=>{actualizados.push({id,...data});return {ok:true,status:200}};
    c.crearConfiguracionCobertura=async data=>{creados.push({...data});return {ok:true,status:200}};
    c.renderizarReglasCobertura();c.cambiarPaginaCobertura(1);
    c.editarReglaCobertura(1);
    await c.guardarReglaCobertura();
    assert.equal(c.window.paginaCobertura,2);
    assert.equal(doc.getElementById('cobertura-id').value,'');
    assert.equal(doc.getElementById('cobertura-valor').value,'TI');
    doc.getElementById('cobertura-dia').value='1';
    await c.guardarReglaCobertura();
    assert.equal(actualizados.length,1);assert.equal(actualizados[0].id,'1');
    assert.equal(creados.length,1);assert.equal(creados[0].valor,'TI');
    assert.equal(creados[0].dia_semana,1);
});

test('un guardado rechazado no borra la edición ni las selecciones',async()=>{
    const {c,doc}=contexto();
    c.editarReglaCobertura(1);
    c.actualizarConfiguracionCobertura=async()=>({ok:false,status:400});
    c.leerMensajeRespuestaError=async()=> 'Error de prueba';
    const mensajes=[];c.alert=mensaje=>mensajes.push(mensaje);
    await c.guardarReglaCobertura();
    assert.equal(doc.getElementById('cobertura-id').value,'1');
    assert.equal(doc.getElementById('cobertura-valor').value,'TI');
    assert.equal(mensajes.length,1);
});
