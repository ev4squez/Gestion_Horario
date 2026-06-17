const meses = [
    "Enero","Febrero","Marzo","Abril",
    "Mayo","Junio","Julio","Agosto",
    "Septiembre","Octubre","Noviembre","Diciembre"
]

const hoy = new Date()

let mesActual = hoy.getMonth()

let anioActual = hoy.getFullYear()


function inicializarSelectores(){

    const mesSelector =
        document.getElementById(
            "mes-selector"
        )

    const anioSelector =
        document.getElementById(
            "anio-selector"
        )

    mesSelector.innerHTML = ""

    anioSelector.innerHTML = ""

    meses.forEach((mes,index)=>{

        mesSelector.innerHTML += `
            <option value="${index}">
                ${mes}
            </option>
        `

    })

    for(let i=2024; i<=2035; i++){

        anioSelector.innerHTML += `
            <option value="${i}">
                ${i}
            </option>
        `

    }

    mesSelector.value = mesActual

    anioSelector.value = anioActual

}


function actualizarVista(){

    mesActual = parseInt(
        document.getElementById(
            "mes-selector"
        ).value
    )

    anioActual = parseInt(
        document.getElementById(
            "anio-selector"
        ).value
    )

    filtrarCargo()

    if(typeof renderizarCobertura === "function"){
        renderizarCobertura()
    }

}


function generarSemanas(
    mes,
    anio
){

    const semanas = []

    // =====================================
    // PRIMER DIA MES
    // =====================================

    const primerDiaMes =
        new Date(
            anio,
            mes,
            1
        )

    // =====================================
    // AJUSTAR A LUNES
    // =====================================

    const inicioCalendario =
        new Date(primerDiaMes)

    let diaSemana =
        inicioCalendario.getDay()

    if(diaSemana === 0){

        diaSemana = 7

    }

    inicioCalendario.setDate(

        inicioCalendario.getDate()

        -

        (diaSemana - 1)

    )

    // =====================================
    // ITERACION
    // =====================================

    let fechaActual =
        new Date(inicioCalendario)

    // =====================================
    // GENERAR SEMANAS
    // =====================================

    while(true){

        const inicioSemana =
            new Date(fechaActual)

        const finSemana =
            new Date(fechaActual)

        finSemana.setDate(
            finSemana.getDate() + 6
        )

        // =====================================
        // VALIDAR SI EXISTE
        // AL MENOS 1 DIA DEL MES
        // =====================================

        let contieneMes = false

        for(let i=0; i<7; i++){

            const fecha =
                new Date(inicioSemana)

            fecha.setDate(
                fecha.getDate() + i
            )

            if(
                fecha.getMonth()
                ===
                mes
            ){

                contieneMes = true

                break

            }

        }

        // =====================================
        // SI NO CONTIENE
        // TERMINAR
        // =====================================

        if(!contieneMes){

            break

        }

        semanas.push({

            inicio:
                new Date(inicioSemana),

            fin:
                new Date(finSemana)

        })

        // =====================================
        // AVANZAR
        // =====================================

        fechaActual.setDate(
            fechaActual.getDate() + 7
        )

    }

    return semanas

}

function formatearFecha(fecha){

    return `
        ${fecha.getDate()}
        ${meses[fecha.getMonth()]}
    `

}


function crearHeaderDia(
    nombre,
    fechaInicioSemana,
    offset
){

    // =====================================
    // FECHA REAL
    // =====================================

    const fecha = new Date(
        fechaInicioSemana
    )

    fecha.setDate(
        fecha.getDate() + offset
    )

    // =====================================
    // VALIDAR MES
    // =====================================

    const esMesActual =
        fecha.getMonth()
        ===
        mesActual

    let claseExtra = ""

    if(!esMesActual){

        claseExtra = `
            bg-slate-100
            opacity-60
        `

    }

    return `

        <th class="
            text-center
            px-3
            py-4
            border-b
            border-slate-100
            ${claseExtra}
        ">

            <div class="
                text-xs
                uppercase
                tracking-wide
                text-slate-500
                mb-1
            ">
                ${nombre}
            </div>

            <div class="
                text-lg
                font-bold
                text-slate-700
            ">
                ${fecha.getDate()}
            </div>

        </th>

    `
}
