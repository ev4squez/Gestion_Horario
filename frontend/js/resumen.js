// Colación (descanso de comida) a descontar por cada turno trabajado.
// Regla: 1 hora para el CECO de Seguridad, 30 minutos para el resto.
function colacionPorCeco(ceco){

    const texto = (ceco || "").trim().toLowerCase()

    return texto === "seguridad" ? 1 : 0.5

}

function calcularHorasSemana(
    turnos,
    colacionHoras = 0.5
){

    let total = 0

    turnos.forEach(turno => {

        if(!turno) return

        const texto =
            turno.toLowerCase()

        // =====================================
        // IGNORAR LIBRE
        // =====================================

        if(
            texto.includes("libre")
        ){
            return
        }

        if(
            texto.includes("saliente")
        ){
            return
        }

        // =====================================
        // FORMATO
        // =====================================

        const regex =
            /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/

        const match =
            turno.match(regex)

        if(!match){

            return

        }

        // =====================================
        // HORAS
        // =====================================

        let horaInicio =
            parseInt(match[1])

        let minutoInicio =
            parseInt(match[2])

        let horaFin =
            parseInt(match[3])

        let minutoFin =
            parseInt(match[4])

        let inicio =
            horaInicio
            +
            (minutoInicio / 60)

        let fin =
            horaFin
            +
            (minutoFin / 60)

        // =====================================
        // CRUZA MEDIANOCHE
        // =====================================

        if(fin < inicio){

            fin += 24

        }

        let horas =
            fin - inicio

        // Descontar la colación del turno trabajado (no baja de 0).
        horas = Math.max(0, horas - colacionHoras)

        total += horas

    })

    // Redondeo a 1 decimal (conserva medias horas, p. ej. 7.5).
    return Math.round(total * 10) / 10

}

function obtenerTurnoGuardado(
    trabajadorId,
    fecha
) {

    const encontrado =
        planificacionGlobal.find(p =>

            p.trabajador_id === trabajadorId

            &&

            p.fecha.startsWith(
                fecha
            )

        )

    if(encontrado){

        return encontrado.turno

    }

    return "Libre"

}

function crearCelda(
    valor,
    fecha,
    esMesActual = true
) {

    let claseExtra = ""

    // =====================================
    // DIAS OTRO MES
    // =====================================

    if(!esMesActual){

        claseExtra = `
            bg-slate-100
            opacity-60
        `

    }

    return `
    
    <td class="
        p-3
        border-t
        border-slate-100
        ${claseExtra}
    ">

        <input

            list="turnos"

            value="${escaparHTML(valor)}"

            data-fecha="${escaparHTML(fecha)}"

            class="
                turno-input
                w-full
                min-w-[90px]
                xl:min-w-[130px]
                rounded-2xl
                px-4
                py-3
                text-sm
                font-medium
                outline-none
                border
                border-transparent
                focus:border-blue-500
                focus:ring-4
                focus:ring-blue-100
                ${claseExtra}
            "

            onblur="
                actualizarColor(this);
                recalcularFila(this);
                guardarTurno(this);
            "

        >

    </td>

    `
}

function actualizarColor(input) {

    const valor =
        input.value.toLowerCase()

    input.classList.remove(

        "bg-blue-50", "text-blue-700",

        "bg-green-100", "text-green-700",

        "bg-yellow-100", "text-yellow-700"

    )

    if (valor.includes("libre")) {

        input.classList.add(
            "bg-green-100",
            "text-green-700"
        )

    }
    else if (valor.includes("saliente")) {

        input.classList.add(
            "bg-yellow-100",
            "text-yellow-700"
        )

    }
    else {

        input.classList.add(
            "bg-blue-50",
            "text-blue-700"
        )

    }

}


function obtenerDomingosDelMes(){

    let total = 0

    const ultimoDia = new Date(
        anioActual,
        mesActual + 1,
        0
    )

    for(
        let dia = 1;
        dia <= ultimoDia.getDate();
        dia++
    ){

        const fecha = new Date(
            anioActual,
            mesActual,
            dia
        )

        if(
            fecha.getDay() === 0
        ){

            total++

        }

    }

    return total

}


function calcularDomingosLibres(
    trabajadorId
) {

    return (
        obtenerDomingosDelMes()
        -
        calcularDomingosTrabajados(
            trabajadorId
        )
    )

}


function renderizarResumenDomingos(
    lista = trabajadoresGlobal
) {

    const contenedor =
        document.getElementById(
            "resumen-domingos"
        )

    if (!contenedor) return

    // Ocultar la card si no hay trabajadores en la lista filtrada.
    const card = document.getElementById("card-domingos")

    if (!lista || lista.length === 0) {

        if (card) card.classList.add("hidden")
        contenedor.innerHTML = ""

        return

    }

    if (card) card.classList.remove("hidden")

    contenedor.innerHTML = ""

    let html = ""

    lista.forEach(t => {

        const domingos =
            calcularDomingosTrabajados(
                t.id
            )

        const libres =
            calcularDomingosLibres(
                t.id
            )

        html += `

            <div class="fade-card bg-white border border-slate-200 rounded-2xl p-3">

                <!-- PERSONA -->
                <div class="flex items-center gap-2.5 min-w-0 mb-2.5">

                    <div class="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined text-blue-600 text-lg">person</span>
                    </div>

                    <div class="min-w-0">
                        <h3 class="text-xs font-black text-slate-900 uppercase truncate leading-tight">
                            ${escaparHTML(t.nombre)}
                        </h3>
                        <p class="text-slate-500 text-[11px] truncate">
                            ${escaparHTML(t.responsable)}
                        </p>
                    </div>

                </div>

                <!-- ESTADISTICAS -->
                <div class="grid grid-cols-2 gap-2">

                    <!-- TRABAJADOS -->
                    <div class="bg-blue-50 rounded-xl px-2.5 py-2 min-w-0">
                        <div class="flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-blue-600 text-sm">work</span>
                            <p class="text-slate-500 text-[11px] truncate">Trabajados</p>
                        </div>
                        <h4 class="text-lg font-black text-blue-600 mt-0.5 leading-none">${domingos}</h4>
                    </div>

                    <!-- LIBRES -->
                    <div class="bg-emerald-50 rounded-xl px-2.5 py-2 min-w-0">
                        <div class="flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-emerald-600 text-sm">event_available</span>
                            <p class="text-slate-500 text-[11px] truncate">Libres</p>
                        </div>
                        <h4 class="text-lg font-black text-emerald-600 mt-0.5 leading-none">${libres}</h4>
                    </div>

                </div>

            </div>

        `

    })

    contenedor.innerHTML = html

}

function calcularDomingosTrabajados(
    trabajadorId
){

    let total = 0

    const ultimoDia = new Date(
        anioActual,
        mesActual + 1,
        0
    )

    for(
        let dia = 1;
        dia <= ultimoDia.getDate();
        dia++
    ){

        const fechaDomingo =
            new Date(
                anioActual,
                mesActual,
                dia
            )

        // =====================================
        // SOLO DOMINGOS
        // =====================================

        if(
            fechaDomingo.getDay() !== 0
        ){
            continue
        }

        // =====================================
        // TEXTO DOMINGO
        // =====================================

        const domingoTexto =

            `${fechaDomingo.getFullYear()}-${
                String(
                    fechaDomingo.getMonth() + 1
                ).padStart(2,"0")
            }-${
                String(
                    fechaDomingo.getDate()
                ).padStart(2,"0")
            }`

        // =====================================
        // SABADO ANTERIOR
        // =====================================

        const fechaSabado =
            new Date(fechaDomingo)

        fechaSabado.setDate(
            fechaSabado.getDate() - 1
        )

        const sabadoTexto =

            `${fechaSabado.getFullYear()}-${
                String(
                    fechaSabado.getMonth() + 1
                ).padStart(2,"0")
            }-${
                String(
                    fechaSabado.getDate()
                ).padStart(2,"0")
            }`

        // =====================================
        // BUSCAR TURNOS
        // =====================================

        const turnoDomingo =
            planificacionGlobal.find(p =>

                p.trabajador_id
                ===
                trabajadorId

                &&

                p.fecha.startsWith(
    domingoTexto
)

            )

        const turnoSabado =
            planificacionGlobal.find(p =>

                p.trabajador_id
                ===
                trabajadorId

                &&

                p.fecha.startsWith(
    sabadoTexto
)

            )

        let trabajoDomingo = false

        // =====================================
        // DOMINGO TRABAJADO DIRECTO
        // =====================================

        if(turnoDomingo){

            const turno =
                (
                    turnoDomingo.turno || ""
                )
                .trim()
                .toLowerCase()

            if(
                turno !== ""
                &&
                turno !== "libre"
            ){

                trabajoDomingo = true

            }

        }

        // =====================================
        // SABADO CRUZA MEDIANOCHE
        // =====================================

        if(turnoSabado){

            const turno =
                (
                    turnoSabado.turno || ""
                )
                .trim()

            // IGNORAR LIBRE

            if(
                turno.toLowerCase() !== "libre"
            ){

                const regex =
                    /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/

                const match =
                    turno.match(regex)

                if(match){

                    const horaInicio =
                        parseInt(match[1])

                    const minutoInicio =
                        parseInt(match[2])

                    const horaSalida =
                        parseInt(match[3])

                    const minutoSalida =
                        parseInt(match[4])

                    const inicio =
                        (horaInicio * 60)
                        +
                        minutoInicio

                    const salida =
                        (horaSalida * 60)
                        +
                        minutoSalida

                    // =====================================
                    // SI SALE MENOR → PASA 00:00
                    // =====================================

                    if(salida < inicio){

                        trabajoDomingo = true

                    }

                }

            }

        }

        // =====================================
        // SUMAR
        // =====================================

        if(trabajoDomingo){

            total++

        }

    }

    return total

}


// =====================================================
// ALERTAS DESCANSO
// =====================================================

function calcularAlertasDescanso(
    trabajadores
){

    const alertas = []

    trabajadores.forEach(trabajador => {

        // =====================================
        // OBTENER TURNOS TRABAJADOR
        // =====================================

const turnos = planificacionGlobal

    .filter(p => {

        // =====================================
        // TRABAJADOR
        // =====================================

        if(
            p.trabajador_id
            !==
            trabajador.id
        ){
            return false
        }

        // =====================================
        // FECHA
        // =====================================

        const fecha =
            new Date(p.fecha)

        // =====================================
        // SOLO MES ACTUAL
        // =====================================

        return (

            fecha.getMonth()
            ===
            mesActual

            &&

            fecha.getFullYear()
            ===
            anioActual

        )

    })

    .sort((a,b)=>

        new Date(a.fecha)
        -
        new Date(b.fecha)

    )

        // =====================================
        // RECORRER TURNOS
        // =====================================

        for(let i=0; i<turnos.length - 1; i++){

            const actual =
                turnos[i]

            const siguiente =
                turnos[i + 1]

            // =====================================
            // IGNORAR LIBRES
            // =====================================

            if(
                !actual.turno
                ||
                !siguiente.turno
            ){
                continue
            }

            const turnoActual =
                actual.turno
                    .trim()
                    .toLowerCase()

            const turnoSiguiente =
                siguiente.turno
                    .trim()
                    .toLowerCase()

            // =====================================
            // IGNORAR LIBRE
            // =====================================

            if(
                turnoActual === "libre"
                ||
                turnoActual === "vacaciones"
                ||
                turnoActual === "saliente"
            ){
                continue
            }

            if(
                turnoSiguiente === "libre"
                ||
                turnoSiguiente === "vacaciones"
                ||
                turnoSiguiente === "saliente"
            ){
                continue
            }

            // =====================================
            // REGEX
            // =====================================

            const regex =
                /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/

            const matchActual =
                actual.turno.match(regex)

            const matchSiguiente =
                siguiente.turno.match(regex)

            if(
                !matchActual
                ||
                !matchSiguiente
            ){
                continue
            }

            // =====================================
            // FECHA SALIDA
            // =====================================

            const fechaSalida =
                new Date(actual.fecha)

            let horaSalida =
                parseInt(matchActual[3])

            let minutoSalida =
                parseInt(matchActual[4])

            fechaSalida.setHours(
                horaSalida,
                minutoSalida,
                0,
                0
            )

            // =====================================
            // SI CRUZA MEDIANOCHE
            // =====================================

            const horaInicioActual =
                parseInt(matchActual[1])

            if(
                horaSalida
                <
                horaInicioActual
            ){

                fechaSalida.setDate(
                    fechaSalida.getDate() + 1
                )

            }

            // =====================================
            // FECHA ENTRADA
            // =====================================

            const fechaEntrada =
                new Date(siguiente.fecha)

            let horaEntrada =
                parseInt(matchSiguiente[1])

            let minutoEntrada =
                parseInt(matchSiguiente[2])

            fechaEntrada.setHours(
                horaEntrada,
                minutoEntrada,
                0,
                0
            )

            // =====================================
            // DIFERENCIA
            // =====================================

            const diferenciaMs =
                fechaEntrada - fechaSalida

            const diferenciaHoras =
                diferenciaMs
                /
                (1000 * 60 * 60)

            // =====================================
            // MENOR A 12 HORAS
            // =====================================

            if(
                diferenciaHoras < 12
            ){

                let tipo =
                    "warning"

                if(
                    diferenciaHoras < 10
                ){

                    tipo = "danger"

                }

                alertas.push({

                    trabajador:
                        trabajador.nombre,

                    responsable:
                        trabajador.responsable,

                    fecha1:
                        actual.fecha,

                    fecha2:
                        siguiente.fecha,

                    descanso:
                        diferenciaHoras,

                    tipo

                })

            }

        }

    })

    return alertas

}


// =====================================================
// RENDER ALERTAS
// =====================================================

function renderizarAlertas(
    trabajadores
) {

    const contenedor =
        document.getElementById(
            "contenedor-alertas"
        )

    if (!contenedor) return

    const alertas =
        calcularAlertasDescanso(
            trabajadores
        )

    // =====================================
    // SIN ALERTAS
    // =====================================

    const card = document.getElementById("card-alertas")
    const badge = document.getElementById("badge-alertas")

    // Sin alertas: ocultar la card completa.
    // (style.display prevalece sobre las utilidades hidden / xl:flex.)
    if (alertas.length === 0) {

        if (card) card.style.display = "none"
        contenedor.innerHTML = ""
        if (badge) badge.textContent = ""

        return

    }

    // Hay alertas: mostrar la card y actualizar el contador.
    if (card) card.style.display = ""
    if (badge) badge.textContent = alertas.length

    // =====================================
    // RENDER ALERTAS
    // =====================================

    let html = ""

    alertas.forEach(alerta => {

        let colorCard = `
            border-amber-200
            bg-amber-50
        `

        let colorIcon = `
            bg-amber-100
            text-amber-600
        `

        let icono =
            "notifications_active"

        let estado =
            "Advertencia"

        if (
            alerta.tipo === "danger"
        ) {

            colorCard = `
                border-red-200
                bg-red-50
            `

            colorIcon = `
                bg-red-100
                text-red-600
            `

            icono =
                "priority_high"

            estado =
                "Crítico"

        }

        html += `

            <div class="fade-card border rounded-2xl p-3 ${colorCard}">

                <div class="flex items-start gap-2.5">

                    <!-- ICONO -->
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colorIcon}">
                        <span class="material-symbols-outlined text-lg">${icono}</span>
                    </div>

                    <!-- CONTENIDO -->
                    <div class="flex-1 min-w-0">

                        <!-- TOP -->
                        <div class="flex items-center justify-between gap-2">
                            <h3 class="font-black text-slate-800 text-xs truncate">
                                ${escaparHTML(alerta.trabajador)}
                            </h3>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${colorIcon}">
                                ${estado}
                            </span>
                        </div>

                        <!-- FECHAS -->
                        <div class="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-600">
                            <span class="material-symbols-outlined text-sm text-slate-400">schedule</span>
                            <span>${escaparHTML(alerta.fecha1)}</span>
                            <span class="text-slate-400">→</span>
                            <span>${escaparHTML(alerta.fecha2)}</span>
                        </div>

                        <!-- DESCANSO -->
                        <div class="mt-1.5 flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-sm text-slate-400">hotel</span>
                            <p class="text-[11px] font-semibold text-slate-700">
                                Descanso: <span class="font-black">${alerta.descanso.toFixed(1)}h</span>
                            </p>
                        </div>

                    </div>

                </div>

            </div>

        `

    })

    contenedor.innerHTML = html

}