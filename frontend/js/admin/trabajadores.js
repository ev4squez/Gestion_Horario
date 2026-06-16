// =====================================================
// SELECTS DEL MODAL (Responsable / Área / CECO)
// =====================================================
// Cada campo es un <select> con los valores existentes más una opción
// "➕ Crear nuevo…". Al elegir esa opción se muestra un <input> para escribir
// un valor nuevo (que al guardar pasa a formar parte de la lista).

const OPCION_NUEVO = "__nuevo__"

// Pool de responsables: nombres ya usados como responsable + trabajadores
// marcados como "puede ser responsable".
function valoresResponsables(){

    return [
        ...trabajadoresGlobal.map(t => t.responsable),
        ...trabajadoresGlobal
            .filter(t => t.es_responsable)
            .map(t => t.nombre),
    ]

}

function valoresUnicos(valores){

    return [
        ...new Set(
            valores.filter(
                v => v && String(v).trim() !== ""
            )
        )
    ].sort()

}

// Llena un <select> con las opciones únicas más "Crear nuevo…".
function poblarSelect(id, valores){

    const select = document.getElementById(id)

    if(!select) return

    const unicos = valoresUnicos(valores)

    let html = `<option value="">— Seleccione —</option>`

    unicos.forEach(v => {
        html += `<option value="${escaparHTML(v)}">${escaparHTML(v)}</option>`
    })

    html += `<option value="${OPCION_NUEVO}">➕ Crear nuevo…</option>`

    select.innerHTML = html

}

function poblarSelectsTrabajador(){

    poblarSelect("trabajador-responsable", valoresResponsables())

    poblarSelect("trabajador-area", trabajadoresGlobal.map(t => t.area))

    poblarSelect("trabajador-ceco", trabajadoresGlobal.map(t => t.ceco))

    poblarSelect("trabajador-cargo", trabajadoresGlobal.map(t => t.cargo))

}

// Muestra/oculta el input "nuevo" según lo elegido en el select.
function alternarCampoNuevo(campo){

    const select = document.getElementById(`trabajador-${campo}`)

    const input = document.getElementById(`trabajador-${campo}-nuevo`)

    if(!select || !input) return

    if(select.value === OPCION_NUEVO){
        input.classList.remove("hidden")
        input.focus()
    }else{
        input.classList.add("hidden")
        input.value = ""
    }

}

// Valor efectivo de un campo: el texto nuevo si se eligió "Crear nuevo…",
// si no, el valor seleccionado.
function valorCampo(campo){

    const select = document.getElementById(`trabajador-${campo}`)

    if(select.value === OPCION_NUEVO){
        return document
            .getElementById(`trabajador-${campo}-nuevo`)
            .value
            .trim()
    }

    return select.value.trim()

}

// Selecciona un valor en el campo. Si el valor no existe entre las opciones
// (p. ej. una mayúscula distinta), se agrega para no perderlo al editar.
function fijarCampo(campo, valor){

    const select = document.getElementById(`trabajador-${campo}`)

    const input = document.getElementById(`trabajador-${campo}-nuevo`)

    input.classList.add("hidden")
    input.value = ""

    const v = valor || ""

    if(v && !Array.from(select.options).some(o => o.value === v)){
        const opt = document.createElement("option")
        opt.value = v
        opt.textContent = v
        // Insertar antes de "Crear nuevo…" (última opción).
        select.add(opt, select.options[select.options.length - 1])
    }

    select.value = v

}


// =====================================================
// ABRIR MODAL
// =====================================================

function abrirModalTrabajador(){

    poblarSelectsTrabajador()

    document
        .getElementById("modal-trabajador")
        .classList.remove("hidden")

}


// =====================================================
// NUEVO TRABAJADOR
// =====================================================

function nuevoTrabajador(){

    document.getElementById(
        "titulo-modal-trabajador"
    ).innerText = "Nuevo Trabajador"

    // Poblar selects antes de fijar valores.
    poblarSelectsTrabajador()

    document.getElementById("trabajador-id").value = ""
    document.getElementById("trabajador-rut").value = ""
    document.getElementById("trabajador-nombre").value = ""
    document.getElementById("trabajador-jornada").value = "42"

    fijarCampo("responsable", "")
    fijarCampo("area", "")
    fijarCampo("ceco", "")
    fijarCampo("cargo", "")

    document.getElementById("trabajador-es-responsable").checked = false

    document
        .getElementById("modal-trabajador")
        .classList.remove("hidden")

}


// =====================================================
// EDITAR TRABAJADOR
// =====================================================

function editarTrabajador(id){

    const trabajador =
        trabajadoresGlobal.find(
            t => t.id === id
        )

    if(!trabajador) return

    document.getElementById(
        "titulo-modal-trabajador"
    ).innerText = "Editar Trabajador"

    // Poblar selects antes de fijar valores.
    poblarSelectsTrabajador()

    document.getElementById("trabajador-id").value =
        trabajador.id

    document.getElementById("trabajador-rut").value =
        trabajador.rut || ""

    document.getElementById("trabajador-nombre").value =
        trabajador.nombre || ""

    fijarCampo("responsable", trabajador.responsable || "")
    fijarCampo("area", trabajador.area || "")
    fijarCampo("ceco", trabajador.ceco || "")
    fijarCampo("cargo", trabajador.cargo || "")

    document.getElementById("trabajador-jornada").value =
        trabajador.jornada || "44"

    document.getElementById("trabajador-es-responsable").checked =
        !!trabajador.es_responsable

    document
        .getElementById("modal-trabajador")
        .classList.remove("hidden")

}


// =====================================================
// GUARDAR TRABAJADOR (crear / actualizar)
// =====================================================

async function guardarTrabajador(){

    const id =
        document.getElementById("trabajador-id").value

    const rut =
        document.getElementById("trabajador-rut").value.trim()

    const nombre =
        document.getElementById("trabajador-nombre").value.trim()

    // =====================================
    // VALIDACIÓN MÍNIMA
    // =====================================

    if(!rut || !nombre){
        alert("RUT y Nombre son obligatorios.")
        return
    }

    const data = {
        rut,
        nombre,
        responsable: valorCampo("responsable"),
        area: valorCampo("area"),
        ceco: valorCampo("ceco"),
        cargo: valorCampo("cargo"),
        jornada:
            parseInt(
                document.getElementById("trabajador-jornada").value
            ),
        es_responsable:
            document.getElementById("trabajador-es-responsable").checked
    }

    // =====================================
    // ENVIAR
    // =====================================

    const respuesta = id
        ? await actualizarTrabajador(id, data)
        : await crearTrabajador(data)

    // =====================================
    // SESIÓN
    // =====================================

    if(respuesta.status === 401){
        alert("Sesión expirada. Inicia sesión nuevamente.")
        cerrarSesionAdmin()
        cerrarModalTrabajador()
        accederCRUD()
        return
    }

    // =====================================
    // ERRORES (ej. RUT duplicado)
    // =====================================

    if(!respuesta.ok){

        let mensaje = "No se pudo guardar el trabajador."

        try{
            const error = await respuesta.json()
            if(error && error.detail){
                mensaje = error.detail
            }
        }catch(e){}

        alert(mensaje)
        return

    }

    // =====================================
    // REFRESCAR DATOS
    // =====================================

    trabajadoresGlobal = await obtenerTrabajadores()

    cerrarModalTrabajador()

    cargarFiltrosTrabajadores()

    renderizarTrabajadoresCRUD()

    cargarCargos()

}


// =====================================================
// ELIMINAR TRABAJADOR
// =====================================================

async function eliminarTrabajadorCRUD(id){

    const trabajador =
        trabajadoresGlobal.find(
            t => t.id === id
        )

    const nombre = trabajador ? trabajador.nombre : ""

    if(!confirm(`¿Eliminar a "${nombre}"? Esta acción no se puede deshacer.`)){
        return
    }

    const respuesta = await eliminarTrabajador(id)

    if(respuesta.status === 401){
        alert("Sesión expirada. Inicia sesión nuevamente.")
        cerrarSesionAdmin()
        accederCRUD()
        return
    }

    if(!respuesta.ok){
        alert("No se pudo eliminar el trabajador.")
        return
    }

    trabajadoresGlobal = await obtenerTrabajadores()

    cargarFiltrosTrabajadores()

    renderizarTrabajadoresCRUD()

    cargarCargos()

}
