// =====================================================
// MOTOR DE ASIGNACIÓN AUTOMÁTICA
// =====================================================
// Genera una propuesta en memoria. La planificación existente solo cambia
// cuando el usuario revisa y aprueba explícitamente la propuesta.

const MOTOR_DESCANSO_MINIMO_HORAS = 12
const MOTOR_MAX_DIAS_CONSECUTIVOS = 6
const MOTOR_MAX_HORAS_LEGALES_SEMANA = 42

let propuestaPlanificacionAutomatica = null

function motorFechasDelMes(){

    const fechas = []
    const ultimoDia =
        new Date(anioActual, mesActual + 1, 0).getDate()

    for(let dia=1; dia<=ultimoDia; dia++){
        fechas.push(
            formatearFechaISO(
                new Date(anioActual, mesActual, dia)
            )
        )
    }

    return fechas

}

function motorTurnosDisponibles(ceco = null){

    const turnosConfigurados = obtenerTurnosDisponibles(ceco)
        .filter(turno =>
            /^([01]\d|2[0-3]):[0-5]\d\s-\s([01]\d|2[0-3]):[0-5]\d$/
                .test(String(turno || "").trim())
        )

    if(turnosConfigurados.length > 0 || ceco === null){
        return turnosConfigurados
    }

    return []

}

function motorTurnoDesdeIntervalo(inicio, fin){

    return `${formatearHoraDesdeFecha(inicio)} - ${formatearHoraDesdeFecha(fin)}`

}

function motorClaveAsignacion(trabajadorId, fecha){
    return `${trabajadorId}|${fecha}`
}

function motorInicioSemana(fechaTexto){

    const fecha =
        new Date(`${fechaTexto}T00:00:00`)

    const dia =
        fecha.getDay() === 0
            ? 7
            : fecha.getDay()

    fecha.setDate(
        fecha.getDate() - (dia - 1)
    )

    return formatearFechaISO(fecha)

}

function motorEsTurnoTrabajado(turno){

    return !!intervaloDesdeTurno(
        "2000-01-01",
        turno
    )

}

// Distingue los placeholders "vacíos" (Libre o cadena vacía) de los turnos
// reales y de los estados intencionales como Saliente o Vacaciones. El top-up
// usa esto para decidir si puede sobrescribir una entrada existente: solo
// sobrescribe si es Libre/no-asignado, nunca Saliente ni Vacaciones.
function motorEsNoAsignado(turno){

    const texto =
        String(turno || "").trim().toLowerCase()

    return texto === "" || texto === "libre"

}

function motorMapaPlanificacionActual(){

    const mapa = new Map()

    planificacionGlobal.forEach(registro => {

        const fecha =
            String(registro.fecha || "").slice(0, 10)

        mapa.set(
            motorClaveAsignacion(
                registro.trabajador_id,
                fecha
            ),
            {
                trabajador_id: registro.trabajador_id,
                responsable: registro.responsable,
                fecha,
                turno: registro.turno,
                horas: Number(registro.horas) || 0,
                origen: "existente"
            }
        )

    })

    return mapa

}

// Mínimo representativo de una regla (el mayor entre apertura y cierre), usado
// para priorizar las reglas más exigentes al construir la propuesta.
function motorMinimoRegla(regla){

    return Math.max(
        regla.minimo_inicio ?? regla.minimo_personas,
        regla.minimo_fin ?? regla.minimo_personas
    )

}

function motorReglasActivas(){

    return coberturaConfigGlobal
        .filter(regla => regla.activo)
        .sort((a, b) =>
            motorMinimoRegla(b) - motorMinimoRegla(a)
        )

}

function motorTurnosParaBrecha(fechaTexto, brecha, regla){

    // Para reglas de tipo "ceco" usamos el catálogo del CECO concreto. Para
    // "area" / "cargo" no hay un CECO único: caemos al pool global de
    // turnos disponibles (que ya incluye los defaults cuando la empresa aún
    // no configuró nada). Pasar `null` aquí se apoya en `obtenerTurnosDisponibles`,
    // que decide si el CECO "global" tiene catálogo propio.
    const filtroCeco = regla && regla.tipo === "ceco" ? regla.valor : null

    const turnos =
        motorTurnosDisponibles(filtroCeco)
        .map(turno => ({
            turno,
            intervalo:
                intervaloDesdeTurno(
                    fechaTexto,
                    turno
                )
        }))
        .filter(item => {

            // Instante que el turno debe cubrir para tapar la brecha (apertura
            // o cierre). Compat: brechas antiguas sin "cobertura" usan inicio.
            const punto =
                brecha.cobertura || brecha.inicio

            return (
                item.intervalo &&
                item.intervalo.inicio <= punto &&
                item.intervalo.fin > punto
            )

        })
        .sort((a, b) => {

            return (
                b.intervalo.fin - a.intervalo.fin
            )

        })
        .map(item => item.turno)

    const turnoMedida =
        motorTurnoDesdeIntervalo(
            brecha.inicio,
            brecha.fin
        )

    if(!turnos.includes(turnoMedida)){
        turnos.unshift(turnoMedida)
    }

    return turnos

}

function motorAsignacionesTrabajador(mapa, trabajadorId){

    return [...mapa.values()]
        .filter(registro =>
            registro.trabajador_id === trabajadorId &&
            motorEsTurnoTrabajado(registro.turno)
        )

}

function motorHorasSemana(
    mapa,
    trabajador,
    fechaTexto,
    turnoNuevo = null
){

    const semana =
        motorInicioSemana(fechaTexto)

    const turnos =
        motorAsignacionesTrabajador(
            mapa,
            trabajador.id
        )
        .filter(registro =>
            motorInicioSemana(registro.fecha) === semana &&
            registro.fecha !== fechaTexto
        )
        .map(registro => registro.turno)

    if(turnoNuevo){
        turnos.push(turnoNuevo)
    }

    return calcularHorasSemana(
        turnos,
        colacionPorCeco(trabajador.ceco)
    )

}

function motorHorasMes(mapa, trabajador){

    return motorAsignacionesTrabajador(
        mapa,
        trabajador.id
    )
    .filter(registro =>
        registro.fecha.startsWith(
            `${anioActual}-${String(mesActual + 1).padStart(2, "0")}`
        )
    )
    .reduce(
        (total, registro) =>
            total + calcularHorasSemana(
                [registro.turno],
                colacionPorCeco(trabajador.ceco)
            ),
        0
    )

}

function motorEstadisticasEquidad(mapa, trabajador){

    const asignaciones =
        motorAsignacionesTrabajador(
            mapa,
            trabajador.id
        )
        .filter(registro =>
            registro.fecha.startsWith(
                `${anioActual}-${String(mesActual + 1).padStart(2, "0")}`
            )
        )

    let nocturnos = 0
    let domingos = 0

    asignaciones.forEach(registro => {

        const intervalo =
            intervaloDesdeTurno(
                registro.fecha,
                registro.turno
            )

        if(
            intervalo &&
            intervalo.fin.getDate() !== intervalo.inicio.getDate()
        ){
            nocturnos++
        }

        if(
            new Date(`${registro.fecha}T00:00:00`).getDay() === 0
        ){
            domingos++
        }

    })

    return {
        horas: motorHorasMes(mapa, trabajador),
        nocturnos,
        domingos
    }

}

function motorDescansoValido(
    mapa,
    trabajador,
    fechaTexto,
    turno
){

    const nuevo =
        intervaloDesdeTurno(
            fechaTexto,
            turno
        )

    if(!nuevo){ return false }

    const otros =
        motorAsignacionesTrabajador(
            mapa,
            trabajador.id
        )
        .filter(registro =>
            registro.fecha !== fechaTexto
        )
        .map(registro =>
            intervaloDesdeTurno(
                registro.fecha,
                registro.turno
            )
        )
        .filter(Boolean)

    for(const intervalo of otros){

        if(
            nuevo.inicio < intervalo.fin &&
            nuevo.fin > intervalo.inicio
        ){
            return false
        }

        if(intervalo.fin <= nuevo.inicio){

            const descanso =
                (nuevo.inicio - intervalo.fin) / 3600000

            if(
                descanso >= 0 &&
                descanso < MOTOR_DESCANSO_MINIMO_HORAS
            ){
                return false
            }

        }

        if(nuevo.fin <= intervalo.inicio){

            const descanso =
                (intervalo.inicio - nuevo.fin) / 3600000

            if(
                descanso >= 0 &&
                descanso < MOTOR_DESCANSO_MINIMO_HORAS
            ){
                return false
            }

        }

    }

    return true

}

function motorDiasConsecutivosValidos(
    mapa,
    trabajador,
    fechaTexto
){

    const fechas =
        new Set(
            motorAsignacionesTrabajador(
                mapa,
                trabajador.id
            )
            .map(registro => registro.fecha)
        )

    fechas.add(fechaTexto)

    const objetivo =
        new Date(`${fechaTexto}T00:00:00`)

    let consecutivos = 1

    for(let offset=1; offset<=MOTOR_MAX_DIAS_CONSECUTIVOS; offset++){

        const anterior =
            new Date(objetivo)

        anterior.setDate(
            anterior.getDate() - offset
        )

        if(!fechas.has(formatearFechaISO(anterior))){
            break
        }

        consecutivos++

    }

    for(let offset=1; offset<=MOTOR_MAX_DIAS_CONSECUTIVOS; offset++){

        const siguiente =
            new Date(objetivo)

        siguiente.setDate(
            siguiente.getDate() + offset
        )

        if(!fechas.has(formatearFechaISO(siguiente))){
            break
        }

        consecutivos++

    }

    return consecutivos <= MOTOR_MAX_DIAS_CONSECUTIVOS

}

function motorHorasValidas(
    mapa,
    trabajador,
    fechaTexto,
    turno
){

    // La jornada es por trabajador (campo `jornada` de la tabla). No hay cap
    // global: si jornada=45, el tope semanal es 45h. Si el dato viene vacío
    // caemos al valor por defecto de la constante como salvaguarda.
    const maximo =
        parseInt(trabajador.jornada) ||
        MOTOR_MAX_HORAS_LEGALES_SEMANA

    return motorHorasSemana(
        mapa,
        trabajador,
        fechaTexto,
        turno
    ) <= maximo

}

// Horas que aún le faltan al trabajador en la semana de `fechaTexto` para
// alcanzar su `jornada` semanal. Considera turnos manuales previos y los
// turnos ya agregados a la propuesta (que viven en `mapa`).
function motorHorasFaltantesSemana(
    mapa,
    trabajador,
    fechaTexto
){

    const maximo =
        parseInt(trabajador.jornada) ||
        MOTOR_MAX_HORAS_LEGALES_SEMANA

    return Math.max(
        0,
        maximo - motorHorasSemana(
            mapa,
            trabajador,
            fechaTexto
        )
    )

}

// Reglas de cobertura activas que aplican al trabajador en una fecha concreta
// (filtra por día de la semana y por `trabajadorCumpleRegla`). Devuelve un
// array vacío si no hay ninguna — en ese caso el top-up no se restringe.
function motorReglasAplicables(trabajador, fechaTexto){

    const diaSemana =
        indiceDiaSemanaLunes(
            new Date(`${fechaTexto}T00:00:00`)
        )

    return coberturaConfigGlobal.filter(regla =>
        regla.activo &&
        regla.dia_semana === diaSemana &&
        trabajadorCumpleRegla(trabajador, regla)
    )

}

// ¿El turno contiene el instante `hora` del día `fechaTexto`? El instante
// puede caer el mismo día o el siguiente (cierres que cruzan medianoche,
// p. ej. regla "09:00 - 03:00" donde cierre es a las 03:00 del día
// siguiente). inicio <= punto < fin (el punto debe quedar estrictamente
// dentro del turno, no puede ser exactamente el fin).
function motorTurnoCubreApertura(turno, fechaTexto, horaApertura){

    const intervalo = intervaloDesdeTurno(fechaTexto, turno)
    if(!intervalo){ return false }

    const [horas, minutos] =
        String(horaApertura || "").split(":").map(Number)

    if(Number.isNaN(horas) || Number.isNaN(minutos)){ return false }

    const mismoDia = new Date(`${fechaTexto}T00:00:00`)
    mismoDia.setHours(horas, minutos, 0, 0)

    if(
        intervalo.inicio <= mismoDia &&
        intervalo.fin > mismoDia
    ){
        return true
    }

    // Si no cae el mismo día, probar el siguiente (cierre que cruza
    // medianoche). El turno "16:30 - 03:00" en Mon cubre el cierre Tue 03:00.
    const diaSiguiente = new Date(mismoDia)
    diaSiguiente.setDate(diaSiguiente.getDate() + 1)

    return (
        intervalo.inicio <= diaSiguiente &&
        intervalo.fin > diaSiguiente
    )

}

// ¿El intervalo del turno se solapa con la ventana de la regla? Útil para
// verificar que un turno fijo "aporta" a la regla sin exigir que cubra un
// slot específico: si el turno se cruza con la ventana, está haciendo algo
// útil (cubre apertura, llega al cierre, etc.). Usa la regla estándar de
// solapamiento: inicioA < finB AND finA > inicioB.
function motorTurnoSeSolapaConRegla(turno, fechaTexto, regla){

    const intervalo = intervaloDesdeTurno(fechaTexto, turno)
    if(!intervalo){ return false }

    const inicioRegla = new Date(`${fechaTexto}T00:00:00`)
    const [hIni, mIni] = regla.hora_inicio.split(":").map(Number)
    if(Number.isNaN(hIni)){ return false }
    inicioRegla.setHours(hIni, mIni, 0, 0)

    const finRegla = new Date(`${fechaTexto}T00:00:00`)
    const [hFin, mFin] = regla.hora_fin.split(":").map(Number)
    if(Number.isNaN(hFin)){ return false }
    finRegla.setHours(hFin, mFin, 0, 0)
    if(finRegla <= inicioRegla){
        finRegla.setDate(finRegla.getDate() + 1)
    }

    return (
        intervalo.inicio < finRegla &&
        intervalo.fin > inicioRegla
    )

}

// Pool de turnos que el top-up puede usar respetando la cobertura del
// trabajador para esa fecha. Devuelve `null` cuando no hay reglas
// aplicables — en ese caso el top-up usa el catálogo completo (sin filtro).
// Cuando hay reglas, exige que el turno cubra la apertura de al menos una.
function motorTurnosCompatiblesConReglas(trabajador, fechaTexto){

    const reglas = motorReglasAplicables(trabajador, fechaTexto)
    if(reglas.length === 0){ return null }

    return motorTurnosDisponibles(trabajador.ceco).filter(turno =>
        reglas.some(regla =>
            motorTurnoCubreApertura(
                turno,
                fechaTexto,
                regla.hora_inicio
            )
        )
    )

}

// ¿Cuántos trabajadores (en `mapa`, que combina manual + propuesta) cubren
// el instante `hora` del día `fechaTexto`? Se usa para evitar sobre-cumplir
// minimo_inicio / minimo_fin al asignar turnos automáticos.
function motorContarCoberturaSlot(mapa, fechaTexto, hora){

    let count = 0

    for(const registro of mapa.values()){
        if(String(registro.fecha).slice(0, 10) !== fechaTexto){ continue }
        if(!motorTurnoCubreApertura(registro.turno, fechaTexto, hora)){ continue }
        count++
    }

    return count

}

// ¿El candidato `turno` cubre al menos un slot de las reglas que aún está
// bajo el mínimo? Si no, no aporta a la cobertura y se descarta (modo
// estricto). Considera tanto la apertura (hora_inicio / minimo_inicio) como
// el cierre (hora_fin / minimo_fin) de cada regla aplicable.
function motorTurnoCubreSlotSubcubierto(mapa, turno, fechaTexto, reglas){

    if(!reglas || reglas.length === 0){ return false }

    for(const regla of reglas){

        if(motorTurnoCubreApertura(turno, fechaTexto, regla.hora_inicio)){
            const count =
                motorContarCoberturaSlot(mapa, fechaTexto, regla.hora_inicio)
            if(count < regla.minimo_inicio){ return true }
        }

        if(motorTurnoCubreApertura(turno, fechaTexto, regla.hora_fin)){
            const count =
                motorContarCoberturaSlot(mapa, fechaTexto, regla.hora_fin)
            if(count < regla.minimo_fin){ return true }
        }

    }

    return false

}

// Elige el mejor turno disponible para acercar al trabajador a su jornada
// semanal sin pasarse. Si no hay turno que entre respetando descanso, días
// consecutivos y reglas de cobertura, devuelve null y el top-up salta el día.
function motorSeleccionarTurnoParaJornada(
    mapa,
    trabajador,
    fechaTexto,
    horasFaltantes
){

    if(horasFaltantes <= 0){ return null }

    const ceco = colacionPorCeco(trabajador.ceco)

    // Si hay reglas de cobertura aplicables, restringimos el pool a turnos
    // que cubran la apertura de alguna; si no, usamos todo el catálogo.
    const turnosPermitidos =
        motorTurnosCompatiblesConReglas(trabajador, fechaTexto)

    const pool =
        turnosPermitidos !== null
            ? turnosPermitidos
            : motorTurnosDisponibles(trabajador.ceco)

    const candidatos =
        pool
            .map(turno => ({
                turno,
                horas: calcularHorasSemana([turno], ceco)
            }))
            .filter(item =>
                item.horas > 0 &&
                item.horas <= horasFaltantes &&
                motorCandidatoValido(
                    mapa,
                    trabajador,
                    fechaTexto,
                    item.turno
                )
            )

    if(candidatos.length === 0){ return null }

    // Preferir el turno más largo que no se pase de las horas que faltan.
    candidatos.sort((a, b) => b.horas - a.horas)
    return candidatos[0].turno

}

function motorCandidatoValido(
    mapa,
    trabajador,
    fechaTexto,
    turno
){

    const clave =
        motorClaveAsignacion(
            trabajador.id,
            fechaTexto
        )

    const existente =
        mapa.get(
            clave
        )

    mapa.delete(clave)

    const valido =
        motorHorasValidas(
            mapa,
            trabajador,
            fechaTexto,
            turno
        ) &&
        motorDescansoValido(
            mapa,
            trabajador,
            fechaTexto,
            turno
        ) &&
        motorDiasConsecutivosValidos(
            mapa,
            trabajador,
            fechaTexto
        )

    if(existente){
        mapa.set(clave, existente)
    }

    return valido

}

function motorResumenSuficiencia(
    fechasEvaluadas,
    reglasEvaluadas,
    conflictos,
    topup = {}
){

    const conflictosCobertura =
        conflictos.filter(conflicto =>
            conflicto.tipo === "BRECHA_COBERTURA"
        )

    const reglasSinCubrir =
        new Set(
            conflictosCobertura.map(conflicto =>
                [
                    conflicto.fecha,
                    conflicto.cobertura,
                    conflicto.area,
                    conflicto.franja
                ].join("|")
            )
        )

    const semanasAlcanzadas =
        topup.semanas_alcanzadas || 0

    const semanasTotales =
        topup.semanas_totales || 0

    const topupAsignaciones =
        topup.topup_asignaciones || 0

    const mensajePersonal =
        conflictosCobertura.length === 0
            ? "El personal disponible permite cumplir la cobertura configurada."
            : "Se requiere más personal disponible o ajustar turnos para cumplir toda la cobertura."

    let mensajeJornada = ""
    if(semanasTotales > 0){
        const porcentaje =
            Math.round((semanasAlcanzadas / semanasTotales) * 100)
        mensajeJornada =
            semanasAlcanzadas === semanasTotales
                ? `Top-up completado: ${semanasAlcanzadas}/${semanasTotales} ` +
                  `pares (trabajador × semana) alcanzaron su jornada.`
                : `Top-up parcial: ${semanasAlcanzadas}/${semanasTotales} ` +
                  `pares (${porcentaje}%) alcanzaron su jornada. El resto ` +
                  `no tiene días libres donde encajar un turno válido.`
    }

    return {
        fechas_evaluadas: fechasEvaluadas,
        reglas_evaluadas: reglasEvaluadas,
        reglas_cubiertas:
            Math.max(0, reglasEvaluadas - reglasSinCubrir.size),
        reglas_sin_cubrir: reglasSinCubrir.size,
        personal_suficiente:
            conflictosCobertura.length === 0,
        semanas_alcanzadas: semanasAlcanzadas,
        semanas_totales: semanasTotales,
        topup_asignaciones: topupAsignaciones,
        diagnostico: topup.diagnostico || {
            jornada_baja: [],
            sin_dias: [],
            parcial: [],
            parcial_por_cobertura: []
        },
        no_rotativos: topup.no_rotativos || [],
        conflictos_turno_fijo: topup.conflictos_turno_fijo || [],
        mensaje: mensajePersonal,
        mensaje_jornada: mensajeJornada
    }

}

function motorBrechasRegla(
    mapa,
    trabajadores,
    regla,
    fechaTexto
){

    const requerido =
        intervaloDesdeHora(
            new Date(`${fechaTexto}T00:00:00`),
            regla.hora_inicio,
            regla.hora_fin
        )

    if(!requerido){ return null }

    const intervalos =
        trabajadores.map(trabajador => {

            if(!trabajadorCumpleRegla(trabajador, regla)){
                return null
            }

            const registro =
                mapa.get(
                    motorClaveAsignacion(
                        trabajador.id,
                        fechaTexto
                    )
                )

            if(!registro){ return null }

            return intervaloDesdeTurno(
                    fechaTexto,
                    registro.turno
                )

        })
        .filter(Boolean)

    return calcularBrechasIntervalo(
        requerido,
        intervalos,
        regla.minimo_inicio ?? regla.minimo_personas,
        regla.minimo_fin ?? regla.minimo_personas
    )

}

function motorTurnoFijoDelDia(trabajador, fechaTexto){

    if(!trabajador.turnos_fijos || trabajador.turnos_fijos.length === 0){
        return null
    }

    const dia =
        indiceDiaSemanaLunes(
            new Date(`${fechaTexto}T00:00:00`)
        )

    const encontrado = trabajador.turnos_fijos.find(
        tf => tf.dia_semana === dia
    )

    return encontrado ? String(encontrado.turno || "").trim() || null : null
}

function motorEsFijo(trabajador){

    return (
        !trabajador.turno_rotativo &&
        Array.isArray(trabajador.turnos_fijos) &&
        trabajador.turnos_fijos.length > 0
    )

}

function motorSeleccionarCandidato(
    mapa,
    candidatos,
    turnosRotativos,
    fechaTexto
){

    const opciones = []

    candidatos.forEach(trabajador => {

        // Si el trabajador es fijo, el turno a evaluar es el del día
        // concreto (turno_fijo por día de la semana). El parámetro
        // `turnosRotativos` se ignora para él.
        const turnoFijo =
            motorTurnoFijoDelDia(trabajador, fechaTexto)

        const esFijo =
            motorEsFijo(trabajador) &&
            turnoFijo !== null

        const turnosFrecuentesCeco =
            motorTurnosDisponibles(trabajador.ceco)

        const turnos = esFijo
            ? [turnoFijo]
            : turnosRotativos.filter(turno =>
                turnosFrecuentesCeco.includes(turno)
            )

        turnos.forEach(turno => {

            if(
                !motorCandidatoValido(
                    mapa,
                    trabajador,
                    fechaTexto,
                    turno
                )
            ){
                return
            }

            const existente =
                mapa.get(
                    motorClaveAsignacion(
                        trabajador.id,
                        fechaTexto
                    )
                )

            const equidad =
                motorEstadisticasEquidad(
                    mapa,
                    trabajador
                )

            const intervalo =
                intervaloDesdeTurno(
                    fechaTexto,
                    turno
                )

            const nocturno =
                intervalo &&
                intervalo.fin.getDate() !== intervalo.inicio.getDate()

            const horasTurno =
                calcularHorasSemana(
                    [turno],
                    colacionPorCeco(trabajador.ceco)
                )

            const modificaExistente =
                existente &&
                motorEsTurnoTrabajado(existente.turno)

            opciones.push({
                trabajador,
                turno,
                score:
                    equidad.horas +
                    horasTurno +
                    (equidad.nocturnos * 4) +
                    (equidad.domingos * 6) +
                    (nocturno ? 2 : 0) +
                    (modificaExistente ? 3 : 0)
            })

        })

    })

    opciones.sort((a, b) =>
        a.score - b.score ||
        a.trabajador.nombre.localeCompare(
            b.trabajador.nombre
        )
    )

    return opciones[0] || null

}

function motorCrearConflicto(regla, fecha, detalle){

    return {
        tipo: "BRECHA_COBERTURA",
        fecha,
        area: regla.valor,
        cobertura: regla.tipo,
        franja: `${regla.hora_inicio} - ${regla.hora_fin}`,
        requerido: regla.minimo_personas,
        detalle
    }

}

function construirPropuestaPlanificacionAutomatica(){

    const trabajadores =
        filtrarPorCargos(
            trabajadoresGlobal
        )
        .filter(t => t.activo !== false)
        // Solo los rotativos y los fijos con al menos un turno fijo definido
        // entran al motor. Un fijo sin turnos fijos queda fuera (sus turnos
        // manuales se conservan, igual que antes).
        .filter(t =>
            t.turno_rotativo !== false ||
            motorEsFijo(t)
        )

    const reglas =
        motorReglasActivas()

    const mapa =
        motorMapaPlanificacionActual()

    const asignaciones = []
    const conflictos = []
    let reglasEvaluadas = 0

    if(trabajadores.length === 0){
        conflictos.push({
            tipo: "SIN_COLABORADORES",
            detalle: "No hay colaboradores para el filtro de cargo seleccionado."
        })
    }

    if(reglas.length === 0){
        conflictos.push({
            tipo: "SIN_REGLAS_COBERTURA",
            detalle: "No existen reglas de cobertura activas."
        })
    }

    motorFechasDelMes().forEach(fechaTexto => {

        const diaSemana =
            indiceDiaSemanaLunes(
                new Date(`${fechaTexto}T00:00:00`)
            )

        reglas
            .filter(regla =>
                regla.dia_semana === diaSemana
            )
            .forEach(regla => {

                reglasEvaluadas++

                const candidatosRegla =
                    trabajadores.filter(trabajador =>
                        trabajadorCumpleRegla(
                            trabajador,
                            regla
                        )
                    )

                if(candidatosRegla.length === 0){

                    if(
                        !window.cargosSeleccionados ||
                        window.cargosSeleccionados.length === 0
                    ){
                        conflictos.push(
                            motorCrearConflicto(
                                regla,
                                fechaTexto,
                                "No existen colaboradores compatibles con esta regla."
                            )
                        )
                    }

                    return
                }

                let brechas =
                    motorBrechasRegla(
                        mapa,
                        trabajadoresGlobal,
                        regla,
                        fechaTexto
                    )

                if(brechas === null){
                    conflictos.push(
                        motorCrearConflicto(
                            regla,
                            fechaTexto,
                            "La regla contiene un horario inválido."
                        )
                    )
                    return
                }

                let intentos = 0

                while(brechas.length > 0){

                    intentos++

                    if(intentos > candidatosRegla.length){
                        conflictos.push(
                            motorCrearConflicto(
                                regla,
                                fechaTexto,
                                "No fue posible cerrar todas las brechas con el personal disponible."
                            )
                        )
                        break
                    }

                    const brecha =
                        brechas[0]

                    const turnos =
                        motorTurnosParaBrecha(
                            fechaTexto,
                            brecha,
                            regla
                        )

                    if(turnos.length === 0){
                        conflictos.push(
                            motorCrearConflicto(
                                regla,
                                fechaTexto,
                                `No existe un turno que cubra la brecha ` +
                                `${etiquetaPuntoBrecha(brecha)}.`
                            )
                        )
                        break
                    }

                    const seleccion =
                        motorSeleccionarCandidato(
                            mapa,
                            candidatosRegla,
                            turnos,
                            fechaTexto
                        )

                    if(!seleccion){
                        conflictos.push(
                            motorCrearConflicto(
                                regla,
                                fechaTexto,
                                `Brecha ${etiquetaPuntoBrecha(brecha)}. ` +
                                "No quedan candidatos que cumplan descanso, horas y días consecutivos."
                            )
                        )
                        break
                    }

                    const horas =
                        calcularHorasSemana(
                            [seleccion.turno],
                            colacionPorCeco(
                                seleccion.trabajador.ceco
                            )
                        )

                    const claveAsignacion =
                        motorClaveAsignacion(
                            seleccion.trabajador.id,
                            fechaTexto
                        )

                    const existente =
                        mapa.get(claveAsignacion)

                    const asignacion = {
                        trabajador_id:
                            seleccion.trabajador.id,
                        responsable:
                            seleccion.trabajador.responsable || "",
                        fecha: fechaTexto,
                        turno: seleccion.turno,
                        horas,
                        trabajador:
                            seleccion.trabajador.nombre,
                        cargo:
                            seleccion.trabajador.cargo,
                        regla:
                            `${regla.tipo.toUpperCase()} ${regla.valor}`,
                        turno_anterior:
                            existente ? existente.turno : "",
                        accion:
                            existente &&
                            motorEsTurnoTrabajado(existente.turno)
                                ? "modificar"
                                : "crear"
                    }

                    mapa.set(
                        claveAsignacion,
                        {
                            ...asignacion,
                            origen: "propuesta"
                        }
                    )

                    const indiceExistente =
                        asignaciones.findIndex(item =>
                            item.trabajador_id === asignacion.trabajador_id &&
                            item.fecha === asignacion.fecha
                        )

                    if(indiceExistente >= 0){
                        asignaciones[indiceExistente] =
                            asignacion
                    }else{
                        asignaciones.push(asignacion)
                    }

                    brechas =
                        motorBrechasRegla(
                            mapa,
                            trabajadoresGlobal,
                            regla,
                            fechaTexto
                        )

                }

            })

    })

    // =====================================================
    // TOP-UP: completar la jornada respetando cobertura estricta
    // =====================================================
    // Tras cubrir las brechas de cobertura, recorremos los trabajadores y
    // agregamos turnos en los días aún vacíos hasta acercar a cada uno a su
    // `jornada` semanal. Restricciones:
    //   - Solo asigna en días con reglas aplicables al CECO/cargo del
    //     trabajador (no se rellenan días sin regla).
    //   - El turno debe cubrir al menos un slot (apertura o cierre) que aún
    //     esté bajo minimo_inicio / minimo_fin: no sobrecubre.
    //   - Para fijos con turnos_fijos: usa el turno del día concreto (puede
    //     ser distinto por día). Si el día no tiene turno fijo definido,
    //     no se asigna nada.
    //   - Para rotativos: usa motorSeleccionarTurnoParaJornada.
    //   - Los turnos manuales ya presentes viven en `mapa`.
    const fechasDelMes = motorFechasDelMes()
    const semanasDelMes = [
        ...new Set(fechasDelMes.map(motorInicioSemana))
    ].sort()

    let topupAsignaciones = 0
    let semanasAlcanzadas = 0
    let semanasTotales = 0

    trabajadores.forEach(trabajador => {

        const objetivo =
            parseInt(trabajador.jornada) ||
            MOTOR_MAX_HORAS_LEGALES_SEMANA

        const esFijo = motorEsFijo(trabajador)

        semanasDelMes.forEach(inicioSemana => {

            semanasTotales++

            const fechasSemana =
                fechasDelMes
                    .filter(f => motorInicioSemana(f) === inicioSemana)
                    .sort()

            let horasFaltantes =
                motorHorasFaltantesSemana(
                    mapa,
                    trabajador,
                    `${inicioSemana}T00:00:00`
                )

            for(const fechaTexto of fechasSemana){

                if(horasFaltantes <= 0){ break }

                // Modo estricto: solo se asigna en días donde el trabajador
                // tenga al menos una regla aplicable.
                const reglas =
                    motorReglasAplicables(trabajador, fechaTexto)

                if(reglas.length === 0){ continue }

                const claveFecha =
                    motorClaveAsignacion(
                        trabajador.id,
                        fechaTexto
                    )

                const registroExistente =
                    mapa.get(claveFecha)

                // Si ya tiene un turno real o un estado intencional
                // (Saliente / Vacaciones) lo respetamos. Los días marcados
                // como "Libre" (o vacíos) se consideran no asignados y el
                // top-up los puede sobrescribir para alcanzar la jornada.
                if(
                    registroExistente &&
                    !motorEsNoAsignado(registroExistente.turno)
                ){
                    continue
                }

                const turno = esFijo
                    ? motorTurnoFijoDelDia(trabajador, fechaTexto)
                    : motorSeleccionarTurnoParaJornada(
                        mapa,
                        trabajador,
                        fechaTexto,
                        horasFaltantes
                    )

                if(!turno){ continue }

                // Filtro de cobertura:
                //   - Rotativos: deben aportar a un slot bajo minimo (modo
                //     estricto anti-sobre-cobertura, pedido por el usuario).
                //   - Fijos: el usuario configuró explícitamente este turno por
                //     día, así que se asigna sin chequear sobre-cobertura. Solo
                //     verificamos que el turno se solape con la ventana de
                //     alguna regla aplicable (si no, el turno está mal
                //     configurado para esa regla).
                let pasaFiltroCobertura = false

                if(esFijo){
                    pasaFiltroCobertura = reglas.some(regla =>
                        motorTurnoSeSolapaConRegla(
                            turno,
                            fechaTexto,
                            regla
                        )
                    )
                }else{
                    pasaFiltroCobertura = motorTurnoCubreSlotSubcubierto(
                        mapa,
                        turno,
                        fechaTexto,
                        reglas
                    )
                }

                if(!pasaFiltroCobertura){ continue }

                // Verificación legal unificada (rotativos y fijos): cap de
                // horas por jornada, descanso mínimo de 12h, máximo 6 días
                // consecutivos. Para rotativos esto ya se chequeó dentro de
                // motorSeleccionarTurnoParaJornada (filtro de candidatos),
                // pero para fijos es crítico: motorTurnoFijoDelDia solo lee
                // la configuración, no valida. Sin este check un fijo podría
                // acumular más horas que su jornada semanal (o romper
                // descanso si su configuración lo permite).
                if(!motorCandidatoValido(
                    mapa,
                    trabajador,
                    fechaTexto,
                    turno
                )){
                    continue
                }

                const horas =
                    calcularHorasSemana(
                        [turno],
                        colacionPorCeco(trabajador.ceco)
                    )

                const asignacion = {
                    trabajador_id: trabajador.id,
                    responsable: trabajador.responsable || "",
                    fecha: fechaTexto,
                    turno,
                    horas,
                    trabajador: trabajador.nombre,
                    cargo: trabajador.cargo,
                    regla: esFijo
                        ? "Turno fijo"
                        : "Top-up jornada",
                    turno_anterior: registroExistente
                        ? registroExistente.turno
                        : "",
                    accion: registroExistente
                        ? "modificar"
                        : "crear"
                }

                mapa.set(
                    claveFecha,
                    {
                        ...asignacion,
                        origen: "topup"
                    }
                )

                asignaciones.push(asignacion)

                topupAsignaciones++

                horasFaltantes -= horas

            }

            // Cuenta la semana como alcanzada si quedó ≥ 95% del objetivo
            // (tolerancia para redondeos de colación o turnos que se pasan
            // ligeramente del target).
            const horasFinales =
                objetivo -
                motorHorasFaltantesSemana(
                    mapa,
                    trabajador,
                    `${inicioSemana}T00:00:00`
                )

            if(horasFinales >= objetivo * 0.95){
                semanasAlcanzadas++
            }

        })

    })

    // =====================================================
    // DIAGNÓSTICO: explicar por qué un rotativo quedó sin completar
    // =====================================================
    // Tres causas principales por las que un rotativo puede terminar con 0
    // turnos o con jornada parcial: jornada menor que el turno más corto del
    // catálogo, todos sus días ocupados (Libre o con turnos manuales), o
    // simplemente no se llegó al target por restricciones legales. Estos
    // datos se muestran en el modal para que el operador sepa qué corregir.
    const turnosCatalogo = motorTurnosDisponibles()
    const horasTurnoMasCorto = turnosCatalogo.length > 0
        ? turnosCatalogo
            .map(t => calcularHorasSemana([t], 0))
            .filter(h => h > 0)
            .reduce((min, h) => Math.min(min, h), Infinity)
        : Infinity

    const diagnosticoTrabajadores = {
        jornada_baja: [],
        sin_dias: [],
        parcial: [],
        parcial_por_cobertura: []
    }

    trabajadores.forEach(trabajador => {

        const objetivo =
            parseInt(trabajador.jornada) ||
            MOTOR_MAX_HORAS_LEGALES_SEMANA

        const asignacionesDel =
            asignaciones.filter(a =>
                a.trabajador_id === trabajador.id
            ).length

        let horasMes = 0
        semanasDelMes.forEach(inicioSemana => {
            horasMes += objetivo -
                motorHorasFaltantesSemana(
                    mapa,
                    trabajador,
                    `${inicioSemana}T00:00:00`
                )
        })

        const targetMensual = objetivo * semanasDelMes.length

        // ¿Hay al menos una regla de cobertura aplicable a este trabajador
        // durante el mes? Si la hay y quedó parcial, lo más probable es que
        // el catálogo de turnos no tenga un candidato compatible que entre
        // en las horas que le faltan. Esa categoría la separamos para
        // distinguirla de la "parcial por simple redondeo de horas".
        let tieneReglasEnElMes = false
        for(const fecha of fechasDelMes){
            if(motorReglasAplicables(trabajador, fecha).length > 0){
                tieneReglasEnElMes = true
                break
            }
        }

        if(objetivo < horasTurnoMasCorto){
            diagnosticoTrabajadores.jornada_baja.push({
                id: trabajador.id,
                nombre: trabajador.nombre,
                jornada: objetivo,
                minimo_turno: horasTurnoMasCorto
            })
        }else if(asignacionesDel === 0){
            diagnosticoTrabajadores.sin_dias.push({
                id: trabajador.id,
                nombre: trabajador.nombre,
                jornada: objetivo
            })
        }else if(horasMes < targetMensual * 0.95){
            const item = {
                id: trabajador.id,
                nombre: trabajador.nombre,
                horas: horasMes,
                jornada: objetivo,
                semanas: semanasDelMes.length
            }
            if(tieneReglasEnElMes){
                diagnosticoTrabajadores.parcial_por_cobertura.push(item)
            }else{
                diagnosticoTrabajadores.parcial.push(item)
            }
        }

    })

    // "Excluidos" son solo los no_rotativos SIN turnos fijos (los fijos con
    // al menos un turno fijo entran al motor y se ven reflejados en sus
    // asignaciones).
    const noRotativos = trabajadoresGlobal
        .filter(t => !motorEsFijo(t) && t.turno_rotativo === false)
        .map(t => ({
            id: t.id,
            nombre: t.nombre,
            cargo: t.cargo || "Sin cargo"
        }))

    // Conflictos entre la propuesta y el turno_fijo configurado. Útil para
    // detectar drift cuando una asignación manual o de cobertura difiere del
    // horario que el usuario configuró explícitamente para el fijo.
    const conflictosTurnoFijo = []

    trabajadores.forEach(trabajador => {

        if(!motorEsFijo(trabajador)){ return }

        const configPorDia = new Map()
        ;(trabajador.turnos_fijos || []).forEach(tf => {
            configPorDia.set(tf.dia_semana, tf.turno)
        })

        if(configPorDia.size === 0){ return }

        const detalles = []

        asignaciones.forEach(a => {

            if(a.trabajador_id !== trabajador.id){ return }

            const dia =
                indiceDiaSemanaLunes(
                    new Date(`${a.fecha}T00:00:00`)
                )

            const turnoEsperado = configPorDia.get(dia)

            if(
                turnoEsperado &&
                String(a.turno || "").trim() !==
                    String(turnoEsperado).trim()
            ){
                detalles.push({
                    fecha: a.fecha,
                    esperado: turnoEsperado,
                    actual: a.turno
                })
            }

        })

        if(detalles.length > 0){
            conflictosTurnoFijo.push({
                id: trabajador.id,
                nombre: trabajador.nombre,
                jornada: parseInt(trabajador.jornada) || 0,
                detalles
            })
        }

    })

    const resumenSuficiencia =
        motorResumenSuficiencia(
            fechasDelMes.length,
            reglasEvaluadas,
            conflictos,
            {
                semanas_alcanzadas: semanasAlcanzadas,
                semanas_totales: semanasTotales,
                topup_asignaciones: topupAsignaciones,
                diagnostico: diagnosticoTrabajadores,
                no_rotativos: noRotativos,
                conflictos_turno_fijo: conflictosTurnoFijo
            }
        )

    return {
        estado: "PENDIENTE_APROBACION",
        mes: mesActual,
        anio: anioActual,
        cargos:
            [...(window.cargosSeleccionados || [])],
        asignaciones,
        conflictos,
        suficiencia: resumenSuficiencia,
        generado_en:
            new Date().toISOString()
    }

}

function motorCrearModal(){

    let modal =
        document.getElementById(
            "modal-planificacion-automatica"
        )

    if(modal){ return modal }

    modal =
        document.createElement("div")

    modal.id =
        "modal-planificacion-automatica"

    modal.className =
        "fixed inset-0 z-[80] hidden items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"

    modal.innerHTML = `
        <div class="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div class="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
                    <p class="text-xs font-black uppercase tracking-widest text-blue-600">
                        Motor de asignación
                    </p>
                    <h2 class="mt-1 text-xl font-black text-slate-900">
                        Propuesta de planificación automática
                    </h2>
                </div>
                <button type="button"
                    onclick="cerrarPropuestaPlanificacionAutomatica()"
                    class="rounded-xl p-2 text-slate-500 hover:bg-slate-100">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>

            <div id="contenido-propuesta-automatica"
                class="flex-1 overflow-auto p-6"></div>

            <div class="flex flex-col-reverse gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:justify-end">
                <button type="button"
                    onclick="cerrarPropuestaPlanificacionAutomatica()"
                    class="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700 hover:bg-slate-50">
                    Cancelar
                </button>
                <button type="button"
                    id="btn-aprobar-planificacion-automatica"
                    onclick="aprobarPlanificacionAutomatica()"
                    class="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                    Aprobar y aplicar
                </button>
            </div>
        </div>
    `

    document.body.appendChild(modal)

    return modal

}

function motorRenderDiagnostico(diagnostico, noRotativos, conflictosTurnoFijo){

    const totalCategorias =
        (diagnostico.jornada_baja?.length || 0) +
        (diagnostico.sin_dias?.length || 0) +
        (diagnostico.parcial?.length || 0) +
        (diagnostico.parcial_por_cobertura?.length || 0) +
        (noRotativos?.length || 0) +
        (conflictosTurnoFijo?.length || 0)

    if(totalCategorias === 0){
        return ""
    }

    const seccionCategoria = (titulo, icono, tono, items, formatear) => {

        if(!items || items.length === 0){ return "" }

        const tonos = {
            amber: {
                caja: "border-amber-200 bg-amber-50/70 text-amber-800",
                chip: "bg-amber-200 text-amber-900"
            },
            slate: {
                caja: "border-slate-200 bg-slate-50 text-slate-700",
                chip: "bg-slate-200 text-slate-700"
            },
            red: {
                caja: "border-red-200 bg-red-50/70 text-red-800",
                chip: "bg-red-200 text-red-900"
            },
            blue: {
                caja: "border-blue-200 bg-blue-50/70 text-blue-800",
                chip: "bg-blue-200 text-blue-900"
            },
            indigo: {
                caja: "border-indigo-200 bg-indigo-50/70 text-indigo-800",
                chip: "bg-indigo-200 text-indigo-900"
            }
        }

        const estilo = tonos[tono] || tonos.slate

        const filas = items.map(item => `
            <li class="flex items-start justify-between gap-3 py-1">
                <span class="font-semibold">${escaparHTML(item.nombre)}</span>
                <span class="text-xs font-semibold ${estilo.chip} rounded-full px-2 py-0.5 whitespace-nowrap">
                    ${escaparHTML(formatear(item))}
                </span>
            </li>
        `).join("")

        return `
            <div class="rounded-2xl border ${estilo.caja} p-4 text-sm">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined">${icono}</span>
                    <p class="font-black">${escaparHTML(titulo)} (${items.length})</p>
                </div>
                <ul class="mt-2 space-y-1">${filas}</ul>
            </div>
        `

    }

    const partes = [
        seccionCategoria(
            "Excluidos por turno fijo",
            "lock",
            "slate",
            noRotativos,
            item => item.cargo || "Turno manual"
        ),
        seccionCategoria(
            "Jornada menor al turno mínimo",
            "straighten",
            "amber",
            diagnostico.jornada_baja,
            item =>
                `${item.jornada}h vs mín ${item.minimo_turno.toFixed(1)}h`
        ),
        seccionCategoria(
            "Sin días disponibles",
            "event_busy",
            "red",
            diagnostico.sin_dias,
            item => `Jornada ${item.jornada}h`
        ),
        seccionCategoria(
            "Parcial por cobertura",
            "rule",
            "indigo",
            diagnostico.parcial_por_cobertura,
            item =>
                `${item.horas.toFixed(1)}h de ${item.jornada * item.semanas}h`
        ),
        seccionCategoria(
            "Jornada parcial",
            "schedule",
            "blue",
            diagnostico.parcial,
            item =>
                `${item.horas.toFixed(1)}h de ${item.jornada * item.semanas}h`
        )
    ].filter(Boolean)

    // Sección aparte para los conflictos entre la propuesta y el turno fijo
    // configurado (cada conflicto tiene varios días con detalle).
    const conflictosFijoHtml =
        !conflictosTurnoFijo || conflictosTurnoFijo.length === 0
            ? ""
            : `
                <div class="md:col-span-2 rounded-2xl border border-orange-200 bg-orange-50/70 text-orange-800 p-4 text-sm">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined">rule</span>
                        <p class="font-black">Conflictos con turno fijo configurado (${conflictosTurnoFijo.length})</p>
                    </div>
                    <p class="mt-1 text-xs">
                        Estas asignaciones difieren del horario que configuraste
                        explícitamente para el trabajador fijo. Podés revisar la
                        tabla de Asignaciones para corregir manualmente o
                        rechazar la propuesta.
                    </p>
                    <div class="mt-3 space-y-3">
                        ${conflictosTurnoFijo.map(c => `
                            <div>
                                <p class="font-bold">
                                    ${escaparHTML(c.nombre)}
                                </p>
                                <ul class="mt-1 space-y-0.5">
                                    ${c.detalles.map(d => `
                                        <li class="text-xs flex items-start gap-2">
                                            <span class="font-mono">${escaparHTML(d.fecha)}</span>
                                            <span class="text-orange-700/70">→</span>
                                            <span>
                                                esperaba
                                                <code class="bg-orange-100 px-1 py-0.5 rounded font-bold">${escaparHTML(d.esperado)}</code>
                                                ·
                                                tiene
                                                <code class="bg-orange-100 px-1 py-0.5 rounded font-bold">${escaparHTML(d.actual)}</code>
                                            </span>
                                        </li>
                                    `).join("")}
                                </ul>
                            </div>
                        `).join("")}
                    </div>
                </div>
            `

    return `
        <section class="mt-4">
            <h3 class="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">
                Diagnóstico por trabajador
            </h3>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                ${partes.join("")}
            </div>
        </section>
    `

}

// Genera el HTML de las filas de la tabla de asignaciones. Vive fuera de
// `motorRenderizarPropuesta` para que el buscador pueda re-pintar solo el
// <tbody> cuando el usuario tipea, sin tocar el resto del modal.
function motorFilasAsignaciones(asignaciones){

    if(!asignaciones || asignaciones.length === 0){
        return `
            <tr>
                <td colspan="6" class="p-8 text-center text-slate-500">
                    No hay asignaciones que coincidan con el filtro.
                </td>
            </tr>
        `
    }

    return asignaciones
        .slice()
        .sort((a, b) =>
            a.fecha.localeCompare(b.fecha) ||
            a.trabajador.localeCompare(b.trabajador)
        )
        .map(asignacion => `
            <tr class="border-t border-slate-100">
                <td class="p-3 font-semibold text-slate-800">
                    ${escaparHTML(asignacion.trabajador)}
                </td>
                <td class="p-3 text-slate-600">
                    ${escaparHTML(asignacion.cargo || "Sin cargo")}
                </td>
                <td class="p-3 text-slate-600">
                    ${escaparHTML(asignacion.fecha)}
                </td>
                <td class="p-3 text-center font-bold text-blue-700">
                    ${escaparHTML(asignacion.turno)}
                    ${
                        asignacion.turno_anterior
                            ? `<div class="mt-1 text-xs font-semibold text-slate-400">
                                Antes: ${escaparHTML(asignacion.turno_anterior)}
                            </div>`
                            : ""
                    }
                </td>
                <td class="p-3 text-center text-slate-600">
                    ${asignacion.horas}h
                </td>
                <td class="p-3 text-center">
                    <span class="rounded-full px-2 py-1 text-xs font-bold ${
                        asignacion.accion === "modificar"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                    }">
                        ${
                            asignacion.accion === "modificar"
                                ? "Modifica"
                                : "Nueva"
                        }
                    </span>
                </td>
            </tr>
        `)
        .join("")

}

// Genera el HTML del bloque de conflictos. Misma razón que las filas:
// el buscador lo re-pinta sin tocar el resto del modal.
function motorBloqueConflictos(conflictos){

    if(!conflictos || conflictos.length === 0){
        return `
            <div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                No se detectaron conflictos de cobertura que coincidan con el filtro.
            </div>
        `
    }

    return conflictos.map(conflicto => `
        <div class="rounded-2xl border border-red-200 bg-red-50 p-4">
            <div class="flex items-start gap-3">
                <span class="material-symbols-outlined text-red-600">
                    warning
                </span>
                <div>
                    <h4 class="font-black text-red-800">
                        ${escaparHTML(conflicto.tipo)}
                    </h4>
                    <p class="mt-1 text-sm text-red-700">
                        ${escaparHTML(
                            [
                                conflicto.fecha,
                                conflicto.cobertura,
                                conflicto.area,
                                conflicto.franja
                            ]
                            .filter(Boolean)
                            .join(" · ")
                        )}
                    </p>
                    <p class="mt-1 text-sm text-slate-700">
                        ${escaparHTML(conflicto.detalle)}
                    </p>
                </div>
            </div>
        </div>
    `).join("")

}

// Filtra una asignación por el query normalizado: nombre, cargo, ceco y área
// del trabajador.
function motorAsignacionCoincide(asignacion, queryNorm){

    if(!queryNorm){ return true }

    const t =
        trabajadoresGlobal.find(x => x.id === asignacion.trabajador_id)

    const searchable = normalizarTexto(
        [
            asignacion.trabajador,
            asignacion.cargo,
            t?.ceco,
            t?.area
        ]
        .filter(Boolean)
        .join(" | ")
    )

    return searchable.includes(queryNorm)

}

function motorConflictoCoincide(conflicto, queryNorm){

    if(!queryNorm){ return true }

    const searchable = normalizarTexto(
        [
            conflicto.fecha,
            conflicto.cobertura,
            conflicto.area,
            conflicto.franja,
            conflicto.detalle
        ]
        .filter(Boolean)
        .join(" | ")
    )

    return searchable.includes(queryNorm)

}

// Re-pinta la tabla de asignaciones y el bloque de conflictos según el
// contenido del input de búsqueda. La propuesta viva vive en la global
// `propuestaPlanificacionAutomatica`.
function motorFiltrarPropuestaAutomatica(){

    const propuesta = propuestaPlanificacionAutomatica
    if(!propuesta){ return }

    const input =
        document.getElementById("busqueda-propuesta-automatica")

    const queryNorm =
        normalizarTexto(input ? input.value : "")

    const asignaciones =
        propuesta.asignaciones.filter(a =>
            motorAsignacionCoincide(a, queryNorm)
        )

    const conflictos =
        propuesta.conflictos.filter(c =>
            motorConflictoCoincide(c, queryNorm)
        )

    const tbody =
        document.getElementById("tbody-propuesta-asignaciones")

    if(tbody){
        tbody.innerHTML = motorFilasAsignaciones(asignaciones)
    }

    const contenedor =
        document.getElementById("contenedor-propuesta-conflictos")

    if(contenedor){
        contenedor.innerHTML = motorBloqueConflictos(conflictos)
    }

    const contador =
        document.getElementById("contador-propuesta-asignaciones")

    if(contador){
        contador.textContent =
            `${asignaciones.length} / ${propuesta.asignaciones.length}`
    }

}

function motorRenderizarPropuesta(propuesta){

    const modal =
        motorCrearModal()

    const contenido =
        modal.querySelector(
            "#contenido-propuesta-automatica"
        )

    const cargo =
        propuesta.cargos.length > 0
            ? propuesta.cargos.join(", ")
            : "Todos los cargos"

    const filasAsignaciones =
        motorFilasAsignaciones(propuesta.asignaciones)

    const suficiencia =
        propuesta.suficiencia || {
            reglas_evaluadas: 0,
            reglas_cubiertas: 0,
            reglas_sin_cubrir: 0,
            personal_suficiente: propuesta.conflictos.length === 0,
            semanas_alcanzadas: 0,
            semanas_totales: 0,
            topup_asignaciones: 0,
            diagnostico: {
                jornada_baja: [],
                sin_dias: [],
                parcial: [],
                parcial_por_cobertura: []
            },
            no_rotativos: [],
            conflictos_turno_fijo: [],
            mensaje:
                propuesta.conflictos.length === 0
                    ? "El personal disponible permite cumplir la cobertura configurada."
                    : "Se requiere más personal disponible o ajustar turnos para cumplir toda la cobertura.",
            mensaje_jornada: ""
        }

    const diagnostico = suficiencia.diagnostico || {
        jornada_baja: [],
        sin_dias: [],
        parcial: [],
        parcial_por_cobertura: []
    }
    const noRotativos = suficiencia.no_rotativos || []
    const conflictosTurnoFijo = suficiencia.conflictos_turno_fijo || []

    const asignacionesModificadas =
        propuesta.asignaciones.filter(asignacion =>
            asignacion.accion === "modificar"
        ).length

    const asignacionesNuevas =
        propuesta.asignaciones.length - asignacionesModificadas

    const conflictos =
        motorBloqueConflictos(propuesta.conflictos)

    contenido.innerHTML = `
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div class="rounded-2xl bg-blue-50 p-4">
                <p class="text-xs font-black uppercase text-blue-600">Estado</p>
                <p class="mt-1 font-black text-slate-900">Pendiente de aprobación</p>
            </div>
            <div class="rounded-2xl bg-emerald-50 p-4">
                <p class="text-xs font-black uppercase text-emerald-600">Asignaciones</p>
                <p class="mt-1 text-2xl font-black text-slate-900">
                    ${propuesta.asignaciones.length}
                </p>
            </div>
            <div class="rounded-2xl bg-violet-50 p-4">
                <p class="text-xs font-black uppercase text-violet-600">Cambios</p>
                <p class="mt-1 text-sm font-black text-slate-900">
                    ${asignacionesNuevas} nuevas · ${asignacionesModificadas} modificadas
                </p>
            </div>
            <div class="rounded-2xl bg-amber-50 p-4">
                <p class="text-xs font-black uppercase text-amber-600">Conflictos</p>
                <p class="mt-1 text-2xl font-black text-slate-900">
                    ${propuesta.conflictos.length}
                </p>
            </div>
            <div class="rounded-2xl bg-indigo-50 p-4">
                <p class="text-xs font-black uppercase text-indigo-600">Jornada semanal</p>
                <p class="mt-1 text-2xl font-black text-slate-900">
                    ${suficiencia.semanas_alcanzadas}/${suficiencia.semanas_totales}
                </p>
                <p class="mt-1 text-xs font-semibold text-slate-600">
                    ${suficiencia.topup_asignaciones || 0} turnos añadidos
                </p>
            </div>
        </div>

        <div class="mt-4 rounded-2xl border ${
            suficiencia.personal_suficiente
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
        } p-4 text-sm">
            <div class="flex items-start gap-3">
                <span class="material-symbols-outlined">
                    ${suficiencia.personal_suficiente ? "check_circle" : "error"}
                </span>
                <div>
                    <p class="font-black">
                        ${
                            suficiencia.personal_suficiente
                                ? "Personal suficiente"
                                : "Personal insuficiente"
                        }
                    </p>
                    <p class="mt-1">
                        ${escaparHTML(suficiencia.mensaje)}
                    </p>
                    <p class="mt-1 text-xs font-semibold">
                        Cobertura: ${suficiencia.reglas_cubiertas}/${suficiencia.reglas_evaluadas}
                        reglas cubiertas.
                    </p>
                </div>
            </div>
        </div>

        ${
            suficiencia.mensaje_jornada
                ? `
        <div class="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 text-indigo-800 p-4 text-sm">
            <div class="flex items-start gap-3">
                <span class="material-symbols-outlined">
                    ${suficiencia.semanas_alcanzadas === suficiencia.semanas_totales
                        ? "check_circle"
                        : "schedule"}
                </span>
                <div>
                    <p class="font-black">Jornada completada</p>
                    <p class="mt-1">
                        ${escaparHTML(suficiencia.mensaje_jornada)}
                    </p>
                </div>
            </div>
        </div>`
                : ""
        }

        ${
            motorRenderDiagnostico(
                diagnostico,
                noRotativos,
                conflictosTurnoFijo
            )
        }

        <div class="mt-4 rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">
            <strong>Filtro:</strong> ${escaparHTML(cargo)}.
            La propuesta puede crear turnos nuevos o modificar turnos existentes para cubrir la demanda.
        </div>

        <section class="mt-6">
            <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 class="text-lg font-black text-slate-900">
                    Asignaciones propuestas
                </h3>
                <div class="flex flex-1 items-center gap-2 sm:max-w-md">
                    <label class="relative flex-1">
                        <span class="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                            search
                        </span>
                        <input id="busqueda-propuesta-automatica" type="search"
                            oninput="motorFiltrarPropuestaAutomatica()"
                            placeholder="Buscar por cargo, ceco, área o nombre…"
                            autocomplete="off"
                            class="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                    </label>
                    <span id="contador-propuesta-asignaciones"
                        class="whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                        ${propuesta.asignaciones.length} / ${propuesta.asignaciones.length}
                    </span>
                </div>
            </div>
            <div class="overflow-auto rounded-2xl border border-slate-200">
                <table class="w-full min-w-[760px] text-sm">
                    <thead class="bg-slate-900 text-left text-white">
                        <tr>
                            <th class="p-3">Colaborador</th>
                            <th class="p-3">Cargo</th>
                            <th class="p-3">Fecha</th>
                            <th class="p-3 text-center">Turno</th>
                            <th class="p-3 text-center">Horas</th>
                            <th class="p-3 text-center">Acción</th>
                        </tr>
                    </thead>
                    <tbody id="tbody-propuesta-asignaciones">${filasAsignaciones}</tbody>
                </table>
            </div>
        </section>

        <section class="mt-6">
            <h3 class="mb-3 text-lg font-black text-slate-900">
                Conflictos detectados
            </h3>
            <div id="contenedor-propuesta-conflictos" class="space-y-3">${conflictos}</div>
        </section>
    `

    const boton =
        modal.querySelector(
            "#btn-aprobar-planificacion-automatica"
        )

    boton.disabled =
        propuesta.asignaciones.length === 0

    modal.classList.remove("hidden")
    modal.classList.add("flex")

}

function cerrarPropuestaPlanificacionAutomatica(){

    const modal =
        document.getElementById(
            "modal-planificacion-automatica"
        )

    if(!modal){ return }

    modal.classList.add("hidden")
    modal.classList.remove("flex")

}

function generarPlanificacionAutomatica(){

    // Abrir el modal de propuesta también exige sesión: el "Aprobar y aplicar"
    // que viene detrás golpea /planificacion/lote, que ya está protegido.
    if(!(adminAutorizado && obtenerToken())){
        iniciarSesion()
        return
    }

    propuestaPlanificacionAutomatica =
        construirPropuestaPlanificacionAutomatica()

    motorRenderizarPropuesta(
        propuestaPlanificacionAutomatica
    )

}

async function aprobarPlanificacionAutomatica(){

    const propuesta =
        propuestaPlanificacionAutomatica

    if(
        !propuesta ||
        propuesta.estado !== "PENDIENTE_APROBACION" ||
        propuesta.asignaciones.length === 0
    ){
        return
    }

    const boton =
        document.getElementById(
            "btn-aprobar-planificacion-automatica"
        )

    if(boton){
        boton.disabled = true
        boton.textContent = "Aplicando..."
    }

    const asignaciones =
        propuesta.asignaciones.map(asignacion => ({
            trabajador_id: asignacion.trabajador_id,
            responsable: asignacion.responsable,
            fecha: asignacion.fecha,
            turno: asignacion.turno,
            horas: asignacion.horas
        }))

    try{

        const respuesta =
            await guardarPlanificacionLote(
                asignaciones
            )

        if(!respuesta.ok){

            if(respuesta.status === 401){
                alert("Sesión expirada. Inicia sesión nuevamente.")
                cerrarSesionAdmin()
                return
            }

            let mensaje =
                "No se pudo aplicar la propuesta."

            try{
                const error =
                    await respuesta.json()

                if(error.detail){
                    mensaje = error.detail
                }
            }catch(error){}

            throw new Error(mensaje)

        }

        propuesta.estado = "APROBADA"

        planificacionGlobal =
            await obtenerPlanificacion()

        filtrarCargo()
        cerrarPropuestaPlanificacionAutomatica()

        alert(
            `Planificación aplicada: ${asignaciones.length} asignaciones.`
        )

    }catch(error){

        alert(
            error.message ||
            "No se pudo aplicar la propuesta."
        )

        if(boton){
            boton.disabled = false
            boton.textContent = "Aprobar y aplicar"
        }

    }

}
