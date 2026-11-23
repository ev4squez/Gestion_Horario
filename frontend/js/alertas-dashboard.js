// Dashboard de monitoreo. Los indicadores resumen el período y los cargos
// seleccionados; los filtros refinan el detalle sin cambiar esos totales.
const CATEGORIAS_DASHBOARD_ALERTAS = {
    cobertura: {nombre: "Cobertura", detalle: "Dotación de apertura, cierre y continuidad"},
    descanso: {nombre: "Descanso", detalle: "Separación entre jornadas"},
    horas: {nombre: "Horas semanales", detalle: "Diferencias con la jornada contratada"}
}
const PRIORIDADES_DASHBOARD_ALERTAS = {
    danger: "Críticas", warning: "Advertencias", info: "Informativas"
}

function semanaDashboardAlerta(alerta, semanas){
    if(alerta.kind === "horas"){
        const numero = Number(alerta.semana)
        return Number.isInteger(numero) && numero > 0 && numero <= semanas.length ? numero : 0
    }
    // Un descanso puede empezar antes de la grilla y terminar dentro de ella.
    // Cada incidencia se cuenta una sola vez, aunque abarque dos fechas.
    for(const valor of [alerta.fecha, alerta.fecha1, alerta.fecha2]){
        if(!valor) continue
        const fecha = String(valor).slice(0, 10)
        const indice = semanas.findIndex(s => fecha >= resumenFechaISO(s.inicio) && fecha <= resumenFechaISO(s.fin))
        if(indice >= 0) return indice + 1
    }
    return 0
}

function contarPrioridadesDashboard(alertas){
    const conteos = {todos: alertas.length, danger: 0, warning: 0, info: 0}
    alertas.forEach(a => { conteos[a.tipo]++ })
    return conteos
}

function filtrarDashboardAlertas(campo, valor){
    const ids = {categoria: "categoria-alertas", prioridad: "prioridad-alertas", semana: "semana-alertas"}
    const control = document.getElementById(ids[campo])
    if(!control) return
    control.value = String(valor)
    window.paginaDashboardAlertas = 1
    renderizarAlertasVista()
    const atributo = {categoria: "data-categoria-dashboard", prioridad: "data-prioridad-dashboard", semana: "data-semana-dashboard"}[campo]
    const boton = [...document.querySelectorAll(`[${atributo}]`)].find(el => el.getAttribute(atributo) === String(valor))
    boton?.focus({preventScroll: true})
}

function limpiarFiltrosDashboardAlertas(){
    for(const id of ["categoria-alertas", "prioridad-alertas", "semana-alertas"]){
        document.getElementById(id).value = "todos"
    }
    document.getElementById("busqueda-alertas").value = ""
    window.paginaDashboardAlertas = 1
    renderizarAlertasVista()
}

function cambiarPaginaDashboardAlertas(delta){
    window.paginaDashboardAlertas = (window.paginaDashboardAlertas || 1) + delta
    renderizarAlertasVista()
}

function cargosDisponiblesDashboardAlertas(){
    return [...new Set(trabajadoresGlobal
        .filter(t => t.activo !== false)
        .map(t => t.cargo)
        .filter(cargo => typeof cargo === "string" && cargo.trim()))]
        .sort((a,b) => a.localeCompare(b, "es"))
}

function renderizarAlertasVista(){
    const contenedor = document.getElementById("contenedor-alertas-vista")
    const indicadores = document.getElementById("alertas-kpis")
    const botonCargo = document.getElementById("cargo-alertas")
    if(!contenedor || !indicadores || !botonCargo) return

    const cargos = cargosDisponiblesDashboardAlertas()
    const seleccion = window.cargosSeleccionados || []
    const cargo = seleccion.length === 1 && cargos.includes(seleccion[0]) ? seleccion[0] : ""
    botonCargo.textContent = cargo ? `Cambiar cargo: ${cargo}` : "Seleccionar cargo"
    botonCargo.disabled = !cargos.length
    document.querySelectorAll("[data-cargo-requerido]").forEach(el => { el.hidden = !cargo })
    document.getElementById("alertas-sin-cargo").hidden = !!cargo
    const periodo = new Date(anioActual, mesActual, 1).toLocaleDateString("es-CL", {month: "long", year: "numeric"})
    document.getElementById("alertas-contexto").textContent = `${periodo} · ${cargo || "Selecciona un cargo"}`
    const estado = document.getElementById("alertas-estado")
    if(!cargo){
        // No convertir una selección vacía o múltiple en "todos". Tampoco
        // dejar visibles los resultados del cargo consultado anteriormente.
        for(const id of ["alertas-kpis", "alertas-por-categoria", "alertas-por-semana", "contenedor-alertas-vista"]){
            document.getElementById(id).innerHTML = ""
        }
        document.getElementById("badge-alertas-vista").textContent = ""
        document.getElementById("alertas-sin-cargo-mensaje").textContent = cargos.length
            ? "Usa Seleccionar cargo para elegir un único cargo en el mismo modal de Planificación. No se muestran alertas de todos los cargos."
            : "No hay cargos con colaboradores activos. Asigna un cargo en Colaboradores para consultar sus alertas."
        estado.classList.remove("alert-dash-status-clear")
        estado.textContent = "Selecciona un cargo para consultar"
        window.paginaDashboardAlertas = 1
        return
    }

    // La consulta corresponde al cargo completo, no a una búsqueda de
    // personas que haya quedado abierta en la planificación.
    const trabajadores = trabajadoresGlobal.filter(t => t.activo !== false && t.cargo === cargo)
    const semanas = generarSemanas(mesActual, anioActual)
    const todas = calcularTodasAlertas(trabajadores).map(a => ({
        ...a,
        tipo: Object.hasOwn(PRIORIDADES_DASHBOARD_ALERTAS, a.tipo) ? a.tipo : "warning",
        semanaDashboard: semanaDashboardAlerta(a, semanas)
    }))
    const conteos = contarPrioridadesDashboard(todas)
    const categoria = document.getElementById("categoria-alertas").value
    const prioridad = document.getElementById("prioridad-alertas").value
    const busqueda = normalizarTexto(document.getElementById("busqueda-alertas").value)
    const selectorSemana = document.getElementById("semana-alertas")
    const semanaAnterior = selectorSemana.value || "todos"
    const sinFecha = todas.some(a => a.semanaDashboard === 0)
    selectorSemana.innerHTML = '<option value="todos">Todas las semanas</option>' +
        semanas.map((s, i) => `<option value="${i+1}">Semana ${i+1}</option>`).join("") +
        (sinFecha ? '<option value="0">Sin fecha</option>' : "")
    selectorSemana.value = [...selectorSemana.options].some(o => o.value === semanaAnterior) ? semanaAnterior : "todos"
    const semana = selectorSemana.value


    estado.classList.toggle("alert-dash-status-clear", !todas.length)
    estado.textContent = conteos.danger ? `${conteos.danger} alerta${conteos.danger === 1 ? " crítica requiere" : "s críticas requieren"} atención` : todas.length ? "Hay ajustes pendientes" : "Sin alertas detectadas"

    indicadores.innerHTML = Object.entries({todos: "Total de alertas", ...PRIORIDADES_DASHBOARD_ALERTAS}).map(([key, nombre]) => `
        <button type="button" class="alert-dash-kpi alert-dash-kpi-${key}" data-prioridad-dashboard="${key}"
            aria-pressed="${prioridad === key}" onclick="filtrarDashboardAlertas('prioridad','${key}')">
            <span>${nombre}</span><strong>${conteos[key]}</strong>
            <small>${key === "todos" ? "Ver todas las prioridades" : "Filtrar el detalle"}<span aria-hidden="true">↗</span></small>
        </button>`).join("")

    const maxCategoria = Math.max(1, ...Object.keys(CATEGORIAS_DASHBOARD_ALERTAS).map(key => todas.filter(a => a.kind === key).length))
    document.getElementById("alertas-por-categoria").innerHTML = Object.entries(CATEGORIAS_DASHBOARD_ALERTAS).map(([key, datos]) => {
        const total = todas.filter(a => a.kind === key).length
        return `<button type="button" class="alert-dash-category" data-categoria-dashboard="${key}" data-total="${total}"
            aria-pressed="${categoria === key}" onclick="filtrarDashboardAlertas('categoria','${key}')">
            <span class="alert-dash-category-label"><span>${datos.nombre}</span><strong>${total}</strong></span>
            <span class="alert-dash-track" aria-hidden="true"><span style="width:${total / maxCategoria * 100}%"></span></span>
            <small>${datos.detalle}</small>
        </button>`
    }).join("")

    const gruposSemana = semanas.map((s, i) => ({
        numero: i+1, nombre: `Semana ${i+1}`,
        rango: `${s.inicio.toLocaleDateString("es-CL", {day:"2-digit",month:"2-digit"})} – ${s.fin.toLocaleDateString("es-CL", {day:"2-digit",month:"2-digit"})}`,
        conteos: contarPrioridadesDashboard(todas.filter(a => a.semanaDashboard === i+1))
    }))
    if(sinFecha) gruposSemana.push({numero: 0, nombre: "Sin fecha", rango: "Sin fecha asociada", conteos: contarPrioridadesDashboard(todas.filter(a => a.semanaDashboard === 0))})
    const maxSemana = Math.max(1, ...gruposSemana.map(g => g.conteos.todos))
    document.getElementById("alertas-por-semana").innerHTML = gruposSemana.map(g => {
        const etiqueta = `${g.nombre}, ${g.rango}: ${g.conteos.todos} alertas; ${g.conteos.danger} críticas, ${g.conteos.warning} advertencias, ${g.conteos.info} informativas`
        return `<button type="button" class="alert-dash-week" data-semana-dashboard="${g.numero}" data-total="${g.conteos.todos}"
            title="${etiqueta}" aria-label="${etiqueta}" aria-pressed="${semana === String(g.numero)}" onclick="filtrarDashboardAlertas('semana','${g.numero}')">
            <strong>${g.conteos.todos}</strong>
            <span class="alert-dash-stack" aria-hidden="true">${Object.keys(PRIORIDADES_DASHBOARD_ALERTAS).map(key => `<span class="alert-dash-segment-${key}" style="height:${g.conteos[key] / maxSemana * 100}%"></span>`).join("")}</span>
            <span>${g.nombre}</span><small>${g.rango}</small>
        </button>`
    }).join("")

    const orden = {danger: 0, warning: 1, info: 2}
    const filtradas = todas.filter(a => (categoria === "todos" || a.kind === categoria) &&
        (prioridad === "todos" || a.tipo === prioridad) && (semana === "todos" || String(a.semanaDashboard) === semana) &&
        (!busqueda || normalizarTexto([a.trabajador, a.responsable, a.titulo, a.mensaje, a.detalle, a.fecha, a.fecha1, a.fecha2, a.kind,
            CATEGORIAS_DASHBOARD_ALERTAS[a.kind]?.nombre, a.semana ? `Semana ${a.semana}` : ""].join(" ")).includes(busqueda)))
        .sort((a,b) => orden[a.tipo] - orden[b.tipo] || String(a.fecha || a.fecha1 || "").localeCompare(String(b.fecha || b.fecha1 || "")))
    const tamano = Number(document.getElementById("alertas-por-pagina").value) || 10
    const firma = JSON.stringify([anioActual, mesActual, window.cargosSeleccionados, window.busquedaPlanificacion, categoria, prioridad, semana, busqueda, tamano])
    if(window.firmaDashboardAlertas !== firma){
        window.paginaDashboardAlertas = 1
        window.firmaDashboardAlertas = firma
    }
    const paginas = Math.max(1, Math.ceil(filtradas.length / tamano))
    const pagina = Math.max(1, Math.min(paginas, window.paginaDashboardAlertas || 1))
    window.paginaDashboardAlertas = pagina
    const inicio = (pagina - 1) * tamano
    document.getElementById("badge-alertas-vista").textContent = `${filtradas.length} de ${todas.length} alertas`
    document.getElementById("alertas-pagina").textContent = `Página ${pagina} de ${paginas}`
    document.getElementById("alertas-anterior").disabled = pagina <= 1
    document.getElementById("alertas-siguiente").disabled = pagina >= paginas
    document.getElementById("alertas-rango").textContent = filtradas.length ? `Mostrando ${inicio+1}–${Math.min(inicio+tamano, filtradas.length)} de ${filtradas.length}` : "0 alertas para mostrar"
    contenedor.innerHTML = filtradas.length ? filtradas.slice(inicio, inicio + tamano).map(renderAlertaCard).join("") :
        `<div class="alerts-empty">${iconoVistaAlertas(todas.length ? "search" : "check")}<strong>${todas.length ? "No hay coincidencias" : "Sin alertas para este período"}</strong><p>${todas.length ? "Prueba otra búsqueda o limpia los filtros del detalle." : "No se detectaron conflictos para los cargos y el período seleccionados."}</p></div>`
}
