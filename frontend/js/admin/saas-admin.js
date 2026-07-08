// =====================================================
// SAAS ADMIN (panel multi-empresa)
// =====================================================
// Vista dedicada del super-admin: gestiona TODAS las empresas
// (crear, editar, activar/desactivar), gestiona los usuarios de
// cualquier empresa sin tener que impersonarla, y muestra un
// audit log de actividad reciente.
//
// El toggle visual (ocultar sidebar / header / panel derecho)
// lo hace modal.js (modo-saas); este archivo solo maneja el
// contenido del CRUD + stats + audit + usuarios.

// ---------------- Estado en memoria ----------------

let empresasSaasGlobal = []
let auditSaasGlobal = []
let saasTabActual = "empresas"
window.empresaSaasActual = null  // {id, slug, nombre} para gestión de usuarios
window.usuarioSaasEditando = null  // {id, username, nombre, activo} para edición

// ---------------- Tabs (Empresas | Actividad) ----------------

function cambiarTabSaas(tab){

    saasTabActual = tab

    document.querySelectorAll("[data-saas-tab]").forEach(btn => {
        const activo = btn.dataset.saasTab === tab
        btn.classList.toggle("bg-slate-900", activo)
        btn.classList.toggle("text-white", activo)
        btn.classList.toggle("bg-slate-100", !activo)
        btn.classList.toggle("text-slate-700", !activo)
    })

    document.querySelectorAll("[data-saas-panel]").forEach(panel => {
        const visible = panel.dataset.saasPanel === tab
        panel.classList.toggle("hidden", !visible)
    })

    if(tab === "actividad"){
        cargarAuditSaas()
    }

}

// ---------------- Carga y render de empresas ----------------

async function cargarEmpresasSaaS(){

    const empresas = await listarEmpresasSaas()
    if(!empresas){ return }
    empresasSaasGlobal = empresas

    await Promise.all(empresas.map(async (e) => {
        try{
            e.__stats = await obtenerStatsEmpresaSaas(e.id)
        }catch(_){
            e.__stats = { usuarios: 0, trabajadores: 0, turnos_fijos: 0 }
        }
    }))

    renderizarEmpresasSaas()
    renderizarStatsGlobalesSaas()

}

function renderizarEmpresasSaas(){

    const tbody = document.getElementById("cuerpo-saas-empresas")
    if(!tbody){ return }

    const texto = normalizarTexto(document.getElementById("saas-busqueda")?.value || "")
    const filtroEstado = document.getElementById("saas-filtro-estado")?.value || ""

    const filtradas = empresasSaasGlobal.filter(e => {
        if(filtroEstado === "activo" && !e.activo){ return false }
        if(filtroEstado === "inactivo" && e.activo){ return false }
        if(!texto){ return true }
        const searchable = [e.slug, e.nombre, e.rut].map(normalizarTexto).join(" | ")
        return searchable.includes(texto)
    })

    if(filtradas.length === 0){
        tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-500">No hay empresas que coincidan.</td></tr>'
        return
    }

    tbody.innerHTML = filtradas.map(e => {

        const estadoBadge = e.activo
            ? '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">Activa</span>'
            : '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-600">Inactiva</span>'

        const stats = e.__stats || {}
        const statsTexto = `<span class="text-xs text-slate-600">
            <span class="inline-flex items-center gap-1 mr-2">
                <span class="material-symbols-outlined text-[14px]">group</span>${stats.usuarios || 0}
            </span>
            <span class="inline-flex items-center gap-1 mr-2">
                <span class="material-symbols-outlined text-[14px]">badge</span>${stats.trabajadores || 0}
            </span>
            <span class="inline-flex items-center gap-1">
                <span class="material-symbols-outlined text-[14px]">event_available</span>${stats.turnos_fijos || 0}
            </span>
        </span>`

        const creada = e.created_at ? formatearFechaCorta(e.created_at) : "—"

        return '<tr>' +
            `<td class="p-3 font-mono text-xs">${escaparHTML(e.slug)}</td>` +
            `<td class="p-3 font-semibold">${escaparHTML(e.nombre)}</td>` +
            `<td class="p-3 text-slate-600">${escaparHTML(e.rut || "—")}</td>` +
            `<td class="p-3 text-center">${estadoBadge}</td>` +
            `<td class="p-3 text-center">${statsTexto}</td>` +
            `<td class="p-3 text-xs text-slate-500">${creada}</td>` +
            `<td class="p-3 text-center whitespace-nowrap">
                <button type="button" onclick="abrirModalUsuariosEmpresaSaas(${e.id})"
                    class="text-xs font-bold text-purple-600 hover:underline mr-3">Usuarios</button>
                <button type="button" onclick="abrirModalEditarEmpresaSaas(${e.id})"
                    class="text-xs font-bold text-blue-600 hover:underline mr-3">Editar</button>
                <button type="button" onclick="toggleEmpresaSaaSActiva(${e.id})"
                    class="text-xs font-bold ${e.activo ? "text-amber-600" : "text-emerald-600"} hover:underline">
                    ${e.activo ? "Desactivar" : "Activar"}
                </button>
            </td>` +
        '</tr>'
    }).join("")

}

function filtrarEmpresasSaas(){
    renderizarEmpresasSaas()
}

function formatearFechaCorta(iso){
    try{
        const d = new Date(iso)
        if(isNaN(d.getTime())){ return iso }
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, "0")
        const day = String(d.getDate()).padStart(2, "0")
        const hh = String(d.getHours()).padStart(2, "0")
        const mm = String(d.getMinutes()).padStart(2, "0")
        return `${y}-${m}-${day} ${hh}:${mm}`
    }catch(_){ return iso }
}

// ---------------- Stats globales ----------------

function renderizarStatsGlobalesSaas(){

    const totalEmpresas = empresasSaasGlobal.length
    const activas = empresasSaasGlobal.filter(e => e.activo).length

    const totalUsuarios = empresasSaasGlobal.reduce(
        (acc, e) => acc + ((e.__stats && e.__stats.usuarios) || 0), 0
    )
    const totalTrabajadores = empresasSaasGlobal.reduce(
        (acc, e) => acc + ((e.__stats && e.__stats.trabajadores) || 0), 0
    )

    const setText = (id, val) => {
        const el = document.getElementById(id)
        if(el){ el.textContent = val }
    }

    setText("saas-stat-empresas", totalEmpresas)
    setText("saas-stat-empresas-activas", activas)
    setText("saas-stat-usuarios", totalUsuarios)
    setText("saas-stat-trabajadores", totalTrabajadores)

}

// ---------------- Crear empresa ----------------

async function crearEmpresaSaaS(){

    const slug = (document.getElementById("saas-empresa-slug")?.value || "").trim()
    const nombre = (document.getElementById("saas-empresa-nombre")?.value || "").trim()
    const rut = (document.getElementById("saas-empresa-rut")?.value || "").trim()

    if(!slug || !nombre){
        alert("slug y nombre son obligatorios")
        return
    }

    try{
        const respuesta = await crearEmpresaSaas({
            slug, nombre,
            rut: rut || null,
            activo: true
        })

        document.getElementById("saas-empresa-slug").value = ""
        document.getElementById("saas-empresa-nombre").value = ""
        document.getElementById("saas-empresa-rut").value = ""

        if(respuesta && respuesta.admin){
            mostrarModalCredenciales({
                empresa: respuesta,
                admin: respuesta.admin
            })
        }

        await cargarEmpresasSaaS()
    }catch(e){
        alert(e.message || "No se pudo crear la empresa")
    }

}

// ---------------- Editar empresa (modal) ----------------

function abrirModalEditarEmpresaSaas(empresaId){

    const empresa = empresasSaasGlobal.find(e => e.id === empresaId)
    if(!empresa){ return }

    const nuevo = prompt(
        `Editar empresa "${empresa.nombre}".\n\n` +
        `Nuevo nombre (vacío = cancelar):`,
        empresa.nombre
    )
    if(nuevo === null){ return }
    const trimmed = nuevo.trim()
    if(!trimmed || trimmed === empresa.nombre){ return }

    const nuevoRut = prompt(
        `RUT de la empresa (dejar vacío para no cambiar):`,
        empresa.rut || ""
    )
    if(nuevoRut === null){ return }
    const rutTrimmed = nuevoRut.trim()

    const datos = { nombre: trimmed }
    if(nuevoRut !== null && rutTrimmed !== (empresa.rut || "")){
        datos.rut = rutTrimmed || null
    }

    actualizarEmpresaSaas(empresaId, datos)
        .then(() => cargarEmpresasSaaS())
        .catch(e => alert(e.message || "No se pudo actualizar la empresa"))

}

// ---------------- Activar/Desactivar empresa ----------------

async function toggleEmpresaSaaSActiva(empresaId){

    const empresa = empresasSaasGlobal.find(e => e.id === empresaId)
    if(!empresa){ return }

    const accion = empresa.activo ? "desactivar" : "activar"
    if(!confirm(`¿Seguro que quieres ${accion} "${empresa.nombre}"?`)){ return }

    try{
        await toggleEmpresaSaasActiva(empresaId)
        await cargarEmpresasSaaS()
    }catch(e){
        alert(e.message || "No se pudo cambiar el estado")
    }

}

// ---------------- Gestión de usuarios de una empresa ----------------

async function abrirModalUsuariosEmpresaSaas(empresaId){

    const empresa = empresasSaasGlobal.find(e => e.id === empresaId)
    if(!empresa){ return }

    window.empresaSaasActual = empresa

    const setText = (id, val) => {
        const el = document.getElementById(id)
        if(el){ el.textContent = val || "—" }
    }

    setText("usuarios-empresa-nombre", empresa.nombre)
    setText("usuarios-empresa-slug", empresa.slug)

    const modal = document.getElementById("modal-usuarios-empresa-saas")
    modal.classList.remove("hidden")
    modal.style.display = "flex"

    await cargarUsuariosEmpresaSaas()

}

function cerrarModalUsuariosEmpresaSaas(){

    const modal = document.getElementById("modal-usuarios-empresa-saas")
    modal.classList.add("hidden")
    modal.style.display = "none"
    window.empresaSaasActual = null

    // Limpiamos los inputs del form por seguridad
    const ids = ["saas-usuario-nuevo-username", "saas-usuario-nuevo-nombre", "saas-usuario-nuevo-password"]
    ids.forEach(id => {
        const el = document.getElementById(id)
        if(el){ el.value = "" }
    })

}

async function cargarUsuariosEmpresaSaas(){

    if(!window.empresaSaasActual){ return }
    const empresaId = window.empresaSaasActual.id

    const tbody = document.getElementById("cuerpo-usuarios-empresa-saas")
    if(!tbody){ return }

    const usuarios = await listarUsuariosEmpresaSaas(empresaId)
    if(!usuarios){ return }

    if(usuarios.length === 0){
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-500">Esta empresa aún no tiene usuarios.</td></tr>'
        return
    }

    tbody.innerHTML = usuarios.map(u => {

        const estado = u.activo
            ? '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">Activo</span>'
            : '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-600">Inactivo</span>'

        return '<tr>' +
            `<td class="p-2 font-mono text-xs">${escaparHTML(u.username)}</td>` +
            `<td class="p-2">${escaparHTML(u.nombre)}</td>` +
            `<td class="p-2 text-center">${estado}</td>` +
            `<td class="p-2 text-center whitespace-nowrap">
                <button type="button" onclick="abrirModalEditarUsuarioSaas(${u.id})"
                    class="text-xs font-bold text-blue-600 hover:underline mr-3">Editar</button>
                <button type="button" onclick="toggleActivoUsuarioSaas(${u.id}, ${!u.activo})"
                    class="text-xs font-bold ${u.activo ? "text-amber-600" : "text-emerald-600"} hover:underline mr-3">
                    ${u.activo ? "Desactivar" : "Activar"}
                </button>
                <button type="button" onclick="eliminarUsuarioSaas(${u.id}, '${escaparHTML(u.username).replace(/'/g, "\\'")}')"
                    class="text-xs font-bold text-red-600 hover:underline">Eliminar</button>
            </td>` +
        '</tr>'
    }).join("")

}

async function crearUsuarioEmpresaSaas(){

    if(!window.empresaSaasActual){ return }

    const username = (document.getElementById("saas-usuario-nuevo-username")?.value || "").trim()
    const nombre = (document.getElementById("saas-usuario-nuevo-nombre")?.value || "").trim()
    const password = document.getElementById("saas-usuario-nuevo-password")?.value || ""

    if(!username || !password){
        alert("username y contraseña son obligatorios")
        return
    }

    try{
        await crearUsuarioEmpresaSaasApi(window.empresaSaasActual.id, {
            username, password, nombre, activo: true
        })
        document.getElementById("saas-usuario-nuevo-username").value = ""
        document.getElementById("saas-usuario-nuevo-nombre").value = ""
        document.getElementById("saas-usuario-nuevo-password").value = ""
        await cargarUsuariosEmpresaSaas()
        // Refrescamos stats globales también
        await cargarEmpresasSaaS()
    }catch(e){
        alert(e.message || "No se pudo crear el usuario")
    }

}

function abrirModalEditarUsuarioSaas(usuarioId){

    if(!window.empresaSaasActual){ return }
    const tbody = document.getElementById("cuerpo-usuarios-empresa-saas")
    if(!tbody){ return }

    // Buscamos al usuario en el tbody (forma simple, evitamos guardar cache)
    const filas = tbody.querySelectorAll("tr")
    let usuario = null
    filas.forEach(fila => {
        const btn = fila.querySelector(`button[onclick="abrirModalEditarUsuarioSaas(${usuarioId})"]`)
        if(btn){
            const celdas = fila.querySelectorAll("td")
            usuario = {
                id: usuarioId,
                username: celdas[0]?.textContent.trim(),
                nombre: celdas[1]?.textContent.trim(),
                activo: celdas[2]?.textContent.trim() === "Activo",
            }
        }
    })

    if(!usuario){ return }
    window.usuarioSaasEditando = usuario

    document.getElementById("editar-usuario-saas-username").textContent = usuario.username
    document.getElementById("editar-usuario-saas-nombre").value = usuario.nombre
    document.getElementById("editar-usuario-saas-password").value = ""
    document.getElementById("editar-usuario-saas-activo").value = usuario.activo ? "true" : "false"

    const modal = document.getElementById("modal-editar-usuario-saas")
    modal.classList.remove("hidden")
    modal.style.display = "flex"

}

function cerrarModalEditarUsuarioSaas(){

    const modal = document.getElementById("modal-editar-usuario-saas")
    modal.classList.add("hidden")
    modal.style.display = "none"

    document.getElementById("editar-usuario-saas-password").value = ""
    window.usuarioSaasEditando = null

}

async function guardarEdicionUsuarioSaas(){

    if(!window.empresaSaasActual || !window.usuarioSaasEditando){ return }

    const nombre = document.getElementById("editar-usuario-saas-nombre").value.trim()
    const password = document.getElementById("editar-usuario-saas-password").value
    const activo = document.getElementById("editar-usuario-saas-activo").value === "true"

    const datos = { nombre, activo }
    if(password){
        datos.password = password
    }

    try{
        await actualizarUsuarioEmpresaSaasApi(
            window.empresaSaasActual.id,
            window.usuarioSaasEditando.id,
            datos
        )
        cerrarModalEditarUsuarioSaas()
        await cargarUsuariosEmpresaSaas()
        await cargarEmpresasSaaS()
    }catch(e){
        alert(e.message || "No se pudo actualizar el usuario")
    }

}

async function toggleActivoUsuarioSaas(usuarioId, nuevoActivo){

    if(!window.empresaSaasActual){ return }

    try{
        await actualizarUsuarioEmpresaSaasApi(
            window.empresaSaasActual.id,
            usuarioId,
            { activo: nuevoActivo }
        )
        await cargarUsuariosEmpresaSaas()
        await cargarEmpresasSaaS()
    }catch(e){
        alert(e.message || "No se pudo cambiar el estado")
    }

}

async function eliminarUsuarioSaas(usuarioId, username){

    if(!window.empresaSaasActual){ return }

    if(!confirm(`¿Eliminar al usuario "${username}"? Esta acción no se puede deshacer.`)){
        return
    }

    try{
        await eliminarUsuarioEmpresaSaasApi(window.empresaSaasActual.id, usuarioId)
        await cargarUsuariosEmpresaSaas()
        await cargarEmpresasSaaS()
    }catch(e){
        alert(e.message || "No se pudo eliminar el usuario")
    }

}

// ---------------- Audit log ----------------

async function cargarAuditSaas(){

    const contenedor = document.getElementById("cuerpo-saas-audit")
    if(!contenedor){ return }

    contenedor.innerHTML = '<p class="p-4 text-center text-slate-500 text-sm">Cargando...</p>'

    const filas = await listarAuditSaas(50)
    if(!filas){ return }
    auditSaasGlobal = filas

    if(filas.length === 0){
        contenedor.innerHTML = '<p class="p-4 text-center text-slate-500 text-sm">Sin actividad reciente.</p>'
        document.getElementById("saas-stat-audit").textContent = "0"
        return
    }

    document.getElementById("saas-stat-audit").textContent = String(filas.length)

    contenedor.innerHTML = filas.map(f => {

        const color = {
            crear_empresa: "bg-emerald-100 text-emerald-700",
            actualizar_empresa: "bg-blue-100 text-blue-700",
            toggle_empresa: "bg-amber-100 text-amber-700",
            crear_usuario: "bg-purple-100 text-purple-700",
            actualizar_usuario: "bg-indigo-100 text-indigo-700",
            eliminar_usuario: "bg-red-100 text-red-700",
        }[f.accion] || "bg-slate-100 text-slate-700"

        const empresaTxt = f.empresa_id ? `empresa #${f.empresa_id}` : "—"

        return `<div class="rounded-2xl border border-slate-200 p-3 flex items-center gap-3">
            <span class="px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${color}">${escaparHTML(f.accion)}</span>
            <div class="min-w-0 flex-1">
                <p class="text-sm text-slate-800 truncate">${escaparHTML(f.detalle || "—")}</p>
                <p class="text-xs text-slate-500 mt-0.5">
                    ${escaparHTML(f.actor || "—")} · ${escaparHTML(empresaTxt)} · ${formatearFechaCorta(f.created_at)}
                </p>
            </div>
        </div>`

    }).join("")

}

// ---------------- Render principal ----------------

function renderizarSaasAdmin(){
    cargarEmpresasSaaS()
    cargarAuditSaas()
    // Aseguramos que arranca en el tab "empresas"
    cambiarTabSaas("empresas")
}

// =====================================================
// MODAL DE CREDENCIALES GENERADAS (mostrar una sola vez)
// =====================================================
// Llena los campos del modal #modal-credenciales-admin con los datos
// del admin creado y abre el modal. Se usa después de crear una
// empresa para que el super-admin copie y entregue las credenciales
// al cliente. La contraseña en claro NUNCA vuelve a estar disponible
// después de cerrar este modal.
function mostrarModalCredenciales({ empresa, admin }){

    const modal = document.getElementById("modal-credenciales-admin")
    if(!modal){ return }

    const setText = (id, texto) => {
        const el = document.getElementById(id)
        if(el){ el.textContent = texto || "—" }
    }

    setText("credencial-empresa-nombre", empresa && empresa.nombre)
    setText("credencial-empresa-slug", empresa && empresa.slug)
    setText("credencial-username", admin && admin.username)
    setText("credencial-password", admin && admin.password_generada)

    modal.classList.remove("hidden")
    modal.style.display = "flex"

}

function cerrarModalCredenciales(){

    const modal = document.getElementById("modal-credenciales-admin")
    if(!modal){ return }
    modal.classList.add("hidden")
    modal.style.display = "none"

    const ids = [
        "credencial-empresa-nombre",
        "credencial-empresa-slug",
        "credencial-username",
        "credencial-password",
    ]
    ids.forEach(id => {
        const el = document.getElementById(id)
        if(el){ el.textContent = "—" }
    })

}

async function copiarCredencial(elementId, boton){

    const el = document.getElementById(elementId)
    if(!el){ return }

    const texto = el.textContent || ""
    if(!texto || texto === "—"){ return }

    try{
        await navigator.clipboard.writeText(texto)
    }catch(e){
        const rango = document.createRange()
        rango.selectNodeContents(el)
        const seleccion = window.getSelection()
        seleccion.removeAllRanges()
        seleccion.addRange(rango)
        try{ document.execCommand("copy") }catch(_){}
        seleccion.removeAllRanges()
    }

    if(boton){
        const original = boton.innerHTML
        boton.innerHTML = '<span class="material-symbols-outlined text-base">check</span> Copiado'
        boton.disabled = true
        setTimeout(() => {
            boton.innerHTML = original
            boton.disabled = false
        }, 1500)
    }

}