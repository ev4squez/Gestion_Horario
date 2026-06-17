// =====================================================
// COBERTURA OPERATIVA
// =====================================================

let coberturaConfigGlobal = []

const NOMBRES_DIAS_COBERTURA = [
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo"
]

function minutosDesdeHora(hora){

    const match =
        String(hora || "")
            .trim()
            .match(/^(\d{1,2}):(\d{2})$/)

    if(!match){ return null }

    const horas = parseInt(match[1])
    const minutos = parseInt(match[2])

    if(horas < 0 || horas > 23 || minutos < 0 || minutos > 59){
        return null
    }

    return (horas * 60) + minutos

}

function formatearHoraDesdeFecha(fecha){

    return `${String(fecha.getHours()).padStart(2, "0")}:${
        String(fecha.getMinutes()).padStart(2, "0")
    }`

}

function formatearFechaISO(fecha){

    return `${fecha.getFullYear()}-${
        String(fecha.getMonth() + 1).padStart(2, "0")
    }-${
        String(fecha.getDate()).padStart(2, "0")
    }`

}

function indiceDiaSemanaLunes(fecha){

    const dia = fecha.getDay()

    return dia === 0 ? 6 : dia - 1

}

function intervaloDesdeHora(fechaBase, horaInicio, horaFin){

    const inicioMin = minutosDesdeHora(horaInicio)
    const finMin = minutosDesdeHora(horaFin)

    if(inicioMin === null || finMin === null){ return null }

    const inicio = new Date(fechaBase)
    inicio.setHours(0, inicioMin, 0, 0)

    const fin = new Date(fechaBase)
    fin.setHours(0, finMin, 0, 0)

    if(fin <= inicio){
        fin.setDate(fin.getDate() + 1)
    }

    return { inicio, fin }

}

function intervaloDesdeTurno(fechaTexto, turno){

    const texto = String(turno || "").trim().toLowerCase()

    if(
        !texto ||
        texto.includes("libre") ||
        texto.includes("saliente") ||
        texto.includes("vacaciones")
    ){
        return null
    }

    const match =
        String(turno)
            .match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)

    if(!match){ return null }

    const inicio = new Date(`${fechaTexto}T00:00:00`)
    inicio.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0)

    const fin = new Date(`${fechaTexto}T00:00:00`)
    fin.setHours(parseInt(match[3]), parseInt(match[4]), 0, 0)

    if(fin <= inicio){
        fin.setDate(fin.getDate() + 1)
    }

    return { inicio, fin }

}

function obtenerFechasMesCobertura(){

    const fechas = []

    const ultimoDia =
        new Date(anioActual, mesActual + 1, 0).getDate()

    for(let dia=1; dia<=ultimoDia; dia++){
        fechas.push(new Date(anioActual, mesActual, dia))
    }

    return fechas

}

function trabajadorCumpleRegla(trabajador, regla){

    const campo =
        regla.tipo === "area"
            ? trabajador.area
            : trabajador.ceco

    return String(campo || "").trim().toLowerCase() ===
        String(regla.valor || "").trim().toLowerCase()

}

function intervalosTrabajadosParaRegla(regla, fechaTexto){

    return planificacionGlobal
        .map(p => {

            const trabajador =
                trabajadoresGlobal.find(t => t.id === p.trabajador_id)

            if(!trabajador || !trabajadorCumpleRegla(trabajador, regla)){
                return null
            }

            if(!String(p.fecha || "").startsWith(fechaTexto)){
                return null
            }

            const intervalo =
                intervaloDesdeTurno(fechaTexto, p.turno)

            if(!intervalo){ return null }

            return {
                ...intervalo,
                trabajador
            }

        })
        .filter(Boolean)

}

function calcularBrechasIntervalo(requerido, intervalos, minimoPersonas){

    const puntos =
        [
            requerido.inicio.getTime(),
            requerido.fin.getTime()
        ]

    intervalos.forEach(i => {
        if(i.fin > requerido.inicio && i.inicio < requerido.fin){
            puntos.push(
                Math.max(i.inicio.getTime(), requerido.inicio.getTime())
            )
            puntos.push(
                Math.min(i.fin.getTime(), requerido.fin.getTime())
            )
        }
    })

    const ordenados =
        [...new Set(puntos)].sort((a,b) => a - b)

    const brechas = []

    for(let i=0; i<ordenados.length - 1; i++){

        const inicio = new Date(ordenados[i])
        const fin = new Date(ordenados[i + 1])

        if(fin <= inicio){ continue }

        const dotacion =
            intervalos.filter(turno =>
                turno.inicio < fin && turno.fin > inicio
            ).length

        if(dotacion < minimoPersonas){
            brechas.push({
                inicio,
                fin,
                dotacion,
                faltan: minimoPersonas - dotacion
            })
        }

    }

    return brechas

}

function calcularCobertura(){

    const resultados = []
    const reglas =
        coberturaConfigGlobal.filter(r => r.activo)

    obtenerFechasMesCobertura().forEach(fecha => {

        const diaSemana =
            indiceDiaSemanaLunes(fecha)

        const fechaTexto =
            formatearFechaISO(fecha)

        reglas
            .filter(r => r.dia_semana === diaSemana)
            .forEach(regla => {

                const requerido =
                    intervaloDesdeHora(
                        fecha,
                        regla.hora_inicio,
                        regla.hora_fin
                    )

                if(!requerido){
                    resultados.push({
                        regla,
                        fecha: fechaTexto,
                        cubierto: false,
                        error: "Horario de cobertura inválido",
                        brechas: []
                    })
                    return
                }

                const intervalos =
                    intervalosTrabajadosParaRegla(regla, fechaTexto)

                const brechas =
                    calcularBrechasIntervalo(
                        requerido,
                        intervalos,
                        regla.minimo_personas
                    )

                resultados.push({
                    regla,
                    fecha: fechaTexto,
                    cubierto: brechas.length === 0,
                    asignados: intervalos.length,
                    brechas
                })

            })

    })

    return resultados

}

function calcularAlertasCobertura(){

    return calcularCobertura()
        .filter(r => !r.cubierto)
        .flatMap(r => {

            if(r.error){
                return [{
                    tipo: "danger",
                    kind: "cobertura",
                    titulo: `${r.fecha} · ${r.regla.tipo.toUpperCase()} ${r.regla.valor}`,
                    mensaje: r.error,
                    detalle: `Mínimo ${r.regla.minimo_personas}`,
                }]
            }

            return r.brechas.map(b => ({
                tipo: b.faltan > 0 ? "danger" : "warning",
                kind: "cobertura",
                titulo: `${r.fecha} · ${r.regla.tipo.toUpperCase()} ${r.regla.valor}`,
                mensaje: `Brecha ${formatearHoraDesdeFecha(b.inicio)} - ${formatearHoraDesdeFecha(b.fin)}`,
                detalle: `Dotación ${b.dotacion}/${r.regla.minimo_personas} · faltan ${b.faltan}`,
            }))

        })

}

function poblarValoresCobertura(){

    const tipo =
        document.getElementById("cobertura-tipo")

    const valor =
        document.getElementById("cobertura-valor")

    if(!tipo || !valor){ return }

    const campo =
        tipo.value === "area"
            ? "area"
            : "ceco"

    const valores =
        [
            ...new Set(
                trabajadoresGlobal
                    .map(t => t[campo])
                    .filter(v => v && String(v).trim() !== "")
            )
        ].sort()

    valor.innerHTML = `<option value="">Seleccione</option>`

    valores.forEach(v => {
        valor.innerHTML += `
            <option value="${escaparHTML(v)}">${escaparHTML(v)}</option>
        `
    })

}

function limpiarFormularioCobertura(){

    document.getElementById("cobertura-id").value = ""
    document.getElementById("cobertura-tipo").value = "ceco"
    document.getElementById("cobertura-dia").value = "0"
    document.getElementById("cobertura-inicio").value = "09:00"
    document.getElementById("cobertura-fin").value = "05:00"
    document.getElementById("cobertura-minimo").value = "1"
    document.getElementById("cobertura-activo").checked = true

    poblarValoresCobertura()

}

function editarReglaCobertura(id){

    const regla =
        coberturaConfigGlobal.find(r => r.id === id)

    if(!regla){ return }

    document.getElementById("cobertura-id").value = regla.id
    document.getElementById("cobertura-tipo").value = regla.tipo
    poblarValoresCobertura()
    document.getElementById("cobertura-valor").value = regla.valor
    document.getElementById("cobertura-dia").value = regla.dia_semana
    document.getElementById("cobertura-inicio").value = regla.hora_inicio
    document.getElementById("cobertura-fin").value = regla.hora_fin
    document.getElementById("cobertura-minimo").value = regla.minimo_personas
    document.getElementById("cobertura-activo").checked = !!regla.activo

}

async function guardarReglaCobertura(){

    const id =
        document.getElementById("cobertura-id").value

    const data = {
        tipo: document.getElementById("cobertura-tipo").value,
        valor: document.getElementById("cobertura-valor").value,
        dia_semana: parseInt(document.getElementById("cobertura-dia").value),
        hora_inicio: document.getElementById("cobertura-inicio").value,
        hora_fin: document.getElementById("cobertura-fin").value,
        minimo_personas: parseInt(document.getElementById("cobertura-minimo").value),
        activo: document.getElementById("cobertura-activo").checked
    }

    if(!data.valor || !data.hora_inicio || !data.hora_fin){
        alert("Completa tipo, valor y horarios de cobertura.")
        return
    }

    const respuesta = id
        ? await actualizarConfiguracionCobertura(id, data)
        : await crearConfiguracionCobertura(data)

    if(respuesta.status === 401){
        alert("Sesión expirada. Inicia sesión nuevamente.")
        cerrarSesionAdmin()
        accederCRUD()
        return
    }

    if(!respuesta.ok){
        let mensaje = "No se pudo guardar la regla de cobertura."
        try{
            const error = await respuesta.json()
            if(error && error.detail){ mensaje = error.detail }
        }catch(e){}
        alert(mensaje)
        return
    }

    coberturaConfigGlobal = await obtenerConfiguracionCobertura()
    limpiarFormularioCobertura()
    renderizarCobertura()

}

async function eliminarReglaCobertura(id){

    if(!confirm("¿Eliminar esta regla de cobertura?")){
        return
    }

    const respuesta =
        await eliminarConfiguracionCobertura(id)

    if(respuesta.status === 401){
        alert("Sesión expirada. Inicia sesión nuevamente.")
        cerrarSesionAdmin()
        accederCRUD()
        return
    }

    if(!respuesta.ok){
        alert("No se pudo eliminar la regla.")
        return
    }

    coberturaConfigGlobal =
        await obtenerConfiguracionCobertura()

    renderizarCobertura()

}

function renderizarReglasCobertura(){

    const tbody =
        document.getElementById("tabla-cobertura-body")

    if(!tbody){ return }

    if(coberturaConfigGlobal.length === 0){
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="p-5 text-center text-slate-400">
                    Sin reglas configuradas
                </td>
            </tr>
        `
        return
    }

    let html = ""

    coberturaConfigGlobal.forEach(regla => {
        html += `
            <tr class="hover:bg-slate-50">
                <td class="p-3 font-semibold uppercase">${escaparHTML(regla.tipo)}</td>
                <td class="p-3">${escaparHTML(regla.valor)}</td>
                <td class="p-3">${NOMBRES_DIAS_COBERTURA[regla.dia_semana]}</td>
                <td class="p-3">${escaparHTML(regla.hora_inicio)} - ${escaparHTML(regla.hora_fin)}</td>
                <td class="p-3 text-center">${regla.minimo_personas}</td>
                <td class="p-3 text-center">
                    <span class="px-2 py-1 rounded-full text-xs font-bold ${
                        regla.activo
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                    }">
                        ${regla.activo ? "Activa" : "Inactiva"}
                    </span>
                </td>
                <td class="p-3">
                    <div class="flex justify-center gap-2">
                        <button onclick="editarReglaCobertura(${regla.id})"
                            class="px-3 py-2 rounded-xl bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold">
                            Editar
                        </button>
                        <button onclick="eliminarReglaCobertura(${regla.id})"
                            class="px-3 py-2 rounded-xl bg-red-100 text-red-700 hover:bg-red-200 font-semibold">
                            Eliminar
                        </button>
                    </div>
                </td>
            </tr>
        `
    })

    tbody.innerHTML = html

}

function renderizarResultadoCobertura(){

    const contenedor =
        document.getElementById("resultado-cobertura")

    const badge =
        document.getElementById("badge-cobertura")

    if(!contenedor){ return }

    const resultados =
        calcularCobertura()

    const problemas =
        resultados.filter(r => !r.cubierto)

    if(badge){
        badge.textContent =
            problemas.length === 0
                ? "Cubierto"
                : `${problemas.length} brechas`

        badge.className =
            problemas.length === 0
                ? "px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold"
                : "px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold"
    }

    if(coberturaConfigGlobal.length === 0){
        contenedor.innerHTML = `
            <div class="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-500">
                Configura reglas por área o CECO para validar apertura, cierre y continuidad horaria.
            </div>
        `
        return
    }

    if(problemas.length === 0){
        contenedor.innerHTML = `
            <div class="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold">
                Todos los días configurados tienen cobertura completa para el mes seleccionado.
            </div>
        `
        return
    }

    let html = ""

    problemas.forEach(r => {
        const detalleBrechas =
            r.error
                ? escaparHTML(r.error)
                : r.brechas.map(b =>
                    `${formatearHoraDesdeFecha(b.inicio)}-${formatearHoraDesdeFecha(b.fin)} ` +
                    `(${b.dotacion}/${r.regla.minimo_personas})`
                ).join(", ")

        html += `
            <div class="border border-red-200 bg-red-50 rounded-2xl p-4">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                        <h4 class="font-black text-slate-800">
                            ${escaparHTML(r.fecha)} · ${escaparHTML(r.regla.tipo.toUpperCase())}
                            ${escaparHTML(r.regla.valor)}
                        </h4>
                        <p class="text-sm text-red-700 mt-1">
                            Brechas: ${detalleBrechas}
                        </p>
                    </div>
                    <span class="px-3 py-1 rounded-full bg-white text-red-700 text-xs font-bold self-start md:self-auto">
                        Mínimo ${r.regla.minimo_personas}
                    </span>
                </div>
            </div>
        `
    })

    contenedor.innerHTML = html

}

function renderizarCobertura(){

    poblarValoresCobertura()
    renderizarReglasCobertura()
    renderizarResultadoCobertura()

}
