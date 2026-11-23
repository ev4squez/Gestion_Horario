// Altura útil de una hoja A4 horizontal para un bloque de semana. Es menor que la
// hoja real (≈529 pt) para dejar margen a las filas con horas extra, que ocupan más.
const ALTO_SEMANA_PDF = 440
// Altura fija de cada bloque de semana: título, dos filas de encabezado (con feriados) y separación.
const ALTO_FIJO_SEMANA_PDF = 80
// Largo máximo de nombre para que cada colaborador ocupe una sola línea.
const LARGO_NOMBRE_PDF = 26
// Altura de una línea de texto a 8 pt.
const ALTO_LINEA_PDF = 10
// Espacio que ocupan la cabecera y la leyenda en la primera hoja.
const ALTO_CABECERA_PDF = 130
// Relleno mínimo por fila; con menos, la grilla se vuelve ilegible.
const PADDING_MINIMO_PDF = 1

// Ajusta el relleno vertical de las filas para que un bloque quepa en una hoja
// cuando hay pocas filas, y lo reduce (sin bajar del mínimo) cuando hay muchas.
function paddingFilaPDF(cantidadFilas, altoDisponible = ALTO_SEMANA_PDF){
    const porFila = (altoDisponible - ALTO_FIJO_SEMANA_PDF) / Math.max(1, cantidadFilas)
    return Math.max(PADDING_MINIMO_PDF, Math.min(4, (porFila - ALTO_LINEA_PDF) / 2))
}

// Máxima cantidad de colaboradores que caben en una hoja completa con el relleno mínimo.
function filasPorHojaPDF(){
    return Math.floor((ALTO_SEMANA_PDF - ALTO_FIJO_SEMANA_PDF) / (ALTO_LINEA_PDF + 2 * PADDING_MINIMO_PDF))
}

// Reparte a los colaboradores en bloques de tamaño parejo para no dejar una o dos filas sueltas.
function dividirEnBloquesPDF(trabajadores){
    const bloques = Math.max(1, Math.ceil(trabajadores.length / filasPorHojaPDF()))
    const tamano = Math.ceil(trabajadores.length / bloques)
    return Array.from({length: bloques}, (_, i) => trabajadores.slice(i * tamano, (i + 1) * tamano))
}

// Acorta el nombre con puntos suspensivos para que no ocupe más de una línea.
function nombreCortoPDF(nombre){
    const caracteres = Array.from(String(nombre || 'Sin nombre').replace(/\s+/g, ' ').trim())
    return caracteres.length > LARGO_NOMBRE_PDF ? caracteres.slice(0, LARGO_NOMBRE_PDF - 1).join('') + '…' : caracteres.join('')
}

function construirTabla({trabajadores, semanas, mesActual}){
    const dias = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM']
    const bloques = dividirEnBloquesPDF(trabajadores)
    const salida = []
    semanas.forEach((semana, index) => {
        const fechas = Array.from({length:7}, (_, dia) => {
            const fecha = new Date(semana.inicio)
            fecha.setDate(fecha.getDate() + dia)
            const iso = resumenFechaISO(fecha)
            return {fecha, iso, feriado: typeof feriadoDe === 'function' ? feriadoDe(iso) : null}
        })
        const rango = `${fechas[0].fecha.toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit'})} al ${fechas[6].fecha.toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit'})}`
        bloques.forEach((grupo, parte) => {
            // El primer bloque de la primera semana comparte hoja con la cabecera,
            // así que se compacta para que entre en el espacio que queda.
            const primero = salida.length === 0
            const disponible = primero ? ALTO_SEMANA_PDF - ALTO_CABECERA_PDF : ALTO_SEMANA_PDF
            const padding = paddingFilaPDF(grupo.length, disponible)
            const alturaBloque = ALTO_FIJO_SEMANA_PDF + grupo.length * (ALTO_LINEA_PDF + 2 * padding)
            const continua = parte > 0 ? '  ·  (continúa)' : ''
            const body = [
                [{text:`SEMANA ${index + 1}  ·  ${rango}${continua}`,colSpan:9,bold:true,fontSize:10,color:'#253247',fillColor:'#ecf2ff',margin:[0,4,0,4]}, ...Array.from({length:8},()=>({}))],
                [
                    {text:'COLABORADOR',bold:true,alignment:'left'},
                    ...fechas.map(({fecha,feriado},dia)=>({stack:[
                        {text:`${dias[dia]} ${String(fecha.getDate()).padStart(2,'0')}/${String(fecha.getMonth()+1).padStart(2,'0')}`,bold:true},
                        ...(feriado ? [{text:feriado.nombre,fontSize:6,color:'#b34545',margin:[0,2,0,0]}] : [])
                    ],fillColor:feriado ? '#fff1ef' : '#f6f9fc'})),
                    {text:'HORAS /\nJORNADA',bold:true}
                ]
            ]
            grupo.forEach(t => {
                const turnos = fechas.map(({iso})=>obtenerTurnoGuardado(t.id,iso))
                const horas = calcularHorasSemana(turnos,colacionPorCeco(t.ceco))
                const jornada = parseInt(t.jornada) || 0
                body.push([
                    {text:nombreCortoPDF(t.nombre),bold:true,fontSize:8.5,alignment:'left',noWrap:true},
                    ...turnos.map((turno,dia)=>{
                        const valor = String(turno || '').trim()
                        const estado = valor.toLowerCase()
                        const [fillColor,color] = estado.includes('vacaciones') ? ['#f1ecfb','#69449a']
                            : estado.includes('saliente') ? ['#edf1f5','#526174']
                            : estado.includes('libre') ? ['#e9f7f1','#236b51'] : ['#edf3ff','#2b53a4']
                        return {text:valor || '—',fontSize:8,noWrap:true,fillColor,color:fechas[dia].fecha.getMonth() !== mesActual ? '#626f82' : color}
                    }),
                    // Las horas extra van en la misma línea para no aumentar la altura de la fila.
                    {text:[
                        {text:`${horas} / ${jornada || '—'}h`,bold:true,fontSize:8.5},
                        ...(jornada && horas > jornada ? [{text:`  +${Math.round((horas-jornada)*10)/10}h`,fontSize:7,color:'#b34545'}] : [])
                    ],noWrap:true,fillColor:jornada && horas > jornada ? '#fff1ef' : '#f6f9fc'}
                ])
            })
            // El primer bloque de una semana empieza en hoja nueva si no cabe junto a la cabecera.
            // Los bloques siguientes empiezan en hoja nueva para no compartirla con otra semana parcial.
            const saltoAntes = primero
                ? alturaBloque > disponible
                : parte > 0 || alturaBloque > ALTO_SEMANA_PDF
            // Cada bloque se mantiene completo en su hoja (pdfmake no puede partir un bloque
            // más alto que la hoja, así que los bloques ya están dimensionados para caber).
            salida.push({
                ...(saltoAntes ? {pageBreak:'before'} : {}),
                stack:[{
                    table:{headerRows:2,keepWithHeaderRows:1,dontBreakRows:true,widths:[136,...Array(7).fill('*'),78],body},
                    layout:{hLineWidth:()=>.5,vLineWidth:()=>.5,hLineColor:()=> '#e5eaf0',vLineColor:()=> '#e5eaf0',
                        paddingLeft:()=>5,paddingRight:()=>5,paddingTop:()=>padding,paddingBottom:()=>padding,
                        fillColor:row=>row===1 ? '#f6f9fc' : '#fff'},
                    fontSize:8,color:'#253247',alignment:'center',margin:[0,10,0,0]
                }],
                unbreakable: true
            })
        })
    })
    return salida
}
