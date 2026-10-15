// Exporta el mismo equipo y filtros visibles en Planificación.
function exportarPDF(){
    try{
        const trabajadores = trabajadoresPlanificacionVisibles().filter(t => t.activo !== false)
        if(!trabajadores.length){ alert('No hay colaboradores para exportar con estos filtros.'); return }
        const cecos = [...new Set(trabajadores.map(t=>t.ceco).filter(Boolean))].join(', ')
        const semanas = generarSemanas(mesActual, anioActual)
        const generado = new Date().toLocaleString('es-CL')
        const contenido = [
            construirCabecera({cecos,mesActual,anioActual}),
            construirStats({trabajadores,semanas,cecos}),
            construirLeyenda(),
            ...construirTabla({trabajadores,semanas,mesActual})
        ]
        const alertas = typeof calcularTodasAlertas === 'function' ? calcularTodasAlertas(trabajadores) : []
        if(alertas.length){
            const body = [[
                {text:'TIPO',bold:true},{text:'REFERENCIA',bold:true},{text:'MOTIVO',bold:true}
            ]]
            alertas.forEach(a => {
                const color = a.tipo === 'danger' ? '#b34545' : a.tipo === 'info' ? '#365fc4' : '#996515'
                const tipo = a.kind === 'horas' ? 'Horas semanales' : a.kind === 'cobertura' ? 'Cobertura' : 'Descanso'
                const referencia = a.kind === 'cobertura' ? a.titulo : a.trabajador
                const motivo = a.kind === 'horas'
                    ? `Semana ${a.semana} · ${a.horas}h / ${a.jornada}h · ${a.diferencia > 0 ? '+' : ''}${a.diferencia}h`
                    : a.kind === 'cobertura' ? `${a.mensaje} · ${a.detalle}`
                    : `${a.fecha1} al ${a.fecha2} · Descanso ${a.descanso.toFixed(1)}h (mínimo 12h)`
                body.push([{text:tipo,color},{text:referencia || '—'},{text:motivo}])
            })
            contenido.push({pageBreak:'before',stack:[
                {text:'Alertas de planificación',fontSize:17,bold:true,color:'#253247',margin:[0,0,0,5]},
                {text:`${alertas.length} observaciones · ${obtenerNombreMes(mesActual)} ${anioActual}`,fontSize:9,color:'#626f82',margin:[0,0,0,12]}
            ]})
            contenido.push({
                table:{headerRows:1,dontBreakRows:true,widths:[90,180,'*'],body},
                layout:{hLineWidth:()=>.5,vLineWidth:()=>0,hLineColor:()=> '#e5eaf0',
                    paddingTop:()=>7,paddingBottom:()=>7,paddingLeft:()=>8,paddingRight:()=>8,
                    fillColor:row=>row===0 ? '#ecf2ff' : row%2===0 ? '#f6f9fc' : '#fff'},
                fontSize:8,color:'#253247'
            })
        }
        const documento = {
            pageSize:'A4',pageOrientation:'landscape',pageMargins:[28,32,28,34],
            info:{title:`Planificación ${obtenerNombreMes(mesActual)} ${anioActual}`,subject:'Planificación de turnos'},
            header:page=>page===1 ? null : {text:`PLANIFICACIÓN · ${obtenerNombreMes(mesActual)} ${anioActual}`,fontSize:8,color:'#626f82',margin:[28,14,28,0]},
            footer:(page,total)=>({columns:[
                {text:`Generado: ${generado}`,alignment:'left'},
                {text:`Página ${page} de ${total}`,alignment:'right'}
            ],margin:[28,12,28,0],fontSize:8,color:'#626f82'}),
            content:contenido,defaultStyle:{font:'Roboto',fontSize:9,color:'#253247'}
        }
        pdfMake.createPdf(documento).download(`Planificacion_${obtenerNombreMes(mesActual)}_${anioActual}.pdf`)
    }catch(err){
        console.error('Error al exportar PDF:',err)
        alert('No se pudo generar el PDF: ' + (err.message || err))
    }
}
