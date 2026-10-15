// =====================================================
// MOTOR DE ASIGNACIÓN AUTOMÁTICA
// =====================================================
// Genera una propuesta en memoria. La planificación existente solo cambia
// cuando el usuario revisa y aprueba explícitamente la propuesta.

const MOTOR_DESCANSO_MINIMO_HORAS = 12
const MOTOR_MAX_DIAS_CONSECUTIVOS = 6
const MOTOR_MAX_HORAS_LEGALES_SEMANA = 42

let propuestaPlanificacionAutomatica = null
let motorCargandoContexto = false

function motorFechasDelMes(mes = mesActual, anio = anioActual){

    const fechas = []
    const ultimoDia =
        new Date(anio, mes + 1, 0).getDate()

    for(let dia=1; dia<=ultimoDia; dia++){
        fechas.push(
            formatearFechaISO(
                new Date(anio, mes, dia)
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
        new Date(`${String(fechaTexto).slice(0, 10)}T00:00:00`)

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

    const intervaloMedida = intervaloDesdeTurno(fechaTexto,turnoMedida)
    const puntoMedida = brecha.cobertura || brecha.inicio
    if(intervaloMedida && intervaloMedida.inicio <= puntoMedida && intervaloMedida.fin > puntoMedida && !turnos.includes(turnoMedida)){
        turnos.unshift(turnoMedida)
    }

    return turnos

}

function motorAsignacionesTrabajador(mapa, trabajadorId){

    return [...mapa.values()]
        .filter(registro =>
            String(registro.trabajador_id) === String(trabajadorId) &&
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
            (turnoNuevo === null || registro.fecha !== fechaTexto)
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

// Usar las mismas brechas por regla que la fase principal: no contar
// personal de otro CECO/cargo/área ni evaluar el cierre en el día equivocado.
function motorTurnoCubreSlotSubcubierto(mapa, turno, fechaTexto, reglas){
    const intervalo = intervaloDesdeTurno(fechaTexto, turno)
    if(!intervalo || !reglas?.length) return false
    return reglas.some(regla => {
        const brechas = motorBrechasRegla(mapa, trabajadoresGlobal, regla, fechaTexto)
        return brechas?.some(b => intervalo.inicio <= b.cobertura && intervalo.fin > b.cobertura)
    })
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

    // Estados intencionales nunca son candidatos, ni en cobertura ni al
    // completar jornadas. Un turno real puede ajustarse con aprobación.
    if(existente && !motorEsNoAsignado(existente.turno) && !motorEsTurnoTrabajado(existente.turno)){
        return false
    }

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

    const coberturaCompleta = reglasEvaluadas > 0 && conflictos.length === 0
    const mensajePersonal =
        reglasEvaluadas === 0 ? "No hay reglas de cobertura evaluadas para este equipo." : coberturaCompleta
            ? "El personal disponible permite cumplir la cobertura configurada."
            : "Se requiere más personal disponible o ajustar turnos para cumplir toda la cobertura."

    let mensajeJornada = ""
    if(semanasTotales > 0){
        const porcentaje =
            Math.round((semanasAlcanzadas / semanasTotales) * 100)
        mensajeJornada =
            semanasAlcanzadas === semanasTotales
                ? `${semanasAlcanzadas}/${semanasTotales} semanas de colaboradores alcanzaron entre el 95% y el 100% de su jornada.`
                : `${semanasAlcanzadas}/${semanasTotales} semanas de colaboradores (${porcentaje}%) alcanzaron entre el 95% y el 100% de su jornada. Revisa las semanas restantes.`
    }

    return {
        personal: topup.personal || null,
        fechas_evaluadas: fechasEvaluadas,
        reglas_evaluadas: reglasEvaluadas,
        reglas_cubiertas:
            Math.max(0, reglasEvaluadas - reglasSinCubrir.size),
        reglas_sin_cubrir: reglasSinCubrir.size,
        personal_suficiente: coberturaCompleta,
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

    const fechas = [-1,0,1].map(desplazamiento => {
        const fecha = new Date(`${fechaTexto}T00:00:00`)
        fecha.setDate(fecha.getDate()+desplazamiento)
        return formatearFechaISO(fecha)
    })
    const intervalos = trabajadores
        .filter(t => t.activo !== false && trabajadorCumpleRegla(t,regla))
        .flatMap(t => fechas.map(fecha => {
            const registro = mapa.get(motorClaveAsignacion(t.id,fecha))
            const intervalo = registro ? intervaloDesdeTurno(fecha,registro.turno) : null
            return intervalo ? {...intervalo,trabajador:t} : null
        }))
        .filter(i => i && i.inicio < requerido.fin && i.fin > requerido.inicio)

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
    fechaTexto,
    brecha = null
){

    const opciones = []

    candidatos.forEach(trabajador => {

        const guardado = mapa.get(motorClaveAsignacion(trabajador.id,fechaTexto))
        if(guardado?.origen === "existente" && motorEsTurnoTrabajado(guardado.turno)) return

        // Si el trabajador es fijo, el turno a evaluar es el del día
        // concreto (turno_fijo por día de la semana). El parámetro
        // `turnosRotativos` se ignora para él.
        const turnoFijo =
            motorTurnoFijoDelDia(trabajador, fechaTexto)

        const esFijo = motorEsFijo(trabajador)
        if(esFijo && !turnoFijo) return

        const turnosFrecuentesCeco =
            motorTurnosDisponibles(trabajador.ceco)

        const turnos = esFijo
            ? [turnoFijo]
            : turnosRotativos.filter(turno =>
                turnosFrecuentesCeco.includes(turno) ||
                (brecha && turno === motorTurnoDesdeIntervalo(brecha.inicio,brecha.fin))
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
    const mapaInicial = new Map(mapa)

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
                            fechaTexto,
                            brecha
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

    // Completar jornadas después de priorizar cobertura. La cobertura
    // mínima ya cumplida no impide asignar el resto de la semana.
    const fechasDelMes = motorFechasDelMes()
    const semanasDelMes = [...new Set(fechasDelMes.map(motorInicioSemana))].sort()
    let topupAsignaciones = 0
    const busquedasLimitadas = []
    const resultadosJornada = new Map()
    trabajadores.forEach(trabajador => {
        semanasDelMes.forEach(inicioSemana => {
            const fechas = fechasDelMes.filter(f => motorInicioSemana(f) === inicioSemana)
            const resultado = motorCompletarSemana(mapa,mapaInicial,trabajador,fechas,inicioSemana)
            resultadosJornada.set(motorClaveAsignacion(trabajador.id,inicioSemana),resultado)
            resultado.cambios.forEach(a => {
                const indice = asignaciones.findIndex(previa => String(previa.trabajador_id) === String(a.trabajador_id) && previa.fecha === a.fecha)
                if(indice < 0) asignaciones.push(a)
                else asignaciones[indice] = a
            })
            topupAsignaciones += resultado.cambios.length
            if(resultado.limitada) busquedasLimitadas.push({trabajador:trabajador.nombre,semana:inicioSemana})
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
                    inicioSemana
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
        }else if(asignacionesDel === 0 && horasMes === 0){
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
            diagnosticoTrabajadores.parcial.push(item)
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

    const resultadoFinal = motorEvaluarResultadoFinal(mapa, trabajadores, fechasDelMes, reglas)
    const resumenSuficiencia =
        motorResumenSuficiencia(
            fechasDelMes.length,
            resultadoFinal.reglasEvaluadas,
            resultadoFinal.conflictos,
            {
                personal: resultadoFinal.personal,
                semanas_alcanzadas: resultadoFinal.semanasAlcanzadas,
                semanas_totales: resultadoFinal.semanasTotales,
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
        asignaciones: asignaciones.filter(a => {
            const previo = mapaInicial.get(motorClaveAsignacion(a.trabajador_id,a.fecha))
            return !previo || previo.turno !== a.turno || previo.responsable !== a.responsable || previo.horas !== a.horas
        }).map(a => {
            const previo = mapaInicial.get(motorClaveAsignacion(a.trabajador_id,a.fecha))
            return {...a,turno_anterior:previo?.turno || "",accion:previo ? "modificar" : "crear"}
        }),
        trabajadores_ids: trabajadores.map(t => t.id),
        conflictos: resultadoFinal.conflictos,
        suficiencia: {...resumenSuficiencia,busquedas_limitadas:busquedasLimitadas,jornadas_pendientes:motorJornadasPendientes(mapa,trabajadores,fechasDelMes,resultadosJornada)},
        generado_en:
            new Date().toISOString()
    }

}

// Recalcular contra el resultado final, no contra brechas intermedias.
function motorEvaluarResultadoFinal(mapa, trabajadores, fechas, reglas, cargos = window.cargosSeleccionados || []){
    const conflictos = []
    const puntosPendientes = []
    let reglasEvaluadas = 0
    if(!trabajadores.length) conflictos.push({tipo:"SIN_COLABORADORES",detalle:"No hay colaboradores disponibles para este equipo."})
    if(!reglas.length) conflictos.push({tipo:"SIN_REGLAS_COBERTURA",detalle:"No existen reglas de cobertura activas."})
    fechas.forEach(fecha => {
        const dia = indiceDiaSemanaLunes(new Date(`${fecha}T00:00:00`))
        reglas.filter(r => r.dia_semana === dia).forEach(regla => {
            if(cargos.length && !trabajadores.some(t => trabajadorCumpleRegla(t, regla)) &&
                !(regla.tipo === "cargo" && cargos.some(c => String(c).trim().toLowerCase() === String(regla.valor).trim().toLowerCase())) &&
                !trabajadoresGlobal.some(t => cargos.includes(t.cargo) && trabajadorCumpleRegla(t, regla))) return
            reglasEvaluadas++
            const brechas = motorBrechasRegla(mapa, trabajadoresGlobal, regla, fecha)
            if(brechas === null){
                conflictos.push(motorCrearConflicto(regla,fecha,"La regla contiene un horario inválido."))
            }else if(brechas.length){
                brechas.forEach(b => puntosPendientes.push(motorDiagnosticarBrecha(mapa,trabajadores,regla,fecha,b)))
                conflictos.push(motorCrearConflicto(regla,fecha,brechas.map(b=>
                    `${etiquetaPuntoBrecha(b)}: dotación ${b.dotacion}/${b.minimo}, faltan ${b.faltan}`
                ).join(" · ")))
            }
        })
    })
    const semanas = [...new Set(fechas.map(motorInicioSemana))]
    let semanasAlcanzadas = 0
    trabajadores.forEach(t => semanas.forEach(inicio => {
        const objetivo = parseInt(t.jornada) || MOTOR_MAX_HORAS_LEGALES_SEMANA
        const horas = motorHorasSemana(mapa,t,inicio)
        if(horas >= objetivo * 0.95 && horas <= objetivo) semanasAlcanzadas++
    }))
    return {conflictos,reglasEvaluadas,semanasAlcanzadas,semanasTotales:trabajadores.length * semanas.length,personal:motorResumenPersonal(puntosPendientes,reglasEvaluadas,conflictos)}
}

function motorActualizarResumenAplicado(propuesta){
    const ids = new Set((propuesta.trabajadores_ids || propuesta.asignaciones.map(a=>a.trabajador_id)).map(String))
    const trabajadores = trabajadoresGlobal.filter(t => ids.has(String(t.id)))
    const resultado = motorEvaluarResultadoFinal(
        motorMapaPlanificacionActual(), trabajadores,
        motorFechasDelMes(propuesta.mes, propuesta.anio), motorReglasActivas(), propuesta.cargos
    )
    propuesta.conflictos = resultado.conflictos
    propuesta.suficiencia = motorResumenSuficiencia(
        motorFechasDelMes(propuesta.mes, propuesta.anio).length,
        resultado.reglasEvaluadas, resultado.conflictos, {
            personal:resultado.personal,
            semanas_alcanzadas:resultado.semanasAlcanzadas,
            semanas_totales:resultado.semanasTotales,
            topup_asignaciones:propuesta.suficiencia?.topup_asignaciones || 0
        }
    )
    propuesta.suficiencia.jornadas_pendientes = motorJornadasPendientes(motorMapaPlanificacionActual(),trabajadores,motorFechasDelMes(propuesta.mes,propuesta.anio))
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
                        asignacion.accion === "existente" ? "bg-slate-100 text-slate-600" : asignacion.accion === "modificar"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                    }">
                        ${
                            asignacion.accion === "existente" ? "Sin cambio" : asignacion.accion === "modificar"
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
async function generarPlanificacionAutomatica(){
    if(motorCargandoContexto || propuestaPlanificacionAutomatica?.estado === "APLICANDO") return
    if(!(adminAutorizado && obtenerToken())){ iniciarSesion(); return }
    motorCargandoContexto = true
    const mes = mesActual, anio = anioActual
    try{
        const contexto = await obtenerContextoAutomatico()
        if(mes !== mesActual || anio !== anioActual) return
        trabajadoresGlobal = contexto.trabajadores
        planificacionGlobal = contexto.planificacion
        coberturaConfigGlobal = contexto.cobertura
        colacionConfigGlobal = contexto.colacion
        turnosFrecuentesGlobal = contexto.turnos
        actualizarVistaPlanificacion()
        propuestaPlanificacionAutomatica = construirPropuestaPlanificacionAutomatica()
        propuestaPlanificacionAutomatica.revision = contexto.revision
        motorRenderizarPropuesta(propuestaPlanificacionAutomatica)
    }catch(error){
        alert(error.message || "No se pudo actualizar la planificación antes de generar.")
    }finally{
        motorCargandoContexto = false
    }
}

async function aprobarPlanificacionAutomatica(){
    const propuesta = propuestaPlanificacionAutomatica
    if(propuesta?.estado === "OBSOLETA"){ await generarPlanificacionAutomatica(); return }
    if(!propuesta || propuesta.estado !== "PENDIENTE_APROBACION" || !propuesta.asignaciones.length) return
    if(!(adminAutorizado && obtenerToken())){ iniciarSesion(); return }
    propuesta.estado = "APLICANDO"
    const boton = document.getElementById("btn-aprobar-planificacion-automatica")
    if(boton){ boton.disabled = true; boton.textContent = "Aplicando..." }
    const asignaciones = propuesta.asignaciones.map(a => ({
        trabajador_id:a.trabajador_id,responsable:a.responsable,fecha:a.fecha,turno:a.turno,horas:a.horas
    }))
    try{
        const respuesta = await guardarPlanificacionAutomatica(propuesta, asignaciones)
        if(!respuesta.ok){
            let mensaje = respuesta.status === 401 ? "Sesión expirada. Inicia sesión nuevamente." : "No se pudo aplicar la propuesta."
            try{ const error = await respuesta.json(); if(typeof error.detail === "string") mensaje = error.detail }catch{}
            const error = new Error(mensaje)
            error.status = respuesta.status
            throw error
        }
    }catch(error){
        if(error.status === 409){
            propuesta.estado = "OBSOLETA"
            propuesta.aviso_recarga = error.message
            motorRenderizarPropuesta(propuesta)
            return
        }
        propuesta.estado = "PENDIENTE_APROBACION"
        if(boton){ boton.disabled = false; boton.textContent = `Aplicar ${propuesta.asignaciones.length} cambios` }
        alert(error.message || "No se pudo aplicar la propuesta.")
        return
    }

    // Un fallo al recargar no debe volver a habilitar un lote ya guardado.
    propuesta.estado = "APROBADA"
    asignaciones.forEach(a => {
        const existente = planificacionGlobal.find(p => String(p.trabajador_id) === String(a.trabajador_id) && String(p.fecha).slice(0,10) === a.fecha)
        if(existente) Object.assign(existente,a)
        else planificacionGlobal.push({...a})
    })
    try{
        const guardada = await obtenerPlanificacion()
        if(!Array.isArray(guardada)) throw new Error("Respuesta inválida")
        planificacionGlobal = guardada
        propuesta.aviso_recarga = ""
    }catch{
        propuesta.aviso_recarga = "Los turnos fueron guardados, pero no se pudo recargar el servidor. El resumen usa el lote confirmado; recarga la vista para sincronizar."
    }
    motorActualizarResumenAplicado(propuesta)
    propuesta.pestana = "resumen"
    propuesta.brechaRevisada = null
    actualizarVistaPlanificacion()
    motorRenderizarPropuesta(propuesta)
}
