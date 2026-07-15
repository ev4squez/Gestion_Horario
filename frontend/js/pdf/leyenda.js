// =====================================================
// MODULO: leyenda (3 stat cards + 5 legend items)
// =====================================================
// Construye dos items para el array `contenido`:
//   1. construirStats   : las 3 tarjetas Colaboradores / Semanas / CECO
//   2. construirLeyenda : los 5 chips (Libre, Vacaciones, Turno, Horas, Feriado)
//
// Extraido de pdf.js como parte del refactor modular.
//
// Dependencias globales:
//   - obtenerIconoPDF(tipo, color)  -> pdf/auxiliares.js

function construirStats(opts){

    const trabajadores = opts.trabajadores
    const semanas = opts.semanas
    const cecos = opts.cecos

    return {

        columns:[

            {
                width:'33%',
                table:{
                    widths:[24, '*'],
                    body:[[
                        {
                            svg: obtenerIconoPDF('personas', '#2563eb'),
                            margin:[0,2,6,0]
                        },
                        {
                            stack:[
                                {text:'COLABORADORES', fontSize:7, bold:true, color:'#64748b'},
                                {text:String(trabajadores.length), fontSize:14, bold:true, color:'#0f172a'}
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
                            svg: obtenerIconoPDF('calendario', '#7c3aed'),
                            margin:[0,2,6,0]
                        },
                        {
                            stack:[
                                {text:'SEMANAS', fontSize:7, bold:true, color:'#64748b'},
                                {text:String(semanas.length), fontSize:14, bold:true, color:'#0f172a'}
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
                            svg: obtenerIconoPDF('trabajo', '#059669'),
                            margin:[0,2,6,0]
                        },
                        {
                            stack:[
                                {text:'CECO', fontSize:7, bold:true, color:'#64748b'},
                                {text:cecos || 'No definido', fontSize:9, bold:true, color:'#0f172a'}
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

    }

}

function construirLeyenda(){

    // 5 items: cada uno es un canvas (cuadradito de color) + texto.
    // Los 2 items de "Turno asignado" y "Horas semanales" usan el mismo
    // fillColor gris claro #f8fafc. El mockup del casino los queria asi
    // pero pdfmake tiene la limitacion de que un mismo columns no puede
    // tener dos fillColors distintos en swatches consecutivos sin duplicar
    // el bloque. Por eso los manejamos como 5 items separados.
    return {

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
                    color:'#dbeafe'
                }]
            },
            {
                width:'auto',
                text:'Turno asignado',
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

    }

}