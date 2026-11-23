const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require(process.env.JSDOM_PATH || 'jsdom');

function contexto(alertas=[]){
    const dom=new JSDOM(fs.readFileSync('frontend/index.html','utf8'));
    const c=vm.createContext({document:dom.window.document,window:dom.window,console,alert:mensaje=>{throw new Error(mensaje)}});
    const permitidos=new Set(['api','calendario','resumen','cobertura','app','alertas-dashboard','pdf/auxiliares','pdf/cabecera','pdf/leyenda','pdf/tabla','pdf/alertas-dashboard','pdf']);
    for(const script of dom.window.document.querySelectorAll('script[src]')){
        const archivo=script.getAttribute('src').split('?')[0].replace(/^js\//,'').replace(/\.js$/,'');
        if(permitidos.has(archivo)) vm.runInContext(fs.readFileSync(`frontend/js/${archivo}.js`,'utf8'),c);
    }
    vm.runInContext(`mesActual=9;anioActual=2026;trabajadoresGlobal=[
        {id:1,nombre:'Ana de prueba',cargo:'Cajero',ceco:'Caja',jornada:42,activo:true},
        {id:2,nombre:'Persona inactiva',cargo:'Cajero',ceco:'Caja',jornada:42,activo:false}
    ];window.cargosSeleccionados=['Cajero'];`,c);
    c.calcularTodasAlertasReal=c.calcularTodasAlertas;
    c.calcularTodasAlertas=trabajadores=>{assert.deepEqual(Array.from(trabajadores,t=>t.id),[1]);return alertas};
    let documento,nombre;
    c.pdfMake={createPdf:doc=>{documento=doc;return {download:n=>{nombre=n}}}};
    return {c,doc:dom.window.document,documento:()=>documento,nombre:()=>nombre};
}

const muestra=[
    {kind:'cobertura',tipo:'warning',titulo:'Caja',fecha:'2026-10-02',mensaje:'Falta una persona',detalle:'Dotación 1/2'},
    {kind:'descanso',tipo:'danger',trabajador_id:1,trabajador:'Ana de prueba',fecha1:'2026-10-08',fecha2:'2026-10-09',descanso:8},
    {kind:'horas',tipo:'info',trabajador_id:1,trabajador:'Ana de prueba',semana:3,horas:30,jornada:42,diferencia:-12}
];

test('la exportación termina con una única hoja de dashboard y los indicadores completos',()=>{
    const {c,documento,nombre}=contexto(muestra);
    c.exportarPDF();
    const pdf=documento(),hoja=pdf.content.at(-1);
    assert.equal(hoja.id,'dashboard-alertas-pdf');
    assert.equal(hoja.pageBreak,'before');
    assert.equal(pdf.content.filter(n=>n.id==='dashboard-alertas-pdf').length,1);
    const svg=new JSDOM(hoja.svg,{contentType:'image/svg+xml'}).window.document;
    for(const [id,total] of [['total',3],['danger',1],['warning',1],['info',1]]){
        assert.equal(Number(svg.getElementById(`pdf-alert-kpi-${id}`).textContent),total);
    }
    assert.equal(svg.documentElement.getAttribute('height'),'520');
    assert(svg.documentElement.textContent.includes('Alertas de planificación'));
    assert.equal(nombre(),'Planificacion_Octubre_2026.pdf');
    assert(!pdf.content.some(n=>n.table?.widths?.[0]===90),'No debe seguir anexando el listado ilimitado anterior');
});
