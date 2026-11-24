// Contexto de una alerta consultada. No modifica turnos ni abre su editor.
function fechaFocoAlertaPlanificacion(valor){
    if(typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(valor)) return null
    const iso = valor.slice(0, 10)
    const [anio, mes, dia] = iso.split("-").map(Number)
    if(anio < 1900 || resumenFechaISO(new Date(anio, mes - 1, dia)) !== iso) return null
    return iso
}

function limpiarFocoAlertaPlanificacion(){
    window.focoAlertaPlanificacion = null
    const vista = document.getElementById("vista-planificacion")
    if(!vista) return
    const aviso = document.getElementById("planificacion-alerta-contexto")
    if(aviso?.contains(document.activeElement)){
        vista.querySelector(".planning-alert-target")?.focus({preventScroll: true})
    }
    vista.querySelectorAll(".planning-alert-target").forEach(el => {
        el.classList.remove("planning-alert-target")
        el.removeAttribute("aria-describedby")
    })
    vista.querySelectorAll(".planning-alert-row").forEach(el => el.classList.remove("planning-alert-row"))
    vista.querySelectorAll(".planning-alert-marker").forEach(el => el.remove())
    aviso?.remove()
}

function prepararFocoAlertaPlanificacion(trabajador, datos = {}){
    limpiarFocoAlertaPlanificacion()
    if(!datos || !["descanso", "horas", "nocturno5x2"].includes(datos.alertaKind)) return
    if(!/^(?:[0-9]|1[01])$/.test(String(datos.mes)) || !/^\d{4}$/.test(String(datos.anio))) return
    const mes = Number(datos.mes), anio = Number(datos.anio)
    if(anio < 1900) return
    const semanas = generarSemanas(mes, anio)
    const formato = fecha => fecha.split("-").reverse().join("/")
    const motivo = typeof datos.motivoAlerta === "string" ? datos.motivoAlerta.slice(0, 500) : "Revisa los turnos marcados."
    let fechas = [], semanaInicio = null, titulo, mensaje
    if(datos.alertaKind === "descanso"){
        const fecha1 = fechaFocoAlertaPlanificacion(datos.fecha1)
        const fecha2 = fechaFocoAlertaPlanificacion(datos.fecha2)
        if(!fecha1 || !fecha2 || fecha1 >= fecha2) return
        fechas = [fecha1, fecha2].filter(fecha => semanas.some(s =>
            fecha >= resumenFechaISO(s.inicio) && fecha <= resumenFechaISO(s.fin)
        ))
        if(!fechas.length) return
        titulo = `${trabajador.nombre} · Descanso entre jornadas`
        mensaje = `${formato(fecha1)} → ${formato(fecha2)}. ${motivo}`
    }else if(datos.alertaKind === "nocturno5x2"){
        const fecha = fechaFocoAlertaPlanificacion(datos.fecha1)
        if(!fecha) return
        fechas = [fecha]
        titulo = `${trabajador.nombre} · Nocturno 5x2`
        mensaje = `${formato(fecha)}. ${motivo}`
    }else{
        if(!/^[1-9]\d*$/.test(String(datos.semana))) return
        const numero = Number(datos.semana)
        const semana = semanas[numero - 1]
        if(!semana) return
        semanaInicio = resumenFechaISO(semana.inicio)
        titulo = `${trabajador.nombre} · Horas semanales · Semana ${numero}`
        mensaje = `${formato(semanaInicio)} al ${formato(resumenFechaISO(semana.fin))}. ${motivo}`
    }
    window.focoAlertaPlanificacion = {
        trabajadorId: String(trabajador.id), kind: datos.alertaKind,
        mes, anio, fechas, semanaInicio, titulo, mensaje, pendiente: true
    }
    mesActual = mes
    anioActual = anio
    const selectorMes = document.getElementById("mes-selector")
    const selectorAnio = document.getElementById("anio-selector")
    if(selectorMes) selectorMes.value = String(mes)
    if(selectorAnio) selectorAnio.value = String(anio)
}

function desplazarFocoAlertaPlanificacion(destino){
    const scroll = destino.closest(".schedule-scroll")
    const semana = destino.closest(".planning-week")
    if(!scroll || !semana) return
    const caja = scroll.getBoundingClientRect()
    const celda = destino.getBoundingClientRect()
    const cabecera = scroll.querySelector("thead")?.getBoundingClientRect().height || 0
    const nombre = scroll.querySelector(".schedule-name")?.getBoundingClientRect().width || 0
    scroll.scrollTop += celda.top - caja.top - cabecera - Math.max(0, (scroll.clientHeight - cabecera - celda.height) / 2)
    scroll.scrollLeft += celda.left - caja.left - nombre - Math.max(0, (scroll.clientWidth - nombre - celda.width) / 2)
    const doc = document.defaultView
    for(let padre = scroll.parentElement; padre; padre = padre.parentElement){
        if(padre === document.scrollingElement) continue
        if(/auto|scroll/.test(doc.getComputedStyle(padre).overflowY) && padre.scrollHeight > padre.clientHeight){
            padre.scrollTop += semana.getBoundingClientRect().top - padre.getBoundingClientRect().top - 12
        }
    }
    const exterior = document.scrollingElement
    if(exterior && exterior.scrollHeight > exterior.clientHeight){
        const header = document.querySelector(".header-glass")
        const altoHeader = header && /sticky|fixed/.test(doc.getComputedStyle(header).position)
            ? Math.max(0, header.getBoundingClientRect().bottom) : 0
        exterior.scrollTop += semana.getBoundingClientRect().top - altoHeader - 12
    }
}

function aplicarFocoAlertaPlanificacion(restaurarFoco = false){
    const foco = window.focoAlertaPlanificacion
    if(!foco) return
    if(foco.mes !== mesActual || foco.anio !== anioActual){
        limpiarFocoAlertaPlanificacion()
        return
    }
    const vista = document.getElementById("vista-planificacion")
    if(!vista) return
    const filas = [...vista.querySelectorAll(".fila-trabajador")].filter(el => el.dataset.trabajadorId === foco.trabajadorId)
    const destinos = foco.kind === "horas"
        ? filas.filter(el => el.closest(".schedule-scroll").dataset.semana === foco.semanaInicio).map(el => el.querySelector(".schedule-hours"))
        : filas.flatMap(fila => [...fila.querySelectorAll(".turno-input")]
            .filter(el => foco.fechas.includes(el.dataset.fecha)).map(el => el.closest(".schedule-day")))
    if(!destinos.length){
        limpiarFocoAlertaPlanificacion()
        return
    }
    destinos.forEach(el => {
        el.classList.add("planning-alert-target")
        el.closest(".fila-trabajador").classList.add("planning-alert-row")
        el.tabIndex = -1
        el.setAttribute("aria-describedby", "planificacion-alerta-mensaje")
        if(!el.querySelector(".planning-alert-marker")){
            const marca = document.createElement("span")
            marca.className = "planning-alert-marker"
            marca.textContent = foco.kind === "horas" ? "Revisar horas" : "Revisar"
            marca.setAttribute("aria-hidden", "true")
            el.appendChild(marca)
        }
    })
    const destino = destinos[destinos.length - 1]
    let aviso = document.getElementById("planificacion-alerta-contexto")
    if(!aviso){
        aviso = document.createElement("aside")
        aviso.id = "planificacion-alerta-contexto"
        aviso.className = "planning-alert-context"
        aviso.setAttribute("role", "status")
        aviso.innerHTML = '<div><small>Alerta de origen</small><strong></strong><p id="planificacion-alerta-mensaje"></p></div><div class="planning-alert-context-actions"><button type="button" data-volver-alertas>Volver a alertas</button><button type="button" data-quitar-marca>Quitar marca</button></div>'
        aviso.querySelector("[data-volver-alertas]").addEventListener("click", () => mostrarVistaAlertas())
        aviso.querySelector("[data-quitar-marca]").addEventListener("click", limpiarFocoAlertaPlanificacion)
        destino.closest(".planning-week").prepend(aviso)
    }
    aviso.querySelector("strong").textContent = foco.titulo
    aviso.querySelector("p").textContent = foco.mensaje
    if(!vista.classList.contains("hidden") && foco.pendiente){
        desplazarFocoAlertaPlanificacion(destino)
        destino.focus({preventScroll: true})
        foco.pendiente = false
    }else if(restaurarFoco && !vista.classList.contains("hidden")){
        destino.focus({preventScroll: true})
    }
}
