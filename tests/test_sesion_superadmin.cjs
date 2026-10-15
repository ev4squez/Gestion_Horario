const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const {JSDOM}=require(process.env.JSDOM_PATH || 'jsdom');
async function contexto(superadmin){
    const dom=new JSDOM(fs.readFileSync('frontend/index.html','utf8'),{url:'http://localhost'});
    await new Promise(resolve=>dom.window.addEventListener('load',resolve,{once:true}));
    let token='token',role=superadmin,cargas=0,renders=0;
    const c=vm.createContext({document:dom.window.document,window:dom.window,localStorage:dom.window.localStorage,console:{log(){}},adminAutorizado:true,
        obtenerToken:()=>token,obtenerEsSuperAdmin:()=>role,obtenerNombreUsuario:()=> 'Admin',obtenerEmpresa:()=>null,
        verificarSesion:async()=>true,cargarSistema:async()=>{cargas++},renderizarSaasAdmin:()=>{renders++},
        actualizarVistaPlanificacion:()=>{},logoutServidor:async()=>{},borrarToken:()=>{token='';role=false},
        listarEmpresas:async()=>[],guardarNombreUsuario:()=>{},loginAdmin:async()=>{token='token';return {username:'Admin'}},
        alert:()=>{},escaparHTML:v=>String(v),actualizarPanelAlertas:()=>{}});
    for(const f of ['modal','usuarios','turnos-frecuentes','auth']) vm.runInContext(fs.readFileSync(`frontend/js/admin/${f}.js`,'utf8'),c);
    // El overlay vive directamente en body, igual que en DOMContentLoaded.
    dom.window.document.body.appendChild(dom.window.document.getElementById('vista-saas-admin'));
    return {c,doc:dom.window.document,cargas:()=>cargas,renders:()=>renders};
}
function soloSaas(doc){
    assert(doc.body.classList.contains('modo-saas'));
    assert(!doc.getElementById('vista-saas-admin').classList.contains('hidden'));
    for(const id of ['vista-planificacion','vista-cobertura','vista-trabajadores','vista-usuarios','vista-alertas','vista-turnos-frecuentes'])
        assert.equal(doc.getElementById(id).style.display,'none',id);
    assert.equal(doc.getElementById('right-panel').style.display,'none');
    assert.equal(doc.querySelector('[onclick="salirModoSaas()"]'),null);
}
test('login de superadmin abre solo SaaS sin cargar datos de empresa',async()=>{
    const {c,doc,cargas}=await contexto(true);
    doc.getElementById('usuario-admin').value='superadmin';doc.getElementById('password-admin').value='prueba';
    await c.validarAdmin();soloSaas(doc);assert.equal(cargas(),0);
    for(const id of ['menu-planificacion','menu-alertas','menu-colaboradores','menu-cobertura','menu-usuarios','menu-turnos-frecuentes','badge-empresa-sidebar'])
        assert(doc.getElementById(id).classList.contains('hidden'),id);
});
test('recargar y navegar con superadmin mantiene SaaS y cerrar sesión quita el modo dedicado',async()=>{
    const {c,doc,cargas}=await contexto(true);await c.inicializarSesion();soloSaas(doc);
    for(const accion of ['mostrarVistaPlanificacion','mostrarVistaCobertura','mostrarVistaTrabajadores','mostrarVistaAlertas','mostrarVistaUsuarios','mostrarVistaTurnosFrecuentes','volverAPlanificacion','salirModoSaas']){
        await c[accion]();soloSaas(doc);
    }
    assert.equal(cargas(),0);
    await c.cerrarSesionAdmin();assert(!doc.body.classList.contains('modo-saas'));
    assert.equal(doc.getElementById('vista-saas-admin').style.display,'none');
    assert(!doc.getElementById('modal-login-admin').classList.contains('hidden'));
});
test('usuario de empresa conserva planificación y sus menús al recuperar sesión',async()=>{
    const {c,doc,cargas,renders}=await contexto(false);await c.inicializarSesion();
    assert.equal(cargas(),1);assert.equal(renders(),0);assert(!doc.body.classList.contains('modo-saas'));
    assert(!doc.getElementById('vista-planificacion').classList.contains('hidden'));
    for(const id of ['menu-planificacion','menu-alertas','menu-colaboradores','menu-cobertura','menu-usuarios','menu-turnos-frecuentes'])
        assert(!doc.getElementById(id).classList.contains('hidden'),id);
    assert(doc.getElementById('menu-saas-admin').classList.contains('hidden'));
});

test('recarga usa /me real, espera validación y respeta rol explícito del servidor',async()=>{
    const {c,doc,cargas}=await contexto(false);
    c.sessionStorage=c.window.sessionStorage;
    vm.runInContext(fs.readFileSync('frontend/js/api.js','utf8'),c);
    c.guardarToken('token-super');c.guardarEsSuperAdmin(false);
    let responder;
    c.fetch=()=>new Promise(resolve=>{responder=resolve});
    const inicio=c.inicializarSesion();
    assert(doc.body.classList.contains('sesion-inicializando'));
    assert(doc.getElementById('sesion-cargando'));
    responder({ok:true,json:async()=>({username:'superadmin',es_super_admin:true,empresa:{id:1,nombre:'Dato anterior'}})});
    await inicio;soloSaas(doc);assert.equal(cargas(),0);
    assert(!doc.body.classList.contains('sesion-inicializando'));
    assert.equal(doc.getElementById('sesion-cargando'),null);
});

test('recarga de usuario de empresa elimina un flag de superadmin obsoleto',async()=>{
    const {c,doc,cargas}=await contexto(true);c.sessionStorage=c.window.sessionStorage;
    vm.runInContext(fs.readFileSync('frontend/js/api.js','utf8'),c);
    c.guardarToken('token-empresa');c.guardarEsSuperAdmin(true);
    c.fetch=async()=>({ok:true,json:async()=>({username:'persona',es_super_admin:false,empresa:{id:7,nombre:'Empresa'}})});
    await c.inicializarSesion();assert.equal(cargas(),1);assert(!c.obtenerEsSuperAdmin());
    assert(!doc.body.classList.contains('modo-saas'));
});

test('recarga compatible con /me anterior y token inválido vuelve al login',async()=>{
    const {c,doc}=await contexto(true);c.sessionStorage=c.window.sessionStorage;
    vm.runInContext(fs.readFileSync('frontend/js/api.js','utf8'),c);
    c.guardarToken('token-super');
    c.fetch=async()=>({ok:true,json:async()=>({username:'superadmin',empresa:{id:null,slug:null,nombre:null}})});
    await c.inicializarSesion();soloSaas(doc);
    c.fetch=async()=>({ok:false});await c.inicializarSesion();
    assert(!doc.body.classList.contains('modo-saas'));assert(!doc.body.classList.contains('sesion-inicializando'));
    assert(!doc.getElementById('modal-login-admin').classList.contains('hidden'));
    assert.equal(c.obtenerToken(),'');
});
