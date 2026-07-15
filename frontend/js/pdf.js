// =====================================================
// EXPORTAR PDF
// =====================================================
// Las funciones auxiliares (obtenerNombreMes, obtenerIconoPDF) viven en
// pdf/auxiliares.js y se cargan antes que este archivo via <script>.

function exportarPDF(){

    // Wrap defensivo: cualquier excepcion de runtime (p. ej. una global
    // faltante, un JSON mal formado, un pdfMake que falla) se loguea Y
    // se muestra en pantalla, porque el usuario suele no abrir la consola
    // y el sintoma de "le hice click y no pasa nada" esconde el error
    // real.
    try{

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

    contenido.push(
            construirCabecera({
                cecos,
                mesActual,
                anioActual,
            })
        )

    // =====================================
    // RESUMEN Y LEYENDA
    // =====================================

    contenido.push(
        construirStats({
            trabajadores,
            semanas,
            cecos,
        })
    )

    contenido.push(construirLeyenda())

    // =====================================
    // SEMANAS
    // =====================================

    // El bucle de semanas vive ahora en pdf/tabla.js (construirTabla).
    // Devuelve un array de items que se concatenan al `contenido`.
    contenido.push(...construirTabla({trabajadores, semanas, mesActual}))

    // =====================================
    // ALERTAS
    // =====================================
    // Guard defensivo: si por algun motivo `calcularTodasAlertas` no esta
    // expuesta globalmente (por ejemplo, porque `resumen.js` fallo al
    // cargar o se cargo despues de pdf.js en algun flujo), seguimos sin
    // alertas en vez de reventar toda la generacion del PDF.
    const alertas =
        typeof calcularTodasAlertas === "function"
            ? calcularTodasAlertas(trabajadores)
            : []

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

    }catch(err){

        // Loguear a la consola con stack completo para debugging.
        console.error("[exportarPDF] fallo:", err && err.message, err && err.stack)

        // Y ademas mostrar un alert con el mensaje para que el usuario
        // sepa que algo fallo aunque no abra la consola del navegador.
        // Mantenemos el mensaje corto para que sea legible.
        let msg = "No se pudo generar el PDF."

        if(err && err.message){

            msg += "\n\nDetalle: " + err.message

        }

        try{

            alert(msg)

        }catch(_){ // alert puede no estar disponible en algunos contextos

            // Silenciar si alert no esta disponible.

        }

    }

}
