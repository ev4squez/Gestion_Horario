// =====================================================
// MODULO: cabecera
// =====================================================
// Construye el item de cabecera (la primera fila visual del documento)
// que se pushea al array `contenido` de pdfmake.
//
// Devuelve UN item (no un array) listo para hacer `contenido.push(...)`.
// La cabecera es la unica seccion que usa `table` con un body de 1x1 para
// envolver las columns (asi tiene margen 20px alrededor de todo el bloque).
//
// Extraido de pdf.js como parte del refactor modular.
//
// Parametros:
//   - cecos          : string (ej: "Slots" o "Slots, Mesa")
//   - mesActual      : numero (0-11) del mes a renderizar
//   - anioActual     : numero del anio
//
// Dependencias globales (asumidas disponibles al momento de llamar):
//   - obtenerIconoPDF(tipo, color)  -> viene de pdf/auxiliares.js
//   - obtenerNombreMes(mes)         -> viene de pdf/auxiliares.js
//   - window.cargosSeleccionados    -> array del index.html

function construirCabecera(opts){

    const cecos = opts.cecos
    const mesActual = opts.mesActual
    const anioActual = opts.anioActual

    return {

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

                            // Label corporativo con bullet unicode dorado.
                            // Antes era un canvas ellipse que producia
                            // "unsupported number: NaN" en algunas versiones
                            // de pdfmake, asi que ahora es un caracter
                            // bullet unicode inline.
                            {

                                text:
                                    '\u2022 OVALLE CASINO RESORT \u00b7 GESTI\u00d3N DE TURNOS',

                                fontSize:9,

                                bold:true,

                                color:'#B08D3E',

                                characterSpacing:1,

                                margin:[0,0,0,0],

                            },

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
                                    )} ${anioActual}`,

                                fontSize:18,

                                bold:false,

                                color:'#E4D6AE',

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

                fillColor:'#0B1626',

                margin:[20,20,20,20]

            }]]

        },

        layout:'noBorders',

        margin:[-20,-20,-20,30]

    }

}