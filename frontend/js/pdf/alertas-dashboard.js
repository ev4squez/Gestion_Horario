// Resumen vectorial de tamaño fijo: toda la sección ocupa una hoja A4 horizontal.
function resumirAlertasPDF(alertas, semanas){
    const prioridades = {danger: 0, warning: 0, info: 0}
    const tipos = [
        {id: "cobertura", nombre: "Cobertura", total: 0},
        {id: "descanso", nombre: "Descanso", total: 0},
        {id: "horas", nombre: "Horas semanales", total: 0}
    ]
    if(alertas.some(a => !tipos.some(t => t.id === a.kind))) tipos.push({id: "otras", nombre: "Otras", total: 0})
    const porSemana = semanas.map((_, i) => ({numero: i + 1, etiqueta: `S${i + 1}`, total: 0, danger: 0, warning: 0, info: 0}))
    const sinFecha = {numero: 0, etiqueta: "Sin fecha", total: 0, danger: 0, warning: 0, info: 0}
    const normalizadas = alertas.map((a, indice) => {
        const tipo = Object.hasOwn(prioridades, a.tipo) ? a.tipo : "warning"
        const numero = semanaDashboardAlerta(a, semanas)
        prioridades[tipo]++
        const grupo = tipos.find(t => t.id === a.kind) || tipos.find(t => t.id === "otras")
        grupo.total++
        const semana = porSemana.find(s => s.numero === numero) || sinFecha
        semana.total++
        semana[tipo]++
        return {...a, tipo, indice, semanaPDF: semana.numero}
    })
    if(sinFecha.total) porSemana.push(sinFecha)
    const orden = {danger: 0, warning: 1, info: 2}
    const destacadas = [...normalizadas].sort((a, b) => orden[a.tipo] - orden[b.tipo] || a.indice - b.indice).slice(0, 4)
    return {total: normalizadas.length, prioridades, tipos, semanas: porSemana, destacadas}
}

function textoDashboardPDF(valor, maximo){
    const caracteres = Array.from(String(valor ?? "").replace(/\s+/g, " ").trim())
    return caracteres.length > maximo ? caracteres.slice(0, maximo - 1).join("") + "…" : caracteres.join("")
}

function escaparSVGDashboardPDF(valor){
    return String(valor ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

function detalleAlertaDashboardPDF(alerta){
    const numero = valor => Number.isFinite(Number(valor)) ? Number(valor).toFixed(1) : "—"
    if(alerta.kind === "horas") return `${numero(alerta.horas)} h asignadas / ${numero(alerta.jornada)} h de jornada. Diferencia: ${numero(alerta.diferencia)} h.`
    if(alerta.kind === "descanso") return `${numero(alerta.descanso)} h de descanso entre jornadas. Mínimo: 12 h.`
    return `${alerta.mensaje || "Revisar planificación"}${alerta.detalle ? `. ${alerta.detalle}` : ""}`
}

function construirDashboardAlertasPDF({alertas, trabajadores, semanas, mesActual, anioActual, cecos}){
    const resumen = resumirAlertasPDF(alertas, semanas)
    const colores = {danger: "#b34545", warning: "#996515", info: "#365fc4"}
    const nombres = {danger: "Críticas", warning: "Advertencias", info: "Informativas"}
    const partes = []
    const texto = (x, y, valor, opciones = {}) => {
        const {tamano = 12, color = "#253247", negrita = false, ancla = "start", id = ""} = opciones
        partes.push(`<text x="${x}" y="${y}" font-size="${tamano}" fill="${color}" font-weight="${negrita ? 700 : 400}" text-anchor="${ancla}"${id ? ` id="${id}"` : ""}>${escaparSVGDashboardPDF(valor)}</text>`)
    }
    const rectangulo = (x, y, ancho, alto, color) => {
        if(ancho > 0 && alto > 0) partes.push(`<rect x="${x}" y="${y}" width="${ancho}" height="${alto}" fill="${color}"/>`)
    }
    // El límite y el recorte explícito impiden que nombres o motivos extensos
    // desborden la hoja. Los conteos siempre consideran todas las incidencias.
    partes.push('<defs><clipPath id="pdf-alert-page"><rect width="785" height="520"/></clipPath></defs><g clip-path="url(#pdf-alert-page)">')
    texto(0, 24, "Alertas de planificación", {tamano: 23, negrita: true})
    texto(0, 46, `${obtenerNombreMes(mesActual)} ${anioActual} · Equipo exportado: ${trabajadores.length} colaboradores · ${semanas.length} semanas`, {color: "#526174"})
    const cargos = [...new Set(trabajadores.map(t => t.cargo).filter(Boolean))].join(", ") || "Sin cargo"
    texto(0, 65, textoDashboardPDF(`Cargo: ${cargos} · CECO: ${cecos || "No definido"}`, 112), {color: "#526174"})

    const indicadores = [{id: "total", nombre: "Total de alertas", valor: resumen.total, color: "#253247"},
        ...Object.keys(prioridadesDashboardPDF()).map(id => ({id, nombre: nombres[id], valor: resumen.prioridades[id], color: colores[id]}))]
    indicadores.forEach((kpi, i) => {
        const x = i * 200
        rectangulo(x, 80, 185, 67, "#f6f9fc")
        texto(x + 12, 102, kpi.nombre, {color: "#526174"})
        texto(x + 12, 134, kpi.valor, {tamano: 29, negrita: true, color: kpi.color, id: `pdf-alert-kpi-${kpi.id}`})
    })

    texto(0, 173, "Distribución por tipo", {tamano: 15, negrita: true})
    const maxTipo = Math.max(1, ...resumen.tipos.map(t => t.total))
    resumen.tipos.forEach((tipo, i) => {
        const y = 199 + i * (94 / resumen.tipos.length)
        texto(0, y, tipo.nombre)
        texto(286, y, tipo.total, {ancla: "end", negrita: true})
        rectangulo(0, y + 8, 286, 7, "#edf0f5")
        rectangulo(0, y + 8, tipo.total / maxTipo * 286, 7, "#6387d5")
    })

    texto(332, 173, "Alertas por semana", {tamano: 15, negrita: true})
    const maxSemana = Math.max(1, ...resumen.semanas.map(s => s.total))
    const anchoSemana = 450 / Math.max(1, resumen.semanas.length)
    resumen.semanas.forEach((semana, i) => {
        const x = 332 + i * anchoSemana + anchoSemana / 2
        const ancho = Math.min(36, anchoSemana - 14)
        rectangulo(x - ancho / 2, 190, ancho, 88, "#f6f9fc")
        let y = 278
        for(const tipo of ["info", "warning", "danger"]){
            const alto = semana[tipo] / maxSemana * 86
            y -= alto
            rectangulo(x - ancho / 2, y, ancho, alto, colores[tipo])
        }
        texto(x, y - 7, semana.total, {ancla: "middle", negrita: true})
        texto(x, 297, semana.etiqueta, {ancla: "middle"})
    })
    Object.keys(nombres).forEach((tipo, i) => {
        const x = 332 + i * 146
        rectangulo(x, 310, 8, 8, colores[tipo])
        texto(x + 13, 318, nombres[tipo], {color: "#526174"})
    })

    texto(0, 343, "Alertas priorizadas", {tamano: 15, negrita: true})
    if(!resumen.total){
        rectangulo(0, 359, 785, 132, "#edf8f2")
        texto(18, 393, "Sin alertas detectadas para el equipo exportado.", {tamano: 15, negrita: true, color: "#246e50"})
        texto(18, 418, "Revisa este resumen nuevamente después de modificar los turnos.", {color: "#526174"})
    }else{
        rectangulo(0, 355, 785, 20, "#ecf2ff")
        texto(10, 369, "Prioridad / tipo", {negrita: true})
        texto(130, 369, "Referencia", {negrita: true})
        texto(382, 369, "Motivo", {negrita: true})
        resumen.destacadas.forEach((alerta, i) => {
            const y = 375 + i * 30
            rectangulo(0, y, 785, 30, i % 2 ? "#f6f9fc" : "#ffffff")
            partes.push(`<defs><clipPath id="pdf-alert-row-${i}"><rect x="0" y="${y}" width="785" height="30"/></clipPath></defs><g clip-path="url(#pdf-alert-row-${i})">`)
            texto(10, y + 12, nombres[alerta.tipo], {color: colores[alerta.tipo], negrita: true})
            const tipo = {cobertura: "Cobertura", descanso: "Descanso", horas: "Horas semanales"}[alerta.kind] || "Otra"
            texto(10, y + 26, tipo, {color: "#526174"})
            texto(130, y + 12, textoDashboardPDF(alerta.trabajador || alerta.titulo || "Sin referencia", 34), {negrita: true})
            const fecha = valor => String(valor || "").slice(0, 10)
            const referencia = alerta.kind === "horas" ? (alerta.semanaPDF ? `Semana ${alerta.semanaPDF}` : "Semana sin referencia")
                : alerta.kind === "descanso" ? `${fecha(alerta.fecha1)} → ${fecha(alerta.fecha2)}` : fecha(alerta.fecha) || "Sin fecha"
            texto(130, y + 26, textoDashboardPDF(referencia, 37), {color: "#526174"})
            const motivo = textoDashboardPDF(detalleAlertaDashboardPDF(alerta), 104)
            texto(382, y + 12, motivo.slice(0, 52))
            texto(382, y + 26, motivo.slice(52))
            partes.push('</g>')
        })
    }
    const nota = resumen.total
        ? `${resumen.destacadas.length} de ${resumen.total} alertas, ordenadas por prioridad. Totales completos; textos abreviados. Detalle en el sistema.`
        : "Resumen del período y de los mismos filtros utilizados para exportar la planificación."
    texto(0, 516, nota, {color: "#526174"})
    partes.push('</g>')
    return {
        id: "dashboard-alertas-pdf", pageBreak: "before", width: 785,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="785" height="520" viewBox="0 0 785 520" font-family="Roboto">${partes.join("")}</svg>`
    }
}

function prioridadesDashboardPDF(){
    return {danger: "Críticas", warning: "Advertencias", info: "Informativas"}
}
