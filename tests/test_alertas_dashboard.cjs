const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {JSDOM} = require(process.env.JSDOM_PATH || 'jsdom');

function contexto(alertas){
    const dom = new JSDOM(fs.readFileSync('frontend/index.html', 'utf8'));
    dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};
    dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'))};
    const c = vm.createContext({document:dom.window.document,window:{},console});
    const archivos = ['api','calendario','resumen','cobertura','app','selector-cargos','alertas-dashboard'];
    for(const archivo of archivos) vm.runInContext(fs.readFileSync(`frontend/js/${archivo}.js`, 'utf8'), c);
    vm.runInContext('mesActual=9; anioActual=2026; trabajadoresGlobal=[{id:1,nombre:"Ana",cargo:"Cajero",activo:true},{id:2,nombre:"Luis",cargo:"Guardia",activo:false}];window.cargosSeleccionados=["Cajero"];', c);
    c.calcularTodasAlertasReal = c.calcularTodasAlertas;
    c.calcularTodasAlertas = trabajadores => {
        assert.equal(trabajadores.length, 1);
        assert.equal(trabajadores[0].id, 1);
        return alertas;
    };
    return {c,doc:dom.window.document};
}

const muestra = [
    {kind:'cobertura',tipo:'warning',titulo:'Caja',fecha:'2026-10-02',mensaje:'Falta una persona',detalle:'Dotación 1/2'},
    {kind:'cobertura',tipo:'danger',titulo:'Seguridad',fecha:'2026-10-09',mensaje:'Sin dotación',detalle:'Dotación 0/2'},
    {kind:'descanso',tipo:'danger',trabajador_id:1,trabajador:'Ana',fecha1:'2026-10-08',fecha2:'2026-10-09',descanso:8},
    {kind:'horas',tipo:'info',trabajador_id:1,trabajador:'Ana',semana:2,horas:30,jornada:42,diferencia:-12},
    {kind:'horas',tipo:'warning',trabajador_id:1,trabajador:'Ana',semana:3,horas:45,jornada:42,diferencia:3},
];

test('dashboard calcula indicadores y gráficos desde las alertas reales sin duplicar los conteos', () => {
    const {c,doc} = contexto(muestra);
    c.renderizarAlertasVista();
    const cantidad = prioridad => doc.querySelector(`[data-prioridad-dashboard="${prioridad}"] strong`)?.textContent;
    assert.equal(cantidad('todos'), '5');
    assert.equal(cantidad('danger'), '2');
    assert.equal(cantidad('warning'), '2');
    assert.equal(cantidad('info'), '1');
    for(const [categoria,total] of [['cobertura',2],['descanso',1],['horas',2]]){
        assert.equal(Number(doc.querySelector(`[data-categoria-dashboard="${categoria}"]`).dataset.total),total);
    }
    const semanas = [...doc.querySelectorAll('[data-semana-dashboard]')];
    assert.equal(semanas.reduce((n,el)=>n+Number(el.dataset.total),0),5);
    assert.equal(Number(semanas.find(el=>el.dataset.semanaDashboard==='2').dataset.total),3);
    assert.equal(doc.querySelectorAll('#contenedor-alertas-vista .alerts-row').length,5);
    assert.equal(doc.querySelectorAll('.alerts-island').length,0);
    assert(doc.getElementById('alertas-contexto').textContent.includes('octubre'));
});

test('indicadores y gráficos filtran el detalle sin alterar los totales del período', () => {
    const {c,doc} = contexto(muestra);
    c.renderizarAlertasVista();
    c.filtrarDashboardAlertas('prioridad','danger');
    assert.equal(doc.querySelectorAll('.alerts-row').length,2);
    assert.equal(doc.activeElement.dataset.prioridadDashboard,'danger');
    c.filtrarDashboardAlertas('categoria','cobertura');
    assert.equal(doc.querySelectorAll('.alerts-row').length,1);
    assert(doc.querySelector('.alerts-row').textContent.includes('Seguridad'));
    c.filtrarDashboardAlertas('semana','2');
    assert.equal(doc.querySelectorAll('.alerts-row').length,1);
    doc.getElementById('busqueda-alertas').value='No existe';
    c.renderizarAlertasVista();
    assert.equal(doc.querySelectorAll('.alerts-row').length,0);
    assert(doc.querySelector('.alerts-empty').textContent.includes('No hay coincidencias'));
    assert.equal(doc.querySelector('[data-prioridad-dashboard="todos"] strong').textContent,'5');
    c.limpiarFiltrosDashboardAlertas();
    assert.equal(doc.querySelectorAll('.alerts-row').length,5);
    assert.equal(doc.getElementById('categoria-alertas').value,'todos');
    assert.equal(doc.getElementById('prioridad-alertas').value,'todos');
    assert.equal(doc.getElementById('semana-alertas').value,'todos');
    assert.equal(doc.getElementById('busqueda-alertas').value,'');
});

test('pagina todos los resultados, conserva filtros al refrescar y ajusta páginas al cambiar los datos', () => {
    const alertas = Array.from({length:23},(_,i)=>({kind:'cobertura',tipo:'warning',titulo:`Sector ${i}`,fecha:'2026-10-02',mensaje:'Dotación insuficiente'}));
    const {c,doc} = contexto(alertas);
    c.renderizarAlertasVista();
    const nombres=[];
    for(let pagina=0;pagina<3;pagina++){
        nombres.push(...[...doc.querySelectorAll('.alerts-row h3')].map(el=>el.textContent));
        if(pagina<2) c.cambiarPaginaDashboardAlertas(1);
    }
    assert.equal(nombres.length,23);assert.equal(new Set(nombres).size,23);
    assert.equal(doc.getElementById('alertas-siguiente').disabled,true);
    c.renderizarAlertasVista();assert.equal(c.window.paginaDashboardAlertas,3);
    alertas.splice(10);
    c.renderizarAlertasVista();assert.equal(c.window.paginaDashboardAlertas,1);
    doc.getElementById('busqueda-alertas').value='sector 1';
    c.filtrarDashboardAlertas('categoria','cobertura');
    c.renderizarAlertasVista();
    assert.equal(doc.getElementById('busqueda-alertas').value,'sector 1');
    assert.equal(doc.getElementById('categoria-alertas').value,'cobertura');
    assert.equal(doc.querySelectorAll('.alerts-row').length,1);
});

test('sin alertas mantiene indicadores en cero y gráficos sin valores inválidos', () => {
    const {c,doc} = contexto([]);
    c.renderizarAlertasVista();
    assert([...doc.querySelectorAll('.alert-dash-kpi strong')].every(el=>el.textContent==='0'));
    assert(doc.querySelector('.alerts-empty').textContent.includes('Sin alertas para este período'));
    assert.equal(doc.getElementById('alertas-anterior').disabled,true);
    assert.equal(doc.getElementById('alertas-siguiente').disabled,true);
    assert(!doc.getElementById('vista-alertas').innerHTML.includes('NaN'));
    assert(!doc.getElementById('vista-alertas').innerHTML.includes('Infinity'));
});

test('las fechas ISO, descansos entre semanas y alertas sin fecha se cuentan una sola vez', () => {
    const {c,doc} = contexto([
        {...muestra[0],fecha:'2026-10-02T00:00:00'},
        {...muestra[2],fecha1:'2026-09-27',fecha2:'2026-09-28'},
        {...muestra[3],semana:99}
    ]);
    c.renderizarAlertasVista();
    assert.equal(Number(doc.querySelector('[data-semana-dashboard="1"]').dataset.total),2);
    assert.equal(Number(doc.querySelector('[data-semana-dashboard="0"]').dataset.total),1);
    assert.equal([...doc.querySelectorAll('[data-semana-dashboard]')].reduce((n,el)=>n+Number(el.dataset.total),0),3);
});

test('el detalle escapa datos de colaboradores y mantiene las acciones de revisión', () => {
    const {c,doc} = contexto([{...muestra[2],trabajador:'<img src=x onerror=alert(1)>',detalle:'<script>alert(1)</script>'},muestra[0]]);
    c.renderizarAlertasVista();
    assert.equal(doc.querySelector('#vista-alertas img, #vista-alertas script'),null);
    assert(doc.querySelector('.alerts-row h3').textContent.includes('<img'));
    const acciones=[...doc.querySelectorAll('.alerts-row-action')].map(el=>el.getAttribute('onclick'));
    assert(acciones.includes('mostrarVistaCobertura()'));assert(acciones.includes('mostrarPlanificacionDesdeAlerta(this.dataset.trabajadorId, this.dataset)'));
});

test('al abrir Alertas el dashboard ocupa el panel principal y no queda debajo del área de trabajo', () => {
    const {c,doc} = contexto(muestra);
    vm.runInContext(fs.readFileSync('frontend/js/admin/modal.js','utf8'),c);
    c.adminAutorizado=true;c.obtenerToken=()=> 'sesion-de-prueba';c.obtenerEsSuperAdmin=()=>false;
    c.mostrarVistaAlertas(false);
    assert.equal(doc.getElementById('vista-alertas').parentElement,doc.getElementById('main-content'));
    assert.equal(doc.getElementById('right-panel').style.display,'none');
});

test('las alertas de cobertura siguen disponibles en el dashboard usando el cálculo del sistema', () => {
    const {c,doc} = contexto([]);
    c.calcularTodasAlertas=c.calcularTodasAlertasReal;
    vm.runInContext(`trabajadoresGlobal=[{id:1,nombre:'Ana',activo:true,ceco:'Caja',cargo:'Cajero',jornada:42}];
        coberturaConfigGlobal=[{id:1,tipo:'ceco',valor:'Caja',activo:true,dia_semana:0,hora_inicio:'09:00',hora_fin:'18:00',minimo_inicio:1,minimo_fin:1}];`,c);
    c.renderizarAlertasVista();
    assert(Number(doc.querySelector('[data-categoria-dashboard="cobertura"]').dataset.total)>0);
});

test('actualizar planificación refresca el dashboard sin borrar los filtros de revisión', () => {
    const alertas = [...muestra];
    const {c,doc} = contexto(alertas);
    c.renderizarTrabajadores=()=>{};c.renderizarResumenDomingos=()=>{};c.renderizarAlertas=()=>{};c.renderizarCobertura=()=>{};
    c.filtrarDashboardAlertas('categoria','horas');
    alertas.push({...muestra[4],semana:4});
    c.actualizarVistaPlanificacion();
    assert.equal(doc.getElementById('categoria-alertas').value,'horas');
    assert.equal(doc.querySelectorAll('.alerts-row').length,3);
    assert.equal(doc.querySelector('[data-prioridad-dashboard="todos"] strong').textContent,'6');
});

test('abrir planificación desde una alerta selecciona su cargo sin preguntar y limpia búsquedas anteriores', () => {
    const {c,doc} = contexto(muestra);
    vm.runInContext(fs.readFileSync('frontend/js/admin/modal.js','utf8'),c);
    vm.runInContext('trabajadoresGlobal=[{id:1,nombre:"Ana",activo:true,cargo:"Cajero"},{id:3,nombre:"Pablo",activo:true,cargo:"Guardia"}];',c);
    c.adminAutorizado=true;c.obtenerToken=()=> 'sesion-de-prueba';c.obtenerEsSuperAdmin=()=>false;
    c.window.cargosSeleccionados=['Guardia'];c.window.busquedaPlanificacion='Pablo';
    doc.getElementById('busqueda-planificacion').value='Pablo';
    let consultas=0,preguntas=0,seleccionActualizada=0;
    c.actualizarVistaPlanificacion=()=>{consultas++};
    c.abrirSelectorCargosPlanificacion=()=>{preguntas++};
    c.cargarCargos=()=>{seleccionActualizada++};
    c.guardarPreferenciaCargos=()=>{};
    const detalle=doc.createElement('div');detalle.innerHTML=c.renderAlertaCard(muestra[2]);
    c.botonAlerta=detalle.querySelector('.alerts-row-action');
    assert.equal(c.botonAlerta.dataset.trabajadorId,'1');
    vm.runInContext(`(function(){${c.botonAlerta.getAttribute('onclick')}}).call(botonAlerta)`,c);
    assert.deepEqual(Array.from(c.window.cargosSeleccionados),['Cajero']);
    assert.equal(c.window.busquedaPlanificacion,'');
    assert.equal(doc.getElementById('busqueda-planificacion').value,'');
    assert.equal(consultas,1);assert.equal(preguntas,0);assert.equal(seleccionActualizada,1);
    assert.equal(doc.getElementById('vista-planificacion').classList.contains('hidden'),false);
    c.mostrarVistaPlanificacion();
    assert.equal(preguntas,0,'La entrada normal conserva el cargo ya seleccionado');
    assert.equal(consultas,2);
    c.mostrarVistaPlanificacion(true);
    assert.equal(preguntas,1,'El cambio explícito de cargos sí abre el selector');
});

test('una alerta obsoleta o sin cargo no abre automáticamente otro equipo', () => {
    for(const caso of [
        {id:'999',persona:{id:1,activo:true,cargo:'Cajero'}},
        {id:'1-invalido',persona:{id:1,activo:true,cargo:'Cajero'}},
        {id:'1',persona:{id:1,activo:false,cargo:'Cajero'}},
        {id:'1',persona:{id:1,activo:true,cargo:''}}
    ]){
        const {c}=contexto([]);
        vm.runInContext(fs.readFileSync('frontend/js/admin/modal.js','utf8'),c);
        c.persona=caso.persona;vm.runInContext('trabajadoresGlobal=[persona]',c);
        c.adminAutorizado=true;c.obtenerToken=()=> 'sesion-de-prueba';c.obtenerEsSuperAdmin=()=>false;
        c.window.cargosSeleccionados=['Guardia'];
        let aperturas=0;c.mostrarVistaPlanificacion=seleccionar=>{assert.equal(seleccionar,true);aperturas++};
        c.mostrarPlanificacionDesdeAlerta(caso.id);
        assert.equal(aperturas,1);assert.deepEqual(Array.from(c.window.cargosSeleccionados),['Guardia']);
    }
});

test('navegar desde alertas respeta la sesión y el acceso exclusivo del superadmin', () => {
    for(const superadmin of [false,true]){
        const {c}=contexto([]);
        vm.runInContext(fs.readFileSync('frontend/js/admin/modal.js','utf8'),c);
        c.adminAutorizado=superadmin;c.obtenerToken=()=>superadmin ? 'sesion-de-prueba' : '';
        c.obtenerEsSuperAdmin=()=>superadmin;
        let login=0,saas=0;
        c.iniciarSesion=()=>{login++};c.mostrarVistaSaasAdmin=()=>{saas++};
        c.window.cargosSeleccionados=['Guardia'];
        c.mostrarPlanificacionDesdeAlerta('1');
        assert.equal(login,superadmin ? 0 : 1);assert.equal(saas,superadmin ? 1 : 0);
        assert.deepEqual(Array.from(c.window.cargosSeleccionados),['Guardia']);
    }
});

test('sin un único cargo seleccionado no calcula ni muestra alertas de todo el personal', () => {
    for(const cargos of [[],['Cajero','Guardia'],['Inexistente'],['Guardia']]){
        const {c,doc}=contexto(muestra);
        c.window.cargosSeleccionados=cargos;
        let calculos=0;c.calcularTodasAlertas=()=>{calculos++;return muestra};
        c.renderizarAlertasVista();
        assert.equal(calculos,0,'No debe calcular alertas generales sin un cargo único');
        assert.equal(doc.querySelectorAll('#contenedor-alertas-vista .alerts-row').length,0);
        assert.equal(doc.getElementById('alertas-sin-cargo').hidden,false);
        assert.equal(doc.getElementById('alertas-kpis').hidden,true);
    }
});

test('el selector único limita indicadores, gráficos y detalle al cargo consultado', () => {
    const {c,doc}=contexto([]);
    c.calcularTodasAlertas=c.calcularTodasAlertasReal;
    c.mostrarVistaAlertas=seleccionar=>{assert.equal(seleccionar,false);c.renderizarAlertasVista()};
    vm.runInContext(`trabajadoresGlobal=[
        {id:1,nombre:'Ana',cargo:'Cajero',ceco:'Caja',activo:true,jornada:42},
        {id:3,nombre:'Pablo',cargo:'Guardia',ceco:'Seguridad',activo:true,jornada:42}
    ];
    planificacionGlobal=[
        {trabajador_id:1,fecha:'2026-10-08',turno:'16:00 - 00:00'},
        {trabajador_id:1,fecha:'2026-10-09',turno:'08:00 - 16:00'},
        {trabajador_id:3,fecha:'2026-10-15',turno:'16:00 - 00:00'},
        {trabajador_id:3,fecha:'2026-10-16',turno:'08:00 - 16:00'}
    ];
    coberturaConfigGlobal=[
        {id:1,tipo:'cargo',valor:'Cajero',dia_semana:0,hora_inicio:'09:00',hora_fin:'18:00',minimo_inicio:1,minimo_fin:1,activo:true},
        {id:2,tipo:'cargo',valor:'Guardia',dia_semana:1,hora_inicio:'09:00',hora_fin:'18:00',minimo_inicio:1,minimo_fin:1,activo:true}
    ];`,c);
    for(const [cargo,ajeno] of [['Cajero','Pablo'],['Guardia','Ana']]){
        c.abrirSelectorCargosAlertas();
        const modal=doc.getElementById('selector-cargos-planificacion');
        const fila=[...modal.querySelectorAll('.cargo-picker-option')].find(el=>el.querySelector('span').textContent===cargo);
        fila.querySelector('input').click();
        modal.querySelector('form').dispatchEvent(new doc.defaultView.Event('submit',{cancelable:true}));
        const personas=vm.runInContext('trabajadoresGlobal.filter(t=>t.cargo===window.cargosSeleccionados[0])',c);
        const esperadas=c.calcularTodasAlertas(personas);
        assert(esperadas.length>0);
        assert.deepEqual(Array.from(c.window.cargosSeleccionados),[cargo]);
        assert.equal(doc.getElementById('cargo-alertas').textContent,`Cambiar cargo: ${cargo}`);
        assert.equal(doc.getElementById('alertas-sin-cargo').hidden,true);
        assert.equal(doc.getElementById('alertas-kpis').hidden,false);
        assert.equal(Number(doc.querySelector('[data-prioridad-dashboard="todos"] strong').textContent),esperadas.length);
        assert.equal([...doc.querySelectorAll('[data-categoria-dashboard]')].reduce((n,el)=>n+Number(el.dataset.total),0),esperadas.length);
        assert.equal([...doc.querySelectorAll('[data-semana-dashboard]')].reduce((n,el)=>n+Number(el.dataset.total),0),esperadas.length);
        assert(!doc.getElementById('contenedor-alertas-vista').textContent.includes(ajeno));
        assert(!esperadas.some(a=>a.kind==='cobertura' && a.titulo.includes(cargo==='Cajero' ? 'Guardia' : 'Cajero')));
    }
    assert.equal(doc.getElementById('cargo-alertas').tagName,'BUTTON');
    assert.equal(doc.getElementById('cargo-alertas').getAttribute('onclick'),'abrirSelectorCargosAlertas()');
    assert.equal(doc.querySelector('#vista-alertas select#cargo-alertas'),null);
    c.window.cargosSeleccionados=[];
    c.renderizarAlertasVista();
    assert.equal(doc.getElementById('alertas-kpis').innerHTML,'');
    assert.equal(doc.querySelectorAll('.alerts-row').length,0);
});

test('la búsqueda previa del planificador no oculta alertas del cargo y sin personal activo no se consulta', () => {
    const {c,doc}=contexto(muestra);
    c.window.busquedaPlanificacion='Otra persona';doc.getElementById('busqueda-planificacion').value='Otra persona';
    c.renderizarAlertasVista();
    assert.equal(doc.querySelector('[data-prioridad-dashboard="todos"] strong').textContent,'5');
    assert(doc.getElementById('alertas-contexto').textContent.includes('Cajero'));
    assert(!doc.getElementById('alertas-contexto').textContent.includes('Otra persona'));
    vm.runInContext('trabajadoresGlobal=[]',c);
    c.calcularTodasAlertas=()=>{throw new Error('No debe consultar sin cargo disponible')};
    c.renderizarAlertasVista();
    assert.equal(doc.getElementById('cargo-alertas').disabled,true);
    assert.equal(doc.getElementById('alertas-sin-cargo').hidden,false);
    assert(doc.getElementById('alertas-sin-cargo-mensaje').textContent.includes('No hay cargos'));
});
