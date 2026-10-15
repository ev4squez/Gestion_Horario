// =====================================================
// AUTENTICACIÓN (usuario + contraseña)
// =====================================================
// El backend valida usuario/contraseña contra la tabla `usuarios` y devuelve
// un token. A partir de ahora la planificación también exige sesión:
// la grilla, el botón "Generar" y los paneles laterales (alertas / resumen)
// solo se muestran cuando hay un token válido.

// Abre el modal de login.
function iniciarSesion(){

    document
        .getElementById("modal-login-admin")
        .classList.remove("hidden")

    // Llena el <select> de empresas con la lista que devuelve el backend.
    poblarSelectEmpresas()

    const campoUsuario = document.getElementById("usuario-admin")
    if(campoUsuario){ campoUsuario.focus() }

}

// Pide al backend la lista de empresas activas y llena el <select> del modal
// de login. Si falla (backend caído, sin empresas), deja solo un placeholder.
async function poblarSelectEmpresas(){

    const select =
        document.getElementById("empresa-admin")

    if(!select){ return }

    const empresas =
        typeof listarEmpresas === "function"
            ? await listarEmpresas()
            : []

    if(!empresas || empresas.length === 0){

        select.innerHTML = `
            <option value="">— No hay empresas registradas —</option>
        `
        return
    }

    // Si hay un valor previo (última empresa usada), lo preseleccionamos.
    const previa =
        localStorage.getItem("authUltimaEmpresa") || ""

    let html = `<option value="">— Empresa (opcional) —</option>`

    empresas.forEach(e => {
        const selected = e.slug === previa ? "selected" : ""
        html += `
            <option value="${escaparHTML(e.slug)}" ${selected}>
                ${escaparHTML(e.nombre)} (${escaparHTML(e.slug)})
            </option>
        `
    })

    select.innerHTML = html

}

async function validarAdmin(){

    const empresa =
        document.getElementById("empresa-admin").value.trim()

    const username =
        document.getElementById("usuario-admin").value.trim()

    const password =
        document.getElementById("password-admin").value

    if(!username || !password){
        alert("Ingresa usuario y contraseña.")
        return
    }

    // Recordar la empresa seleccionada para preseleccionarla la próxima vez.
    // Si está vacía, la borramos (el super-admin no la necesita).
    if(empresa){
        localStorage.setItem("authUltimaEmpresa", empresa)
    }else{
        localStorage.removeItem("authUltimaEmpresa")
    }

    const datos = await loginAdmin(empresa, username, password)

    if(!datos){
        alert("Empresa, usuario o contraseña incorrectos")
        return
    }

    adminAutorizado = true

    guardarNombreUsuario(datos.nombre || datos.username || username)

    document.getElementById("empresa-admin").value = ""
    document.getElementById("usuario-admin").value = ""
    document.getElementById("password-admin").value = ""

    actualizarBotonSesion()

    actualizarBloqueoPlanificacion()

    cerrarModalAdmin()

    await abrirVistaInicialSesion()

}

// Acceso a la vista Colaboradores: con sesión la abre, si no pide login.
function accederCRUD(){

    if(adminAutorizado && obtenerToken()){
        mostrarVistaTrabajadores()
        return
    }

    iniciarSesion()

}

function cerrarModalAdmin(){

    document
        .getElementById("modal-login-admin")
        .classList.add("hidden")

}

async function cerrarSesionAdmin(){

    // Invalida el token en el backend (best-effort) y limpia el cliente.
    await logoutServidor()

    adminAutorizado = false

    borrarToken()

    // Defensa: si el usuario está en modo-saas (vista SaaS Admin
    // como overlay absoluto), quitamos la clase y ocultamos la vista
    // para que no quede "pegada" en pantalla tras el logout.
    document.body.classList.remove("modo-saas")
    const vista = document.getElementById("vista-saas-admin")
    if(vista){
        vista.classList.add("hidden")
        vista.style.display = "none"
    }

    actualizarBotonSesion()

    actualizarBloqueoPlanificacion()

    // Volver a la vista de planificación. Como ahora la vista está gateada,
    // esto abre el modal de login en lugar de mostrar la grilla.
    if(typeof mostrarVistaPlanificacion === "function"){
        mostrarVistaPlanificacion()
    }

}

// =====================================================
// VISIBILIDAD SEGÚN SESIÓN
// =====================================================
// Con sesión: se muestran Planificación, Cobertura, Colaboradores, Usuarios
// y "Cerrar sesión". Sin sesión: solo "Iniciar sesión" y un placeholder con
// candado en lugar de la grilla de planificación.

// Muestra la grilla + paneles laterales cuando hay sesión; en caso contrario
// enseña el placeholder con candado y oculta los datos protegidos.
function actualizarBloqueoPlanificacion(){

    const sesionActiva = !!(adminAutorizado && obtenerToken())
    const superadmin = sesionSuperAdminActiva()

    const toggle = (id, visible) => {
        const el = document.getElementById(id)
        if(!el){ return }
        el.classList.toggle("hidden", !visible)
    }

    toggle("vista-planificacion", sesionActiva && !superadmin)
    toggle("planificacion-bloqueada", !sesionActiva)
    toggle("right-panel", sesionActiva && !superadmin)

}

function actualizarBotonSesion(){

    const mostrar = (id, visible) => {
        const el = document.getElementById(id)
        if(!el){ return }
        el.classList.toggle("hidden", !visible)
    }

    mostrar("btn-login", !adminAutorizado)
    mostrar("btn-logout", adminAutorizado)
    const superadmin = sesionSuperAdminActiva()
    const empresaActiva = adminAutorizado && !superadmin
    mostrar("menu-planificacion", !superadmin)
    mostrar("menu-alertas", !superadmin)
    mostrar("menu-turnos-frecuentes", empresaActiva)
    mostrar("menu-cobertura", empresaActiva)
    mostrar("menu-colaboradores", empresaActiva)
    mostrar("menu-usuarios", empresaActiva)
    mostrar("menu-saas-admin", superadmin)
    mostrar("badge-empresa-sidebar", empresaActiva)

    // Nombre del usuario en el botón de cerrar sesión.
    const texto = document.getElementById("texto-sesion")
    if(texto){
        const nombre = obtenerNombreUsuario()
        texto.textContent = nombre ? `Cerrar sesión (${nombre})` : "Cerrar sesión"
    }

    // Empresa activa (multi-tenant).
    const textoEmpresa = document.getElementById("texto-empresa-sidebar")
    if(textoEmpresa){
        const empresa = typeof obtenerEmpresa === "function" ? obtenerEmpresa() : null
        textoEmpresa.textContent = empresa ? empresa.nombre : "—"
    }

}

// =====================================================
// ESTADO INICIAL
// =====================================================
// Si hay un token guardado, se valida contra el backend; si ya no es válido
// (p. ej. el servidor se reinició), se limpia la sesión del cliente.

// El superadmin administra empresas; no carga datos de planificación.
async function abrirVistaInicialSesion(){
    if(sesionSuperAdminActiva()){
        mostrarVistaSaasAdmin()
        return
    }
    document.body.classList.remove("modo-saas")
    if(typeof cargarSistema === "function") await cargarSistema()
    mostrarVistaPlanificacion()
}

async function inicializarSesion(){
    document.body.classList.add("sesion-inicializando")
    try{
        adminAutorizado = obtenerToken() ? await verificarSesion() : false
        if(!adminAutorizado) borrarToken()

        actualizarBotonSesion()
        actualizarBloqueoPlanificacion()

        if(adminAutorizado){
            await abrirVistaInicialSesion()
        }else{
            document.body.classList.remove("modo-saas")
            ocultarTodasLasVistas()
            iniciarSesion()
        }
    }finally{
        document.body.classList.remove("sesion-inicializando")
        document.getElementById("sesion-cargando")?.remove()
    }
}


document.addEventListener("DOMContentLoaded", () => {

    // ─────────────────────────────────────────────────────────
    // FIX: mover #vista-saas-admin a hijo directo de <body>
    // ─────────────────────────────────────────────────────────
    // En el HTML la vista está anidada dentro de #main-content, que a su
    // vez está dentro de <main> y de un wrapper flex. Cuando el CSS modo-
    // saas aplica `position: fixed; inset: 0; width: 100vw; height: 100vh`
    // la regla "gana" en specificity, pero igual queda atrapada por el
    // contexto de posicionamiento de los ancestros: el navegador reporta
    // offsetHeight=0 aunque el display sea flex y la position sea fixed.
    //
    // La solución estándar para overlays de pantalla completa es que el
    // nodo sea hijo directo de <body>. Como solo es cuestión de DOM, lo
    // hacemos acá en una línea en vez de reorganizar el HTML.
    const vistaSaas = document.getElementById("vista-saas-admin")
    if(vistaSaas && vistaSaas.parentElement !== document.body){
        document.body.appendChild(vistaSaas)
    }

    inicializarSesion()

})

// =====================================================
// DETECCIÓN DE TOKEN MUERTO (server reiniciado, etc.)
// =====================================================
// api.js dispara `auth:token-muerto` cuando una llamada devuelve 401
// y sabemos que el server sigue corriendo (no es un problema de red).
// Cerramos la sesión acá para que el modal de login aparezca en vez de
// dejar la vista SaaS Admin en blanco con stats vacíos.
window.addEventListener("auth:token-muerto", () => {

    if(!obtenerToken()){ return }

    borrarToken()
    adminAutorizado = false
    actualizarBotonSesion()
    actualizarBloqueoPlanificacion()

    // Si estamos en modo-saas, salir para que el overlay no quede pegado.
    document.body.classList.remove("modo-saas")
    const vista = document.getElementById("vista-saas-admin")
    if(vista){
        vista.classList.add("hidden")
        vista.style.display = "none"
    }

    if(typeof mostrarVistaPlanificacion === "function"){
        mostrarVistaPlanificacion()
    }

    if(typeof iniciarSesion === "function"){
        iniciarSesion()
    }

    // Mensaje claro (no silencioso) para que se entienda qué pasó.
    if(typeof Swal !== "undefined"){
        Swal.fire({
            icon: "warning",
            title: "Sesión expirada",
            text: "El servidor se reinició o tu sesión caducó. Vuelve a iniciar sesión.",
            confirmButtonText: "Entendido"
        })
    }else{
        alert("Sesión expirada. El servidor se reinició o tu sesión caducó. Vuelve a iniciar sesión.")
    }

})

// Helper: navega a la vista de planificación. Se usa desde SaaS Admin
// y otras vistas que quieren "volver".
function volverAPlanificacion(){
    if(typeof mostrarVistaPlanificacion === "function"){
        mostrarVistaPlanificacion()
    }
}

