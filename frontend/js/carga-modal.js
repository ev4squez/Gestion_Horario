// Borrador aislado: los turnos solo cambian al guardar el lote completo.
let detalleCarga = null

function semanasDetalleCarga(trabajador){
    return generarSemanas(mesActual, anioActual).map((semana, index) => {
        const dias = Array.from({length:7}, (_, dia) => {
            const fecha = new Date(semana.inicio)
            fecha.setDate(fecha.getDate() + dia)
            const iso = resumenFechaISO(fecha)
            return {fecha:iso, nombre:`${NOMBRES_DIAS[dia]} ${fecha.getDate()}/${fecha.getMonth()+1}`, turno:obtenerTurnoGuardado(trabajador.id, iso)}
        })
        const horas = calcularHorasSemana(dias.map(d=>d.turno), colacionPorCeco(trabajador.ceco))
        return {index, dias, horas}
    })
}

function abrirDetalleCarga(id){
    const trabajador = trabajadoresGlobal.find(t=>String(t.id)===String(id))
    if(!trabajador) return
    if(detalleCarga) return
    const semanas = semanasDetalleCarga(trabajador)
    const mayor = semanas.reduce((a,b)=>b.horas>a.horas ? b : a)
    detalleCarga = {trabajador, semanas, seleccion:mayor.index, borrador:new Map(), originales:new Map(), guardando:false, origen:document.activeElement}
    semanas.forEach(s=>s.dias.forEach(d=>detalleCarga.originales.set(d.fecha, d.turno)))
    const dialog = document.createElement('dialog')
    dialog.id = 'modal-detalle-carga'
    dialog.className = 'carga-dialog'
    dialog.setAttribute('aria-labelledby','carga-modal-titulo')
    dialog.innerHTML = `
        <form id="form-detalle-carga" novalidate>
            <header><div><h2 id="carga-modal-titulo">Revisar carga semanal</h2><p>${escaparHTML(trabajador.nombre)}</p></div>
                <button type="button" data-carga-cerrar aria-label="Cerrar"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
            </header>
            <div class="carga-modal-content">
                <label class="carga-semana-label" for="carga-modal-semana">Semana a revisar</label>
                <select id="carga-modal-semana">${semanas.map(s=>`<option value="${s.index}" ${s.index===mayor.index ? 'selected' : ''}>Semana ${s.index+1} · ${s.dias[0].nombre} al ${s.dias[6].nombre} · ${s.horas}h${parseInt(trabajador.jornada) && s.horas>parseInt(trabajador.jornada) ? ' · Sobre jornada' : ''}</option>`).join('')}</select>
                <div id="carga-modal-balance" aria-live="polite"></div>
                <p class="carga-instruccion">Modifica los turnos para ajustar la carga. Las horas descuentan ${colacionMinutosPorCeco(trabajador.ceco)} min de colación por jornada.</p>
                <datalist id="carga-modal-turnos">${obtenerTurnosDisponibles(trabajador.ceco).map(t=>`<option value="${escaparHTML(t)}"></option>`).join('')}</datalist>
                <div id="carga-modal-dias"></div>
                <p id="carga-modal-error" role="alert"></p>
            </div>
            <footer><span id="carga-modal-cambios" aria-live="polite"></span><div>
                <button type="button" data-carga-cerrar>Cancelar</button><button id="carga-modal-guardar" type="submit" disabled>Guardar cambios</button>
            </div></footer>
        </form>`
    document.body.appendChild(dialog)
    dialog.addEventListener('cancel', e=>{if(detalleCarga?.guardando) e.preventDefault()})
    dialog.addEventListener('close',()=>{
        const origen=detalleCarga?.origen
        detalleCarga=null
        dialog.remove()
        if(origen?.isConnected) origen.focus()
    })
    dialog.querySelectorAll('[data-carga-cerrar]').forEach(b=>b.addEventListener('click',()=>{if(!detalleCarga.guardando) dialog.close()}))
    dialog.querySelector('select').addEventListener('change',e=>{
        detalleCarga.seleccion=Number(e.target.value)
        renderDiasDetalleCarga()
    })
    dialog.querySelector('form').addEventListener('submit',guardarDetalleCarga)
    renderDiasDetalleCarga()
    dialog.showModal()
}

function renderDiasDetalleCarga(){
    const {semanas,seleccion,borrador}=detalleCarga
    document.getElementById('carga-modal-dias').innerHTML = semanas[seleccion].dias.map(d=>`
        <div class="carga-dia">
            <label for="carga-dia-${d.fecha}">${d.nombre}</label>
            <input id="carga-dia-${d.fecha}" data-fecha="${d.fecha}" value="${escaparHTML(borrador.get(d.fecha) ?? d.turno)}" list="carga-modal-turnos" maxlength="13" aria-label="Turno del ${d.nombre}" placeholder="00:00 - 00:00">
            <span data-carga-horas="${d.fecha}"></span>
        </div>`).join('')
    document.querySelectorAll('#carga-modal-dias input').forEach(input=>input.addEventListener('input',()=>{
        limpiarErrorFormatoTurno(input)
        detalleCarga.borrador.set(input.dataset.fecha,input.value)
        actualizarBalanceDetalleCarga()
    }))
    document.getElementById('carga-modal-error').textContent=''
    actualizarBalanceDetalleCarga()
}

function normalizarTurnoDetalleCarga(valor){
    const texto=String(valor || '').trim()
    const estado={libre:'Libre',saliente:'Saliente',vacaciones:'Vacaciones'}[texto.toLowerCase()]
    if(!texto) return 'Libre'
    if(estado) return estado
    return /^([01]\d|2[0-3]):([0-5]\d)\s-\s([01]\d|2[0-3]):([0-5]\d)$/.test(texto) ? texto : null
}

function cambiosDetalleCarga(){
    return Array.from(detalleCarga.borrador,([fecha,valor])=>({fecha,turno:normalizarTurnoDetalleCarga(valor)}))
        .filter(d=>d.turno===null || d.turno!==detalleCarga.originales.get(d.fecha))
}

function actualizarBalanceDetalleCarga(){
    const {trabajador,semanas,seleccion,borrador}=detalleCarga
    const turnos=semanas[seleccion].dias.map(d=>normalizarTurnoDetalleCarga(borrador.get(d.fecha) ?? d.turno))
    const valido=turnos.every(t=>t!==null)
    const horas=valido ? calcularHorasSemana(turnos,colacionPorCeco(trabajador.ceco)) : null
    const jornada=parseInt(trabajador.jornada) || 0
    const exceso=horas!==null && jornada ? Math.round((horas-jornada)*10)/10 : 0
    const balance=document.getElementById('carga-modal-balance')
    balance.className=exceso>0 ? 'carga-balance carga-balance-exceso' : 'carga-balance'
    balance.textContent=!valido ? 'Revisa el formato de los turnos: 00:00 - 00:00.'
        : !jornada ? `${horas}h planificadas · Sin jornada definida para comparar.`
        : `${horas}h planificadas / ${jornada}h de jornada · ${exceso>0 ? `Exceso de ${exceso}h en esta semana` : 'Sin sobrecarga en esta semana'}`
    semanas[seleccion].dias.forEach((d,i)=>{
        document.querySelector(`[data-carga-horas="${d.fecha}"]`).textContent=turnos[i]===null ? '—' : `${calcularHorasSemana([turnos[i]],colacionPorCeco(trabajador.ceco))}h`
    })
    const cambios=cambiosDetalleCarga()
    document.getElementById('carga-modal-cambios').textContent=cambios.length ? `${cambios.length} turnos modificados sin guardar` : 'Sin cambios pendientes'
    document.getElementById('carga-modal-guardar').disabled=detalleCarga.guardando || !cambios.length || cambios.some(d=>d.turno===null)
}

async function guardarDetalleCarga(evento){
    evento.preventDefault()
    if(!detalleCarga || detalleCarga.guardando) return
    const error=document.getElementById('carga-modal-error')
    if(!(adminAutorizado && obtenerToken())){
        error.textContent='Tu sesión expiró. Vuelve a iniciar sesión para guardar.'
        return
    }
    const cambios=cambiosDetalleCarga()
    if(!cambios.length) return
    if(cambios.some(d=>d.turno===null)){
        error.textContent='Revisa los horarios en todas las semanas modificadas: 00:00 - 00:00.'
        return
    }
    const {trabajador}=detalleCarga
    const asignaciones=cambios.map(d=>({...d,trabajador_id:trabajador.id,responsable:trabajador.responsable,
        horas:calcularHorasSemana([d.turno],colacionPorCeco(trabajador.ceco))}))
    detalleCarga.guardando=true
    const dialog=document.getElementById('modal-detalle-carga')
    dialog.querySelectorAll('input,select,button').forEach(e=>e.disabled=true)
    error.textContent=''
    try{
        const respuesta=await guardarPlanificacionLote(asignaciones)
        if(!respuesta.ok){
            let mensaje=respuesta.status===401 ? 'Tu sesión expiró. Vuelve a iniciar sesión para guardar.' : 'No se pudieron guardar los turnos.'
            try{const datos=await respuesta.json();if(typeof datos.detail==='string') mensaje=datos.detail}catch{}
            throw new Error(mensaje)
        }
        // El servidor guardó el lote de forma atómica; reflejar solo ese lote.
        asignaciones.forEach(a=>{
            const guardado=planificacionGlobal.find(p=>String(p.trabajador_id)===String(a.trabajador_id) && String(p.fecha).slice(0,10)===a.fecha)
            if(guardado) Object.assign(guardado,a)
            else planificacionGlobal.push(a)
        })
    }catch(e){
        detalleCarga.guardando=false
        dialog.querySelectorAll('input,select,button').forEach(el=>el.disabled=false)
        actualizarBalanceDetalleCarga()
        error.textContent=e.message || 'No se pudo conectar. Tus cambios siguen en el borrador.'
        return
    }
    dialog.close()
    actualizarVistaPlanificacion()
}
