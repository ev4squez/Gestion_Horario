// =====================================================
// GESTIÓN DE TURNOS FRECUENTES POR CECO
// =====================================================

function cecosDisponiblesTurnosFrecuentes(){

    return [...new Set(
        (trabajadoresGlobal || [])
            .map(trabajador => String(trabajador.ceco || "").trim())
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b))

}

function poblarCecosTurnosFrecuentes(){

    const select = document.getElementById("turno-frecuente-ceco")
    if(!select){ return }

    const previo = select.value
    const cecos = cecosDisponiblesTurnosFrecuentes()

    select.innerHTML = cecos.length > 0
        ? cecos.map(ceco =>
            `<option value="${escaparHTML(ceco)}">${escaparHTML(ceco)}</option>`
        ).join("")
        : `<option value="">Sin CECO disponibles</option>`

    if(previo && cecos.includes(previo)){
        select.value = previo
    }

}

function renderizarTurnosFrecuentes(){

    const tbody = document.getElementById("tabla-turnos-frecuentes-body")
    if(!tbody){ return }

    const turnos = [...(turnosFrecuentesGlobal || [])].sort((a, b) =>
        a.ceco.localeCompare(b.ceco) || a.turno.localeCompare(b.turno)
    )

    if(turnos.length === 0){
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="p-6 text-center text-slate-400">
                    Aún no hay turnos frecuentes configurados.
                </td>
            </tr>
        `
        return
    }

    // Estado de colapso persistido entre renders, igual que
    // `reglasColapsadas` en js/cobertura.js. Mantiene predecible la UX
    // cuando el admin re-agrega turnos: el grupo sigue en su estado
    // anterior sin "saltar" abierto cada vez que se refresca la tabla.
    if(
        !window.__turnosFrecuentesColapsados
        || !(window.__turnosFrecuentesColapsados instanceof Set)
    ){
        window.__turnosFrecuentesColapsados = new Set()
    }
    const colapsados = window.__turnosFrecuentesColapsados

    // Agrupa por CECO. La API devuelve lista plana; la vista la pliega
    // en grupos colapsables para que la tabla no sea un muro plano cuando
    // hay muchos CECOs o varios turnos por CECO.
    const grupos = new Map()
    turnos.forEach(turno => {
        const clave = String(turno.ceco || "(sin CECO)").toLowerCase()
        if(!grupos.has(clave)){
            grupos.set(clave, {
                clave,
                etiqueta: turno.ceco,
                turnos: []
            })
        }
        grupos.get(clave).turnos.push(turno)
    })

    const gruposOrdenados = [...grupos.values()].sort((a, b) =>
        a.etiqueta.localeCompare(b.etiqueta)
    )

    let html = ""

    gruposOrdenados.forEach(grupo => {
        const total = grupo.turnos.length
        const colapsado = colapsados.has(grupo.clave)

        html += `
            <tr class="bg-slate-50/80 border-y border-slate-200">
                <td colspan="3" class="p-0">
                    <button type="button"
                        data-grupo-ceco-toggle="${escaparHTML(grupo.clave)}"
                        aria-expanded="${colapsado ? "false" : "true"}"
                        class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-100 transition">
                        <span class="flex items-center gap-2 min-w-0">
                            <span class="material-symbols-outlined text-slate-500 text-lg transition-transform" data-grupo-ceco-caret>${
                                colapsado ? "chevron_right" : "expand_more"
                            }</span>
                            <span class="font-black text-slate-800 truncate">${escaparHTML(grupo.etiqueta)}</span>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-200 text-slate-700">${total} turno${total === 1 ? "" : "s"}</span>
                        </span>
                        <span class="text-[11px] text-slate-500">Click para ${colapsado ? "expandir" : "colapsar"}</span>
                    </button>
                </td>
            </tr>
        `

        if(colapsado){ return }

        grupo.turnos.forEach(turno => {
            html += `
                <tr class="hover:bg-slate-50" data-grupo-ceco-fila="${escaparHTML(grupo.clave)}">
                    <td class="p-4 text-slate-400 text-xs uppercase tracking-wide">
                        <span class="material-symbols-outlined text-slate-300 align-middle" style="font-size: 16px">subdirectory_arrow_right</span>
                        Turno frecuente
                    </td>
                    <td class="p-4 text-center font-mono font-semibold text-slate-700">
                        ${escaparHTML(turno.turno)}
                    </td>
                    <td class="p-4 text-center">
                        <button type="button" onclick="eliminarTurnoFrecuenteCRUD(${turno.id})"
                            class="px-3 py-2 rounded-xl bg-red-100 text-red-700 hover:bg-red-200 font-semibold transition">
                            Eliminar
                        </button>
                    </td>
                </tr>
            `
        })
    })

    tbody.innerHTML = html

    // Listener delegado al tbody: evita N handlers y sobrevive a re-renders.
    // Si el dataset ya marca el wire, no reinstalamos.
    if(!tbody.dataset.gruposCecoWired){
        tbody.dataset.gruposCecoWired = "1"
        tbody.addEventListener("click", function(e){
            const boton = e.target.closest("[data-grupo-ceco-toggle]")
            if(!boton){ return }
            const clave = boton.dataset.grupoCecoToggle
            if(colapsados.has(clave)){
                colapsados.delete(clave)
            }else{
                colapsados.add(clave)
            }
            // Re-render inmediato del grupo: barato y mantiene el resto del
            // DOM (foco, scroll) intacto.
            renderizarTurnosFrecuentes()
        })
    }

}

async function mostrarVistaTurnosFrecuentes(){

    if(redirigirSuperAdmin()) return

    if(!(adminAutorizado && obtenerToken())){
        iniciarSesion()
        return
    }

    marcarMenuActivo("menu-turnos-frecuentes")
    ocultarTodasLasVistas()
    mostrarVista("vista-turnos-frecuentes")

    const resultado = await obtenerTurnosFrecuentes()

    if(resultado === null){
        alert("Sesión expirada. Inicia sesión nuevamente.")
        cerrarSesionAdmin()
        return
    }

    turnosFrecuentesGlobal = resultado
    poblarCecosTurnosFrecuentes()
    renderizarTurnosFrecuentes()

}

async function guardarTurnoFrecuente(){

    const ceco = document.getElementById("turno-frecuente-ceco")?.value || ""
    const inicio = document.getElementById("turno-frecuente-inicio")?.value || ""
    const fin = document.getElementById("turno-frecuente-fin")?.value || ""

    if(!ceco){
        alert("Selecciona un CECO.")
        return
    }

    if(!inicio || !fin){
        alert("Indica la hora de inicio y de término.")
        return
    }

    const respuesta = await crearTurnoFrecuente({
        ceco,
        turno: `${inicio} - ${fin}`
    })

    if(respuesta.status === 401){
        alert("Sesión expirada. Inicia sesión nuevamente.")
        cerrarSesionAdmin()
        return
    }

    if(!respuesta.ok){
        alert(
            await leerMensajeRespuestaError(
                respuesta,
                "No se pudo agregar el turno frecuente"
            )
        )
        return
    }

    turnosFrecuentesGlobal = await obtenerTurnosFrecuentes()
    renderizarTurnosFrecuentes()

}

async function eliminarTurnoFrecuenteCRUD(id){

    const item = (turnosFrecuentesGlobal || []).find(turno => turno.id === id)
    if(!item){ return }

    if(!confirm(`¿Eliminar el turno ${item.turno} del CECO ${item.ceco}?`)){
        return
    }

    const respuesta = await eliminarTurnoFrecuente(id)

    if(respuesta.status === 401){
        alert("Sesión expirada. Inicia sesión nuevamente.")
        cerrarSesionAdmin()
        return
    }

    if(!respuesta.ok){
        alert(
            await leerMensajeRespuestaError(
                respuesta,
                "No se pudo eliminar el turno frecuente"
            )
        )
        return
    }

    turnosFrecuentesGlobal = await obtenerTurnosFrecuentes()
    renderizarTurnosFrecuentes()

}
