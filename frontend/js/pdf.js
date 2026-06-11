// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

function obtenerNombreMes(mes){

    const meses = [

        'Enero',
        'Febrero',
        'Marzo',
        'Abril',
        'Mayo',
        'Junio',
        'Julio',
        'Agosto',
        'Septiembre',
        'Octubre',
        'Noviembre',
        'Diciembre'

    ]

    return meses[mes]

}


// =====================================================
// EXPORTAR PDF
// =====================================================

function exportarPDF(){

    // =====================================
    // VALIDACION
    // =====================================

    if(typeof trabajadoresGlobal === 'undefined'){

        console.error(
            "trabajadoresGlobal no definido"
        )

        return

    }

    // =====================================
    // FILTRO RESPONSABLE
    // =====================================

    const trabajadores =

        window.responsableSeleccionado
        ===
        "todos"

        ?

        trabajadoresGlobal

        :

        trabajadoresGlobal.filter(
            t =>
                t.responsable
                ===
                window.responsableSeleccionado
        )

    // =====================================
    // CECO
    // =====================================

    const cecos = [

        ...new Set(

            trabajadores.map(
                t => t.ceco
            )

        )

    ]

    .filter(Boolean)

    .join(", ")

    // =====================================
    // SEMANAS
    // =====================================

    const semanas =
        generarSemanas(
            mesActual,
            anioActual
        )

    let contenido = []

    // =====================================
    // CABECERA
    // =====================================

    contenido.push({

        table:{

            widths:['*'],

            body:[[{

                stack:[

                    {

                        text:
                            'PLANIFICACIÓN MENSUAL',

                        fontSize:22,

                        bold:true,

                        color:'white'

                    },

                    {

                        text:
                            `${obtenerNombreMes(
                                mesActual
                            ).toUpperCase()} ${anioActual}`,

                        fontSize:12,

                        color:'white',

                        margin:[0,5,0,0]

                    },

                    {

                        text:

                            `Responsable: ${
                                window.responsableSeleccionado
                                ===
                                "todos"

                                ?

                                "TODOS"

                                :

                                window.responsableSeleccionado
                            }`,

                        fontSize:10,

                        color:'white',

                        margin:[0,10,0,0]

                    },

                    {

                        text:

                            `Área / CECO: ${
                                cecos || "No definido"
                            }`,

                        fontSize:10,

                        color:'white',

                        margin:[0,3,0,0]

                    }

                ],

                fillColor:'#1e293b',

                margin:[20,20,20,20]

            }]]

        },

        layout:'noBorders',

        margin:[-20,-20,-20,30]

    })

    // =====================================
    // SEMANAS
    // =====================================

    semanas.forEach((semana,index)=>{

        let body = []

        const diasSemana = []

        // =====================================
        // FECHAS
        // =====================================

        for(let dia=0; dia<7; dia++){

            const fecha =
                new Date(semana.inicio)

            fecha.setDate(
                fecha.getDate() + dia
            )

            diasSemana.push(

                `${fecha.getDate()}/${
                    fecha.getMonth()+1
                }`

            )

        }

        // =====================================
        // HEADER TABLA
        // =====================================

        body.push([

            {
                text:'COLABORADOR',
                style:'tableHeader'
            },

            {
                text:`LUN\n${diasSemana[0]}`,
                style:'tableHeader'
            },

            {
                text:`MAR\n${diasSemana[1]}`,
                style:'tableHeader'
            },

            {
                text:`MIÉ\n${diasSemana[2]}`,
                style:'tableHeader'
            },

            {
                text:`JUE\n${diasSemana[3]}`,
                style:'tableHeader'
            },

            {
                text:`VIE\n${diasSemana[4]}`,
                style:'tableHeader'
            },

            {
                text:`SÁB\n${diasSemana[5]}`,
                style:'tableHeader'
            },

            {
                text:`DOM\n${diasSemana[6]}`,
                style:'tableHeader'
            },

            {
                text:'HRS',
                style:'tableHeader'
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

                color:'#334155'

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

                const turnoTexto =
                    (turno || "")
                    .toLowerCase()

                if(
                    turnoTexto === "libre"
                ){

                    fillColor = '#dcfce7'

                }

                if(
                    turnoTexto.includes("vacaciones")
                ){

                    fillColor = '#fef3c7'

                }

                fila.push({

                    text:
                        turno || '-',

                    alignment:'center',

                    fontSize:8,

                    fillColor

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
        // TITULO SEMANA
        // =====================================

        contenido.push({

            columns:[

                {

                    width:5,

                    canvas:[{

                        type:'rect',

                        x:0,

                        y:0,

                        w:5,

                        h:15,

                        color:'#3b82f6'

                    }]

                },

                {

                    text:
                        `SEMANA ${index + 1}`,

                    fontSize:13,

                    bold:true,

                    margin:[5,0,0,10]

                }

            ]

        })

        // =====================================
        // TABLA
        // =====================================

        contenido.push({

            table:{

                headerRows:1,

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
                    '#e2e8f0',

                vLineColor:() =>
                    '#e2e8f0',

                fillColor:(rowIndex)=>{

                    if(rowIndex === 0){

                        return '#334155'

                    }

                    return rowIndex % 2 === 0

                        ?

                        '#f8fafc'

                        :

                        null

                },

                paddingLeft:() => 5,
                paddingRight:() => 5,
                paddingTop:() => 4,
                paddingBottom:() => 4

            },

            margin:[0,0,0,15]

        })

    })

    // =====================================
    // ALERTAS
    // =====================================

    const alertas =
        calcularAlertasDescanso(
            trabajadores
        )

    if(
        alertas
        &&
        alertas.length > 0
    ){

        contenido.push({

            text:
                '⚠ ALERTAS DE DESCANSO',

            fontSize:12,

            bold:true,

            color:'#b91c1c',

            margin:[0,10,0,8]

        })

        alertas.forEach(a => {

            contenido.push({

                text:

                    `• ${a.trabajador} | ${a.fecha1} → ${a.fecha2} | Descanso: ${a.descanso.toFixed(1)}h`,

                color:

                    a.tipo === 'danger'

                    ?

                    '#b91c1c'

                    :

                    '#92400e',

                fontSize:8,

                margin:[10,2,0,2]

            })

        })

    }

    // =====================================
    // FOOTER
    // =====================================

    const documento = {

        pageOrientation:'landscape',

        pageMargins:[25,25,25,30],

        footer:function(currentPage,pageCount){

            return {

                columns:[

                    {

                        text:
                            `Generado: ${
                                new Date().toLocaleString()
                            }`,

                        alignment:'left',

                        margin:[25,0]

                    },

                    {

                        text:
                            `Página ${currentPage} de ${pageCount}`,

                        alignment:'right',

                        margin:[0,0,25,0]

                    }

                ],

                fontSize:8,

                color:'#64748b'

            }

        },

        content:contenido,

        styles:{

            tableHeader:{

                bold:true,

                fontSize:9,

                color:'white',

                alignment:'center',

                margin:[0,3,0,3]

            }

        },

        defaultStyle:{

            fontSize:10

        }

    }

    // =====================================
    // EXPORTAR
    // =====================================

    pdfMake.createPdf(
        documento
    ).download(

        `Planificacion_${
            obtenerNombreMes(
                mesActual
            )
        }_${anioActual}.pdf`

    )

}