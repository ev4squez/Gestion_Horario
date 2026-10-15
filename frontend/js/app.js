// =====================================================
// VARIABLES GLOBALES
// =====================================================

let trabajadoresGlobal = []

let planificacionGlobal = []

let turnosFrecuentesGlobal = []

// Cargos elegidos en el filtro. Array vacío = "todos los cargos" (sin filtro).
window.cargosSeleccionados =
    []
window.busquedaPlanificacion = window.busquedaPlanificacion || ""


// =====================================================
// CARGA SISTEMA
// =====================================================

async function cargarSistema(){

    // Sin sesión no hay nada que mostrar: el backend rechazaría los GET
    // protegidos y el empty-state se ocupa del resto.
    if(!(adminAutorizado && obtenerToken())){
        return
    }

    trabajadoresGlobal =
        await obtenerTrabajadores()

    planificacionGlobal =
        await obtenerPlanificacion()

    if(typeof obtenerTurnosFrecuentes === "function"){
        const resultado = await obtenerTurnosFrecuentes()
        if(resultado !== null){
            turnosFrecuentesGlobal = resultado
        }
    }

    if(typeof obtenerConfiguracionCobertura === "function"){
        coberturaConfigGlobal =
            await obtenerConfiguracionCobertura()
    }

    if(typeof obtenerConfiguracionColacion === "function"){
        colacionConfigGlobal =
            await obtenerConfiguracionColacion()
    }

    inicializarSelectores()

    cargarCargos()

    actualizarVistaPlanificacion()

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

function trabajadoresPlanificacionVisibles(){

    const porCargo =
        filtrarPorCargos(trabajadoresGlobal)

    const texto =
        normalizarTexto(
            document.getElementById("busqueda-planificacion")?.value ||
            window.busquedaPlanificacion
        )

    if(!texto){
        return porCargo
    }

    return porCargo.filter(t => {

        const turnos =
            planificacionGlobal
                .filter(p => p.trabajador_id === t.id)
                .map(p => `${p.fecha} ${p.turno} ${p.responsable || ""}`)
                .join(" | ")

        const searchable = [
            t.nombre,
            t.responsable,
            t.area,
            t.ceco,
            t.cargo,
            t.rut,
            turnos
        ].map(normalizarTexto).join(" | ")

        return searchable.includes(texto)

    })

}

function actualizarVistaPlanificacion(){

    const listaRender =
        trabajadoresPlanificacionVisibles()

    // Pre-cargar feriados del anio actual antes de renderizar. Si ya
    // estan cacheados no hace falta volver a pedirlos. Tras la carga
    // refrescamos los marcadores visuales invocando un segundo render.
    if(typeof precargarFeriados === 'function'){
        precargarFeriados(anioActual)
            .then(() => {
                if(typeof renderizarTrabajadores === 'function'){
                    renderizarTrabajadores(trabajadoresPlanificacionVisibles())
                }
            })
            .catch(() => {})
    }

    renderizarTrabajadores(
        listaRender
    )

    renderizarResumenDomingos(
        listaRender
    )

    renderizarAlertas(
        listaRender
    )

    if(typeof renderizarCobertura === "function"){
        renderizarCobertura()
    }

}

// Vista Alertas (full-page). Reusa `calcularTodasAlertas` de resumen.js para
// obtener todos los alertas (cobertura + descanso + horas) y los pinta en
// `#contenedor-alertas-vista`. Soporta un filtro rápido por `kind`.
function iconoVistaAlertas(nombre, clase = ""){
    const trazos = {
        error:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>',
        warning:'<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3h.01"/>',
        info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
        check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
        arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
        search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>'
    }
    return `<svg class="alerts-svg ${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trazos[nombre] || trazos.info}</svg>`
}

function renderizarAlertasVista(){
    const contenedor = document.getElementById("contenedor-alertas-vista")
    const badge = document.getElementById("badge-alertas-vista")
    if(!contenedor || !badge) return
    const trabajadores = trabajadoresPlanificacionVisibles().filter(t=>t.activo !== false)
    const todas = calcularTodasAlertas(trabajadores)
    const filtro = document.querySelector(".filtro-alerta.bg-slate-900")?.dataset.filtroAlerta || "todos"
    const prioridad = document.getElementById("prioridad-alertas")?.value || "todos"
    const busqueda = normalizarTexto(document.getElementById("busqueda-alertas")?.value)
    const categorias = {todos:"Todas",cobertura:"Cobertura",descanso:"Descanso",horas:"Horas"}
    Object.entries(categorias).forEach(([key,label])=>{
        const boton = document.querySelector(`.filtro-alerta[data-filtro-alerta="${key}"]`)
        const n = key === "todos" ? todas.length : todas.filter(a=>a.kind===key).length
        if(boton){
            boton.innerHTML = `${label}<span class="alerts-tab-count">${n}</span>`
            boton.setAttribute("aria-pressed",String(key===filtro))
        }
    })
    const contexto = document.getElementById("alertas-contexto")
    const periodo = new Date(anioActual,mesActual,1).toLocaleDateString("es-CL",{month:"long",year:"numeric"})
    if(contexto) contexto.textContent = `${periodo} · ${window.cargosSeleccionados?.length ? window.cargosSeleccionados.join(", ") : "Todos los cargos"}${window.busquedaPlanificacion ? ` · Filtro de planificación: ${window.busquedaPlanificacion}` : ""}`
    const criticas = todas.filter(a=>a.tipo==="danger").length
    const advertencias = todas.filter(a=>a.tipo==="warning").length
    const estado = document.getElementById("alertas-estado")
    if(estado){
        estado.classList.toggle("alerts-status-clear",!todas.length)
        estado.innerHTML = `${iconoVistaAlertas(criticas ? "error" : todas.length ? "info" : "check")}
            <div><strong>${criticas ? `${criticas} caso${criticas===1 ? " crítico requiere" : "s críticos requieren"} atención` : todas.length ? "Revisa los ajustes pendientes" : "Sin alertas detectadas"}</strong>
            <p>${todas.length ? `${advertencias} advertencias · ${todas.length-criticas-advertencias} informativas. Revisa primero la cobertura y el descanso.` : "No se detectaron conflictos para el período y los filtros seleccionados."}</p></div>`
    }
    const orden = {danger:0,warning:1,info:2}
    const filtradas = todas.filter(a=>(filtro==="todos" || a.kind===filtro) && (prioridad==="todos" || a.tipo===prioridad) &&
        (!busqueda || normalizarTexto([a.trabajador,a.responsable,a.titulo,a.mensaje,a.detalle,a.fecha,a.fecha1,a.fecha2,a.kind,a.semana ? `Semana ${a.semana}` : ""].join(" ")).includes(busqueda)))
        .sort((a,b)=>(orden[a.tipo] ?? 2)-(orden[b.tipo] ?? 2) || String(a.fecha || a.fecha1 || "").localeCompare(String(b.fecha || b.fecha1 || "")))
    badge.textContent = `${filtradas.length} de ${todas.length} alerta${todas.length===1 ? "" : "s"}`
    window.estadoIslasAlertas = window.estadoIslasAlertas || {}
    contenedor.querySelectorAll(".alerts-island").forEach(isla=>{
        window.estadoIslasAlertas[isla.dataset.categoria] = {
            abierta:isla.open, scroll:isla.querySelector(".alerts-island-body")?.scrollTop || 0
        }
    })
    const grupos = Object.entries(categorias).filter(([key])=>key!=="todos")
        .map(([key,titulo])=>({key,titulo,items:filtradas.filter(a=>a.kind===key)}))
        .filter(g=>g.items.length)
    contenedor.classList.toggle("alerts-islands-single",grupos.length===1)
    contenedor.innerHTML = filtradas.length ? grupos.map(grupo=>{
        const criticas = grupo.items.filter(a=>a.tipo==="danger").length
        const estado = window.estadoIslasAlertas[grupo.key]
        return `<details class="alerts-island alerts-island-${grupo.key}" data-categoria="${grupo.key}" ${estado?.abierta===false ? "" : "open"}>
            <summary class="alerts-island-heading"><div><h3>${grupo.titulo}</h3><p>${criticas ? `${criticas} crítica${criticas===1 ? "" : "s"} · ` : ""}${grupo.items.length} alerta${grupo.items.length===1 ? "" : "s"}</p></div>
                <span class="alerts-island-count">${grupo.items.length}</span><span class="alerts-island-chevron">${iconoVistaAlertas("arrow")}</span>
            </summary>
            <div class="alerts-island-body" tabindex="0" role="region" aria-label="Alertas de ${grupo.titulo}">${grupo.items.map(renderAlertaCard).join("")}</div>
        </details>`
    }).join("") :
        `<div class="alerts-empty">${iconoVistaAlertas(todas.length ? "search" : "check")}<strong>${todas.length ? "No hay coincidencias" : "Todo revisado para esta selección"}</strong><p>${todas.length ? "Prueba otra búsqueda, categoría o prioridad." : "Puedes revisar otro período o ajustar las reglas de cobertura."}</p></div>`
    contenedor.querySelectorAll(".alerts-island").forEach(isla=>{
        const cuerpo = isla.querySelector(".alerts-island-body")
        cuerpo.scrollTop = window.estadoIslasAlertas[isla.dataset.categoria]?.scroll || 0
    })
}

function renderAlertaCard(alerta){
    const prioridad = {danger:["Crítica","error"],warning:["Advertencia","warning"],info:["Informativa","info"]}
    const tipo = prioridad[alerta.tipo] ? alerta.tipo : "warning"
    const [etiqueta,icono] = prioridad[tipo]
    const categorias = {cobertura:"Cobertura",descanso:"Descanso",horas:"Horas semanales"}
    const titulo = alerta.trabajador || alerta.titulo || "Cobertura pendiente"
    const fecha = alerta.kind === "horas" ? `Semana ${alerta.semana}` : alerta.kind === "descanso" ? `${alerta.fecha1} → ${alerta.fecha2}` : alerta.fecha || ""
    let mensaje = alerta.mensaje || "Revisa la cobertura configurada."
    if(alerta.kind === "descanso") mensaje = `${Number(alerta.descanso).toFixed(1)} h de descanso entre jornadas · Mínimo 12 h`
    if(alerta.kind === "horas") mensaje = `${Number(alerta.horas).toFixed(1)} h asignadas / ${Number(alerta.jornada)} h de jornada · ${Number(alerta.diferencia)>0 ? "+" : ""}${Number(alerta.diferencia).toFixed(1)} h de diferencia`
    const accion = alerta.kind === "cobertura" ? "mostrarVistaCobertura()" : "mostrarVistaPlanificacion(false)"
    return `<article class="alerts-row alerts-row-${tipo}">
        ${iconoVistaAlertas(icono,"alerts-row-icon")}
        <div class="alerts-row-content"><div class="alerts-row-meta"><span class="alerts-priority">${etiqueta}</span><span>${categorias[alerta.kind] || "Alerta"}</span><span>${escaparHTML(fecha)}</span></div>
            <h3>${escaparHTML(titulo)}</h3><p>${escaparHTML(mensaje)}</p>
            ${alerta.detalle ? `<details class="alerts-row-detail"><summary>Ver detalle</summary><p>${escaparHTML(alerta.detalle)}</p></details>` : ""}
        </div>
        <button type="button" class="alerts-row-action" onclick="${accion}">${alerta.kind === "cobertura" ? "Ver cobertura" : "Ver planificación"}${iconoVistaAlertas("arrow")}</button>
    </article>`
}

function renderAlertaCobertura(alerta, tono){

    return `
        <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${tono.chip}">
                ${tono.etiqueta}
            </span>
            <span class="font-mono text-xs ${tono.texto} opacity-70">
                ${escaparHTML(alerta.titulo || "")}
            </span>
        </div>
        <p class="mt-1 font-black ${tono.texto}">
            ${escaparHTML(alerta.mensaje || "Brecha detectada")}
        </p>
        ${
            alerta.detalle
                ? `<p class="mt-1 text-xs ${tono.texto} opacity-80">${escaparHTML(alerta.detalle)}</p>`
                : ""
        }
    `

}

function renderAlertaHoras(alerta, tono){

    const horasNum = parseFloat(alerta.horas) || 0
    const jornadaNum = parseInt(alerta.jornada) || 0
    const diferencia = parseFloat(alerta.diferencia) || 0
    const exceso = diferencia > 0

    const pct = jornadaNum > 0
        ? Math.min(100, Math.round((horasNum / jornadaNum) * 100))
        : 0

    const barraColor = horasNum >= jornadaNum
        ? "bg-emerald-500"
        : horasNum >= jornadaNum * 0.8
            ? "bg-blue-500"
            : horasNum > jornadaNum
                ? "bg-red-500"
                : "bg-amber-500"

    return `
        <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${tono.chip}">
                ${exceso ? "Horas extra" : "Bajo jornada"}
            </span>
            <span class="font-black ${tono.texto}">
                Semana ${escaparHTML(String(alerta.semana || ""))}
            </span>
        </div>
        <p class="mt-1 font-black ${tono.texto}">
            ${escaparHTML(alerta.trabajador || "")}
        </p>
        <div class="mt-2 flex items-center gap-3">
            <div class="flex-1">
                <div class="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div class="h-full ${barraColor}" style="width: ${pct}%"></div>
                </div>
            </div>
            <span class="text-xs font-bold ${tono.texto} whitespace-nowrap">
                ${horasNum.toFixed(1)}h / ${jornadaNum}h
            </span>
        </div>
        <p class="mt-1 text-xs ${tono.texto} opacity-80">
            ${
                exceso
                    ? `+${diferencia.toFixed(1)}h sobre la meta`
                    : `${Math.abs(diferencia).toFixed(1)}h por debajo de la meta`
            }
        </p>
    `

}

function renderAlertaDescanso(alerta, tono){

    const descanso = parseFloat(alerta.descanso) || 0
    const esCritico = alerta.tipo === "danger"

    return `
        <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${tono.chip}">
                ${esCritico ? "Descanso crítico" : "Descanso corto"}
            </span>
        </div>
        <p class="mt-1 font-black ${tono.texto}">
            ${escaparHTML(alerta.trabajador || "")}
        </p>
        <p class="mt-1 text-xs ${tono.texto} opacity-80 flex items-center gap-1">
            <span class="material-symbols-outlined text-sm">event</span>
            ${escaparHTML(alerta.fecha1 || "")} → ${escaparHTML(alerta.fecha2 || "")}
        </p>
        <p class="mt-1 text-xs ${tono.texto} opacity-80 flex items-center gap-1">
            <span class="material-symbols-outlined text-sm">hotel</span>
            Descanso real: <strong>${descanso.toFixed(1)}h</strong>
            <span class="opacity-70">(mínimo legal 12h)</span>
        </p>
    `

}

// Wire de los botones de filtro de la vista Alertas. Selecciona uno solo a
// la vez y re-pinta la lista.
function wireFiltrosAlertas(){

    const botones = document.querySelectorAll(".filtro-alerta")

    if(!botones || botones.length === 0){ return }

    botones.forEach(boton => {

        if(boton.dataset.wired === "1"){ return }
        boton.dataset.wired = "1"

        boton.addEventListener("click", () => {

            botones.forEach(b =>
                b.classList.remove("bg-slate-900", "text-white")
            )
            botones.forEach(b =>
                b.classList.add("bg-slate-100", "text-slate-700")
            )

            boton.classList.remove("bg-slate-100", "text-slate-700")
            boton.classList.add("bg-slate-900", "text-white")

            renderizarAlertasVista()

        })

    })

}

document.addEventListener("DOMContentLoaded", () => {
    wireFiltrosAlertas()
})

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

    // El panel se divide en dos zonas: buscador sticky arriba y la lista
    // scrollable debajo. Cada fila de cargo lleva `data-cargo` para que
    // `motorBuscarCargo` pueda ocultar/mostrar según el query.
    const filasCargos = cargos.map(c => {

        const marcado =
            window.cargosSeleccionados.includes(c)

        return `
            <label data-cargo="${escaparHTML(c)}"
                class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-blue-50">
                <input type="checkbox"
                    class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    value="${escaparHTML(c)}"
                    ${marcado ? "checked" : ""}
                    onchange="alternarCargo(this.value, this.checked)">
                <span>${escaparHTML(c)}</span>
            </label>
        `

    }).join("")

    // Capturamos el filtro activo ANTES de reemplazar el innerHTML: el
    // nuevo <input> arranca con `value=""`, así que si leemos después ya
    // perdimos el texto que el usuario había tipeado.
    const filtroPrevio =
        document.getElementById("busqueda-cargos")?.value ?? ""

    panel.innerHTML = `
        <div class="sticky top-0 z-10 bg-white border-b border-slate-100 p-2">
            <label class="relative block">
                <span class="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">
                    search
                </span>
                <input id="busqueda-cargos" type="search"
                    oninput="motorBuscarCargo(this.value)"
                    placeholder="Buscar cargo…"
                    autocomplete="off"
                    class="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </label>
        </div>
        <div id="filtro-cargo-lista" class="p-1">
            <label class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-blue-50 font-semibold">
                <input type="checkbox"
                    class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    ${todosActivo ? "checked" : ""}
                    onchange="seleccionarTodosCargos()">
                <span>Todos los cargos</span>
            </label>
            <div class="my-1 border-t border-slate-100"></div>
            ${filasCargos}
            <div id="filtro-cargo-vacio" class="hidden px-3 py-2 text-center text-xs text-slate-400">
                Sin coincidencias
            </div>
        </div>
    `

    // Restauramos el filtro sobre el nuevo panel (si lo había). Restauramos
    // también el `value` del input nuevo para que no se vea vacío mientras
    // el usuario sigue tipeando.
    if(filtroPrevio.trim() !== ""){
        const nuevoInput =
            document.getElementById("busqueda-cargos")

        if(nuevoInput){
            nuevoInput.value = filtroPrevio
        }

        motorBuscarCargo(filtroPrevio)
    }

    actualizarEtiquetaCargos()

}

// Filtra las filas de cargo según el texto tipeado. Case/accent-insensitive
// gracias a `normalizarTexto` (definida en api.js). La selección persiste;
// solo cambia la visibilidad de las casillas.
function motorBuscarCargo(query){

    const lista =
        document.getElementById("filtro-cargo-lista")

    const vacio =
        document.getElementById("filtro-cargo-vacio")

    if(!lista){ return }

    const queryNorm =
        normalizarTexto(String(query || "").trim())

    const filas = lista.querySelectorAll("[data-cargo]")

    let visibles = 0

    filas.forEach(fila => {

        const cargo =
            fila.getAttribute("data-cargo") || ""

        const coincide =
            queryNorm === "" ||
            normalizarTexto(cargo).includes(queryNorm)

        fila.classList.toggle("hidden", !coincide)

        if(coincide){ visibles++ }

    })

    if(vacio){
        vacio.classList.toggle("hidden", visibles > 0)
    }

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

    if(typeof guardarPreferenciaCargos === "function") guardarPreferenciaCargos()

    cargarCargos()
    filtrarCargo()

}

// "Todos": limpia la selección (= sin filtro).
function seleccionarTodosCargos(){

    window.cargosSeleccionados = []

    if(typeof guardarPreferenciaCargos === "function") guardarPreferenciaCargos()

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

    actualizarVistaPlanificacion()

}

function aplicarBusquedaPlanificacion(){

    const input =
        document.getElementById("busqueda-planificacion")

    window.busquedaPlanificacion =
        input ? input.value : ""

    actualizarVistaPlanificacion()

}


// =====================================================
// HELPERS DE PRESENTACIÓN
// =====================================================

const NOMBRES_DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

// Devuelve la duración cruda del turno en formato "Xh Ymin", "Xh" o string
// vacío para estados como Libre/Saliente/Vacaciones. Se muestra como subtexto
// bajo el input de la celda del planificador. Sin descuento de colación:
// refleja la franja real firmada por el admin.
function formatearDuracionTurno(turno){
    const match = String(turno || "").match(
        /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/
    )
    if(!match){ return "" }

    const inicio = parseInt(match[1]) + parseInt(match[2]) / 60
    let fin = parseInt(match[3]) + parseInt(match[4]) / 60
    if(fin < inicio){ fin += 24 }

    const totalMinutos = Math.round((fin - inicio) * 60)
    const horas = Math.floor(totalMinutos / 60)
    const minutos = totalMinutos % 60

    if(horas === 0){ return `${minutos}min` }
    if(minutos === 0){ return `${horas}h` }
    return `${horas}h ${minutos}min`
}

// Refresca el subtexto de duración del input recién editado. El planificador
// no re-renderiza la celda al tipear (lo hace `guardarTurno` pero solo tras
// recargar la planificación), así que sin este helper el subtexto queda
// stale hasta el próximo repintado completo.
window.actualizarSubtextoDuracion = function(input){
    const celda = input ? input.parentElement : null
    const subtexto = celda ? celda.querySelector(".turno-duracion") : null
    if(subtexto){
        subtexto.textContent = formatearDuracionTurno(input.value)
    }
}

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

// Las alertas diarias se muestran en las mismas columnas que los turnos.
function alertasParaFecha(alertas, fecha){
    return alertas.filter(a => a.kind === "cobertura"
        ? a.fecha === fecha
        : a.kind === "descanso" && (a.fecha1 === fecha || a.fecha2 === fecha))
}

function motivoAlertaPlanificacion(alerta){
    const titulo = alerta.kind === "cobertura" ? alerta.titulo : alerta.trabajador
    const detalle = alerta.kind === "descanso"
        ? `Descanso: ${alerta.descanso.toFixed(1)}h · ${alerta.fecha1} → ${alerta.fecha2}`
        : alerta.kind === "horas"
            ? `${alerta.horas}h / ${alerta.jornada}h · ${alerta.diferencia > 0 ? "+" : ""}${alerta.diferencia}h`
            : `${alerta.mensaje} · ${alerta.detalle}`
    return `${titulo || ""}: ${detalle}`
}

function renderIconoAlertas(alertas, etiqueta, icono = "warning", texto = alertas.length){
    if(!alertas.length) return ""
    const tono = alertas.some(a => a.tipo === "danger")
        ? "text-red-700 bg-red-50"
        : alertas.some(a => a.tipo === "warning")
            ? "text-amber-700 bg-amber-50"
            : "text-blue-700 bg-blue-50"
    const motivo = `${etiqueta} (${alertas.length})\n${alertas.map(motivoAlertaPlanificacion).join("\n")}`
    return `<button type="button" class="planning-alert inline-flex items-center gap-1 rounded-lg px-1.5 py-1 align-middle cursor-help ${tono}"
        title="${escaparHTML(motivo)}" aria-label="${escaparHTML(motivo)}">
        <span class="material-symbols-outlined" aria-hidden="true">${icono}</span>
        <span class="text-[10px] font-bold">${escaparHTML(String(texto))}</span>
    </button>`
}

function alertasCoberturaSemana(alertas, semana){
    const fechas = new Set(Array.from({length: 7}, (_, dia) => {
        const fecha = new Date(semana.inicio)
        fecha.setDate(fecha.getDate() + dia)
        return `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,"0")}-${String(fecha.getDate()).padStart(2,"0")}`
    }))
    return alertas.filter(a => a.kind === "cobertura" && fechas.has(a.fecha))
}

function alternarPanelCarga(){
    window.panelCargaPlegado = !window.panelCargaPlegado
    mostrarPanelDerecho()
}

function renderizarTrabajadores(trabajadores){
    trabajadores = (trabajadores || []).filter(t => t.activo !== false)
    document.getElementById("total-trabajadores").innerText = trabajadores.length
    const contenedor = document.getElementById("contenedor-responsables")
    const semanas = generarSemanas(mesActual, anioActual)
    const alertas = calcularTodasAlertas(trabajadores)
    contenedor.innerHTML = semanas.map((semana, index) => {
        const fechas = Array.from({length:7}, (_, dia) => {
            const fecha = new Date(semana.inicio)
            fecha.setDate(fecha.getDate() + dia)
            return {fecha, iso: resumenFechaISO(fecha), nombre: NOMBRES_DIAS[dia]}
        })
        return `<section class="planning-week card" aria-label="Semana ${index + 1}">
            <div class="planning-week-header">
                <h2>Semana ${index + 1}</h2>
                <p>${formatearFecha(semana.inicio)} al ${formatearFecha(semana.fin)}</p>
            </div>
            <div class="schedule-scroll" tabindex="0" role="region" aria-label="Turnos de la semana ${index + 1}">
                <table class="schedule-table">
                    <caption class="sr-only">Planificación semanal de colaboradores. Las horas descuentan colación.</caption>
                    <thead><tr><th scope="col" class="schedule-name">Colaborador</th>
                        ${fechas.map(({fecha, iso, nombre}) => `<th scope="col" class="${feriadoDe(iso) ? "schedule-holiday" : ""}">
                            ${nombre} <strong>${fecha.getDate()}</strong>
                            ${feriadoDe(iso) ? `<span class="schedule-holiday-label" title="${escaparHTML(feriadoDe(iso).nombre)}">Feriado<span class="sr-only">: ${escaparHTML(feriadoDe(iso).nombre)}</span></span>` : ""}
                            ${renderIconoAlertas(alertasParaFecha(alertas, iso).filter(a => a.kind === "cobertura"), `Cobertura del ${iso}`, "groups")}
                        </th>`).join("")}
                        <th scope="col">Horas / jornada</th>
                    </tr></thead>
                    <tbody>${trabajadores.map(t => {
                        const turnos = fechas.map(({iso}) => obtenerTurnoGuardado(t.id, iso))
                        const horas = calcularHorasSemana(turnos, colacionPorCeco(t.ceco))
                        return `<tr class="fila-trabajador" data-trabajador-id="${t.id}">
                            <th scope="row" class="schedule-name">
                                <span class="jornada-data hidden">${t.jornada}</span>
                                <span class="schedule-person" title="${escaparHTML(t.nombre)}">${escaparHTML(t.nombre)}</span>
                                <small title="${escaparHTML(t.responsable || "Sin responsable")}">${escaparHTML(t.responsable || "Sin responsable")}</small>
                                <small>Colación ${colacionMinutosPorCeco(t.ceco)} min</small>
                            </th>
                            ${fechas.map(({fecha, iso}, dia) => {
                                const descanso = alertasParaFecha(alertas, iso).filter(a => a.kind === "descanso" && String(a.trabajador_id) === String(t.id))
                                const minimo = descanso.length ? Math.min(...descanso.map(a => a.descanso)).toFixed(1).replace(/\.0$/, "") : ""
                                const feriado = feriadoDe(iso)
                                return `<td class="schedule-day ${fecha.getMonth() !== mesActual ? "schedule-outside" : ""} ${feriado ? "schedule-holiday" : ""}">
                                    <input value="${escaparHTML(turnos[dia])}" data-fecha="${iso}" maxlength="13"
                                        aria-label="Turno de ${escaparHTML(t.nombre)}, ${iso}" placeholder="00:00 - 00:00"
                                        class="turno-input"
                                        onfocus="abrirListaTurnos(this)"
                                        oninput="limpiarErrorFormatoTurno(this); filtrarListaTurnos(this)"
                                        onblur="if(validarFormatoTurno(this) !== null){ actualizarColor(this); recalcularFila(this); guardarTurno(this); if(window.actualizarSubtextoDuracion){window.actualizarSubtextoDuracion(this);} }">
                                    <div class="schedule-cell-detail">
                                        <span class="turno-duracion">${formatearDuracionTurno(turnos[dia])}</span>
                                        ${renderIconoAlertas(descanso, "Descanso insuficiente entre jornadas (mínimo 12h)", "hotel", `${minimo}h`)}
                                    </div>
                                </td>`
                            }).join("")}
                            <td class="schedule-hours">
                                <div class="columna-horas">${htmlBloqueHoras(horas, t.jornada)}</div>
                                ${renderIconoAlertas(alertas.filter(a => a.kind === "horas" && a.semana === index + 1 && String(a.trabajador_id) === String(t.id)), "Horas semanales", "schedule")}
                            </td>
                        </tr>`
                    }).join("") || '<tr><td colspan="9" class="schedule-empty">No hay colaboradores para los filtros seleccionados.</td></tr>'}</tbody>
                </table>
            </div>
        </section>`
    }).join("")
    document.querySelectorAll(".turno-input").forEach(actualizarColor)
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

function obtenerTurnosDisponibles(ceco = null){
    const estados = ["Libre", "Saliente", "Vacaciones"]
    const cecoNormalizado = normalizarTexto(ceco)
    const hayConfigurados = (turnosFrecuentesGlobal || []).length > 0

    // ¿Hay catálogo relevante para este CECO? Coincide cuando el CECO tiene
    // turnos propios o cuando se piden los defaults globales (ceco === null).
    const hayCatalogoParaCeco = ceco === null
        ? hayConfigurados
        : (turnosFrecuentesGlobal || []).some(item =>
            normalizarTexto(item.ceco) === cecoNormalizado
        )

    const configurados = (turnosFrecuentesGlobal || [])
        .filter(item =>
            ceco === null ||
            normalizarTexto(item.ceco) === cecoNormalizado
        )
        .map(item => item.turno)

    // Defaults legacy: solo aparecen cuando NUNCA se configuró nada para el
    // CECO pedido (incluye el caso global). Si ya hay catálogo relevante se
    // respeta la configuración del usuario sin contaminar con la lista fija.
    const predeterminados = hayCatalogoParaCeco
        ? []
        : [
            "09:00 - 18:30",
            "09:00 - 17:30",
            "16:30 - 03:00",
            "17:30 - 04:00",
            "18:30 - 05:00",
            "19:30 - 06:00"
        ]

    return [...new Set([...configurados, ...predeterminados, ...estados])]
}

function obtenerCecoDesdeInputTurno(input){
    const fila = input ? input.closest(".fila-trabajador") : null
    const trabajadorId = fila
        ? parseInt(fila.dataset.trabajadorId)
        : null
    const trabajador = (trabajadoresGlobal || []).find(
        item => item.id === trabajadorId
    )

    return trabajador ? trabajador.ceco : ""
}

let dropdownTurnos = null
let inputTurnoActivo = null

function crearDropdownTurnos(){
    dropdownTurnos = document.createElement("div")
    dropdownTurnos.className =
        "fixed z-50 max-h-72 overflow-y-auto overscroll-contain " +
        "rounded-xl border border-slate-200 bg-white shadow-lg " +
        "text-sm hidden"
    // `-webkit-overflow-scrolling: touch` mejora el scroll con trackpad /
    // panel táctil en navegadores antiguos y mantiene momentum en iOS.
    dropdownTurnos.style.WebkitOverflowScrolling = "touch"
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

    // Cerrar al hacer scroll, pero IGNORANDO el scroll que ocurre DENTRO
    // del propio dropdown. Sin ese chequeo el scroll interno se propaga al
    // window en capture-phase y `cerrarListaTurnos()` cierra la lista
    // mientras el usuario todavía está navegando opciones.
    window.addEventListener(
        "scroll",
        function(e){
            if(
                dropdownTurnos &&
                dropdownTurnos.contains(e.target)
            ){
                return
            }
            cerrarListaTurnos()
        },
        true,
    )
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

function limpiarErrorFormatoTurno(input){

    input.setCustomValidity("")

    input.classList.remove(
        "border-red-500",
        "ring-4",
        "ring-red-100"
    )

}

function validarFormatoTurno(input){

    const valor =
        String(input.value || "").trim()

    const estados = {
        libre: "Libre",
        saliente: "Saliente",
        vacaciones: "Vacaciones"
    }

    if(valor === ""){
        input.value = "Libre"
        limpiarErrorFormatoTurno(input)
        return "Libre"
    }

    const estado =
        estados[valor.toLowerCase()]

    if(estado){
        input.value = estado
        limpiarErrorFormatoTurno(input)
        return estado
    }

    const formatoHorario =
        /^([01]\d|2[0-3]):([0-5]\d)\s-\s([01]\d|2[0-3]):([0-5]\d)$/

    if(!formatoHorario.test(valor)){

        input.setCustomValidity(
            "Ingrese el horario en formato 24 horas: 00:00 - 00:00"
        )

        input.classList.add(
            "border-red-500",
            "ring-4",
            "ring-red-100"
        )

        input.title =
            "Formato requerido: 00:00 - 00:00"

        input.reportValidity()

        return null

    }

    input.value = valor
    limpiarErrorFormatoTurno(input)

    return valor

}

function renderListaTurnos(input, filtro){
    const texto = (filtro || "").trim().toLowerCase()
    const ceco = obtenerCecoDesdeInputTurno(input)
    const opciones = obtenerTurnosDisponibles(ceco).filter(t =>
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
        const duracion = formatearDuracionTurno(opcion)
        item.className = "px-3 py-2 cursor-pointer hover:bg-blue-50 text-center"
        item.innerHTML = duracion
            ? `${escaparHTML(opcion)}<span class="block text-[10px] text-slate-400 tabular-nums">${escaparHTML(duracion)}</span>`
            : escaparHTML(opcion)
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

    // Defensa en profundidad: la vista ya está gateada, pero si llegara
    // un input sin sesión (p. ej. cache viejo) no mandamos el POST.
    if(!(adminAutorizado && obtenerToken())){
        iniciarSesion()
        return
    }

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

    const turno =
        validarFormatoTurno(input)

    if(turno === null){
        return
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

    const respuesta =
        await guardarPlanificacion({
            trabajador_id:
                trabajador.id,

            responsable:
                trabajador.responsable,

            fecha,

            turno,

            horas

        })

    if(!respuesta.ok){

        if(respuesta.status === 401){
            alert("Sesión expirada. Inicia sesión nuevamente.")
            cerrarSesionAdmin()
            return
        }

        let mensaje =
            "No se pudo guardar el turno."

        try{
            const error =
                await respuesta.json()

            if(error && error.detail){
                mensaje = error.detail
            }
        }catch(e){}

        alert(
            `${mensaje}. Revisa el turno ingresado y vuelve a intentarlo.`
        )
        return

    }

    // =====================================
    // RECARGAR PLANIFICACION
    // =====================================

    planificacionGlobal =
        await obtenerPlanificacion()
    actualizarVistaPlanificacion()

}

// =====================================================
// INIT
// =====================================================
// cargarSistema() se invoca desde inicializarSesion() una vez validado
// el token contra el backend. Sin sesión los GET protegidos devolverían
// 401 y dejarían los datos en estado inconsistente.

// Tooltip compartido fuera de la tabla para que el scroll no lo recorte.
let tooltipPlanificacion = null
let alertaConTooltip = null
function ocultarTooltipPlanificacion(){
    if(tooltipPlanificacion) tooltipPlanificacion.remove()
    if(alertaConTooltip){
        alertaConTooltip.title = alertaConTooltip.dataset.motivoAlerta || ""
        alertaConTooltip.removeAttribute("aria-describedby")
    }
    tooltipPlanificacion = null
    alertaConTooltip = null
}
function mostrarTooltipPlanificacion(evento){
    const boton = evento.target.closest?.(".planning-alert")
    if(!boton || boton === alertaConTooltip) return
    ocultarTooltipPlanificacion()
    const motivo = boton.title
    if(!motivo) return
    boton.dataset.motivoAlerta = motivo
    boton.title = ""
    alertaConTooltip = boton
    tooltipPlanificacion = document.createElement("div")
    tooltipPlanificacion.id = "planning-alert-tooltip"
    tooltipPlanificacion.className = "planning-tooltip"
    tooltipPlanificacion.setAttribute("role", "tooltip")
    tooltipPlanificacion.textContent = motivo
    document.body.appendChild(tooltipPlanificacion)
    boton.setAttribute("aria-describedby", tooltipPlanificacion.id)
    const r = boton.getBoundingClientRect()
    const t = tooltipPlanificacion.getBoundingClientRect()
    tooltipPlanificacion.style.left = Math.max(12, Math.min(r.left, innerWidth - t.width - 12)) + "px"
    tooltipPlanificacion.style.top = Math.max(12, r.top >= t.height + 12 ? r.top - t.height - 8 : Math.min(r.bottom + 8, innerHeight - t.height - 12)) + "px"
}
document.addEventListener("mouseover", mostrarTooltipPlanificacion)
document.addEventListener("focusin", mostrarTooltipPlanificacion)
document.addEventListener("mouseout", e => {
    if(alertaConTooltip && !alertaConTooltip.contains(e.relatedTarget)) ocultarTooltipPlanificacion()
})
document.addEventListener("focusout", ocultarTooltipPlanificacion)
document.addEventListener("scroll", ocultarTooltipPlanificacion, true)
document.addEventListener("keydown", e => { if(e.key === "Escape") ocultarTooltipPlanificacion() })
