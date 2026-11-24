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

        if(fin <= inicio){

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

    // Comparamos con String() en ambos lados para no morir si el
    // backend serializo `trabajador_id` como numero y `t.id` es
    // string, o viceversa. El bug que reportaba el usuario (PDF
    // 'todo en Libre' pese a haber turnos en pantalla) era este:
    // en la grilla funcionaba porque ahi el codigo usaba coercion
    // implicita o se cargaba con tipos consistentes, pero en el
    // PDF reventaba el `===` y caia al fallback 'Libre'.
    const tid = String(trabajadorId)

    const encontrado =
        planificacionGlobal.find(p =>

            String(p.trabajador_id) === tid

            &&

            String(p.fecha || '').startsWith(
                String(fecha || '')
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

    input.dataset.turnoEstado = valor.includes("vacaciones") ? "vacaciones"
        : valor.includes("saliente") ? "saliente"
        : valor.includes("libre") ? "libre" : "trabajo"

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
                    detalle: `Mayor carga ${maxHorasSemana}h / ${jornada}h`,
                    clase: "bg-amber-50 text-amber-700 border-amber-200",
                    icono: "speed"
                }
                : {
                    texto: "Normal",
                    detalle: jornada
                        ? `Mayor carga ${maxHorasSemana}h / ${jornada}h`
                        : `Mayor carga ${maxHorasSemana}h`,
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


function filtrarCargaMensual(valor){
    window.filtroCargaMensual = valor
    renderizarResumenDomingos(trabajadoresPlanificacionVisibles())
}

function renderizarResumenDomingos(lista = trabajadoresGlobal){
    const contenedor = document.getElementById("resumen-domingos")
    if(!contenedor) return
    const card = document.getElementById("card-domingos")
    lista = (lista || []).filter(t => t.activo !== false)
    if(card) card.classList.toggle("hidden", !lista.length)
    if(!lista.length){ contenedor.innerHTML = ""; return }

    // Conservar los detalles abiertos al guardar un turno o cambiar filtros.
    const abiertos = new Set(Array.from(contenedor.querySelectorAll("details[open]"))
        .map(d => d.dataset.cargaId))
    const datos = lista.map(t => ({t, i: calcularIndicadoresTrabajador(t)}))
    const sobrecargados = datos.filter(({i}) => i.semanasSobrecarga > 0).length
    const horas = Math.round(datos.reduce((n, {i}) => n + i.horasMes, 0) * 10) / 10
    const noches = datos.reduce((n, {i}) => n + i.nocturnos, 0)
    const filtro = window.filtroCargaMensual || "todos"
    const visibles = datos.filter(({i}) => filtro === "sobrecarga"
        ? i.semanasSobrecarga > 0
        : filtro === "sin-turnos" ? i.horasMes === 0 : true)
        .sort((a, b) => b.i.semanasSobrecarga - a.i.semanasSobrecarga ||
            b.i.excesoMaximo - a.i.excesoMaximo || a.t.nombre.localeCompare(b.t.nombre, "es"))
    const opciones = [["todos", "Todo el equipo"], ["sobrecarga", "Con sobrecarga"], ["sin-turnos", "Sin turnos"]]
    contenedor.innerHTML = `
        <div class="workload-period">${escaparHTML(meses[mesActual])} ${anioActual} · ${lista.length} colaboradores</div>
        <div class="workload-totals">
            <div class="${sobrecargados ? "workload-danger" : ""}" title="Colaboradores con alguna semana sobre su jornada">
                <strong>${sobrecargados}</strong><span>Con exceso</span>
            </div>
            <div title="Turnos que terminan al día siguiente"><strong>${noches}</strong><span>Nocturnos</span></div>
            <div title="Horas del mes descontando colación"><strong>${horas}h</strong><span>Horas equipo</span></div>
        </div>
        <label class="workload-filter">
            <span>Mostrar</span>
            <select aria-label="Filtrar carga mensual" onchange="filtrarCargaMensual(this.value)">
                ${opciones.map(([v, texto]) => `<option value="${v}" ${filtro === v ? "selected" : ""}>${texto}</option>`).join("")}
            </select>
        </label>
        <div class="workload-list">${visibles.map(({t, i}) => {
            const estado = !i.horasMes ? "Sin turnos" : !parseInt(t.jornada) ? "Sin jornada" : i.semanasSobrecarga ? "Sobrecarga" : "Sin exceso"
            const tono = estado === "Sobrecarga" ? "danger" : ["Sin turnos", "Sin jornada"].includes(estado) ? "muted" : "normal"
            const pico = parseInt(t.jornada) ? `${i.maxHorasSemana}h / ${t.jornada}h` : `${i.maxHorasSemana}h · sin jornada definida`
            return `<details class="workload-person" data-carga-id="${escaparHTML(String(t.id))}" ${abiertos.has(String(t.id)) ? "open" : ""}>
                <summary>
                    <div class="workload-person-name"><span title="${escaparHTML(t.nombre)}">${escaparHTML(t.nombre)}</span>
                        <small class="workload-${tono}">${estado}${i.semanasSobrecarga ? ` · ${i.semanasSobrecarga} sem.` : ""}</small>
                    </div>
                    <strong class="workload-hours">${i.horasMes}<small> h</small></strong>
                    <span class="material-symbols-outlined workload-chevron" aria-hidden="true">expand_more</span>
                </summary>
                <div class="workload-detail">
                    <p>${escaparHTML(t.responsable || "Sin responsable")}</p>
                    <div class="workload-metrics">
                        <div title="Turnos que cruzan medianoche"><span>Nocturnos</span><strong>${i.nocturnos}</strong></div>
                        <div title="Domingos con trabajo, incluido el turno del sábado que continúa el domingo"><span>Domingos trabajados</span><strong>${i.domingos}</strong></div>
                        <div title="Incluye los días que la grilla muestra como Libre"><span>Días libres</span><strong>${i.libres}</strong></div>
                        <div><span>Domingos libres</span><strong>${i.domingosLibres}</strong></div>
                    </div>
                    <button type="button" class="workload-peak workload-edit" onclick="abrirDetalleCarga('${t.id}')" aria-label="Revisar y editar la carga semanal de ${escaparHTML(t.nombre)}"><span>Mayor carga semanal</span><strong>${escaparHTML(pico)}</strong><span class="material-symbols-outlined" aria-hidden="true">edit_calendar</span></button>
                    ${i.excesoMaximo ? `<p class="workload-danger">Exceso máximo: +${i.excesoMaximo}h en una semana</p>` : ""}
                </div>
            </details>`
        }).join("") || '<p class="workload-empty">No hay colaboradores para este filtro.</p>'}</div>
    `
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

function calcularAlertasDescanso(trabajadores){
    const alertas = []
    const semanas = generarSemanas(mesActual, anioActual)
    const inicioVisible = new Date(semanas[0].inicio)
    inicioVisible.setHours(0, 0, 0, 0)
    const finVisible = new Date(semanas[semanas.length - 1].fin)
    finVisible.setHours(23, 59, 59, 999)
    const esVisible = fecha => {
        const dia = new Date(`${fecha}T00:00:00`)
        return dia >= inicioVisible && dia <= finVisible
    }

    trabajadores.forEach(trabajador => {
        // Fechas locales e IDs normalizados, igual que los turnos de la grilla.
        // Incluir el mes vecino permite detectar descansos en sus limites.
        const turnos = planificacionGlobal
            .filter(p => String(p.trabajador_id) === String(trabajador.id))
            .map(p => {
                const fecha = String(p.fecha || "").slice(0, 10)
                const intervalo = intervaloDesdeTurno(fecha, p.turno)
                return intervalo ? {fecha, ...intervalo} : null
            })
            .filter(Boolean)
            .sort((a, b) => a.inicio - b.inicio)

        for(let i = 0; i < turnos.length - 1; i++){
            const actual = turnos[i]
            const siguiente = turnos[i + 1]
            if(!esVisible(actual.fecha) && !esVisible(siguiente.fecha)) continue
            const descanso = (siguiente.inicio - actual.fin) / 3600000
            if(descanso >= 12) continue
            alertas.push({
                kind: "descanso",
                trabajador_id: trabajador.id,
                trabajador: trabajador.nombre,
                responsable: trabajador.responsable,
                fecha1: actual.fecha,
                fecha2: siguiente.fecha,
                descanso,
                tipo: descanso < 10 ? "danger" : "warning"
            })
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
                    trabajador_id: trabajador.id,

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
// ALERTA NOCTURNO 5x2 (último día de la racha)
// =====================================================
// Regla: en jornada 5x2 de noche, el último día de trabajo de una racha no
// puede extenderse al día siguiente; el turno debe terminar antes de las
// 23:59. Se marca cada turno nocturno (cruza medianoche) cuyo día siguiente
// no es de trabajo (Libre, Saliente, vacío o vacaciones).

// Jornada mínima (horas) para aplicar la regla 5x2. Por debajo de este valor
// el colaborador se considera de otro régimen y no recibe la alerta.
const JORNADA_MINIMA_5X2 = 30

function calcularAlertasNocturnoUltimoDia(trabajadores){

    const alertas = []

    const semanas = generarSemanas(mesActual, anioActual)
    const inicioVisible = new Date(semanas[0].inicio)
    inicioVisible.setHours(0, 0, 0, 0)
    const finVisible = new Date(semanas[semanas.length - 1].fin)
    finVisible.setHours(23, 59, 59, 999)

    trabajadores.forEach(trabajador => {

        // La regla es del régimen 5x2: los colaboradores de jornada menor
        // (p. ej. 20 h) no se evalúan y no reciben esta alerta.
        if((parseInt(trabajador.jornada) || 0) < JORNADA_MINIMA_5X2) return

        planificacionGlobal
            .filter(p => String(p.trabajador_id) === String(trabajador.id))
            .forEach(p => {

                const fecha = String(p.fecha || "").slice(0, 10)
                if(!fecha) return

                const dia = new Date(`${fecha}T00:00:00`)
                if(dia < inicioVisible || dia > finVisible) return

                if(!resumenTurnoEsNocturno(p.turno)) return

                const siguiente = new Date(`${fecha}T00:00:00`)
                siguiente.setDate(siguiente.getDate() + 1)
                const fechaSiguiente = resumenFechaISO(siguiente)

                // Si el día siguiente también se trabaja, no es el último día de la racha.
                if(resumenTurnoEsTrabajado(obtenerTurnoGuardado(trabajador.id, fechaSiguiente))) return

                const fin =
                    String(p.turno).match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)?.[2] || ""

                alertas.push({

                    kind: "nocturno5x2",
                    trabajador_id: trabajador.id,
                    trabajador: trabajador.nombre,
                    responsable: trabajador.responsable,
                    fecha,
                    fecha1: fecha,
                    turno: p.turno,
                    tipo: "danger",

                    mensaje: `El turno cruza la medianoche y termina el ${fechaSiguiente} a las ${fin}.`,
                    detalle: `Último día de la racha nocturna: el día siguiente (${fechaSiguiente}) no es de trabajo, así que el turno debe terminar antes de las 23:59.`

                })

            })

    })

    return alertas

}


// =====================================================
// ALERTA DOMINGOS LIBRES (art. 38, categorías 2 y 7)
// =====================================================
// Inciso 5 del art. 38: en las categorías 2 y 7, al menos dos de los días de
// descanso del mes calendario deben ser domingo. Solo se evalúan trabajadores
// con esa categoría y con turnos cargados en el mes visible (sin turnos no
// hay nada que comparar).

const CATEGORIAS_DOMINGO_ART38 = [2, 7]

function calcularAlertasDomingosArt38(trabajadores){

    const alertas = []

    const prefijo =
        `${anioActual}-${String(mesActual + 1).padStart(2, "0")}`

    const nombreMes =
        new Date(anioActual, mesActual, 1)
            .toLocaleDateString("es-CL", {month: "long", year: "numeric"})

    trabajadores.forEach(trabajador => {

        if(!CATEGORIAS_DOMINGO_ART38.includes(Number(trabajador.categoria_art38))){
            return
        }

        const tieneTurnosEnMes = planificacionGlobal.some(p =>
            String(p.trabajador_id) === String(trabajador.id) &&
            String(p.fecha || "").startsWith(prefijo) &&
            resumenTurnoEsTrabajado(p.turno)
        )

        if(!tieneTurnosEnMes) return

        const libres = calcularDomingosLibres(trabajador.id)

        if(libres >= 2) return

        alertas.push({

            kind: "domingos38",
            trabajador_id: trabajador.id,
            trabajador: trabajador.nombre,
            responsable: trabajador.responsable,

            tipo: libres === 0 ? "danger" : "warning",

            mensaje: `${libres} domingo(s) libre(s) en ${nombreMes}; el art. 38 exige al menos 2.`,
            detalle: `Categoría ${trabajador.categoria_art38} del art. 38. El inciso 5 exige que al menos dos de los días de descanso del mes calendario sean domingo.`

        })

    })

    return alertas

}


// =====================================================
// RENDER ALERTAS
// =====================================================

// =====================================================
// LÍMITES LEGALES (Código del Trabajo)
// =====================================================
// 1. dias:    más de 6 días trabajados en la semana (art. 28).
// 2. diaria:  más de 10 horas netas en un día (art. 28).
// 3. semanal: más de 42 horas netas en la semana (art. 22, vigente desde el
//             26-04-2026). El art. 22 permite promediar hasta 4 semanas, así que
//             es advertencia, no crítica.
// 4. colacion: colación configurada menor a 30 minutos (art. 34), salvo
//             trabajos de proceso continuo, que no se detectan automáticamente.
// Las horas usan la misma base que la grilla: se descuenta la colación del CECO.

const LIMITE_LEGAL_DIAS_SEMANA = 6
const LIMITE_LEGAL_HORAS_DIA = 10
const LIMITE_LEGAL_HORAS_SEMANA = 42
const LIMITE_LEGAL_COLACION_MIN = 30

function calcularAlertasLegales(trabajadores){

    const alertas = []

    const semanas = generarSemanas(mesActual, anioActual)

    const isoDe = fecha =>
        `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2,"0")}-${String(fecha.getDate()).padStart(2,"0")}`

    const prefijo =
        `${anioActual}-${String(mesActual + 1).padStart(2, "0")}`

    trabajadores.forEach(trabajador => {

        const colacion = colacionPorCeco(trabajador.ceco)
        const minutosColacion = colacionMinutosPorCeco(trabajador.ceco)

        const base = {
            kind: "legal",
            trabajador_id: trabajador.id,
            trabajador: trabajador.nombre,
            responsable: trabajador.responsable
        }

        // Colación del CECO: se revisa una vez por trabajador con turnos en el mes.
        const tieneTurnosEnMes = planificacionGlobal.some(p =>
            String(p.trabajador_id) === String(trabajador.id) &&
            String(p.fecha || "").startsWith(prefijo) &&
            resumenTurnoEsTrabajado(p.turno)
        )

        if(tieneTurnosEnMes && minutosColacion < LIMITE_LEGAL_COLACION_MIN){
            alertas.push({
                ...base,
                regla: "colacion",
                tipo: "warning",
                mensaje: `Colación de ${minutosColacion} min en el CECO "${trabajador.ceco || "sin CECO"}"; el art. 34 exige al menos ${LIMITE_LEGAL_COLACION_MIN} min.`,
                detalle: "Si el trabajo es de proceso continuo, la excepción del art. 34 puede aplicar; revísalo manualmente."
            })
        }

        semanas.forEach((semana, indice) => {

            const turnosSemana = []
            let diasTrabajados = 0
            let horasSemana = 0

            for(let dia = 0; dia < 7; dia++){

                const fecha = new Date(semana.inicio)
                fecha.setDate(fecha.getDate() + dia)

                const iso = isoDe(fecha)
                const turno = obtenerTurnoGuardado(trabajador.id, iso)

                turnosSemana.push(turno)

                if(!resumenTurnoEsTrabajado(turno)) continue

                diasTrabajados++

                const horasDia = calcularHorasSemana([turno], colacion)
                horasSemana += horasDia

                if(horasDia > LIMITE_LEGAL_HORAS_DIA){
                    alertas.push({
                        ...base,
                        regla: "diaria",
                        fecha: iso,
                        tipo: "danger",
                        mensaje: `${Math.round(horasDia * 10) / 10} h netas en el día ${iso}; el máximo diario es ${LIMITE_LEGAL_HORAS_DIA} h.`,
                        detalle: `Art. 28 del Código del Trabajo. Turno ${turno}, con la colación descontada.`
                    })
                }
            }

            const semanaIso = isoDe(semana.inicio)

            if(diasTrabajados > LIMITE_LEGAL_DIAS_SEMANA){
                alertas.push({
                    ...base,
                    regla: "dias",
                    fecha: semanaIso,
                    tipo: "danger",
                    mensaje: `${diasTrabajados} días trabajados en la semana ${indice + 1}; el máximo es ${LIMITE_LEGAL_DIAS_SEMANA}.`,
                    detalle: "Art. 28 del Código del Trabajo: la jornada semanal no puede distribuirse en más de seis días."
                })
            }

            if(horasSemana > LIMITE_LEGAL_HORAS_SEMANA){
                alertas.push({
                    ...base,
                    regla: "semanal",
                    fecha: semanaIso,
                    tipo: "warning",
                    mensaje: `${Math.round(horasSemana * 10) / 10} h netas en la semana ${indice + 1}; el límite legal es ${LIMITE_LEGAL_HORAS_SEMANA} h.`,
                    detalle: "Art. 22 del Código del Trabajo. Puede compensarse con promedios de hasta cuatro semanas; revísalo antes de tomar una decisión."
                })
            }

        })

    })

    return alertas

}

// =====================================================
// ALERTA DOMINGOS ANUALES (art. 38 bis, categoría 7)
// =====================================================
// El art. 38 bis exige siete domingos de descanso al año para la categoría 7.
// El texto dice "durante cada año de vigencia del contrato"; el sistema no
// guarda la fecha de inicio del contrato, así que se evalúa por año calendario.
// Solo se evalúa cuando el trabajador tiene planificación en los 12 meses, para
// no contar como libres los meses que aún no se han cargado.

const DOMINGOS_ANUALES_ART38BIS = 7

function calcularAlertasDomingosAnualArt38Bis(trabajadores){

    const alertas = []

    trabajadores.forEach(trabajador => {

        if(Number(trabajador.categoria_art38) !== 7) return

        const meses = new Set(
            planificacionGlobal
                .filter(p =>
                    String(p.trabajador_id) === String(trabajador.id) &&
                    String(p.fecha || "").startsWith(`${anioActual}-`)
                )
                .map(p => String(p.fecha).slice(5, 7))
        )

        if(meses.size < 12) return

        let libres = 0

        for(
            let fecha = new Date(anioActual, 0, 1);
            fecha.getFullYear() === anioActual;
            fecha.setDate(fecha.getDate() + 1)
        ){

            if(fecha.getDay() !== 0) continue

            const sabado = new Date(fecha)
            sabado.setDate(sabado.getDate() - 1)

            // Domingo trabajado: turno propio o turno del sábado que cruza la medianoche.
            const trabajaDomingo =
                resumenTurnoEsTrabajado(obtenerTurnoGuardado(trabajador.id, resumenFechaISO(fecha)))
            const sabadoCruza =
                resumenTurnoEsNocturno(obtenerTurnoGuardado(trabajador.id, resumenFechaISO(sabado)))

            if(!trabajaDomingo && !sabadoCruza) libres++

        }

        if(libres >= DOMINGOS_ANUALES_ART38BIS) return

        alertas.push({

            kind: "domingos38bis",
            trabajador_id: trabajador.id,
            trabajador: trabajador.nombre,
            responsable: trabajador.responsable,

            tipo: "danger",

            mensaje: `${libres} domingo(s) libre(s) en ${anioActual}; el art. 38 bis exige ${DOMINGOS_ANUALES_ART38BIS} al año para la categoría 7.`,
            detalle: "Se evalúa por año calendario (el texto legal habla de cada año de contrato) y solo con planificación de los 12 meses."

        })

    })

    return alertas

}


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

    const alertasNocturno =
        calcularAlertasNocturnoUltimoDia(
            trabajadores
        )

    const alertasDomingos =
        calcularAlertasDomingosArt38(
            trabajadores
        )

    return [
        ...alertasDescanso,
        ...alertasHoras,
        ...alertasNocturno,
        ...alertasDomingos,
        ...calcularAlertasLegales(trabajadores),
        ...calcularAlertasDomingosAnualArt38Bis(trabajadores),
        ...alertasCobertura
    ]

}

function renderizarAlertas(trabajadores) {
    // El detalle se presenta ahora dentro de cada semana de planificacion.
    const card = document.getElementById("card-alertas")
    if (card) card.style.display = "none"
}
