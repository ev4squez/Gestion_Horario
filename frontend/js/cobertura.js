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
            : regla.tipo === "cargo"
                ? trabajador.cargo
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

// Dotación (nº de intervalos) que cubre un instante t. Inicio-inclusive y
// fin-exclusive: un turno cubre t si inicio <= t < fin.
function dotacionEnInstante(intervalos, t){

    return intervalos.filter(i =>
        i.inicio.getTime() <= t && i.fin.getTime() > t
    ).length

}

// Interpretación "solo dos puntos": el mínimo se exige exactamente en la
// apertura (requerido.inicio) y en el cierre (último instante de la franja),
// no en el tramo intermedio. Devuelve hasta dos brechas, una por punto.
// Cada brecha lleva:
//   - punto: "inicio" | "fin" (cuál extremo falla)
//   - cobertura: instante que un turno debe cubrir para tapar la brecha
//   - inicio/fin: franja completa, usada como turno a medida de respaldo
function calcularBrechasIntervalo(requerido, intervalos, minimoInicio, minimoFin){

    const brechas = []

    const tInicio = requerido.inicio.getTime()
    // Instante representativo del cierre: el último minuto de la franja.
    const tFin = requerido.fin.getTime() - 60000

    const dotacionInicio =
        dotacionEnInstante(intervalos, tInicio)

    if(dotacionInicio < minimoInicio){
        brechas.push({
            punto: "inicio",
            inicio: new Date(requerido.inicio),
            fin: new Date(requerido.fin),
            cobertura: new Date(tInicio),
            dotacion: dotacionInicio,
            minimo: minimoInicio,
            faltan: minimoInicio - dotacionInicio
        })
    }

    const dotacionFin =
        dotacionEnInstante(intervalos, tFin)

    if(dotacionFin < minimoFin){
        brechas.push({
            punto: "fin",
            inicio: new Date(requerido.inicio),
            fin: new Date(requerido.fin),
            cobertura: new Date(tFin),
            dotacion: dotacionFin,
            minimo: minimoFin,
            faltan: minimoFin - dotacionFin
        })
    }

    return brechas

}

// Etiqueta legible del punto que falla, p. ej. "Apertura 09:00" / "Cierre 05:00".
function etiquetaPuntoBrecha(b){

    return b.punto === "fin"
        ? `Cierre ${formatearHoraDesdeFecha(b.fin)}`
        : `Apertura ${formatearHoraDesdeFecha(b.inicio)}`

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
                        regla.minimo_inicio ?? regla.minimo_personas,
                        regla.minimo_fin ?? regla.minimo_personas
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

function calcularAlertasCobertura(trabajadores){

    const limitarPorCargo =
        Array.isArray(trabajadores) &&
        trabajadores.length < trabajadoresGlobal.length

    return calcularCobertura()
        .filter(r =>
            !limitarPorCargo ||
            trabajadores.some(
                trabajador => trabajadorCumpleRegla(trabajador, r.regla)
            )
        )
        .filter(r => !r.cubierto)
        .flatMap(r => {

            if(r.error){
                return [{
                    tipo: "danger",
                    kind: "cobertura",
                    titulo: `${r.fecha} · ${r.regla.tipo.toUpperCase()} ${r.regla.valor}`,
                    mensaje: r.error,
                    detalle: `Mínimo ${r.regla.minimo_inicio ?? r.regla.minimo_personas} → ${r.regla.minimo_fin ?? r.regla.minimo_personas}`,
                }]
            }

            return r.brechas.map(b => ({
                tipo: b.faltan > 0 ? "danger" : "warning",
                kind: "cobertura",
                titulo: `${r.fecha} · ${r.regla.tipo.toUpperCase()} ${r.regla.valor}`,
                mensaje: `Brecha ${etiquetaPuntoBrecha(b)}`,
                detalle: `Dotación ${b.dotacion}/${b.minimo} · faltan ${b.faltan}`,
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
            : tipo.value === "cargo"
                ? "cargo"
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
    document.getElementById("cobertura-minimo-inicio").value = "1"
    document.getElementById("cobertura-minimo-fin").value = "1"
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
    document.getElementById("cobertura-minimo-inicio").value =
        regla.minimo_inicio ?? regla.minimo_personas
    document.getElementById("cobertura-minimo-fin").value =
        regla.minimo_fin ?? regla.minimo_personas
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
        minimo_inicio: parseInt(document.getElementById("cobertura-minimo-inicio").value),
        minimo_fin: parseInt(document.getElementById("cobertura-minimo-fin").value),
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
        alert(
            await leerMensajeRespuestaError(
                respuesta,
                "No se pudo guardar la regla de cobertura"
            )
        )
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
        alert(
            await leerMensajeRespuestaError(
                respuesta,
                "No se pudo eliminar la regla"
            )
        )
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

    // Agrupa las reglas por (tipo, valor) para que el panel derecho no se
    // vuelva un muro plano cuando hay muchas reglas. Cada grupo emite una
    // fila-cabecera colapsable que resume la cantidad de reglas que contiene
    // y permite expandir/colapsar con un click. El estado vive en
    // `window.reglasColapsadas` (Set) y persiste entre re-renders.
    if(!window.reglasColapsadas || !(window.reglasColapsadas instanceof Set)){
        window.reglasColapsadas = new Set()
    }

    const grupos = new Map()
    coberturaConfigGlobal.forEach(regla => {
        const clave = `${regla.tipo}::${regla.valor}`
        if(!grupos.has(clave)){
            grupos.set(clave, {
                clave,
                tipo: regla.tipo,
                valor: regla.valor,
                reglas: []
            })
        }
        grupos.get(clave).reglas.push(regla)
    })

    // Orden estable: alfabético por etiqueta visible. Mantiene predecible el
    // orden entre renders aunque cambien los IDs.
    const gruposOrdenados = [...grupos.values()].sort((a, b) =>
        etiquetaGrupoRegla(a).localeCompare(etiquetaGrupoRegla(b))
    )

    let html = ""

    gruposOrdenados.forEach(grupo => {
        const etiqueta = etiquetaGrupoRegla(grupo)
        const total = grupo.reglas.length
        const colapsado = window.reglasColapsadas.has(grupo.clave)

        html += `
            <tr class="bg-slate-50/80 border-y border-slate-200">
                <td colspan="7" class="p-0">
                    <button type="button"
                        data-grupo-toggle="${escaparHTML(grupo.clave)}"
                        aria-expanded="${colapsado ? "false" : "true"}"
                        class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-100 transition">
                        <span class="flex items-center gap-2 min-w-0">
                            <span class="material-symbols-outlined text-slate-500 text-lg transition-transform" data-grupo-caret>${colapsado ? "chevron_right" : "expand_more"}</span>
                            <span class="font-black text-slate-800 truncate">${escaparHTML(etiqueta)}</span>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-200 text-slate-700">${total} regla${total === 1 ? "" : "s"}</span>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-blue-100 text-blue-700">${escaparHTML(grupo.tipo)}</span>
                        </span>
                        <span class="text-[11px] text-slate-500">Click para ${colapsado ? "expandir" : "colapsar"}</span>
                    </button>
                </td>
            </tr>
        `

        if(colapsado){ return }

        grupo.reglas.forEach(regla => {
            html += `
                <tr class="hover:bg-slate-50" data-grupo-fila="${escaparHTML(grupo.clave)}">
                    <td class="p-3 font-semibold uppercase">${escaparHTML(regla.tipo)}</td>
                    <td class="p-3">${escaparHTML(regla.valor)}</td>
                    <td class="p-3">${NOMBRES_DIAS_COBERTURA[regla.dia_semana]}</td>
                    <td class="p-3">${escaparHTML(regla.hora_inicio)} - ${escaparHTML(regla.hora_fin)}</td>
                    <td class="p-3 text-center">${
                        regla.minimo_inicio ?? regla.minimo_personas
                    } → ${
                        regla.minimo_fin ?? regla.minimo_personas
                    }</td>
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
    })

    tbody.innerHTML = html

    // Wire de los toggles. Un solo listener delegado al tbody evita registrar
    // N handlers y se acopla al re-render sin código adicional.
    if(!tbody.dataset.gruposWired){
        tbody.dataset.gruposWired = "1"
        tbody.addEventListener("click", function(e){
            const boton = e.target.closest("[data-grupo-toggle]")
            if(!boton){ return }
            const clave = boton.dataset.grupoToggle
            if(window.reglasColapsadas.has(clave)){
                window.reglasColapsadas.delete(clave)
            }else{
                window.reglasColapsadas.add(clave)
            }
            // Re-render inmediato del grupo: barato y mantiene el estado del
            // resto del DOM (foco, scroll) sin perderlo.
            renderizarReglasCobertura()
        })
    }

}

// Etiqueta visible del grupo: prioriza el nombre del valor y, en paréntesis,
// aclara el tipo (CECO / Área / Cargo) cuando hay reglas de varios tipos
// con el mismo nombre. Para la mayoría de los casos coincide con `valor`.
function etiquetaGrupoRegla(grupo){
    return `${grupo.valor || "(sin valor)"}`
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

    // Las brechas individuales se muestran ahora en la vista Alertas para
    // evitar duplicación. Acá dejamos un resumen + CTA hacia esa vista.
    contenedor.innerHTML = `
        <div class="p-5 rounded-2xl border border-amber-200 bg-amber-50/70 text-amber-800">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <p class="font-black">${problemas.length} brecha${problemas.length === 1 ? "" : "s"} detectada${problemas.length === 1 ? "" : "s"}</p>
                    <p class="text-sm mt-1">
                        Hay días donde la dotación no alcanza el mínimo configurado.
                        Abrí la vista Alertas para ver el detalle por fecha, área y CECO.
                    </p>
                </div>
                <button type="button" onclick="mostrarVistaAlertas()"
                    class="px-4 py-2 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-semibold transition flex items-center gap-2 self-start md:self-auto">
                    <span class="material-symbols-outlined text-lg">warning</span>
                    Ver alertas
                </button>
            </div>
        </div>
    `

    // Refresca también la vista Alertas para que, si el usuario la abre justo
    // después de tocar mes/año en cobertura, vea la información al día.
    if(typeof renderizarAlertasVista === "function"){
        renderizarAlertasVista()
    }

}

function renderizarCobertura(){

    poblarValoresCobertura()
    renderizarReglasCobertura()
    renderizarResultadoCobertura()
    renderizarColacion()

}

// =====================================================
// COLACIÓN POR CECO (minutos)
// =====================================================

// Llena el select con todos los CECO existentes entre los trabajadores.
function poblarCecosColacion(){

    const select =
        document.getElementById("colacion-ceco")

    if(!select){ return }

    const valorActual = select.value

    const cecos =
        [
            ...new Set(
                trabajadoresGlobal
                    .map(t => t.ceco)
                    .filter(v => v && String(v).trim() !== "")
            )
        ].sort()

    select.innerHTML = `<option value="">Seleccione</option>`

    cecos.forEach(c => {
        select.innerHTML += `
            <option value="${escaparHTML(c)}">${escaparHTML(c)}</option>
        `
    })

    // Conserva la selección previa si sigue disponible.
    if(cecos.includes(valorActual)){
        select.value = valorActual
    }

}

function renderizarTablaColacion(){

    const tbody =
        document.getElementById("tabla-colacion-body")

    if(!tbody){ return }

    if((colacionConfigGlobal || []).length === 0){
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="p-5 text-center text-slate-400">
                    Sin colaciones configuradas (se usan los valores por defecto)
                </td>
            </tr>
        `
        return
    }

    let html = ""

    colacionConfigGlobal.forEach(regla => {
        html += `
            <tr class="hover:bg-slate-50">
                <td class="p-3 font-semibold">${escaparHTML(regla.ceco)}</td>
                <td class="p-3 text-center">${regla.minutos} min</td>
                <td class="p-3">
                    <div class="flex justify-center gap-2">
                        <button onclick="editarColacionCeco(${regla.id})"
                            class="px-3 py-2 rounded-xl bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold">
                            Editar
                        </button>
                        <button onclick="eliminarColacionCeco(${regla.id})"
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

function renderizarColacion(){

    poblarCecosColacion()
    renderizarTablaColacion()

}

// Carga una colación existente en el formulario para editarla.
function editarColacionCeco(id){

    const regla =
        (colacionConfigGlobal || []).find(r => r.id === id)

    if(!regla){ return }

    poblarCecosColacion()
    document.getElementById("colacion-ceco").value = regla.ceco
    document.getElementById("colacion-minutos").value = regla.minutos

}

async function guardarColacionCeco(){

    const ceco =
        document.getElementById("colacion-ceco").value

    const minutos =
        parseInt(document.getElementById("colacion-minutos").value, 10)

    if(!ceco){
        alert("Selecciona un CECO.")
        return
    }

    if(!Number.isFinite(minutos) || minutos < 0){
        alert("Indica los minutos de colación (un número válido).")
        return
    }

    const respuesta =
        await guardarConfiguracionColacion({ ceco, minutos })

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
                "No se pudo guardar la colación"
            )
        )
        return
    }

    colacionConfigGlobal = await obtenerConfiguracionColacion()
    renderizarColacion()

    // Refresca la grilla para reflejar los nuevos minutos de colación.
    if(typeof renderizarTrabajadores === "function"){
        renderizarTrabajadores(trabajadoresGlobal)
    }

}

async function eliminarColacionCeco(id){

    if(!confirm("¿Eliminar esta colación? El CECO volverá al valor por defecto.")){
        return
    }

    const respuesta =
        await eliminarConfiguracionColacion(id)

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
                "No se pudo eliminar la colación"
            )
        )
        return
    }

    colacionConfigGlobal = await obtenerConfiguracionColacion()
    renderizarColacion()

    if(typeof renderizarTrabajadores === "function"){
        renderizarTrabajadores(trabajadoresGlobal)
    }

}
