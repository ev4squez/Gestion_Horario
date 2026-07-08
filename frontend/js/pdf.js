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

function obtenerIconoPDF(tipo, color = '#ffffff'){

    const iconos = {
        calendario:
            '<path d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm12 7H5V7h14v2zm0 10H5v-8h14v8z"/>',
        personas:
            '<path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm6 0a3 3 0 1 0 0-6c-.35 0-.69.06-1 .17A5.98 5.98 0 0 1 14 10.83c.31.11.65.17 1 .17zM9 13c-4.42 0-8 2.24-8 5v2h16v-2c0-2.76-3.58-5-8-5zm6.5.1c1.49 1.14 2.5 2.68 2.5 4.4V20h5v-2c0-2.41-3.03-4.43-7.5-4.9z"/>',
        trabajo:
            '<path d="M9 4V2h6v2h5a2 2 0 0 1 2 2v5H2V6a2 2 0 0 1 2-2h5zm2 0h2V4h-2zm11 9v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7h8v2h4v-2h8z"/>',
        reloj:
            '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5.59l3.7 3.7-1.41 1.42L11 13.41V7h2z"/>',
        alerta:
            '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>',
        cobertura:
            '<path d="M12 2 4 5v6c0 5.05 3.41 9.74 8 11 4.59-1.26 8-5.95 8-11V5l-8-3zm-1 14-4-4 1.41-1.41L11 13.17l4.59-4.58L17 10l-6 6z"/>'
    }

    return `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="${color}">
            ${iconos[tipo] || iconos.calendario}
        </svg>
    `

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
    // FILTRO CARGO
    // =====================================

    const trabajadores =
        filtrarPorCargos(trabajadoresGlobal)

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

                columns:[

                    {

                        width:42,

                        svg:
                            obtenerIconoPDF(
                                'calendario',
                                '#bfdbfe'
                            ),

                        margin:[0,2,14,0]

                    },

                    {

                        width:'*',

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

                                color:'#bfdbfe',

                                margin:[0,4,0,0]

                            },

                            {

                                text:

                                    `Cargo: ${
                                        window.cargosSeleccionados.length
                                        ===
                                        0

                                        ?

                                        "TODOS"

                                        :

                                        window.cargosSeleccionados.join(", ")
                                    }`,

                                fontSize:9,

                                color:'white',

                                margin:[0,9,0,0]

                            },

                            {

                                text:

                                    `Área / CECO: ${
                                        cecos || "No definido"
                                    }`,

                                fontSize:9,

                                color:'#cbd5e1',

                                margin:[0,3,0,0]

                            }

                        ]

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
    // RESUMEN Y LEYENDA
    // =====================================

    contenido.push({

        columns:[

            {

                width:'33%',

                table:{

                    widths:[24, '*'],

                    body:[[

                        {

                            svg:
                                obtenerIconoPDF(
                                    'personas',
                                    '#2563eb'
                                ),

                            margin:[0,2,6,0]

                        },

                        {

                            stack:[

                                {
                                    text:'COLABORADORES',
                                    fontSize:7,
                                    bold:true,
                                    color:'#64748b'
                                },

                                {
                                    text:String(trabajadores.length),
                                    fontSize:14,
                                    bold:true,
                                    color:'#0f172a'
                                }

                            ]

                        }

                    ]]

                },

                layout:{
                    hLineWidth:() => 0,
                    vLineWidth:() => 0,
                    fillColor:() => '#eff6ff',
                    paddingLeft:() => 8,
                    paddingRight:() => 8,
                    paddingTop:() => 7,
                    paddingBottom:() => 7
                },

                margin:[0,0,6,0]

            },

            {

                width:'33%',

                table:{

                    widths:[24, '*'],

                    body:[[

                        {

                            svg:
                                obtenerIconoPDF(
                                    'calendario',
                                    '#7c3aed'
                                ),

                            margin:[0,2,6,0]

                        },

                        {

                            stack:[

                                {
                                    text:'SEMANAS',
                                    fontSize:7,
                                    bold:true,
                                    color:'#64748b'
                                },

                                {
                                    text:String(semanas.length),
                                    fontSize:14,
                                    bold:true,
                                    color:'#0f172a'
                                }

                            ]

                        }

                    ]]

                },

                layout:{
                    hLineWidth:() => 0,
                    vLineWidth:() => 0,
                    fillColor:() => '#f5f3ff',
                    paddingLeft:() => 8,
                    paddingRight:() => 8,
                    paddingTop:() => 7,
                    paddingBottom:() => 7
                },

                margin:[3,0,3,0]

            },

            {

                width:'34%',

                table:{

                    widths:[24, '*'],

                    body:[[

                        {

                            svg:
                                obtenerIconoPDF(
                                    'trabajo',
                                    '#059669'
                                ),

                            margin:[0,2,6,0]

                        },

                        {

                            stack:[

                                {
                                    text:'CECO',
                                    fontSize:7,
                                    bold:true,
                                    color:'#64748b'
                                },

                                {
                                    text:cecos || 'No definido',
                                    fontSize:9,
                                    bold:true,
                                    color:'#0f172a'
                                }

                            ]

                        }

                    ]]

                },

                layout:{
                    hLineWidth:() => 0,
                    vLineWidth:() => 0,
                    fillColor:() => '#ecfdf5',
                    paddingLeft:() => 8,
                    paddingRight:() => 8,
                    paddingTop:() => 7,
                    paddingBottom:() => 7
                },

                margin:[6,0,0,0]

            }

        ],

        margin:[0,0,0,8]

    })

    contenido.push({

        columns:[

            {
                width:10,
                canvas:[{
                    type:'rect',
                    x:0,
                    y:1,
                    w:8,
                    h:8,
                    color:'#dcfce7'
                }]
            },

            {
                width:'auto',
                text:'Libre',
                fontSize:7,
                color:'#475569',
                margin:[2,0,14,0]
            },

            {
                width:10,
                canvas:[{
                    type:'rect',
                    x:0,
                    y:1,
                    w:8,
                    h:8,
                    color:'#fef3c7'
                }]
            },

            {
                width:'auto',
                text:'Vacaciones',
                fontSize:7,
                color:'#475569',
                margin:[2,0,14,0]
            },

            {
                width:10,
                canvas:[{
                    type:'rect',
                    x:0,
                    y:1,
                    w:8,
                    h:8,
                    color:'#f8fafc'
                }]
            },

            {
                width:'auto',
                text:'Horas semanales',
                fontSize:7,
                color:'#475569',
                margin:[2,0,0,0]
            }

        ],

        margin:[0,0,0,14]

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
        // BLOQUE SEMANAL
        // =====================================

        contenido.push({

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

                }

            ]

        })

    })

    // =====================================
    // ALERTAS
    // =====================================

    const alertas =
        calcularTodasAlertas(
            trabajadores
        )

    if(
        alertas
        &&
        alertas.length > 0
    ){

        contenido.push({

            pageBreak:'before',

            columns:[

                {

                    width:22,

                    svg:
                        obtenerIconoPDF(
                            'alerta',
                            '#dc2626'
                        ),

                    margin:[0,0,6,0]

                },

                {

                    text:
                        `ALERTAS DE PLANIFICACIÓN (${alertas.length})`,

                    fontSize:12,

                    bold:true,

                    color:'#991b1b',

                    margin:[0,2,0,0]

                }

            ],

            margin:[0,10,0,8]

        })

        alertas.forEach(a => {

            let texto

            if(a.kind === "horas"){

                const diferencia =
                    Math.abs(a.diferencia).toFixed(1)

                texto =
                    `${a.trabajador} | Semana ${a.semana} | ` +
                    `${a.horas}h de ${a.jornada}h | ` +
                    (
                        a.diferencia > 0
                            ? `Horas extra: +${diferencia}h`
                            : `Horas faltantes: ${diferencia}h`
                    )

            }else if(a.kind === "cobertura"){

                texto =
                    `${a.titulo} | ${a.mensaje} | ${a.detalle}`

            }else{

                texto =
                    `${a.trabajador} | ${a.fecha1} → ${a.fecha2} | ` +
                    `Descanso: ${a.descanso.toFixed(1)}h`

            }

            const colorAlerta =
                a.tipo === 'danger'
                    ? '#dc2626'
                    : a.tipo === 'info'
                        ? '#2563eb'
                        : '#d97706'

            const fondoAlerta =
                a.tipo === 'danger'
                    ? '#fef2f2'
                    : a.tipo === 'info'
                        ? '#eff6ff'
                        : '#fffbeb'

            const tipoIcono =
                a.kind === 'cobertura'
                    ? 'cobertura'
                    : a.kind === 'horas'
                        ? 'reloj'
                        : 'alerta'

            contenido.push({

                unbreakable:true,

                table:{

                    widths:[22, '*'],

                    body:[[

                        {

                            svg:
                                obtenerIconoPDF(
                                    tipoIcono,
                                    colorAlerta
                                ),

                            margin:[0,1,6,0]

                        },

                        {

                            text:texto,

                            color:'#334155',

                            fontSize:8,

                            margin:[0,2,0,2]

                        }

                    ]]

                },

                layout:{
                    hLineWidth:() => 0,
                    vLineWidth:() => 0,
                    fillColor:() => fondoAlerta,
                    paddingLeft:() => 8,
                    paddingRight:() => 8,
                    paddingTop:() => 5,
                    paddingBottom:() => 5
                },

                margin:[0,0,0,4]

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
