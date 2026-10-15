function construirStats({trabajadores, semanas}){
    return {text:`${trabajadores.length} colaboradores  ·  ${semanas.length} semanas  ·  Horas netas: descuentan colación`, fontSize:8, color:'#526174', margin:[0,0,0,8]}
}
function construirLeyenda(){
    const estados = [['Trabajo','#edf3ff','#2b53a4'],['Libre','#e9f7f1','#236b51'],['Vacaciones','#f1ecfb','#69449a'],['Saliente','#edf1f5','#526174'],['Feriado','#fff1ef','#b34545']]
    return {
        columns: estados.map(([text, fillColor, color]) => ({
            width:85,
            table:{widths:['*'],body:[[{text,fontSize:8,color,fillColor,alignment:'center',margin:[0,3,0,3]}]]},
            layout:'noBorders',margin:[0,0,6,0]
        })),
        margin:[0,0,0,8]
    }
}
