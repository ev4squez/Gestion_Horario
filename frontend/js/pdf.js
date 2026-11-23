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
        // Las alertas se resumen en una única hoja de dashboard (tamaño fijo),
        // en lugar de listar todas las incidencias.
        const alertas = typeof calcularTodasAlertas === 'function' ? calcularTodasAlertas(trabajadores) : []
        contenido.push(construirDashboardAlertasPDF({alertas,trabajadores,semanas,mesActual,anioActual,cecos}))
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
