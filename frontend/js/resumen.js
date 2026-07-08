// Configuración de minutos de colación por CECO (se carga del backend en
// cargarSistema). Cada elemento: { id, ceco, minutos }. Vacío = usar defaults.
let colacionConfigGlobal = []

// Minutos de colación por defecto cuando el CECO no tiene configuración propia.
function colacionMinutosPorDefecto(ceco){

    const texto = (ceco || "").trim().toLowerCase()

    return texto === "seguridad" ? 60 : 30

}

// Minutos de colación asignados a un CECO. Si existe configuración guardada se
// usa ese valor; si no, cae a la regla por defecto (60 seguridad / 30 resto).
function colacionMinutosPorCeco(ceco){

    const texto = (ceco || "").trim().toLowerCase()

    const config =
        (colacionConfigGlobal || []).find(
            c => String(c.ceco || "").trim().toLowerCase() === texto
        )

    if(config && Number.isFinite(config.minutos)){
        return config.minutos
    }

    return colacionMinutosPorDefecto(ceco)

}

// Colación (descanso de comida) a descontar por cada turno trabajado, en HORAS
// (los cálculos de jornada trabajan en horas). Deriva de los minutos asignados
// al CECO, configurables por el usuario en la vista Cobertura.
function colacionPorCeco(ceco){

    return colacionMinutosPorCeco(ceco) / 60

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

            maxlength="13"

            placeholder="00:00 - 00:00"

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

            oninput="
                limpiarErrorFormatoTurno(this);
            "

            onblur="
                if(validarFormatoTurno(this) !== null){
                    actualizarColor(this);
                    recalcularFila(this);
                    guardarTurno(this);
                }
            "

        >

    </td>

    `
}

function actualizarTooltipHorasTurno(input) {

    const fila =
        input.closest(".fila-trabajador")

    const trabajadorId =
        fila
            ? parseInt(fila.dataset.trabajadorId)
            : null

    const trabajador =
        trabajadoresGlobal.find(
            t => t.id === trabajadorId
        )

    const turno =
        String(input.value || "").trim()

    const esDiaSinTrabajo =
        /libre|saliente|vacaciones/i.test(turno)

    const tieneHorario =
        /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.test(turno)

    if(!esDiaSinTrabajo && !tieneHorario){
        input.title = "No se pudo calcular la duración de esta jornada"
        return
    }

    const horas =
        calcularHorasSemana(
            [turno],
            colacionPorCeco(
                trabajador ? trabajador.ceco : ""
            )
        )

    input.title =
        `Horas trabajadas: ${horas} h`

}

function actualizarColor(input) {

    actualizarTooltipHorasTurno(input)

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

function resumenFechaISO(fecha){

    return `${fecha.getFullYear()}-${
        String(fecha.getMonth() + 1).padStart(2,"0")
    }-${
        String(fecha.getDate()).padStart(2,"0")
    }`

}

function resumenTurnoEsLibre(turno){

    return String(turno || "")
        .trim()
        .toLowerCase()
        .includes("libre")

}

function resumenTurnoEsTrabajado(turno){

    const texto =
        String(turno || "")
            .trim()
            .toLowerCase()

    if(
        !texto ||
        texto.includes("libre") ||
        texto.includes("saliente") ||
        texto.includes("vacaciones")
    ){
        return false
    }

    return /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/
        .test(texto)

}

function resumenTurnoEsNocturno(turno){

    if(!resumenTurnoEsTrabajado(turno)){ return false }

    const match =
        String(turno)
            .match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)

    if(!match){ return false }

    const inicio =
        (parseInt(match[1]) * 60) +
        parseInt(match[2])

    const fin =
        (parseInt(match[3]) * 60) +
        parseInt(match[4])

    return fin <= inicio

}

function calcularIndicadoresTrabajador(trabajador){

    const ultimoDia =
        new Date(
            anioActual,
            mesActual + 1,
            0
        ).getDate()

    let nocturnos = 0
    let libres = 0
    let horasMes = 0

    for(let dia=1; dia<=ultimoDia; dia++){

        const fechaTexto =
            resumenFechaISO(
                new Date(
                    anioActual,
                    mesActual,
                    dia
                )
            )

        const turno =
            obtenerTurnoGuardado(
                trabajador.id,
                fechaTexto
            )

        if(resumenTurnoEsLibre(turno)){
            libres++
        }

        if(resumenTurnoEsNocturno(turno)){
            nocturnos++
        }

        if(resumenTurnoEsTrabajado(turno)){
            horasMes += calcularHorasSemana(
                [turno],
                colacionPorCeco(trabajador.ceco)
            )
        }

    }

    const jornada =
        parseInt(trabajador.jornada) || 0

    const semanas =
        generarSemanas(
            mesActual,
            anioActual
        )

    let semanasSobrecarga = 0
    let maxHorasSemana = 0
    let excesoMaximo = 0

    semanas.forEach(semana => {

        const turnosSemana = []

        for(let dia=0; dia<7; dia++){

            const fecha =
                new Date(semana.inicio)

            fecha.setDate(
                fecha.getDate() + dia
            )

            turnosSemana.push(
                obtenerTurnoGuardado(
                    trabajador.id,
                    resumenFechaISO(fecha)
                )
            )

        }

        const horas =
            calcularHorasSemana(
                turnosSemana,
                colacionPorCeco(trabajador.ceco)
            )

        maxHorasSemana =
            Math.max(
                maxHorasSemana,
                horas
            )

        if(jornada && horas > jornada){
            semanasSobrecarga++
            excesoMaximo =
                Math.max(
                    excesoMaximo,
                    Math.round((horas - jornada) * 10) / 10
                )
        }

    })

    const domingos =
        calcularDomingosTrabajados(
            trabajador.id
        )

    const domingosLibres =
        calcularDomingosLibres(
            trabajador.id
        )

    const carga =
        semanasSobrecarga > 0
            ? {
                texto: "Sobrecarga",
                detalle: `${semanasSobrecarga} sem. sobre jornada`,
                clase: "bg-red-50 text-red-700 border-red-200",
                icono: "priority_high"
            }
            : jornada && maxHorasSemana >= jornada * 0.9
                ? {
                    texto: "Ajustada",
                    detalle: `Pico ${maxHorasSemana}h / ${jornada}h`,
                    clase: "bg-amber-50 text-amber-700 border-amber-200",
                    icono: "speed"
                }
                : {
                    texto: "Normal",
                    detalle: jornada
                        ? `Pico ${maxHorasSemana}h / ${jornada}h`
                        : `Pico ${maxHorasSemana}h`,
                    clase: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    icono: "check_circle"
                }

    return {
        nocturnos,
        domingos,
        domingosLibres,
        libres,
        horasMes:
            Math.round(horasMes * 10) / 10,
        maxHorasSemana,
        semanasSobrecarga,
        excesoMaximo,
        carga
    }

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

        const indicadores =
            calcularIndicadoresTrabajador(t)

        html += `

            <div class="fade-card bg-white border border-slate-200 rounded-2xl p-3">

                <!-- PERSONA -->
                <div class="flex items-start justify-between gap-2.5 min-w-0 mb-3">

                    <div class="flex items-center gap-2.5 min-w-0">
                        <div class="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                            <span class="material-symbols-outlined text-slate-600 text-lg">badge</span>
                        </div>

                        <div class="min-w-0">
                            <h3 class="text-xs font-black text-slate-900 uppercase truncate leading-tight">
                                ${escaparHTML(t.nombre)}
                            </h3>
                            <p class="text-slate-500 text-[11px] truncate">
                                ${escaparHTML(t.responsable || "Sin responsable")}
                            </p>
                        </div>
                    </div>

                    <div class="rounded-full border px-2 py-1 text-[10px] font-black uppercase flex items-center gap-1 shrink-0 ${indicadores.carga.clase}">
                        <span class="material-symbols-outlined text-[13px] leading-none">${indicadores.carga.icono}</span>
                        ${indicadores.carga.texto}
                    </div>

                </div>

                <!-- ESTADISTICAS -->
                <div class="grid grid-cols-2 gap-2">

                    <div class="bg-slate-50 rounded-xl px-2.5 py-2 min-w-0">
                        <div class="flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-slate-600 text-sm">dark_mode</span>
                            <p class="text-slate-500 text-[11px] truncate">Nocturnos</p>
                        </div>
                        <h4 class="text-lg font-black text-slate-800 mt-0.5 leading-none">${indicadores.nocturnos}</h4>
                    </div>

                    <div class="bg-blue-50 rounded-xl px-2.5 py-2 min-w-0">
                        <div class="flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-blue-600 text-sm">work</span>
                            <p class="text-slate-500 text-[11px] truncate">Domingos</p>
                        </div>
                        <h4 class="text-lg font-black text-blue-600 mt-0.5 leading-none">${indicadores.domingos}</h4>
                        <p class="text-[10px] text-blue-500 mt-0.5">${indicadores.domingosLibres} libres</p>
                    </div>

                    <div class="bg-emerald-50 rounded-xl px-2.5 py-2 min-w-0">
                        <div class="flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-emerald-600 text-sm">event_available</span>
                            <p class="text-slate-500 text-[11px] truncate">Libres mes</p>
                        </div>
                        <h4 class="text-lg font-black text-emerald-600 mt-0.5 leading-none">${indicadores.libres}</h4>
                    </div>

                    <div class="bg-amber-50 rounded-xl px-2.5 py-2 min-w-0">
                        <div class="flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-amber-600 text-sm">monitoring</span>
                            <p class="text-slate-500 text-[11px] truncate">Horas mes</p>
                        </div>
                        <h4 class="text-lg font-black text-amber-700 mt-0.5 leading-none">${indicadores.horasMes}</h4>
                    </div>

                </div>

                <div class="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2">
                    <div class="flex items-center justify-between gap-2 text-[11px]">
                        <span class="font-bold text-slate-600 truncate">${escaparHTML(indicadores.carga.detalle)}</span>
                        ${
                            indicadores.excesoMaximo > 0
                                ? `<span class="font-black text-red-600 shrink-0">+${indicadores.excesoMaximo}h</span>`
                                : `<span class="font-black text-emerald-600 shrink-0">Sin exceso</span>`
                        }
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

                    kind: "descanso",

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
// ALERTAS DE HORAS SEMANALES (jornada)
// =====================================================
// Compara las horas trabajadas por semana con la jornada del trabajador.
// Más horas que la jornada => alerta (warning); menos => info. Se recorren
// las mismas semanas que la grilla (generarSemanas, Lun–Dom) para que las
// horas coincidan con las que se muestran en cada tarjeta.

function calcularAlertasHoras(
    trabajadores
){

    const alertas = []

    const semanas =
        generarSemanas(
            mesActual,
            anioActual
        )

    trabajadores.forEach(trabajador => {

        const jornada =
            parseInt(trabajador.jornada) || 0

        // Sin jornada definida no hay con qué comparar.
        if(!jornada){ return }

        const colacion =
            colacionPorCeco(trabajador.ceco)

        semanas.forEach((semana, index) => {

            // =====================================
            // TURNOS DE LA SEMANA (Lun–Dom)
            // =====================================

            const turnosSemana = []

            for(let dia=0; dia<7; dia++){

                const fecha =
                    new Date(semana.inicio)

                fecha.setDate(
                    fecha.getDate() + dia
                )

                const fechaTexto =
                    `${fecha.getFullYear()}-${
                        String(fecha.getMonth() + 1).padStart(2,"0")
                    }-${
                        String(fecha.getDate()).padStart(2,"0")
                    }`

                turnosSemana.push(
                    obtenerTurnoGuardado(
                        trabajador.id,
                        fechaTexto
                    )
                )

            }

            const horas =
                calcularHorasSemana(
                    turnosSemana,
                    colacion
                )

            // Semana sin trabajo (toda Libre): no se reporta.
            if(horas <= 0){ return }

            // Cumple exacto la jornada: nada que reportar.
            if(horas === jornada){ return }

            const diferencia =
                Math.round((horas - jornada) * 10) / 10

            alertas.push({

                kind: "horas",

                tipo:
                    horas > jornada
                        ? "warning"
                        : "info",

                trabajador:
                    trabajador.nombre,

                responsable:
                    trabajador.responsable,

                semana: index + 1,

                horas,

                jornada,

                diferencia

            })

        })

    })

    return alertas

}


// =====================================================
// RENDER ALERTAS
// =====================================================

function calcularTodasAlertas(trabajadores) {

    const alertasDescanso =
        calcularAlertasDescanso(
            trabajadores
        )

    const alertasCobertura =
        typeof calcularAlertasCobertura === "function"
            ? calcularAlertasCobertura(trabajadores)
            : []

    const alertasHoras =
        calcularAlertasHoras(
            trabajadores
        )

    return [
        ...alertasDescanso,
        ...alertasHoras,
        ...alertasCobertura
    ]

}

function renderizarAlertas(
    trabajadores
) {

    const contenedor =
        document.getElementById(
            "contenedor-alertas"
        )

    if (!contenedor) return

    const alertas =
        calcularTodasAlertas(
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

        // =====================================
        // COLOR SEGÚN SEVERIDAD
        // =====================================

        let colorCard = `
            border-amber-200
            bg-amber-50
        `

        let colorIcon = `
            bg-amber-100
            text-amber-600
        `

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

        } else if (
            alerta.tipo === "info"
        ) {

            colorCard = `
                border-blue-200
                bg-blue-50
            `

            colorIcon = `
                bg-blue-100
                text-blue-600
            `

        }

        // =====================================
        // CONTENIDO SEGÚN TIPO DE ALERTA
        // =====================================

        let icono
        let estado
        let titulo
        let detalle
        let subtitulo
        let iconoSub
        let iconoDetalle

        if (alerta.kind === "cobertura") {

            icono =
                alerta.tipo === "danger" ? "report" : "fact_check"

            estado =
                alerta.tipo === "danger" ? "Cobertura crítica" : "Cobertura"

            titulo = alerta.titulo
            subtitulo = alerta.detalle
            detalle = alerta.mensaje
            iconoSub = "schedule"
            iconoDetalle = "group"

        } else if (alerta.kind === "horas") {

            const exceso =
                alerta.tipo === "warning"

            const dif =
                Math.abs(alerta.diferencia).toFixed(1)

            icono = exceso ? "more_time" : "schedule"
            estado = exceso ? "Horas extra" : "Bajo jornada"
            titulo = alerta.trabajador
            subtitulo = `Semana ${alerta.semana}`

            detalle =
                `<span class="font-black">${alerta.horas}h</span> / ${alerta.jornada}h · ${
                    exceso ? `+${dif}h` : `faltan ${dif}h`
                }`

            iconoSub = "calendar_month"
            iconoDetalle = "schedule"

        } else {

            // Descanso entre turnos.
            icono =
                alerta.tipo === "danger" ? "priority_high" : "notifications_active"

            estado =
                alerta.tipo === "danger" ? "Crítico" : "Advertencia"

            titulo = alerta.trabajador
            subtitulo = `${escaparHTML(alerta.fecha1)} → ${escaparHTML(alerta.fecha2)}`
            detalle = `Descanso: <span class="font-black">${alerta.descanso.toFixed(1)}h</span>`
            iconoSub = "schedule"
            iconoDetalle = "hotel"

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
                                ${escaparHTML(titulo)}
                            </h3>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${colorIcon}">
                                ${estado}
                            </span>
                        </div>

                        <!-- DETALLE -->
                        <div class="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-600">
                            <span class="material-symbols-outlined text-sm text-slate-400">
                                ${iconoSub}
                            </span>
                            <span>${subtitulo}</span>
                        </div>

                        <div class="mt-1.5 flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-sm text-slate-400">
                                ${iconoDetalle}
                            </span>
                            <p class="text-[11px] font-semibold text-slate-700">
                                ${detalle}
                            </p>
                        </div>

                    </div>

                </div>

            </div>

        `

    })

    contenedor.innerHTML = html

}
