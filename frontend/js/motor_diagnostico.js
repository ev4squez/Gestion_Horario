// Diagnóstico explicable: una brecha no demuestra por sí sola falta de personal.
function motorMotivoDescarte(mapa, trabajador, fecha, brecha, seleccionados){
    const registro = mapa.get(motorClaveAsignacion(trabajador.id, fecha))
    const estado = String(registro?.turno || '').trim().toLowerCase()
    if(estado === 'vacaciones') return 'Vacaciones'
    if(estado === 'saliente') return 'Saliente'
    const actual = intervaloDesdeTurno(fecha, registro?.turno)
    if(actual && actual.inicio <= brecha.cobertura && actual.fin > brecha.cobertura) return 'Ya cubre esta franja'
    if(!seleccionados.has(String(trabajador.id))) return 'Fuera del equipo seleccionado para automatizar'
    const fijo = motorEsFijo(trabajador)
    const configurado = fijo ? motorTurnoFijoDelDia(trabajador, fecha) : null
    if(fijo && !configurado) return 'Sin turno fijo para ese día'
    const turnos = (fijo ? [configurado] : motorTurnosDisponibles(trabajador.ceco)).filter(turno => {
        const intervalo = intervaloDesdeTurno(fecha,turno)
        return intervalo && intervalo.inicio <= brecha.cobertura && intervalo.fin > brecha.cobertura
    })
    if(!turnos.length) return fijo ? 'Turno fijo incompatible con la franja' : 'Sin turno compatible en el catálogo'
    const prueba = new Map(mapa)
    prueba.delete(motorClaveAsignacion(trabajador.id, fecha))
    const conHoras = turnos.filter(t => motorHorasValidas(prueba,trabajador,fecha,t))
    if(!conHoras.length) return 'Límite de horas semanales'
    const conDescanso = conHoras.filter(t => motorDescansoValido(prueba,trabajador,fecha,t))
    if(!conDescanso.length) return 'Descanso insuficiente entre jornadas'
    if(!motorDiasConsecutivosValidos(prueba,trabajador,fecha)) return 'Máximo de días consecutivos'
    return 'Requiere redistribuir turnos; no se concluye falta de personal'
}

function motorDiagnosticarBrecha(mapa, trabajadores, regla, fecha, brecha){
    const grupo = trabajadoresGlobal.filter(t => t.activo !== false && trabajadorCumpleRegla(t,regla))
    const seleccionados = new Set(trabajadores.map(t=>String(t.id)))
    const motivos = grupo.map(t => ({nombre:t.nombre,motivo:motorMotivoDescarte(mapa,t,fecha,brecha,seleccionados)}))
    const disponibles = motivos.filter(m=>!['Vacaciones','Saliente'].includes(m.motivo)).length
    return {
        fecha,tipo:regla.tipo,valor:regla.valor,grupo:`${regla.tipo.toUpperCase()} ${regla.valor}`,franja:etiquetaPuntoBrecha(brecha),
        requerido:brecha.minimo,asignados:brecha.dotacion,faltan:brecha.faltan,
        total:grupo.length,disponibles,adicionales_minimos:Math.max(0,brecha.minimo-grupo.length),motivos
    }
}

function motorResumenPersonal(brechas, reglasEvaluadas, conflictos = []){
    const adicionales = Math.max(0,...brechas.map(b=>b.adicionales_minimos))
    const noDisponibles = brechas.some(b=>b.disponibles < b.requerido)
    return {brechas,adicionales_minimos:adicionales,estado:reglasEvaluadas === 0 ? 'sin-reglas'
        : !brechas.length ? (conflictos.length ? 'revisar-turnos' : 'cubierto') : adicionales>0 ? 'falta-dotacion' : noDisponibles ? 'falta-disponibilidad' : 'revisar-turnos'}
}

function motorRenderPersonal(personal){
    if(!personal) return ''
    const textos = {
        'sin-reglas':['No se puede evaluar la dotación','Configura reglas de cobertura para evaluar al equipo.'],
        'cubierto':['El personal cubre la demanda configurada','La planificación resultante cumple los puntos de cobertura evaluados.'],
        'falta-dotacion':['Se requiere más personal compatible',`Faltan al menos ${personal.adicionales_minimos} colaboradores compatibles en el grupo y punto más exigente. Revisa el detalle antes de definir la dotación adicional total.`],
        'falta-disponibilidad':['La disponibilidad actual no alcanza','El grupo tiene personal, pero hay ausencias o estados protegidos. Revisa reemplazos y disponibilidad antes de aumentar la dotación.'],
        'revisar-turnos':['Hay brechas: revisa la distribución de turnos','No se ha demostrado falta de dotación. Los horarios, descansos o límites semanales pueden impedir cubrir la demanda con esta propuesta.']
    }
    const [titulo,detalle] = textos[personal.estado]
    const tono = personal.estado==='cubierto' ? 'emerald' : personal.estado==='falta-dotacion' ? 'red' : 'amber'
    return `<section class="motor-personal motor-personal-${tono}">
        <h3>¿Alcanza el personal existente?</h3><strong>${titulo}</strong><p>${detalle}</p>
        <p class="motor-alcance">Alcance: toda la franja configurada, con el menor mínimo de apertura y cierre en el tramo intermedio.</p>
        ${personal.brechas.length ? `<details><summary>Ver ${personal.brechas.length} puntos con falta de cobertura</summary>
            ${personal.brechas.map(b=>{
                const conteos = new Map()
                b.motivos.forEach(m=>conteos.set(m.motivo,(conteos.get(m.motivo)||0)+1))
                return `<div class="motor-brecha"><strong>${escaparHTML(b.fecha)} · ${escaparHTML(b.grupo)}</strong>
                    <p>${escaparHTML(b.franja)} · Asignados ${b.asignados}/${b.requerido} · Faltan ${b.faltan}</p>
                    <p>Personal del grupo: ${b.total} · Sin vacaciones/saliente: ${b.disponibles}${b.adicionales_minimos ? ` · Mínimo adicional: ${b.adicionales_minimos}` : ''}</p>
                    <ul>${Array.from(conteos,([motivo,n])=>`<li>${escaparHTML(motivo)}: ${n}</li>`).join('')}</ul>
                    <details><summary>Ver motivos por colaborador</summary><ul>${b.motivos.map(m=>`<li>${escaparHTML(m.nombre)}: ${escaparHTML(m.motivo)}</li>`).join('')}</ul></details>
                </div>`
            }).join('')}
        </details>` : ''}
    </section>`
}
