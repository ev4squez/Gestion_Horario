// =====================================================
// CARGA MASIVA DE COLABORADORES (CSV)
// =====================================================
// Flujo: el usuario sube un CSV → se parsea y clasifica cada fila por RUT
// (la clave única) → se muestra una previsualización (nuevo / ya existe /
// inválido) → al confirmar se envían solo los nuevos al backend.

// Columnas esperadas en el CSV (orden de la plantilla de ejemplo).
const COLUMNAS_CSV = [
    "rut",
    "nombre",
    "jornada",
    "area",
    "ceco",
    "responsable",
    "cargo",
    "es_responsable",
]

// Filas ya clasificadas de la última carga. Cada una: { data, estado }.
let filasImportadas = []


// =====================================================
// DESCARGAR PLANTILLA DE EJEMPLO
// =====================================================

function descargarPlantillaCSV(){

    const encabezado = COLUMNAS_CSV.join(",")

    // Dos filas de ejemplo para mostrar el formato esperado.
    const ejemplos = [
        "12.345.678-9,Juan Pérez,42,Operaciones,Seguridad,María González,Cajero,no",
        "9.876.543-2,Ana Soto,30,Administración,Caja,Pedro Díaz,Supervisor,si",
    ]

    const contenido =
        [encabezado, ...ejemplos].join("\n")

    // BOM (﻿) para que Excel respete los acentos al abrir el CSV.
    const blob =
        new Blob(["﻿" + contenido], { type: "text/csv;charset=utf-8;" })

    const url = URL.createObjectURL(blob)

    const enlace = document.createElement("a")
    enlace.href = url
    enlace.download = "plantilla_colaboradores.csv"
    document.body.appendChild(enlace)
    enlace.click()
    document.body.removeChild(enlace)

    URL.revokeObjectURL(url)

}


// =====================================================
// PARSEO DEL CSV
// =====================================================

// Quita acentos y normaliza para comparar nombres de columna.
function normalizarClaveCSV(texto){

    return String(texto || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")

}

// RUT normalizado para comparar (sin puntos ni espacios, en minúscula).
function normalizarRut(rut){

    return String(rut || "")
        .trim()
        .toLowerCase()
        .replace(/[.\s]/g, "")

}

// Parser de CSV que respeta comillas dobles (campos con el separador o saltos
// de línea adentro). Devuelve una matriz de filas (arrays de strings).
function parsearCSV(texto, separador){

    const filas = []

    let campo = ""
    let fila = []
    let enComillas = false

    for(let i = 0; i < texto.length; i++){

        const c = texto[i]

        if(enComillas){

            if(c === '"'){
                if(texto[i + 1] === '"'){ campo += '"'; i++ }
                else { enComillas = false }
            } else {
                campo += c
            }

        } else {

            if(c === '"'){
                enComillas = true
            } else if(c === separador){
                fila.push(campo); campo = ""
            } else if(c === '\n'){
                fila.push(campo); filas.push(fila); fila = []; campo = ""
            } else if(c === '\r'){
                // Ignorar (CRLF de Windows).
            } else {
                campo += c
            }

        }

    }

    // Último campo / fila pendiente.
    if(campo !== "" || fila.length > 0){
        fila.push(campo)
        filas.push(fila)
    }

    return filas

}

// Detecta el separador (coma o punto y coma) según la línea de encabezado.
function detectarSeparador(textoPlano){

    const primeraLinea =
        textoPlano.split(/\r?\n/)[0] || ""

    const comas = (primeraLinea.match(/,/g) || []).length
    const puntoYComa = (primeraLinea.match(/;/g) || []).length

    return puntoYComa > comas ? ";" : ","

}

// Interpreta valores tipo "sí / no" para es_responsable.
function interpretarBooleano(valor){

    const texto = normalizarClaveCSV(valor)

    return ["si", "true", "1", "x", "verdadero", "v"].includes(texto)

}


// =====================================================
// LECTURA DEL ARCHIVO + CLASIFICACIÓN
// =====================================================

function manejarArchivoCSV(input){

    const archivo = input.files && input.files[0]

    if(!archivo){ return }

    const lector = new FileReader()

    lector.onload = (evento) => {

        try{
            procesarTextoCSV(String(evento.target.result || ""))
        }catch(e){
            alert("No se pudo leer el archivo CSV. Revisa el formato.")
            console.error(e)
        }

        // Permite volver a elegir el mismo archivo si hace falta.
        input.value = ""

    }

    lector.readAsText(archivo, "UTF-8")

}

function procesarTextoCSV(textoPlano){

    const separador = detectarSeparador(textoPlano)

    const filas = parsearCSV(textoPlano, separador)
        .filter(f => f.some(celda => String(celda).trim() !== ""))

    if(filas.length < 2){
        alert("El archivo no tiene filas de datos (solo el encabezado o está vacío).")
        return
    }

    // Mapear encabezado → índice de columna por nombre normalizado.
    const encabezado = filas[0].map(normalizarClaveCSV)

    const indice = {}
    COLUMNAS_CSV.forEach(col => {
        indice[col] = encabezado.indexOf(col)
    })

    if(indice.rut === -1 || indice.nombre === -1){
        alert(
            "El CSV debe incluir al menos las columnas 'rut' y 'nombre'. " +
            "Descarga la plantilla de ejemplo para ver el formato."
        )
        return
    }

    // RUT ya existentes en el sistema (normalizados).
    const rutsExistentes = new Set(
        (trabajadoresGlobal || []).map(t => normalizarRut(t.rut))
    )

    const rutsEnArchivo = new Set()

    const obtener = (fila, col) =>
        indice[col] >= 0 ? String(fila[indice[col]] || "").trim() : ""

    filasImportadas = filas.slice(1).map(fila => {

        const jornadaTexto = obtener(fila, "jornada")
        const jornadaNum = parseInt(jornadaTexto, 10)

        const data = {
            rut: obtener(fila, "rut"),
            nombre: obtener(fila, "nombre"),
            jornada: Number.isFinite(jornadaNum) ? jornadaNum : null,
            area: obtener(fila, "area"),
            ceco: obtener(fila, "ceco"),
            responsable: obtener(fila, "responsable"),
            cargo: obtener(fila, "cargo"),
            es_responsable: interpretarBooleano(obtener(fila, "es_responsable")),
        }

        const rutNorm = normalizarRut(data.rut)

        let estado
        if(!data.rut || !data.nombre){
            estado = "invalido"
        } else if(rutsExistentes.has(rutNorm) || rutsEnArchivo.has(rutNorm)){
            estado = "existe"
        } else {
            estado = "nuevo"
            rutsEnArchivo.add(rutNorm)
        }

        return { data, estado }

    })

    renderizarPreviewImportar()
    abrirModalImportar()

}


// =====================================================
// PREVISUALIZACIÓN
// =====================================================

const META_ESTADO = {
    nuevo:    { texto: "Nuevo",     clase: "bg-emerald-100 text-emerald-700" },
    existe:   { texto: "Ya existe", clase: "bg-amber-100 text-amber-700" },
    invalido: { texto: "Inválido",  clase: "bg-red-100 text-red-700" },
}

function renderizarPreviewImportar(){

    const cuentas = { nuevo: 0, existe: 0, invalido: 0 }
    filasImportadas.forEach(f => { cuentas[f.estado]++ })

    // Resumen (chips).
    const resumen = document.getElementById("importar-resumen")
    if(resumen){
        resumen.innerHTML = `
            <span class="px-4 py-2 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">
                ${cuentas.nuevo} nuevos
            </span>
            <span class="px-4 py-2 rounded-full bg-amber-100 text-amber-700 text-sm font-bold">
                ${cuentas.existe} ya existen
            </span>
            <span class="px-4 py-2 rounded-full bg-red-100 text-red-700 text-sm font-bold">
                ${cuentas.invalido} inválidos
            </span>
        `
    }

    // Tabla.
    const tbody = document.getElementById("importar-tabla-body")
    if(tbody){
        tbody.innerHTML = filasImportadas.map(({ data, estado }) => {
            const meta = META_ESTADO[estado]
            return `
                <tr class="hover:bg-slate-50">
                    <td class="p-3">
                        <span class="px-2 py-1 rounded-full text-xs font-bold ${meta.clase}">
                            ${meta.texto}
                        </span>
                    </td>
                    <td class="p-3 font-semibold">${escaparHTML(data.rut)}</td>
                    <td class="p-3">${escaparHTML(data.nombre)}</td>
                    <td class="p-3 text-center">${data.jornada ?? ""}</td>
                    <td class="p-3">${escaparHTML(data.area)}</td>
                    <td class="p-3">${escaparHTML(data.ceco)}</td>
                    <td class="p-3">${escaparHTML(data.responsable)}</td>
                    <td class="p-3">${escaparHTML(data.cargo)}</td>
                </tr>
            `
        }).join("")
    }

    // Botón confirmar: habilitado solo si hay filas nuevas.
    const boton = document.getElementById("btn-confirmar-importar")
    if(boton){
        boton.disabled = cuentas.nuevo === 0
        boton.textContent =
            cuentas.nuevo > 0
                ? `Importar ${cuentas.nuevo} nuevos`
                : "Sin colaboradores nuevos"
    }

}


// =====================================================
// MODAL
// =====================================================

function abrirModalImportar(){
    document.getElementById("modal-importar").classList.remove("hidden")
}

function cerrarModalImportar(){
    document.getElementById("modal-importar").classList.add("hidden")
    filasImportadas = []
}


// =====================================================
// CONFIRMAR IMPORTACIÓN
// =====================================================

async function confirmarImportacion(){

    const nuevos =
        filasImportadas
            .filter(f => f.estado === "nuevo")
            .map(f => f.data)

    if(nuevos.length === 0){
        alert("No hay colaboradores nuevos para importar.")
        return
    }

    const boton = document.getElementById("btn-confirmar-importar")
    if(boton){ boton.disabled = true; boton.textContent = "Importando…" }

    const respuesta = await importarTrabajadores(nuevos)

    if(respuesta.status === 401){
        alert("Sesión expirada. Inicia sesión nuevamente.")
        cerrarModalImportar()
        cerrarSesionAdmin()
        accederCRUD()
        return
    }

    if(!respuesta.ok){
        let mensaje = "No se pudo completar la importación."
        try{
            const error = await respuesta.json()
            if(error && error.detail){ mensaje = error.detail }
        }catch(e){}
        alert(mensaje)
        if(boton){ boton.disabled = false }
        renderizarPreviewImportar()
        return
    }

    const resultado = await respuesta.json()

    // Refrescar datos y vistas.
    trabajadoresGlobal = await obtenerTrabajadores()
    cargarFiltrosTrabajadores()
    renderizarTrabajadoresCRUD()
    if(typeof cargarCargos === "function"){ cargarCargos() }

    cerrarModalImportar()

    alert(
        `Importación completada: ${resultado.creados} creados` +
        (resultado.omitidos ? `, ${resultado.omitidos} omitidos.` : ".")
    )

}
