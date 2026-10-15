// Completar cada semana buscando combinaciones del catálogo, no solo brechas.
function motorMinutosNetos(turno, trabajador){
    const m=String(turno || '').match(/^(\d{2}):(\d{2}) - (\d{2}):(\d{2})$/)
    if(!m) return 0
    const inicio=Number(m[1])*60+Number(m[2])
    let fin=Number(m[3])*60+Number(m[4]);if(fin<=inicio) fin+=1440
    return Math.max(0,fin-inicio-colacionMinutosPorCeco(trabajador.ceco))
}

function motorConservaPuntosCubiertos(trabajador, fecha, anterior, turno){
    const previo=intervaloDesdeTurno(fecha,anterior), nuevo=intervaloDesdeTurno(fecha,turno)
    if(!previo || !nuevo) return false
    return motorReglasAplicables(trabajador,fecha).every(r=>{
        const franja=intervaloDesdeHora(new Date(`${fecha}T00:00:00`),r.hora_inicio,r.hora_fin)
        if(!franja) return false
        const inicio=new Date(Math.max(previo.inicio,franja.inicio))
        const fin=new Date(Math.min(previo.fin,franja.fin))
        return inicio>=fin || (nuevo.inicio<=inicio && nuevo.fin>=fin)
    })
}

function motorCompletarSemana(mapa, mapaInicial, trabajador, fechas, inicioSemana){
    const objetivo=(parseInt(trabajador.jornada) || MOTOR_MAX_HORAS_LEGALES_SEMANA)*60
    // Las restricciones solo necesitan los turnos del trabajador; evitar
    // clonar toda la empresa en cada rama de la búsqueda.
    const propio=new Map([...mapa].filter(([,a])=>String(a.trabajador_id)===String(trabajador.id)))
    const enSemana=a=>motorInicioSemana(a.fecha)===inicioSemana
    const minutosMapa=m=>[...m.values()].filter(enSemana).reduce((n,a)=>n+motorMinutosNetos(a.turno,trabajador),0)
    let mejorMinutos=minutosMapa(propio)
    if(mejorMinutos>=objetivo) return {cambios:[],limitada:false}
    const original=new Map(propio)
    const esFijo=motorEsFijo(trabajador)
    const dias=fechas.map(fecha=>{
        const clave=motorClaveAsignacion(trabajador.id,fecha)
        const actual=mapa.get(clave), guardado=mapaInicial.get(clave)
        // Turnos manuales y estados protegidos son inmutables al completar.
        if((guardado && !motorEsNoAsignado(guardado.turno)) || (actual && !motorEsNoAsignado(actual.turno) && actual.origen!=='propuesta')){
            return {fecha,clave,bloqueado:true,opciones:[null]}
        }
        const obligatorio=!!actual && motorEsTurnoTrabajado(actual.turno)
        const fijo=esFijo ? motorTurnoFijoDelDia(trabajador,fecha) : null
        let opciones=esFijo ? (fijo ? [fijo] : []) : motorTurnosDisponibles(trabajador.ceco)
        if(obligatorio && !opciones.includes(actual.turno)) opciones=[actual.turno,...opciones]
        opciones=[...new Set(opciones)].filter(t=>motorMinutosNetos(t,trabajador)>0 && (!obligatorio || motorConservaPuntosCubiertos(trabajador,fecha,actual.turno,t)))
        propio.delete(clave)
        return {fecha,clave,bloqueado:false,opciones:obligatorio ? opciones : [...opciones,null]}
    })
    const base=minutosMapa(propio)
    const margen=Math.max(0,objetivo-base)
    // Cotas de combinaciones posibles, en minutos exactos, para preferir
    // soluciones completas (p.ej. cinco jornadas de 8h frente a cuatro de 8.5h).
    const posibles=Array(dias.length+1);posibles[dias.length]=new Set([0])
    for(let i=dias.length-1;i>=0;i--){
        posibles[i]=new Set()
        for(const turno of dias[i].opciones){
            const minutos=dias[i].bloqueado ? 0 : motorMinutosNetos(turno,trabajador)
            for(const resto of posibles[i+1]) if(minutos+resto<=margen) posibles[i].add(minutos+resto)
        }
    }
    const maximoTeorico=base+Math.max(0,...posibles[0])
    let mejorPlan=new Map([...original].filter(([,a])=>enSemana(a)))
    let nodos=0, completa=false
    function visitar(index,minutos){
        if(completa || ++nodos>6000) return
        if(index===dias.length){
            if(minutos>mejorMinutos){
                mejorMinutos=minutos
                mejorPlan=new Map([...propio].filter(([,a])=>enSemana(a)))
                if(minutos===maximoTeorico) completa=true
            }
            return
        }
        const dia=dias[index]
        if(dia.bloqueado){visitar(index+1,minutos);return}
        const orden=dia.opciones.map(turno=>{
            const netos=motorMinutosNetos(turno,trabajador)
            const alcanzable=Math.max(-1,...[...posibles[index+1]].filter(n=>n+netos+minutos<=objetivo))
            return {turno,netos,potencial:alcanzable<0 ? -1 : minutos+netos+alcanzable}
        }).filter(o=>o.potencial>mejorMinutos).sort((a,b)=>b.potencial-a.potencial || b.netos-a.netos || String(a.turno).localeCompare(String(b.turno)))
        for(const o of orden){
            if(o.turno){
                if(!motorCandidatoValido(propio,trabajador,dia.fecha,o.turno)) continue
                propio.set(dia.clave,{trabajador_id:trabajador.id,fecha:dia.fecha,turno:o.turno})
            }
            visitar(index+1,minutos+o.netos)
            propio.delete(dia.clave)
            if(completa || nodos>6000) break
        }
    }
    visitar(0,base)
    const cambios=[]
    if(mejorMinutos>minutosMapa(original)) dias.filter(d=>!d.bloqueado).forEach(d=>{
        const nuevo=mejorPlan.get(d.clave), anterior=mapa.get(d.clave)
        if(!nuevo || nuevo.turno===anterior?.turno) return
        const asignacion={trabajador_id:trabajador.id,responsable:trabajador.responsable || '',fecha:d.fecha,turno:nuevo.turno,
            horas:calcularHorasSemana([nuevo.turno],colacionPorCeco(trabajador.ceco)),trabajador:trabajador.nombre,cargo:trabajador.cargo,
            regla:esFijo ? 'Turno fijo' : 'Completar jornada semanal',turno_anterior:anterior?.turno || '',accion:anterior ? 'modificar' : 'crear'}
        mapa.set(d.clave,{...asignacion,origen:'topup'});cambios.push(asignacion)
    })
    return {cambios,limitada:nodos>6000,maximo_teorico:maximoTeorico}
}

function motorJornadasPendientes(mapa, trabajadores, fechas, resultados = new Map()){
    const pendientes=[]
    const semanas=[...new Set(fechas.map(motorInicioSemana))]
    trabajadores.forEach(t=>semanas.forEach(semana=>{
        const minutos=[...mapa.values()].filter(a=>String(a.trabajador_id)===String(t.id) && motorInicioSemana(a.fecha)===semana)
            .reduce((n,a)=>n+motorMinutosNetos(a.turno,t),0)
        const objetivo=(parseInt(t.jornada) || MOTOR_MAX_HORAS_LEGALES_SEMANA)*60
        if(minutos>=objetivo) return
        const resultado=resultados.get(motorClaveAsignacion(t.id,semana))
        const parcial=fechas.filter(f=>motorInicioSemana(f)===semana).length<7
        const minimoCatalogo=Math.min(Infinity,...motorTurnosDisponibles(t.ceco).map(turno=>motorMinutosNetos(turno,t)).filter(n=>n>0))
        const motivo=parcial ? 'Semana parcial: se programan solo fechas del mes seleccionado.'
            : resultado?.limitada ? 'La búsqueda alcanzó su límite; revisa alternativas manualmente.'
            : motorEsFijo(t) ? 'Los turnos fijos disponibles y las restricciones no completan la jornada.'
            : minimoCatalogo>objetivo-minutos || (resultado && resultado.maximo_teorico<=minutos) ? 'El catálogo no permite encajar las horas restantes sin exceder la jornada.'
            : 'Revisa descansos, días consecutivos, estados protegidos y horarios disponibles.'
        pendientes.push({trabajador:t.nombre,semana,horas:Math.round(minutos/6)/10,jornada:objetivo/60,
            faltan:Math.round((objetivo-minutos)/6)/10,motivo})
    }))
    return pendientes
}
