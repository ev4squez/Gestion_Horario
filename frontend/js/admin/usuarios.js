// =====================================================
// GESTIÓN DE USUARIOS (solo con sesión iniciada)
// =====================================================

let usuariosGlobal = []
window.busquedaUsuarios = window.busquedaUsuarios || ""

async function mostrarVistaUsuarios(){

    // Defensa: la vista solo tiene sentido con sesión activa.
    if(!(adminAutorizado && obtenerToken())){
        iniciarSesion()
        return
    }

    marcarMenuActivo("menu-usuarios")

    ocultarTodasLasVistas()

    // `ocultarTodasLasVistas` aplica `style.display = "none"` inline para
    // ganar sobre las clases responsivas (`xl:flex`, etc.) que suelen
    // tener mayor especificidad. Sin limpiar ese inline, el `hidden`
    // que removemos aquí no se ve — la vista quedaba invisible aunque
    // la lógica siguiera corriendo.
    const vista = document.getElementById("vista-usuarios")
    if(vista){
        vista.classList.remove("hidden")
        vista.style.display = ""
    }

    await cargarUsuarios()

}

async function cargarUsuarios(){

    usuariosGlobal = await obtenerUsuarios()

    renderizarUsuarios()

}

function renderizarUsuarios(){

    const tbody =
        document.getElementById("tabla-usuarios-body")

    if(!tbody){ return }

    const texto =
        normalizarTexto(
            document.getElementById("busqueda-usuarios")?.value
        )

    const filtrados =
        (usuariosGlobal || []).filter(u => {

            if(!texto){ return true }

            const searchable = [
                u.nombre,
                u.username,
                u.activo ? "activo" : "inactivo"
            ].map(normalizarTexto).join(" | ")

            return searchable.includes(texto)

        })

    if(filtrados.length === 0){
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-5 text-center text-slate-400">
                    Sin coincidencias
                </td>
            </tr>
        `
        return
    }

    tbody.innerHTML = filtrados.map(u => `
        <tr class="hover:bg-slate-50">
            <td class="p-3 font-semibold">${escaparHTML(u.nombre)}</td>
            <td class="p-3">${escaparHTML(u.username)}</td>
            <td class="p-3 text-center">
                <span class="px-2 py-1 rounded-full text-xs font-bold ${
                    u.activo
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                }">
                    ${u.activo ? "Activo" : "Inactivo"}
                </span>
            </td>
            <td class="p-3">
                <div class="flex justify-center gap-2">
                    <button onclick="cambiarPasswordUsuario(${u.id})"
                        class="px-3 py-2 rounded-xl bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold">
                        Cambiar clave
                    </button>
                    <button onclick="eliminarUsuarioCRUD(${u.id})"
                        class="px-3 py-2 rounded-xl bg-red-100 text-red-700 hover:bg-red-200 font-semibold">
                        Eliminar
                    </button>
                </div>
            </td>
        </tr>
    `).join("")

}

// Manejo común de respuestas (sesión expirada / error con detalle).
async function manejarRespuestaUsuario(respuesta, mensajeError){

    if(respuesta.status === 401){
        alert("Sesión expirada. Inicia sesión nuevamente.")
        cerrarSesionAdmin()
        return false
    }

    if(!respuesta.ok){
        alert(
            await leerMensajeRespuestaError(
                respuesta,
                mensajeError
            )
        )
        return false
    }

    return true

}

async function guardarUsuarioNuevo(){

    const nombre =
        document.getElementById("usuario-nuevo-nombre").value.trim()

    const username =
        document.getElementById("usuario-nuevo-username").value.trim()

    const password =
        document.getElementById("usuario-nuevo-password").value

    if(!username || !password){
        alert("Usuario y contraseña son obligatorios.")
        return
    }

    const respuesta =
        await crearUsuario({ username, password, nombre })

    if(!(await manejarRespuestaUsuario(respuesta, "No se pudo crear el usuario"))){
        return
    }

    document.getElementById("usuario-nuevo-nombre").value = ""
    document.getElementById("usuario-nuevo-username").value = ""
    document.getElementById("usuario-nuevo-password").value = ""

    await cargarUsuarios()

}

async function cambiarPasswordUsuario(id){

    const usuario =
        usuariosGlobal.find(u => u.id === id)

    if(!usuario){ return }

    const password =
        prompt(`Nueva contraseña para "${usuario.username}":`)

    // Cancelado o vacío: no se cambia.
    if(password === null){ return }

    if(!password.trim()){
        alert("La contraseña no puede estar vacía.")
        return
    }

    const respuesta =
        await actualizarUsuario(id, { password })

    if(!(await manejarRespuestaUsuario(respuesta, "No se pudo cambiar la contraseña"))){
        return
    }

    alert("Contraseña actualizada.")

}

async function eliminarUsuarioCRUD(id){

    const usuario =
        usuariosGlobal.find(u => u.id === id)

    if(!usuario){ return }

    if(!confirm(`¿Eliminar al usuario "${usuario.username}"? Esta acción no se puede deshacer.`)){
        return
    }

    const respuesta =
        await eliminarUsuario(id)

    if(!(await manejarRespuestaUsuario(respuesta, "No se pudo eliminar el usuario"))){
        return
    }

    await cargarUsuarios()

}
