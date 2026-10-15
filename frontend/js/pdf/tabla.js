function construirTabla({trabajadores, semanas, mesActual}){
    const dias = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM']
    return semanas.map((semana, index) => {
        const fechas = Array.from({length:7}, (_, dia) => {
            const fecha = new Date(semana.inicio)
            fecha.setDate(fecha.getDate() + dia)
            const iso = resumenFechaISO(fecha)
            return {fecha, iso, feriado: typeof feriadoDe === 'function' ? feriadoDe(iso) : null}
        })
        const rango = `${fechas[0].fecha.toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit'})} al ${fechas[6].fecha.toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit'})}`
        const body = [
            [{text:`SEMANA ${index + 1}  ·  ${rango}`,colSpan:9,bold:true,fontSize:10,color:'#253247',fillColor:'#ecf2ff',margin:[0,4,0,4]}, ...Array.from({length:8},()=>({}))],
            [
                {text:'COLABORADOR',bold:true,alignment:'left'},
                ...fechas.map(({fecha,feriado},dia)=>({stack:[
                    {text:`${dias[dia]} ${String(fecha.getDate()).padStart(2,'0')}/${String(fecha.getMonth()+1).padStart(2,'0')}`,bold:true},
                    ...(feriado ? [{text:feriado.nombre,fontSize:6,color:'#b34545',margin:[0,2,0,0]}] : [])
                ],fillColor:feriado ? '#fff1ef' : '#f6f9fc'})),
                {text:'HORAS /\nJORNADA',bold:true}
            ]
        ]
        trabajadores.forEach(t => {
            const turnos = fechas.map(({iso})=>obtenerTurnoGuardado(t.id,iso))
            const horas = calcularHorasSemana(turnos,colacionPorCeco(t.ceco))
            const jornada = parseInt(t.jornada) || 0
            body.push([
                {text:t.nombre || 'Sin nombre',bold:true,fontSize:8.5,alignment:'left'},
                ...turnos.map((turno,dia)=>{
                    const valor = String(turno || '').trim()
                    const estado = valor.toLowerCase()
                    const [fillColor,color] = estado.includes('vacaciones') ? ['#f1ecfb','#69449a']
                        : estado.includes('saliente') ? ['#edf1f5','#526174']
                        : estado.includes('libre') ? ['#e9f7f1','#236b51'] : ['#edf3ff','#2b53a4']
                    return {text:valor || '—',fontSize:8,noWrap:true,fillColor,color:fechas[dia].fecha.getMonth() !== mesActual ? '#626f82' : color,margin:[0,3,0,3]}
                }),
                {stack:[{text:`${horas} / ${jornada || '—'}h`,bold:true,fontSize:8.5},
                    ...(jornada && horas > jornada ? [{text:`+${Math.round((horas-jornada)*10)/10}h`,fontSize:7,color:'#b34545',margin:[0,2,0,0]}] : [])
                ],fillColor:jornada && horas > jornada ? '#fff1ef' : '#f6f9fc'}
            ])
        })
        return {
            table:{headerRows:2,keepWithHeaderRows:1,dontBreakRows:true,widths:[136,...Array(7).fill('*'),65],body},
            layout:{hLineWidth:()=>.5,vLineWidth:()=>.5,hLineColor:()=> '#e5eaf0',vLineColor:()=> '#e5eaf0',
                paddingLeft:()=>5,paddingRight:()=>5,paddingTop:()=>4,paddingBottom:()=>4,
                fillColor:row=>row===1 ? '#f6f9fc' : '#fff'},
            fontSize:8,color:'#253247',alignment:'center',margin:[0,10,0,0]
        }
    })
}
