// =====================================================
// MODULO: tabla (semanas con sus celdas)
// =====================================================
// Construye el array de items de "contenido" correspondientes a cada
// semana del mes: el pill "SEMANA N", titulo del rango, sub-linea mono
// con tipos de turno, y la tabla con los colaboradores y sus turnos.
//
// Extraido de pdf.js como parte del refactor modular.
//
// Parametros (via opts):
//   - trabajadores : array de trabajadores (cada uno con id, nombre, etc)
//   - semanas      : array de semanas (cada una con .inicio = Date)
//   - mesActual    : numero (0-11) del mes a renderizar
//
// Dependencias globales (asumidas disponibles al momento de llamar):
//   - obtenerTurnoGuardado(trabajadorId, fechaTexto)  -> resumen.js
//   - feriadoDe(fechaTexto)                          -> calendario.js
//   - filtrarPorCargos(trabajadores)                 -> app.js
//   - calcularHorasSemana(turnos, colacion)           -> resumen.js
//   - colacionPorCeco(ceco)                          -> resumen.js

function construirTabla(opts){

    const trabajadores = opts.trabajadores
    const semanas = opts.semanas
    const mesActual = opts.mesActual

    const items = []


    semanas.forEach((semana, index) => {
    
                let body = []
    
                const diasSemana = []
    
                // =====================================
                // FECHAS
                // =====================================
                // Cada entrada es {label, fechaTexto, feriado}:
                //   - label     : texto corto "DD/MM" para la cabecera de la columna.
                //   - fechaTexto: ISO "YYYY-MM-DD" que matchea con
                //                 `planificacionGlobal[i].fecha` y con
                //                 `feriadoDe(fechaTexto)` en calendario.js.
                //   - feriado   : el objeto {nombre, tipo} que devuelve `feriadoDe`,
                //                 o `null` si no es feriado. El header y el cuerpo
                //                 de la celda leen `feriado.nombre` y chequean
                //                 truthy/falsy respectivamente.
    
                for(let dia=0; dia<7; dia++){
    
                    const fecha =
                        new Date(semana.inicio)
    
                    fecha.setDate(
                        fecha.getDate() + dia
                    )
    
                    const yyyy = fecha.getFullYear()
    
                    const mm = String(
                        fecha.getMonth() + 1
                    ).padStart(2, "0")
    
                    const dd = String(
                        fecha.getDate()
                    ).padStart(2, "0")
    
                    const fechaTexto = `${yyyy}-${mm}-${dd}`
    
                    diasSemana.push({
    
                        label: `${dd}/${mm}`,
                        fechaTexto,
                        feriado:
                            typeof feriadoDe === "function"
                                ? feriadoDe(fechaTexto)
                                : null,
    
                    })
    
                }
    
                // =====================================
                // HEADER TABLA
                // =====================================
    
                body.push([
    
                    {
                        text:'COLABORADOR',
                        color:'white',
                        bold:true,
                        fontSize:10,
                        margin:[0,3,0,3]
                    },
    
                    {
                        stack:[
                            {
                                text:'LUN',
                                bold:true,
                                fontSize:8,
                                color:'#ffffff'
                            },
                            {
                                text: diasSemana[0].label,
                                bold:true,
                                fontSize:15,
                                color:'#E4D6AE',
                                margin:[0,2,0,0]
                            },
                            {
                                text: diasSemana[0].feriado
                                    ? diasSemana[0].feriado.nombre
                                    : '',
                                fontSize:6,
                                color:'#fde68a',
                                italics:true,
                                margin:[0,1,0,0]
                            }
                        ],
                        fillColor: diasSemana[0].feriado
                            ? '#2a3f6b'
                            : '#12213B',
                        margin:[0,4,0,4]
                    },
    
                    {
                        stack:[
                            {
                                text:'MAR',
                                bold:true,
                                fontSize:8,
                                color:'#ffffff'
                            },
                            {
                                text: diasSemana[1].label,
                                bold:true,
                                fontSize:15,
                                color:'#E4D6AE',
                                margin:[0,2,0,0]
                            },
                            {
                                text: diasSemana[1].feriado
                                    ? diasSemana[1].feriado.nombre
                                    : '',
                                fontSize:6,
                                color:'#fde68a',
                                italics:true,
                                margin:[0,1,0,0]
                            }
                        ],
                        fillColor: diasSemana[1].feriado
                            ? '#2a3f6b'
                            : '#12213B',
                        margin:[0,4,0,4]
                    },
    
                    {
                        stack:[
                            {
                                text:'MIÉ',
                                bold:true,
                                fontSize:8,
                                color:'#ffffff'
                            },
                            {
                                text: diasSemana[2].label,
                                bold:true,
                                fontSize:15,
                                color:'#E4D6AE',
                                margin:[0,2,0,0]
                            },
                            {
                                text: diasSemana[2].feriado
                                    ? diasSemana[2].feriado.nombre
                                    : '',
                                fontSize:6,
                                color:'#fde68a',
                                italics:true,
                                margin:[0,1,0,0]
                            }
                        ],
                        fillColor: diasSemana[2].feriado
                            ? '#2a3f6b'
                            : '#12213B',
                        margin:[0,4,0,4]
                    },
    
                    {
                        stack:[
                            {
                                text:'JUE',
                                bold:true,
                                fontSize:8,
                                color:'#ffffff'
                            },
                            {
                                text: diasSemana[3].label,
                                bold:true,
                                fontSize:15,
                                color:'#E4D6AE',
                                margin:[0,2,0,0]
                            },
                            {
                                text: diasSemana[3].feriado
                                    ? diasSemana[3].feriado.nombre
                                    : '',
                                fontSize:6,
                                color:'#fde68a',
                                italics:true,
                                margin:[0,1,0,0]
                            }
                        ],
                        fillColor: diasSemana[3].feriado
                            ? '#2a3f6b'
                            : '#12213B',
                        margin:[0,4,0,4]
                    },
    
                    {
                        stack:[
                            {
                                text:'VIE',
                                bold:true,
                                fontSize:8,
                                color:'#ffffff'
                            },
                            {
                                text: diasSemana[4].label,
                                bold:true,
                                fontSize:15,
                                color:'#E4D6AE',
                                margin:[0,2,0,0]
                            },
                            {
                                text: diasSemana[4].feriado
                                    ? diasSemana[4].feriado.nombre
                                    : '',
                                fontSize:6,
                                color:'#fde68a',
                                italics:true,
                                margin:[0,1,0,0]
                            }
                        ],
                        fillColor: diasSemana[4].feriado
                            ? '#2a3f6b'
                            : '#12213B',
                        margin:[0,4,0,4]
                    },
    
                    {
                        stack:[
                            {
                                text:'SÁB',
                                bold:true,
                                fontSize:8,
                                color:'#ffffff'
                            },
                            {
                                text: diasSemana[5].label,
                                bold:true,
                                fontSize:15,
                                color:'#E4D6AE',
                                margin:[0,2,0,0]
                            },
                            {
                                text: diasSemana[5].feriado
                                    ? diasSemana[5].feriado.nombre
                                    : '',
                                fontSize:6,
                                color:'#fde68a',
                                italics:true,
                                margin:[0,1,0,0]
                            }
                        ],
                        fillColor: diasSemana[5].feriado
                            ? '#2a3f6b'
                            : '#12213B',
                        margin:[0,4,0,4]
                    },
    
                    {
                        stack:[
                            {
                                text:'DOM',
                                bold:true,
                                fontSize:8,
                                color:'#ffffff'
                            },
                            {
                                text: diasSemana[6].label,
                                bold:true,
                                fontSize:15,
                                color:'#E4D6AE',
                                margin:[0,2,0,0]
                            },
                            {
                                text: diasSemana[6].feriado
                                    ? diasSemana[6].feriado.nombre
                                    : '',
                                fontSize:6,
                                color:'#fde68a',
                                italics:true,
                                margin:[0,1,0,0]
                            }
                        ],
                        fillColor: diasSemana[6].feriado
                            ? '#2a3f6b'
                            : '#12213B',
                        margin:[0,4,0,4]
                    },
    
                    {
                        text:'HRS',
                        color:'white',
                        bold:true,
                        fontSize:10,
                        margin:[0,3,0,3],
                        alignment:'center'
                    }
    
                ])
    
                // =====================================
                // FILAS
                // =====================================
    
                trabajadores.forEach(t => {
    
                    let fila = []
    
                    fila.push({
    
                        text:t.nombre,
    
                        bold:true,
    
                        fontSize:9,
    
                        color:'#12213B'
    
                    })
    
                    let turnosSemana = []
    
                    for(let dia=0; dia<7; dia++){
    
                        const fecha =
                            new Date(semana.inicio)
    
                        fecha.setDate(
                            fecha.getDate() + dia
                        )
    
                        const fechaTexto =
    
                            `${fecha.getFullYear()}-${
                                String(
                                    fecha.getMonth()+1
                                ).padStart(2,'0')
                            }-${
                                String(
                                    fecha.getDate()
                                ).padStart(2,'0')
                            }`
    
                        const turno =
                            obtenerTurnoGuardado(
                                t.id,
                                fechaTexto
                            )
    
                        turnosSemana.push(
                            turno
                        )
    
                        // =====================================
                        // COLOR TURNOS
                        // =====================================
    
                        let fillColor = null
                        let colorTexto = '#1C2230'
    
                        const turnoTexto =
                            (turno || "")
                            .toLowerCase()
    
                        if(
                            turnoTexto === "libre"
                        ){
    
                            fillColor = '#EDF3ED'
                            colorTexto = '#4B7A5A'
    
                        }
    
                        if(
                            turnoTexto.includes("vacaciones")
                        ){
    
                            fillColor = '#FBF1DC'
                            colorTexto = '#A17A1F'
    
                        }
    
                        // Turno asignado: cuando hay un horario definido (no es
                        // Libre ni Vacaciones ni vacio), aplicamos el fondo
                        // turno del HTML (#F4F5F7). El texto ya es turno-text
                        // (#1C2230) por default.
                        if(
                            turno
                            && turnoTexto !== "libre"
                            && !turnoTexto.includes("vacaciones")
                        ){
    
                            fillColor = '#F4F5F7'
    
                        }
    
                        fila.push({
    
                            text:
                                turno || '-',
    
                            alignment:'center',
    
                            fontSize:8,
    
                            color: colorTexto,
                            fillColor,
    
                        })
    
                    }
    
                    // =====================================
                    // HORAS
                    // =====================================
    
                    const horas =
                        calcularHorasSemana(
                            turnosSemana,
                            colacionPorCeco(t.ceco)
                        )
    
                    fila.push({
    
                        text:`${horas}h`,
    
                        bold:true,
    
                        alignment:'center',
    
                        fillColor:'#f8fafc',
    
                        fontSize:9
    
                    })
    
                    body.push(fila)
    
                })
    
                // =====================================
                // BLOQUE SEMANAL
                // =====================================
    
                items.push({
    
                    unbreakable:true,
    
                    stack:[
    
                        {
    
                            columns:[
    
                                {
    
                                    width:20,
    
                                    svg:
                                        obtenerIconoPDF(
                                            'calendario',
                                            '#2563eb'
                                        ),
    
                                    margin:[0,0,5,0]
    
                                },
    
                                {
    
                                    text:
                                        `SEMANA ${index + 1}`,
    
                                    fontSize:13,
    
                                    bold:true,
    
                                    margin:[5,0,0,10]
    
                                }
    
                            ]
    
                        },
    
                        {
    
                            table:{
    
                                headerRows:1,
    
                                dontBreakRows:true,
    
                                widths:[
    
                                    110,
                                    '*',
                                    '*',
                                    '*',
                                    '*',
                                    '*',
                                    '*',
                                    '*',
                                    40
    
                                ],
    
                                body
    
                            },
    
                            layout:{
    
                                hLineColor:() =>
                                    '#E3E1DC',
    
                                vLineColor:() =>
                                    '#E3E1DC',
    
                                fillColor:(rowIndex)=>{
    
                                    if(rowIndex === 0){
    
                                        return '#12213B'
    
                                    }
    
                                    return rowIndex % 2 === 0
    
                                        ?
    
                                        '#FBFBFA'
    
                                        :
    
                                        null
    
                                },
    
                                paddingLeft:() => 5,
                                paddingRight:() => 5,
                                paddingTop:() => 4,
                                paddingBottom:() => 4
    
                            },
    
                            margin:[0,0,0,15]
    
                        }
    
                    ]
    
                })
    
    
    })

    return items

}
