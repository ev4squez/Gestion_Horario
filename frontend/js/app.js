// =====================================================
// VARIABLES GLOBALES
// =====================================================

let trabajadoresGlobal = []

let planificacionGlobal = []

// Cargos elegidos en el filtro. Array vacío = "todos los cargos" (sin filtro).
window.cargosSeleccionados =
    []


// =====================================================
// CARGA SISTEMA
// =====================================================

async function cargarSistema(){

    trabajadoresGlobal =
        await obtenerTrabajadores()

    planificacionGlobal =
        await obtenerPlanificacion()

    inicializarSelectores()

    cargarCargos()

    renderizarTrabajadores(
        trabajadoresGlobal
    )

    renderizarResumenDomingos(
        trabajadoresGlobal
    )
    renderizarAlertas(
    trabajadoresGlobal
)

}


// =====================================================
// CARGOS (filtro de selección múltiple)
// =====================================================
// El filtro es un dropdown propio con casillas: una por cargo más "Todos".
// El estado vive en window.cargosSeleccionados (array). Vacío = sin filtro.

// Devuelve la lista filtrada según los cargos elegidos.
function filtrarPorCargos(lista){

    if(
        !window.cargosSeleccionados ||
        window.cargosSeleccionados.length === 0
    ){
        return lista
    }

    return lista.filter(
        t => window.cargosSeleccionados.includes(t.cargo)
    )

}

// (Re)construye el panel de casillas a partir de los cargos existentes.
function cargarCargos(){

    const panel =
        document.getElementById(
            "filtro-cargo-panel"
        )

    if(!panel){ return }

    const cargos = [

        ...new Set(

            trabajadoresGlobal

            .map(
                t => t.cargo
            )

            .filter(
                c => c && c.trim() !== ""
            )

        )

    ]

    cargos.sort()

    // Descartar de la selección cargos que ya no existen.
    window.cargosSeleccionados =
        window.cargosSeleccionados.filter(
            c => cargos.includes(c)
        )

    const todosActivo =
        window.cargosSeleccionados.length === 0

    let html = `
        <label class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-blue-50 font-semibold">
            <input type="checkbox"
                class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                ${todosActivo ? "checked" : ""}
                onchange="seleccionarTodosCargos()">
            <span>Todos los cargos</span>
        </label>
        <div class="my-1 border-t border-slate-100"></div>
    `

    cargos.forEach(c => {

        const marcado =
            window.cargosSeleccionados.includes(c)

        html += `
            <label class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-blue-50">
                <input type="checkbox"
                    class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    value="${escaparHTML(c)}"
                    ${marcado ? "checked" : ""}
                    onchange="alternarCargo(this.value, this.checked)">
                <span>${escaparHTML(c)}</span>
            </label>
        `

    })

    panel.innerHTML = html

    actualizarEtiquetaCargos()

}

// Texto del botón según cuántos cargos haya elegidos.
function actualizarEtiquetaCargos(){

    const label =
        document.getElementById(
            "filtro-cargo-label"
        )

    if(!label){ return }

    const n = window.cargosSeleccionados.length

    if(n === 0){
        label.textContent = "Todos los cargos"
    }else if(n === 1){
        label.textContent = window.cargosSeleccionados[0]
    }else{
        label.textContent = `${n} cargos`
    }

}

// Muestra/oculta el panel.
function toggleDropdownCargos(){

    const panel =
        document.getElementById(
            "filtro-cargo-panel"
        )

    if(!panel){ return }

    panel.classList.toggle("hidden")

}

// Marca/desmarca un cargo concreto.
function alternarCargo(cargo, marcado){

    const set =
        new Set(window.cargosSeleccionados)

    if(marcado){
        set.add(cargo)
    }else{
        set.delete(cargo)
    }

    window.cargosSeleccionados = [...set]

    cargarCargos()
    filtrarCargo()

}

// "Todos": limpia la selección (= sin filtro).
function seleccionarTodosCargos(){

    window.cargosSeleccionados = []

    cargarCargos()
    filtrarCargo()

}

// Cerrar el panel al hacer clic fuera del filtro.
document.addEventListener("mousedown", function(e){

    const wrapper =
        document.getElementById(
            "filtro-cargo-wrapper"
        )

    const panel =
        document.getElementById(
            "filtro-cargo-panel"
        )

    if(!wrapper || !panel){ return }

    if(!wrapper.contains(e.target)){
        panel.classList.add("hidden")
    }

})


// =====================================================
// FILTRAR CARGO (aplica la selección a las vistas)
// =====================================================

function filtrarCargo(){

    const filtrados =
        filtrarPorCargos(trabajadoresGlobal)

    renderizarTrabajadores(
        filtrados
    )

    renderizarResumenDomingos(
        filtrados
    )

    renderizarAlertas(
        filtrados
    )

}


// =====================================================
// HELPERS DE PRESENTACIÓN
// =====================================================

const NOMBRES_DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

function colorBarraHoras(horas, jornada){

    if(horas > jornada){
        return "bg-red-500"
    }

    if(horas >= jornada * 0.8){
        return "bg-blue-500"
    }

    return "bg-green-500"

}

function htmlBloqueHoras(horas, jornada){

    const j = jornada || 0

    const porcentaje = j
        ? Math.min((horas / j) * 100, 100)
        : 0

    const color = colorBarraHoras(horas, j)

    return `
        <div class="flex items-center gap-3 justify-between sm:justify-end">

            <div class="text-right">

                <div class="text-xl font-black text-slate-800 leading-none">
                    ${horas}
                    <span class="text-xs font-semibold text-slate-500">
                        / ${j}h
                    </span>
                </div>

                <div class="text-[10px] uppercase tracking-wide text-slate-400 mt-1">
                    horas semanales
                </div>

            </div>

            <div class="w-20 sm:w-24 h-2.5 bg-slate-200 rounded-full overflow-hidden shrink-0">
                <div class="h-full ${color} rounded-full" style="width:${porcentaje}%"></div>
            </div>

        </div>
    `

}


// =====================================================
// RENDER TARJETAS
// =====================================================

function renderizarTrabajadores(
    trabajadores
){

    document.getElementById(
        "total-trabajadores"
    ).innerText = trabajadores.length

    const contenedor =
        document.getElementById(
            "contenedor-responsables"
        )

    contenedor.innerHTML = ""

    const semanas =
        generarSemanas(
            mesActual,
            anioActual
        )

    let html = ""

    semanas.forEach((semana,index)=>{

        html += `

            <div class="card overflow-hidden mb-4">

                <!-- HEADER SEMANA -->
                <div class="px-5 md:px-8 py-5 md:py-6 border-b border-slate-100 bg-white">

                    <h2 class="font-black text-2xl md:text-3xl text-slate-800">
                        Semana ${index + 1}
                    </h2>

                    <p class="text-slate-500 mt-1 md:mt-2 text-sm">
                        ${formatearFecha(semana.inicio)}
                        al
                        ${formatearFecha(semana.fin)}
                    </p>

                </div>

                <!-- COLABORADORES -->
                <div class="p-4 md:p-6 space-y-3">

        `

        trabajadores.forEach(t => {

            let turnosSemana = []

            let htmlDias = ""

            // =====================================
            // DIAS SEMANA
            // =====================================

            for(let dia=0; dia<7; dia++){

                const fecha = new Date(
                    semana.inicio
                )

                fecha.setDate(
                    fecha.getDate() + dia
                )

                const fechaTexto =

    `${fecha.getFullYear()}-${
        String(
            fecha.getMonth() + 1
        ).padStart(2,"0")
    }-${
        String(
            fecha.getDate()
        ).padStart(2,"0")
    }`

                // =====================================
                // VALIDAR MES
                // =====================================

                const esMesActual =
                    fecha.getMonth()
                    ===
                    mesActual

                // =====================================
                // OBTENER TURNO
                // =====================================

                const turno =
                    obtenerTurnoGuardado(
                        t.id,
                        fechaTexto
                    )

                turnosSemana.push(
                    turno
                )

                // =====================================
                // CELDA DIA (responsive)
                // =====================================

                htmlDias += `
                    <div class="${esMesActual ? "" : "opacity-60"}">

                        <div class="text-[11px] uppercase tracking-wide text-slate-500 mb-1 text-center">
                            ${NOMBRES_DIAS[dia]} ${fecha.getDate()}
                        </div>

                        <input
                            value="${escaparHTML(turno)}"
                            data-fecha="${fechaTexto}"
                            class="turno-input w-full rounded-xl px-2 py-2 text-sm font-medium text-center outline-none border border-transparent focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${esMesActual ? "" : "bg-slate-100"}"
                            onfocus="abrirListaTurnos(this);"
                            oninput="filtrarListaTurnos(this);"
                            onblur="actualizarColor(this); recalcularFila(this); guardarTurno(this);"
                        >

                    </div>
                `

            }

            // =====================================
            // HORAS
            // =====================================

            const horasSemana =
                calcularHorasSemana(
                    turnosSemana,
                    colacionPorCeco(t.ceco)
                )

            // =====================================
            // TARJETA COLABORADOR
            // =====================================

            html += `

                <div class="fila-trabajador border border-slate-100 rounded-2xl p-4" data-trabajador-id="${t.id}">

                    <span class="jornada-data hidden">${t.jornada}</span>

                    <!-- CABECERA -->
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">

                        <div class="min-w-0">

                            <div class="fw-semibold text-slate-800 truncate">
                                ${escaparHTML(t.nombre)}
                            </div>

                            <div class="text-xs text-slate-500 mt-0.5 truncate">
                                ${escaparHTML(t.responsable)}
                            </div>

                        </div>

                        <div class="columna-horas w-full sm:w-auto shrink-0">
                            ${htmlBloqueHoras(horasSemana, t.jornada)}
                        </div>

                    </div>

                    <!-- DIAS -->
                    <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                        ${htmlDias}
                    </div>

                </div>

            `

        })

        html += `

                </div>

            </div>

        `

    })

    // =====================================
    // RENDER FINAL
    // =====================================

    contenedor.innerHTML = html

    // =====================================
    // ACTUALIZAR COLORES
    // =====================================

    document
        .querySelectorAll(
            ".turno-input"
        )
        .forEach(
            actualizarColor
        )

}

// =====================================================
// RECALCULAR HORAS
// =====================================================

function recalcularFila(input){

    const fila =
        input.closest(
            ".fila-trabajador"
        )

    const inputs =
        fila.querySelectorAll(
            ".turno-input"
        )

    let turnos = []

    inputs.forEach(i => {

        turnos.push(i.value)

    })

    // CECO del trabajador de esta fila (para la colación).
    const trabajadorId =
        parseInt(fila.dataset.trabajadorId)

    const trabajador =
        trabajadoresGlobal.find(
            t => t.id === trabajadorId
        )

    const horasSemana =
        calcularHorasSemana(
            turnos,
            colacionPorCeco(
                trabajador ? trabajador.ceco : ""
            )
        )

    const jornada =
        parseInt(
            fila.querySelector(
                ".jornada-data"
            ).innerText
        )

    fila.querySelector(
        ".columna-horas"
    ).innerHTML = htmlBloqueHoras(horasSemana, jornada)

}


// =====================================================
// GUARDAR TURNO
// =====================================================

// =====================================================
// MOSTRAR LISTA COMPLETA DE TURNOS (dropdown propio)
// =====================================================
// El <datalist> nativo dejó de mostrar las opciones de forma fiable en Chrome
// (filtra por el valor exacto y no reabre el popup al vaciarlo). En vez de
// pelear con ese comportamiento, montamos un dropdown propio en el DOM que
// controlamos por completo. La lista de turnos sale del propio <datalist> para
// mantener una única fuente de verdad.

function obtenerTurnosDisponibles(){
    const dl = document.getElementById("turnos")
    if(!dl){ return [] }
    return Array.from(dl.options).map(o => o.value)
}

let dropdownTurnos = null
let inputTurnoActivo = null

function crearDropdownTurnos(){
    dropdownTurnos = document.createElement("div")
    dropdownTurnos.className =
        "fixed z-50 max-h-64 overflow-auto rounded-xl border border-slate-200 " +
        "bg-white shadow-lg text-sm hidden"
    document.body.appendChild(dropdownTurnos)

    // Cerrar al hacer clic fuera.
    document.addEventListener("mousedown", function(e){
        if(
            dropdownTurnos &&
            !dropdownTurnos.contains(e.target) &&
            e.target !== inputTurnoActivo
        ){
            cerrarListaTurnos()
        }
    })

    // Cerrar al hacer scroll (la posición fija quedaría desalineada).
    window.addEventListener("scroll", cerrarListaTurnos, true)
}

function abrirListaTurnos(input){
    if(!dropdownTurnos){ crearDropdownTurnos() }
    inputTurnoActivo = input
    renderListaTurnos(input, "")
    posicionarDropdownTurnos(input)
    dropdownTurnos.classList.remove("hidden")
}

function filtrarListaTurnos(input){
    if(!dropdownTurnos){ return }
    inputTurnoActivo = input
    renderListaTurnos(input, input.value)
    posicionarDropdownTurnos(input)
    dropdownTurnos.classList.remove("hidden")
}

function renderListaTurnos(input, filtro){
    const texto = (filtro || "").trim().toLowerCase()
    const opciones = obtenerTurnosDisponibles().filter(t =>
        texto === "" || t.toLowerCase().includes(texto)
    )

    dropdownTurnos.innerHTML = ""

    if(opciones.length === 0){
        const vacio = document.createElement("div")
        vacio.className = "px-3 py-2 text-slate-400"
        vacio.textContent = "Sin coincidencias"
        dropdownTurnos.appendChild(vacio)
        return
    }

    opciones.forEach(opcion => {
        const item = document.createElement("div")
        item.className = "px-3 py-2 cursor-pointer hover:bg-blue-50 text-center"
        item.textContent = opcion
        // mousedown (no click) para que se ejecute ANTES del blur del input.
        item.addEventListener("mousedown", function(e){
            e.preventDefault()
            seleccionarTurno(input, opcion)
        })
        dropdownTurnos.appendChild(item)
    })
}

function posicionarDropdownTurnos(input){
    const r = input.getBoundingClientRect()
    dropdownTurnos.style.top = r.bottom + "px"
    dropdownTurnos.style.left = r.left + "px"
    dropdownTurnos.style.minWidth = r.width + "px"
}

function seleccionarTurno(input, opcion){
    input.value = opcion
    cerrarListaTurnos()
    actualizarColor(input)
    recalcularFila(input)
    guardarTurno(input)
    input.blur()
}

function cerrarListaTurnos(){
    if(dropdownTurnos){
        dropdownTurnos.classList.add("hidden")
    }
    inputTurnoActivo = null
}


// =====================================================
// GUARDAR TURNO
// =====================================================

async function guardarTurno(input){

    console.log(
        "GUARDANDO TURNO"
    )

    const fila =
        input.closest(
            ".fila-trabajador"
        )

    // =====================================
    // OBTENER TRABAJADOR POR ID
    // =====================================

    const trabajadorId =
        parseInt(
            fila.dataset.trabajadorId
        )

    const trabajador =
        trabajadoresGlobal.find(
            t => t.id === trabajadorId
        )

    if(!trabajador){

        console.log(
            "NO SE ENCONTRO TRABAJADOR"
        )

        return

    }

    // =====================================
    // OBTENER TURNO
    // =====================================

    let turno =
        input.value.trim()

    // =====================================
    // SI ESTA VACIO
    // =====================================

    if(turno === ""){

        turno = "Libre"

        input.value = "Libre"

    }

    // =====================================
    // NORMALIZAR LIBRE
    // =====================================

    if(
        turno.toLowerCase() === "libre"
    ){

        turno = "Libre"

        input.value = "Libre"

    }

    // =====================================
    // HORAS
    // =====================================

    const horas =
        calcularHorasSemana(
            [turno],
            colacionPorCeco(trabajador.ceco)
        )

    // =====================================
    // FECHA
    // =====================================

    const fecha =
        input.dataset.fecha

    // =====================================
    // GUARDAR
    // =====================================

    await guardarPlanificacion({

        trabajador_id:
            trabajador.id,

        responsable:
            trabajador.responsable,

        fecha,

        turno,

        horas

    })

    // =====================================
    // RECARGAR PLANIFICACION
    // =====================================

    planificacionGlobal =
        await obtenerPlanificacion()

    console.log(
        "REFRESH RESUMEN"
    )

    // =====================================
    // FILTRAR RESPONSABLE
    // =====================================

    const listaRender =
        filtrarPorCargos(trabajadoresGlobal)

    // =====================================
    // RENDER
    // =====================================

    renderizarTrabajadores(
        listaRender
    )
    renderizarAlertas(
    listaRender
)

    console.log(
        calcularDomingosTrabajados(
            trabajador.id
        )
    )

    renderizarResumenDomingos(
        listaRender
    )

}

// =====================================================
// INIT
// =====================================================

cargarSistema()