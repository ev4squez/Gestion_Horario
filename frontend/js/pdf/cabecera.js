// Cabecera compacta para impresión, sin una portada independiente.
function construirCabecera({cecos, mesActual, anioActual}){
    const empresa = document.getElementById('texto-empresa-sidebar')?.textContent.trim()
    const cargos = window.cargosSeleccionados || []
    return {
        stack:[
            {text: empresa && empresa !== '—' ? empresa : 'GESTIÓN DE TURNOS', fontSize:9, bold:true, color:'#526174', margin:[0,0,0,6]},
            {columns:[
                {text:'Planificación mensual', fontSize:21, bold:true, color:'#253247'},
                {text:`${obtenerNombreMes(mesActual)} ${anioActual}`, fontSize:15, bold:true, color:'#365fc4', alignment:'right', margin:[0,4,0,0]}
            ]},
            {text:`Cargo: ${cargos.length ? cargos.join(', ') : 'Todos'}  ·  Área / CECO: ${cecos || 'No definido'}`, fontSize:8, color:'#526174', margin:[0,7,0,0]}
        ],
        margin:[0,0,0,12]
    }
}
