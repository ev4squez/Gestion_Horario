const API_URL = ""


// =====================================================
// ESCAPE HTML (prevención XSS)
// =====================================================

function escaparHTML(valor) {

    if (valor === null || valor === undefined) {
        return ""
    }

    return String(valor)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")

}

function normalizarTexto(valor) {

    return String(valor || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()

}

function recomendacionPorEstadoRespuesta(status) {

    switch(status){
        case 400:
            return "Revisa los datos ingresados y vuelve a intentarlo."
        case 401:
            return "Inicia sesi\u00f3n nuevamente."
        case 404:
            return "Recarga la vista y prueba otra vez."
        case 409:
            return "Corrige el dato en conflicto y repite la acci\u00f3n."
        case 422:
            return "Completa los campos obligatorios y valida el formato."
        default:
            return "Si el problema persiste, intenta nuevamente."
    }

}

async function leerMensajeRespuestaError(respuesta, mensajeBase) {

    let mensaje = mensajeBase

    try{
        const error = await respuesta.json()
        if(error && error.detail){
            mensaje = error.detail
        }
    }catch(e){}

    const recomendacion =
        recomendacionPorEstadoRespuesta(
            respuesta.status
        )

    return `${mensaje}. ${recomendacion}`

}


// =====================================================
// TOKEN
// =====================================================

function obtenerToken() {
    return sessionStorage.getItem("authToken") || ""
}

function guardarToken(token) {
    sessionStorage.setItem("authToken", token)
}

function borrarToken() {
    sessionStorage.removeItem("authToken")
    sessionStorage.removeItem("authNombre")
    localStorage.removeItem("authEmpresa")
    localStorage.removeItem("authEsSuperAdmin")
    localStorage.removeItem("authUltimaEmpresa")
}

function guardarEsSuperAdmin(valor){
    sessionStorage.setItem("authEsSuperAdmin", valor ? "1" : "0")
}

function obtenerEsSuperAdmin(){
    return sessionStorage.getItem("authEsSuperAdmin") === "1"
}

function guardarNombreUsuario(nombre) {
    sessionStorage.setItem("authNombre", nombre || "")
}

function obtenerNombreUsuario() {
    return sessionStorage.getItem("authNombre") || ""
}

function guardarEmpresa(empresa) {
    // Guarda un objeto JSON con {id, slug, nombre}.
    if(!empresa){ return }
    try{
        localStorage.setItem("authEmpresa", JSON.stringify(empresa))
    }catch(e){}
}

function obtenerEmpresa() {
    const raw = localStorage.getItem("authEmpresa")
    if(!raw){ return null }
    try{
        return JSON.parse(raw)
    }catch(e){
        return null
    }
}

function authHeaders(extra = {}) {

    const token = obtenerToken()

    return {
        ...extra,
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
    }

}


// =====================================================
// LOGIN
// =====================================================

// Lista las empresas activas (público, sin token). Se usa para poblar el
// <select> del modal de login.
async function listarEmpresas(){

    try{
        const response = await fetch(`/empresas`)
        if(!response.ok){ return [] }
        return await response.json()
    }catch(e){
        return []
    }

}

async function loginAdmin(empresa, username, password) {

    const response = await fetch(`/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa: empresa || null, username, password })
    })

    if (!response.ok) {
        return null
    }

    const data = await response.json()

    guardarToken(data.token)
    if(data.empresa){ guardarEmpresa(data.empresa) }
    guardarEsSuperAdmin(!!data.es_super_admin)

    return data

}

// Cierra la sesión también en el backend (invalida el token en memoria).
async function logoutServidor() {

    try {
        await fetch(`/logout`, {
            method: "POST",
            headers: authHeaders()
        })
    } catch (e) { /* sin red: el token igual se borra en el cliente */ }

}

// Valida si el token guardado sigue activo en el backend.
async function verificarSesion(){

    if (!obtenerToken()) { return false }

    try {
        const response = await fetch(`/me`, { headers: authHeaders() })
        if(!response.ok){ return false }
        const data = await response.json()
        if(data && data.empresa){ guardarEmpresa(data.empresa) }
        // Si /me no devuelve empresa, el usuario es super-admin global
        // (los super-admins tienen empresa_id=NULL y ctx.empresa_slug=None,
        // por lo que data.empresa llega como {id:null, slug:null, nombre:null}
        // desde el backend). En cualquier caso, sincronizamos el flag para
        // que obtenerEsSuperAdmin() devuelva el valor correcto tras un
        // reload de la página.
        const esSuperAdmin = !data || !data.empresa || data.empresa.id == null
        guardarEsSuperAdmin(esSuperAdmin)
        return true
    } catch (e) {
        return false
    }

}

// =====================================================
// USUARIOS (gestión)
// =====================================================

async function obtenerUsuarios() {

    const response = await fetch(`/usuarios`, { headers: authHeaders() })

    if (!response.ok) { return [] }

    return await response.json()

}

async function crearUsuario(data) {

    return await fetch(`/usuarios`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data)
    })

}

async function actualizarUsuario(id, data) {

    return await fetch(`/usuarios/${id}`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data)
    })

}

async function eliminarUsuario(id) {

    return await fetch(`/usuarios/${id}`, {
        method: "DELETE",
        headers: authHeaders()
    })

}


// =====================================================
// TRABAJADORES
// =====================================================

async function obtenerTrabajadores() {

    const response = await fetch(`/trabajadores`, {
        headers: authHeaders()
    })

    return await response.json()

}

async function crearTrabajador(data) {

    const response = await fetch(`/trabajadores`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data)
    })

    return response

}

async function importarTrabajadores(lista) {

    const response = await fetch(`/trabajadores/importar`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(lista)
    })

    return response

}

async function actualizarTrabajador(id, data) {

    const response = await fetch(`/trabajadores/${id}`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data)
    })

    return response

}

async function eliminarTrabajador(id) {

    const response = await fetch(`/trabajadores/${id}`, {
        method: "DELETE",
        headers: authHeaders()
    })

    return response

}

// Turnos fijos por día de la semana. El backend expone dos endpoints:
// GET para leer la lista y PUT para reemplazar la lista completa.
async function obtenerTurnosFijosTrabajador(trabajadorId){

    const response = await fetch(
        `/trabajadores/${trabajadorId}/turnos-fijos`,
        { headers: authHeaders() }
    )

    if(!response.ok){ return [] }

    return await response.json()

}

async function guardarTurnosFijosTrabajador(trabajadorId, turnos){

    return await fetch(
        `/trabajadores/${trabajadorId}/turnos-fijos`,
        {
            method: "PUT",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ turnos })
        }
    )

}


// =====================================================
// PLANIFICACION
// =====================================================

async function obtenerPlanificacion() {

    const response = await fetch(`/planificacion`, { headers: authHeaders() })

    return await response.json()

}

async function guardarPlanificacion(data) {

    const response = await fetch(`/planificacion`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data)
    })

    return response

}

async function guardarPlanificacionLote(asignaciones) {

    return await fetch(`/planificacion/lote`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ asignaciones })
    })

}


// =====================================================
// CONFIGURACIÓN COBERTURA
// =====================================================

async function obtenerConfiguracionCobertura() {

    const response = await fetch(`/cobertura/config`, {
        headers: authHeaders()
    })

    return await response.json()

}

async function crearConfiguracionCobertura(data) {

    const response = await fetch(`/cobertura/config`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data)
    })

    return response

}

async function actualizarConfiguracionCobertura(id, data) {

    const response = await fetch(`/cobertura/config/${id}`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data)
    })

    return response

}

async function eliminarConfiguracionCobertura(id) {

    const response = await fetch(`/cobertura/config/${id}`, {
        method: "DELETE",
        headers: authHeaders()
    })

    return response

}

// =====================================================
// CONFIGURACIÓN COLACIÓN (minutos por CECO)
// =====================================================

async function obtenerConfiguracionColacion() {

    const response = await fetch(`/colacion/config`, {
        headers: authHeaders()
    })

    return await response.json()

}

async function guardarConfiguracionColacion(data) {

    const response = await fetch(`/colacion/config`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data)
    })

    return response

}

async function eliminarConfiguracionColacion(id) {

    const response = await fetch(`/colacion/config/${id}`, {
        method: "DELETE",
        headers: authHeaders()
    })

    return response

}

// =====================================================
// SaaS ADMIN: gestión multi-empresa
// =====================================================

async function listarEmpresasSaas(){

    const response = await fetch(`/superadmin/empresas`, {
        headers: authHeaders()
    })
    if(response.status === 401){
        // Token muerto (server reiniciado o sesión cerrada en otra pestaña).
        // Avisamos a quien escuche (auth.js) para que limpie la sesión y
        // reabra el modal de login en vez de dejar la vista "en blanco".
        try{
            window.dispatchEvent(new CustomEvent("auth:token-muerto", {
                detail: { endpoint: "/superadmin/empresas" }
            }))
        }catch(_){}
        return []
    }
    if(!response.ok){ return [] }
    return await response.json()

}

async function crearEmpresaSaas(datos){

    const response = await fetch(`/superadmin/empresas`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(datos)
    })
    if(!response.ok){
        let msg = "No se pudo crear la empresa"
        try{
            const err = await response.json()
            if(err.detail){ msg = err.detail }
        }catch(e){}
        throw new Error(msg)
    }
    return await response.json()

}

async function actualizarEmpresaSaas(empresaId, datos){

    const response = await fetch(`/superadmin/empresas/${empresaId}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(datos)
    })
    if(!response.ok){
        let msg = "No se pudo actualizar la empresa"
        try{
            const err = await response.json()
            if(err.detail){ msg = err.detail }
        }catch(e){}
        throw new Error(msg)
    }
    return await response.json()

}

async function toggleEmpresaSaasActiva(empresaId){

    const response = await fetch(
        `/superadmin/empresas/${empresaId}/toggle-activo`,
        { method: "POST", headers: authHeaders() }
    )
    if(!response.ok){
        let msg = "No se pudo cambiar el estado de la empresa"
        try{
            const err = await response.json()
            if(err.detail){ msg = err.detail }
        }catch(e){}
        throw new Error(msg)
    }
    return await response.json()

}

// Stats por empresa (cantidad de usuarios, trabajadores, turnos fijos)
async function obtenerStatsEmpresaSaas(empresaId){
    const response = await fetch(
        `/superadmin/empresas/${empresaId}/stats`,
        { headers: authHeaders() }
    )
    if(!response.ok){ return null }
    return await response.json()
}

// Gestión de usuarios de una empresa desde superadmin
async function listarUsuariosEmpresaSaas(empresaId){
    const response = await fetch(
        `/superadmin/empresas/${empresaId}/usuarios`,
        { headers: authHeaders() }
    )
    if(!response.ok){ return [] }
    return await response.json()
}

async function crearUsuarioEmpresaSaasApi(empresaId, datos){
    const response = await fetch(
        `/superadmin/empresas/${empresaId}/usuarios`,
        {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(datos),
        }
    )
    if(!response.ok){
        let msg = "No se pudo crear el usuario"
        try{
            const err = await response.json()
            if(err.detail){ msg = err.detail }
        }catch(e){}
        throw new Error(msg)
    }
    return await response.json()
}

async function actualizarUsuarioEmpresaSaasApi(empresaId, usuarioId, datos){
    const response = await fetch(
        `/superadmin/empresas/${empresaId}/usuarios/${usuarioId}`,
        {
            method: "PATCH",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(datos),
        }
    )
    if(!response.ok){
        let msg = "No se pudo actualizar el usuario"
        try{
            const err = await response.json()
            if(err.detail){ msg = err.detail }
        }catch(e){}
        throw new Error(msg)
    }
    return await response.json()
}

async function eliminarUsuarioEmpresaSaasApi(empresaId, usuarioId){
    const response = await fetch(
        `/superadmin/empresas/${empresaId}/usuarios/${usuarioId}`,
        { method: "DELETE", headers: authHeaders() }
    )
    if(!response.ok){
        let msg = "No se pudo eliminar el usuario"
        try{
            const err = await response.json()
            if(err.detail){ msg = err.detail }
        }catch(e){}
        throw new Error(msg)
    }
    return await response.json()
}

// Audit log del super-admin
async function listarAuditSaas(limit=50){
    const response = await fetch(
        `/superadmin/audit?limit=${limit}`,
        { headers: authHeaders() }
    )
    if(!response.ok){ return [] }
    return await response.json()
}

