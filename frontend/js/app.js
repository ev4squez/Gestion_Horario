// =====================================================
// VARIABLES GLOBALES
// =====================================================

let trabajadoresGlobal = []

let planificacionGlobal = []

window.responsableSeleccionado =
    "todos"


// =====================================================
// CARGA SISTEMA
// =====================================================

async function cargarSistema(){

    trabajadoresGlobal =
        await obtenerTrabajadores()

    planificacionGlobal =
        await obtenerPlanificacion()

    inicializarSelectores()

    cargarResponsables()

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
// RESPONSABLES
// =====================================================

function cargarResponsables(){

    const select =
        document.getElementById(
            "filtro-responsable"
        )

    select.innerHTML = `
        <option value="todos">
            Todos los responsables
        </option>
    `

    const responsables = [

        ...new Set(

            trabajadoresGlobal

            .map(
                t => t.responsable
            )

            .filter(
                r => r && r.trim() !== ""
            )

        )

    ]

    responsables.sort()

    responsables.forEach(r => {

        select.innerHTML += `
            <option value="${escaparHTML(r)}">
                ${escaparHTML(r)}
            </option>
        `

    })

}


// =====================================================
// FILTRAR RESPONSABLE
// =====================================================

function filtrarResponsable(){

    window.responsableSeleccionado =

        document.getElementById(
            "filtro-responsable"
        ).value

    // =====================================
    // TODOS
    // =====================================

    if(
        window.responsableSeleccionado
        ===
        "todos"
    ){

        renderizarTrabajadores(
            trabajadoresGlobal
        )

        renderizarResumenDomingos(
            trabajadoresGlobal
        )

        renderizarAlertas(
            trabajadoresGlobal
        )

        return

    }

    // =====================================
    // FILTRADOS
    // =====================================

    const filtrados =
        trabajadoresGlobal.filter(
            t =>
                t.responsable
                ===
                window.responsableSeleccionado
        )

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

        window.responsableSeleccionado
        ===
        "todos"

        ?

        trabajadoresGlobal

        :

        trabajadoresGlobal.filter(
            t =>
                t.responsable
                ===
                window.responsableSeleccionado
        )

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