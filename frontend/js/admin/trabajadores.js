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

    // Los 7 selects de turno fijo por día de la semana.
    poblarSelectsTurnosFijosPorDia()

}

// Llena los 7 selects de turno fijo por día con el catálogo de turnos
// disponible. Conserva el valor seleccionado en cada uno para no perder la
// configuración del usuario si se vuelve a abrir el modal.
function poblarSelectsTurnosFijosPorDia(){

    const selects =
        document.querySelectorAll(".trabajador-turno-fijo-dia")

    if(selects.length === 0){ return }

    const catalogo = obtenerTurnosDisponibles()

    selects.forEach(select => {

        const previo =
            select.options[select.selectedIndex]?.value || ""

        let html = `<option value="">— Sin turno —</option>`

        catalogo.forEach(t => {
            html += `<option value="${escaparHTML(t)}">${escaparHTML(t)}</option>`
        })

        select.innerHTML = html

        if(previo && Array.from(select.options).some(o => o.value === previo)){
            select.value = previo
        }

    })

}

// Lee los 7 selects y devuelve un array de {dia_semana, turno} con los días
// que tienen un turno elegido. Los días en blanco se descartan.
function leerTurnosFijosTrabajador(){

    const turnos = []

    document.querySelectorAll(".trabajador-turno-fijo-dia").forEach(select => {

        const dia = parseInt(select.dataset.diaFijo)
        const valor = select.value

        if(Number.isNaN(dia) || !valor){ return }

        turnos.push({
            dia_semana: dia,
            turno: valor
        })

    })

    return turnos

}

// Pone cada select en el valor que indique la lista (o "" si no hay entrada).
function pintarTurnosFijosTrabajador(turnosFijos){

    const porDia = new Map()

    ;(turnosFijos || []).forEach(tf => {
        porDia.set(tf.dia_semana, tf.turno)
    })

    document.querySelectorAll(".trabajador-turno-fijo-dia").forEach(select => {

        const dia = parseInt(select.dataset.diaFijo)
        select.value = porDia.get(dia) || ""

    })

    actualizarContadorTurnosFijos()

}

// Actualiza el contador "Días configurados: X / 7".
function actualizarContadorTurnosFijos(){

    const contador =
        document.getElementById("contador-turnos-fijos")

    if(!contador){ return }

    const turnos = leerTurnosFijosTrabajador()
    contador.textContent = turnos.length

}

// Muestra/oculta el bloque de turnos fijos según el checkbox de rotativo.
function alternarBloqueTurnoFijo(){

    const rotativo =
        document.getElementById("trabajador-turno-rotativo").checked

    const bloque =
        document.getElementById("bloque-turno-fijo")

    if(!bloque){ return }

    bloque.classList.toggle("hidden", rotativo)

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

    // Nuevo trabajador queda activo por defecto.
    document.getElementById("trabajador-activo").checked = true

    // Por defecto el trabajador sí rota turnos.
    document.getElementById("trabajador-turno-rotativo").checked = true

    // Limpiar los 7 selects de turno fijo y el contador.
    pintarTurnosFijosTrabajador([])
    alternarBloqueTurnoFijo()

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

    // Activo por defecto si el dato no viene definido.
    document.getElementById("trabajador-activo").checked =
        trabajador.activo !== false

    // Rotativo por defecto si el dato no viene definido (compatibilidad con
    // datos creados antes de que existiera el campo).
    document.getElementById("trabajador-turno-rotativo").checked =
        trabajador.turno_rotativo !== false

    // Turnos fijos por día. `trabajador.turnos_fijos` ya viene en la
    // respuesta del backend (ver _serializar_trabajador).
    pintarTurnosFijosTrabajador(trabajador.turnos_fijos || [])
    alternarBloqueTurnoFijo()

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
            document.getElementById("trabajador-es-responsable").checked,
        activo:
            document.getElementById("trabajador-activo").checked,
        turno_rotativo:
            document.getElementById("trabajador-turno-rotativo").checked
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
        alert(
            await leerMensajeRespuestaError(
                respuesta,
                "No se pudo guardar el trabajador"
            )
        )
        return

    }

    // =====================================
    // TURNOS FIJOS POR DÍA (PUT aparte)
    // =====================================
    // Necesitamos el id del trabajador: si era creación, lo leemos de la
    // respuesta; si era edición, ya teníamos `id`.
    let trabajadorId = id
    if(!trabajadorId){
        try{
            const creado = await respuesta.json()
            trabajadorId = creado && creado.id
        }catch(e){}
    }

    if(trabajadorId){
        const turnosFijos = leerTurnosFijosTrabajador()
        const respFijos = await guardarTurnosFijosTrabajador(
            trabajadorId,
            turnosFijos
        )

        if(respFijos.status === 401){
            alert("Sesión expirada. Inicia sesión nuevamente.")
            cerrarSesionAdmin()
            cerrarModalTrabajador()
            accederCRUD()
            return
        }

        if(!respFijos.ok){
            alert(
                await leerMensajeRespuestaError(
                    respFijos,
                    "No se pudieron guardar los turnos fijos"
                )
            )
            return
        }
    }

    // =====================================
    // REFRESCAR DATOS
    // =====================================

    trabajadoresGlobal = await obtenerTrabajadores()

    cerrarModalTrabajador()

    cargarFiltrosTrabajadores()

    aplicarFiltrosTrabajadores()

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
        alert(
            await leerMensajeRespuestaError(
                respuesta,
                "No se pudo eliminar el trabajador"
            )
        )
        return
    }

    trabajadoresGlobal = await obtenerTrabajadores()

    cargarFiltrosTrabajadores()

    aplicarFiltrosTrabajadores()

    cargarCargos()

}
