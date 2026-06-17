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


// =====================================================
// TOKEN
// =====================================================

function obtenerToken() {
    return localStorage.getItem("authToken") || ""
}

function guardarToken(token) {
    localStorage.setItem("authToken", token)
}

function borrarToken() {
    localStorage.removeItem("authToken")
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

async function loginAdmin(password) {

    const response = await fetch(`/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
    })

    if (!response.ok) {
        return null
    }

    const data = await response.json()

    guardarToken(data.token)

    return data.token

}


// =====================================================
// TRABAJADORES
// =====================================================

async function obtenerTrabajadores() {

    const response = await fetch(`/trabajadores`)

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


// =====================================================
// PLANIFICACION
// =====================================================

async function obtenerPlanificacion() {

    const response = await fetch(`/planificacion`)

    return await response.json()

}

async function guardarPlanificacion(data) {

    // Endpoint público: editar horarios no requiere sesión de administrador.
    const response = await fetch(`/planificacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    })

    return response

}


// =====================================================
// CONFIGURACIÓN COBERTURA
// =====================================================

async function obtenerConfiguracionCobertura() {

    const response = await fetch(`/cobertura/config`)

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
