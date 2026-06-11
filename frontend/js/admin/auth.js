async function validarAdmin(){

    const password =
        document.getElementById(
            "password-admin"
        ).value

    // =====================================
    // VALIDACIÓN EN EL BACKEND
    // =====================================

    const token = await loginAdmin(password)

    if(token){

        adminAutorizado = true

        document.getElementById(
            "password-admin"
        ).value = ""

        actualizarBotonSesion()

        cerrarModalAdmin()

        mostrarVistaTrabajadores()

    }
    else{

        alert(
            "Contraseña incorrecta"
        )

    }

}

function accederCRUD(){

    if(adminAutorizado && obtenerToken()){

        mostrarVistaTrabajadores()

        return

    }

    document
        .getElementById(
            "modal-login-admin"
        )
        .classList.remove(
            "hidden"
        )

}

function cerrarModalAdmin(){

    document
        .getElementById(
            "modal-login-admin"
        )
        .classList.add(
            "hidden"
        )

}

function cerrarSesionAdmin(){

    adminAutorizado = false

    borrarToken()

    actualizarBotonSesion()

    // Volver a la vista de planificación (solo lectura sin sesión).
    if(typeof mostrarVistaPlanificacion === "function"){
        mostrarVistaPlanificacion()
    }

}

// =====================================================
// VISIBILIDAD BOTÓN CERRAR SESIÓN
// =====================================================

function actualizarBotonSesion(){

    const boton =
        document.getElementById("btn-logout")

    if(!boton) return

    if(adminAutorizado){
        boton.classList.remove("hidden")
    }else{
        boton.classList.add("hidden")
    }

}

// Estado inicial al cargar la página.
document.addEventListener(
    "DOMContentLoaded",
    actualizarBotonSesion
)
