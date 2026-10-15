// Presentación de la propuesta; no modifica las asignaciones del motor.
function motorCrearModal(){
    let modal = document.getElementById('modal-planificacion-automatica')
    if(modal) return modal
    modal = document.createElement('dialog')
    modal.id = 'modal-planificacion-automatica'
    modal.className = 'motor-dialog'
    modal.setAttribute('aria-labelledby','titulo-propuesta-automatica')
    modal.innerHTML = `<div class="motor-modal-shell">
        <header class="motor-modal-header"><div><p>Planificación automática</p><h2 id="titulo-propuesta-automatica"></h2></div>
            <button type="button" onclick="cerrarPropuestaPlanificacionAutomatica()" aria-label="Cerrar propuesta"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
        </header>
        <div id="contenido-propuesta-automatica"></div>
        <footer class="motor-modal-footer"><span id="motor-nota-aplicar"></span><div>
            <button id="btn-cerrar-propuesta-automatica" type="button" onclick="cerrarPropuestaPlanificacionAutomatica()">Cancelar</button>
            <button id="btn-aprobar-planificacion-automatica" type="button" onclick="aprobarPlanificacionAutomatica()"></button>
        </div></footer>
    </div>`
    modal.addEventListener('cancel',e=>{if(propuestaPlanificacionAutomatica?.estado==='APLICANDO') e.preventDefault()})
    modal.addEventListener('close',()=>{if(modal.origen?.isConnected) modal.origen.focus()})
    document.body.appendChild(modal)
    return modal
}

function cerrarPropuestaPlanificacionAutomatica(){
    if(propuestaPlanificacionAutomatica?.estado==='APLICANDO') return
    document.getElementById('modal-planificacion-automatica')?.close()
}

function motorTextoJornadas(alcanzadas, total){
    if(!total) return 'No hay semanas de colaboradores para evaluar.'
    if(!alcanzadas) return `Ninguna de las ${total} semanas de colaboradores alcanza la jornada objetivo.`
    if(alcanzadas===total) return `Las ${total} semanas de colaboradores alcanzan la jornada objetivo.`
    return `${alcanzadas} de ${total} semanas de colaboradores alcanzan la jornada objetivo.`
}

function motorConclusionModal(personal){
    switch(personal?.estado){
        case 'cubierto': return ['success','Toda la franja configurada está cubierta.','Se cuentan únicamente colaboradores activos durante toda la franja configurada.']
        case 'falta-dotacion': return ['danger','Falta personal compatible.',`Se requieren al menos ${personal.adicionales_minimos} colaboradores adicionales en el grupo y punto más exigente. El detalle permite estimar la dotación total.`]
        case 'falta-disponibilidad': return ['warning','Falta disponibilidad para cubrir la demanda.','Revisa vacaciones, salientes y reemplazos disponibles.']
        case 'revisar-turnos': return ['warning','La propuesta deja cobertura pendiente.','Revisa horarios y restricciones; esto no demuestra por sí solo falta de dotación.']
        default: return ['warning','No hay cobertura suficiente definida para evaluar.','Revisa las reglas y el equipo seleccionado.']
    }
}

function motorCambiarPestana(nombre, enfocar=false){
    if(!['resumen','turnos','problemas'].includes(nombre)) return
    propuestaPlanificacionAutomatica.pestana=nombre
    const modal=document.getElementById('modal-planificacion-automatica')
    modal.querySelectorAll('[role="tab"]').forEach(b=>{
        const activa=b.dataset.motorTab===nombre
        b.setAttribute('aria-selected',String(activa));b.tabIndex=activa ? 0 : -1
        if(activa && enfocar) b.focus()
    })
    modal.querySelectorAll('[role="tabpanel"]').forEach(p=>p.hidden=p.id!==`motor-panel-${nombre}`)
    document.getElementById('contenido-propuesta-automatica').scrollTop=0
}

function motorTecladoPestanas(evento){
    const nombres=['resumen','turnos','problemas']
    const actual=nombres.indexOf(evento.target.dataset.motorTab)
    if(actual<0) return
    let siguiente
    if(evento.key==='ArrowRight') siguiente=(actual+1)%3
    else if(evento.key==='ArrowLeft') siguiente=(actual+2)%3
    else if(evento.key==='Home') siguiente=0
    else if(evento.key==='End') siguiente=2
    else return
    evento.preventDefault();motorCambiarPestana(nombres[siguiente],true)
}

function motorFilasRevisionBrecha(propuesta, brecha){
    const mapa=motorMapaPlanificacionActual()
    if(propuesta.estado!=='APROBADA') propuesta.asignaciones.forEach(a=>mapa.set(motorClaveAsignacion(a.trabajador_id,a.fecha),a))
    const lunes=new Date(`${motorInicioSemana(brecha.fecha)}T00:00:00`)
    const regla={tipo:brecha.tipo,valor:brecha.valor}
    const grupo=trabajadoresGlobal.filter(t=>t.activo!==false && trabajadorCumpleRegla(t,regla))
    return grupo.flatMap(t=>Array.from({length:7},(_,i)=>{
        const fecha=new Date(lunes);fecha.setDate(fecha.getDate()+i)
        const iso=formatearFechaISO(fecha)
        const actual=mapa.get(motorClaveAsignacion(t.id,iso))
        const cambio=propuesta.asignaciones.find(a=>String(a.trabajador_id)===String(t.id) && a.fecha===iso)
        return {trabajador_id:t.id,trabajador:t.nombre,cargo:t.cargo,fecha:iso,turno:actual?.turno || 'Libre',
            horas:calcularHorasSemana([actual?.turno || 'Libre'],colacionPorCeco(t.ceco)),
            accion:cambio?.accion || 'existente',turno_anterior:cambio?.turno_anterior || ''}
    }))
}

function motorRevisarBrecha(index){
    const propuesta=propuestaPlanificacionAutomatica
    const brecha=propuesta?.suficiencia?.personal?.brechas[index]
    if(!brecha) return
    propuesta.brechaRevisada=brecha
    document.getElementById('busqueda-propuesta-automatica').value=''
    motorFiltrarPropuestaAutomatica()
    motorCambiarPestana('turnos',true)
}

function motorVerCambiosPropuestos(){
    propuestaPlanificacionAutomatica.brechaRevisada=null
    document.getElementById('busqueda-propuesta-automatica').value=''
    motorFiltrarPropuestaAutomatica()
}

function motorFiltrarPropuestaAutomatica(){
    const propuesta=propuestaPlanificacionAutomatica
    if(!propuesta) return
    const query=normalizarTexto(document.getElementById('busqueda-propuesta-automatica')?.value || '')
    const brecha=propuesta.brechaRevisada
    const todas=brecha ? motorFilasRevisionBrecha(propuesta,brecha) : propuesta.asignaciones
    const filas=todas.filter(a=>motorAsignacionCoincide(a,query) || (query && a.fecha.includes(query)))
    document.getElementById('tbody-propuesta-asignaciones').innerHTML=motorFilasAsignaciones(filas)
    document.getElementById('contador-propuesta-asignaciones').textContent=`${filas.length} de ${todas.length}`
    const contexto=document.getElementById('motor-contexto-turnos')
    contexto.hidden=!brecha
    contexto.innerHTML=brecha ? `<div><strong>${escaparHTML(brecha.grupo)} · Semana del ${motorInicioSemana(brecha.fecha)}</strong><p>Revisando la brecha del ${escaparHTML(brecha.fecha)} · ${escaparHTML(brecha.franja)}. Se muestran los turnos resultantes, incluidos días libres y ausencias.</p></div><button type="button" onclick="motorVerCambiosPropuestos()">Ver solo cambios</button>` : ''
}

function motorRenderProblemas(propuesta, busqueda=''){
    const query=normalizarTexto(busqueda)
    const brechas=propuesta.suficiencia?.personal?.brechas || []
    const tarjetas=brechas.map((b,index)=>({b,index})).filter(({b})=>normalizarTexto(`${b.fecha} ${b.grupo} ${b.franja} ${b.motivos.map(m=>m.nombre+' '+m.motivo).join(' ')}`).includes(query))
    const otros=propuesta.conflictos.filter(c=>!brechas.length || c.tipo!=='BRECHA_COBERTURA').filter(c=>motorConflictoCoincide(c,query))
    return tarjetas.map(({b,index})=>`<article class="motor-issue">
        <div class="motor-issue-header"><div><h3>${escaparHTML(b.grupo)}</h3><p>${escaparHTML(b.fecha)} · ${escaparHTML(b.franja)}</p></div><span>Faltan ${b.faltan}</span></div>
        <p>Asignados <strong>${b.asignados} de ${b.requerido}</strong> · Personal del grupo: ${b.total} · Sin vacaciones/saliente: ${b.disponibles}</p>
        ${b.adicionales_minimos ? `<p class="workload-danger">Mínimo adicional en este punto: ${b.adicionales_minimos} colaboradores compatibles.</p>` : ''}
        <details><summary>Por qué no se cubre</summary><ul>${b.motivos.map(m=>`<li><strong>${escaparHTML(m.nombre)}</strong>: ${escaparHTML(m.motivo)}</li>`).join('') || '<li>No hay colaboradores activos compatibles.</li>'}</ul></details>
        <button type="button" onclick="motorRevisarBrecha(${index})"><span class="material-symbols-outlined" aria-hidden="true">calendar_view_week</span>Revisar turnos de esta semana</button>
    </article>`).join('') + (otros.length ? motorBloqueConflictos(otros) : '') || '<p class="motor-empty">No hay problemas para esta búsqueda.</p>'
}

function motorFiltrarProblemas(){
    document.getElementById('contenedor-propuesta-conflictos').innerHTML=motorRenderProblemas(propuestaPlanificacionAutomatica,document.getElementById('motor-busqueda-problemas').value)
}

function motorRenderizarPropuesta(propuesta){
    const modal=motorCrearModal()
    const aplicada=propuesta.estado==='APROBADA', obsoleta=propuesta.estado==='OBSOLETA'
    const s=propuesta.suficiencia || {}
    const [tono,titulo,detalle]=motorConclusionModal(s.personal)
    const problemas=s.personal?.brechas.length || propuesta.conflictos.length
    const personas=new Set(propuesta.asignaciones.map(a=>String(a.trabajador_id))).size
    const modificadas=propuesta.asignaciones.filter(a=>a.accion==='modificar').length
    const contenido=modal.querySelector('#contenido-propuesta-automatica')
    contenido.innerHTML=`
        <section class="motor-verdict motor-verdict-${tono}"><span class="material-symbols-outlined" aria-hidden="true">${tono==='success' ? 'check_circle' : 'info'}</span><div><h3>${titulo}</h3><p>${detalle}</p><small>Evalúa toda la franja; el mínimo intermedio es el menor entre apertura y cierre. La colación no tiene una franja definida y no se descuenta de la presencia.</small></div></section>
        ${propuesta.aviso_recarga ? `<p class="motor-sync-note" role="status">${escaparHTML(propuesta.aviso_recarga)}</p>` : ''}
        <div class="motor-quickstats"><div><strong>${propuesta.asignaciones.length}</strong><span>Turnos ${aplicada ? 'guardados' : 'propuestos'}</span></div><div><strong>${personas}</strong><span>Colaboradores afectados</span></div><div><strong>${problemas}</strong><span>Puntos por revisar</span></div></div>
        <div class="motor-tabs" role="tablist" aria-label="Revisión de planificación" onkeydown="motorTecladoPestanas(event)">
            ${[['resumen','Resumen'],['turnos',`Turnos (${propuesta.asignaciones.length})`],['problemas',`Problemas (${problemas})`]].map(([id,label])=>`<button id="motor-tab-${id}" type="button" role="tab" data-motor-tab="${id}" aria-controls="motor-panel-${id}" aria-selected="false" tabindex="-1" onclick="motorCambiarPestana('${id}')">${label}</button>`).join('')}
        </div>
        <section id="motor-panel-resumen" role="tabpanel" aria-labelledby="motor-tab-resumen" tabindex="0">
            <div class="motor-summary-lines"><div><span>Estado</span><strong>${aplicada ? 'Aplicada' : obsoleta ? 'Requiere recalcular' : 'Pendiente de aprobación'}</strong></div>
                <div><span>Cambios</span><strong>${propuesta.asignaciones.length-modificadas} nuevos · ${modificadas} modificados</strong></div>
                <div><span>Cobertura</span><strong>${s.reglas_cubiertas || 0} de ${s.reglas_evaluadas || 0} reglas cumplidas</strong></div>
            </div>
            <div class="motor-week-status"><h3>Cumplimiento de jornadas</h3><p>${motorTextoJornadas(s.semanas_alcanzadas || 0,s.semanas_totales || 0)}</p><small>Se busca completar el 100%; el indicador admite entre el 95% y el 100% de la jornada individual. Cada semana se cuenta por colaborador.</small>
                ${s.jornadas_pendientes?.length ? `<details class="motor-worker-diagnostics"><summary>Ver horas pendientes por trabajador y semana</summary>${s.jornadas_pendientes.map(j=>`<div class="motor-issue"><strong>${escaparHTML(j.trabajador)} · Semana del ${j.semana}</strong><p>${j.horas}h de ${j.jornada}h · Faltan ${j.faltan}h</p><p>${escaparHTML(j.motivo)}</p></div>`).join('')}</details>` : ''}
            </div>
            <p class="motor-scope">${escaparHTML(obtenerNombreMes(propuesta.mes))} ${propuesta.anio} · ${escaparHTML(propuesta.cargos.length ? propuesta.cargos.join(', ') : 'Todos los cargos')}</p>
            <p class="motor-scope">${aplicada ? 'Los cambios fueron guardados y el resumen se actualizó con la planificación resultante.' : 'Vacaciones y salientes se conservan. La planificación cambia al aplicar la propuesta.'}</p>
            ${!aplicada && s.diagnostico ? `<details class="motor-worker-diagnostics"><summary>Ver diagnóstico del equipo</summary>${motorRenderDiagnostico(s.diagnostico,s.no_rotativos || [],s.conflictos_turno_fijo || [])}</details>` : ''}
        </section>
        <section id="motor-panel-turnos" role="tabpanel" aria-labelledby="motor-tab-turnos" tabindex="0" hidden>
            <div id="motor-contexto-turnos" class="motor-turn-context" hidden></div>
            <div class="motor-search-row"><label><span class="sr-only">Buscar turnos</span><input id="busqueda-propuesta-automatica" type="search" oninput="motorFiltrarPropuestaAutomatica()" placeholder="Buscar nombre, cargo, sector o fecha"></label><span id="contador-propuesta-asignaciones"></span></div>
            <div class="motor-table-scroll"><table class="motor-proposal-table"><thead><tr><th>Colaborador</th><th>Cargo</th><th>Fecha</th><th>Turno</th><th>Horas</th><th>Acción</th></tr></thead><tbody id="tbody-propuesta-asignaciones"></tbody></table></div>
        </section>
        <section id="motor-panel-problemas" role="tabpanel" aria-labelledby="motor-tab-problemas" tabindex="0" hidden>
            <label class="motor-problem-search"><span class="sr-only">Buscar problemas</span><input id="motor-busqueda-problemas" type="search" oninput="motorFiltrarProblemas()" placeholder="Buscar fecha, sector o motivo"></label>
            <div id="contenedor-propuesta-conflictos">${motorRenderProblemas(propuesta)}</div>
        </section>`
    modal.querySelector('#titulo-propuesta-automatica').textContent=aplicada ? 'Planificación aplicada' : 'Revisar propuesta'
    modal.querySelector('#btn-cerrar-propuesta-automatica').textContent=aplicada ? 'Cerrar resumen' : 'Cancelar'
    modal.querySelector('#motor-nota-aplicar').textContent=aplicada ? 'Cambios guardados' : obsoleta ? 'La propuesta cambió; vuelve a generarla.' : problemas ? 'Puedes aplicar cambios aunque queden brechas pendientes.' : 'Revisa los turnos antes de aplicar.'
    const boton=modal.querySelector('#btn-aprobar-planificacion-automatica')
    boton.hidden=aplicada
    boton.textContent=obsoleta ? 'Volver a generar' : `Aplicar ${propuesta.asignaciones.length} cambios`
    boton.disabled=aplicada || (!obsoleta && !propuesta.asignaciones.length)
    motorFiltrarPropuestaAutomatica()
    motorCambiarPestana(propuesta.pestana || 'resumen')
    if(!modal.open){modal.origen=document.activeElement;modal.showModal()}
}
