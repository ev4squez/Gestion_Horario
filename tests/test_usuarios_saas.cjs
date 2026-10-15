const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const {JSDOM}=require(process.env.JSDOM_PATH || 'jsdom');
function contexto(){
    const dom=new JSDOM(fs.readFileSync('frontend/index.html','utf8'),{url:'http://localhost'});
    const solicitudes=[],usuarios=[];let falloCrear=false,falloListar=false;
    const respuesta=(status,data)=>({ok:status===200,status,json:async()=>data});
    const c=vm.createContext({document:dom.window.document,window:dom.window,sessionStorage:dom.window.sessionStorage,localStorage:dom.window.localStorage,console,
        fetch:async(url,opciones={})=>{
            solicitudes.push({url,...opciones});
            if(url.endsWith('/usuarios')){
                if(opciones.method==='POST'){
                    if(falloCrear)return respuesta(409,{detail:'Ya existe ese usuario en esta empresa'});
                    const datos=JSON.parse(opciones.body);const usuario={id:1,empresa_id:7,...datos};usuarios.push(usuario);return respuesta(200,usuario);
                }
                return falloListar ? respuesta(403,{detail:'Requiere permisos de super-admin'}) : respuesta(200,usuarios);
            }
            if(url==='/superadmin/empresas')return respuesta(200,[{id:7,slug:'empresa-prueba',nombre:'Empresa prueba',activo:true}]);
            if(url.endsWith('/stats'))return respuesta(200,{usuarios:usuarios.length});
            throw Error(`Petición inesperada: ${url}`);
        }});
    for(const f of ['frontend/js/api.js','frontend/js/admin/saas-admin.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
    c.guardarToken('token-superadmin');vm.runInContext('empresasSaasGlobal=[{id:7,slug:"empresa-prueba",nombre:"Empresa prueba"}]',c);
    return {c,doc:dom.window.document,solicitudes,fallarCreacion:()=>{falloCrear=true},fallarListado:()=>{falloListar=true}};
}
function rellenar(doc){
    doc.getElementById('saas-usuario-nuevo-username').value=' persona ';
    doc.getElementById('saas-usuario-nuevo-nombre').value='Persona';
    doc.getElementById('saas-usuario-nuevo-password').value='clave-prueba';
}
test('abre empresa, crea usuario con su ID y token, muestra confirmación y actualiza lista',async()=>{
    const {c,doc,solicitudes}=contexto();await c.abrirModalUsuariosEmpresaSaas(7);
    assert.equal(doc.activeElement.id,'saas-usuario-nuevo-username');rellenar(doc);
    await c.crearUsuarioEmpresaSaas();
    const peticion=solicitudes.find(s=>s.method==='POST');assert.equal(peticion.url,'/superadmin/empresas/7/usuarios');
    assert.equal(peticion.headers.Authorization,'Bearer token-superadmin');
    assert.deepEqual(JSON.parse(peticion.body),{username:'persona',nombre:'Persona',password:'clave-prueba',activo:true});
    assert.match(doc.getElementById('cuerpo-usuarios-empresa-saas').textContent,/persona/);
    assert.match(doc.getElementById('saas-usuario-estado').textContent,/creado en Empresa prueba/);
    assert.equal(doc.getElementById('saas-usuario-nuevo-password').value,'');assert(!doc.getElementById('saas-usuario-crear').disabled);
});
test('error al crear queda visible, conserva campos y permite corregir',async()=>{
    const {c,doc,fallarCreacion}=contexto();await c.abrirModalUsuariosEmpresaSaas(7);rellenar(doc);fallarCreacion();await c.crearUsuarioEmpresaSaas();
    assert.match(doc.getElementById('saas-usuario-estado').textContent,/Ya existe ese usuario/);
    assert.equal(doc.getElementById('saas-usuario-nuevo-password').value,'clave-prueba');assert(!doc.getElementById('saas-usuario-crear').disabled);
});
test('fallo al listar no se presenta como empresa vacía y ofrece reintentar',async()=>{
    const {c,doc,fallarListado}=contexto();fallarListado();await c.abrirModalUsuariosEmpresaSaas(7);
    const tabla=doc.getElementById('cuerpo-usuarios-empresa-saas');assert.match(tabla.textContent,/Requiere permisos/);assert.doesNotMatch(tabla.textContent,/aún no tiene usuarios/);
    assert.equal(tabla.querySelector('button').textContent,'Reintentar');
});
test('formulario admite envío con teclado y valida campos antes de hacer POST',async()=>{
    const {c,doc,solicitudes}=contexto();await c.abrirModalUsuariosEmpresaSaas(7);await c.crearUsuarioEmpresaSaas();
    assert.match(doc.getElementById('saas-usuario-estado').textContent,/obligatorios/);assert(!solicitudes.some(s=>s.method==='POST'));
    const boton=doc.getElementById('saas-usuario-crear');assert.equal(boton.type,'submit');assert.match(boton.closest('form').getAttribute('onsubmit'),/crearUsuarioEmpresaSaas/);
});

test('crear empresa muestra sus credenciales encima de SaaS inmediatamente y refresca sus usuarios',async()=>{
    const {c,doc}=contexto();
    const vista=doc.getElementById('vista-saas-admin');doc.body.appendChild(vista);doc.body.classList.add('modo-saas');
    const empresa={id:8,slug:'nueva',nombre:'Nueva empresa',activo:true,admin:{username:'admin-nueva',password_generada:'clave-temporal'}};
    let creadas=0,refrescos=0;
    c.crearEmpresaSaas=async datos=>{creadas++;assert.equal(datos.slug,'nueva');return empresa};
    c.listarEmpresasSaas=async()=>{refrescos++;return [{id:8,slug:'nueva',nombre:'Nueva empresa',activo:true}]};
    c.obtenerStatsEmpresaSaas=async()=>({usuarios:1,trabajadores:0,turnos_fijos:0});
    c.listarUsuariosEmpresaSaas=async id=>{assert.equal(id,8);return [{id:9,username:'admin-nueva',nombre:'Administrador',activo:true}]};
    doc.getElementById('saas-empresa-slug').value='nueva';doc.getElementById('saas-empresa-nombre').value='Nueva empresa';
    await c.crearEmpresaSaaS();
    assert.equal(creadas,1);assert.equal(refrescos,1);
    const modal=doc.getElementById('modal-credenciales-admin');assert.equal(modal.parentElement,vista);
    assert.equal(modal.style.display,'flex');assert(!modal.classList.contains('hidden'));
    assert.equal(doc.getElementById('credencial-username').textContent,'admin-nueva');
    assert.equal(doc.getElementById('credencial-password').textContent,'clave-temporal');
    assert.equal(doc.getElementById('saas-stat-usuarios').textContent,'1');
    c.cerrarModalCredenciales();assert.equal(modal.style.display,'none');assert.equal(doc.getElementById('credencial-password').textContent,'—');
    await c.abrirModalUsuariosEmpresaSaas(8);
    assert.match(doc.getElementById('cuerpo-usuarios-empresa-saas').textContent,/admin-nueva/);
    assert(doc.body.classList.contains('modo-saas'));
});
