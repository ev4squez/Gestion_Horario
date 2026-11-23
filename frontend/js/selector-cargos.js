// Preferencia local por empresa y usuario; el borrador no cambia el filtro.
function clavePreferenciaCargos(){
    const empresa = obtenerEmpresa()
    return `planificacion:cargos:${empresa?.id ?? empresa?.slug ?? 'global'}:${obtenerNombreUsuario()}`
}

function guardarPreferenciaCargos(){
    try{localStorage.setItem(clavePreferenciaCargos(),JSON.stringify(window.cargosSeleccionados || []))}catch(e){}
}

function abrirSelectorCargosPlanificacion(obligatorio = false, destino = 'planificacion'){
    if(document.getElementById('selector-cargos-planificacion')) return
    const alertas = destino === 'alertas'
    const activos = trabajadoresGlobal.filter(t=>t.activo !== false)
    const conteos = new Map()
    activos.forEach(t=>{if(String(t.cargo || '').trim()) conteos.set(t.cargo,(conteos.get(t.cargo)||0)+1)})
    const cargos = [...conteos.keys()].sort((a,b)=>a.localeCompare(b,'es'))
    let anterior = window.cargosSeleccionados || []
    if(!alertas) try{
        const guardado=JSON.parse(localStorage.getItem(clavePreferenciaCargos()))
        if(Array.isArray(guardado) && guardado.every(c=>typeof c==='string')) anterior=guardado
    }catch(e){}
    const vigentes = anterior.filter(c=>conteos.has(c))
    const seleccion = new Set(alertas && vigentes.length !== 1 ? [] : vigentes)

    const descartados = anterior.filter(c=>!conteos.has(c)).length
    const origen = document.activeElement
    const dialog = document.createElement('dialog')
    dialog.id = 'selector-cargos-planificacion'
    dialog.className = 'cargo-picker'
    dialog.setAttribute('aria-labelledby','cargo-picker-title')
    dialog.innerHTML = `<form class="cargo-picker-shell">
        <header><div><p class="cargo-picker-eyebrow">${alertas ? 'Alertas del equipo' : 'Planificación del equipo'}</p><h2 id="cargo-picker-title">${alertas ? '¿Qué cargo quieres consultar?' : '¿A qué cargos vas a asignar turnos?'}</h2><p>${alertas ? 'Selecciona un único cargo para consultar sus alertas.' : 'Debes seleccionar uno o varios cargos antes de continuar.'}</p></div>
            <button type="button" class="cargo-picker-close" aria-label="Cerrar selector">×</button></header>
        <div class="cargo-picker-content">
            <label class="cargo-picker-search"><span class="sr-only">Buscar cargo</span><input type="search" placeholder="Buscar cargo…" autofocus></label>
            ${alertas ? '' : `<label class="cargo-picker-all"><input type="checkbox" data-todos ${!cargos.length ? 'disabled' : ''}><span><strong>Todos los cargos</strong><small>Seleccionar todos los cargos disponibles</small></span><span class="cargo-picker-count">${[...conteos.values()].reduce((n,c)=>n+c,0)} activos</span></label>`}
            <div class="cargo-picker-list">${cargos.map((cargo,i)=>`<label class="cargo-picker-option" data-indice="${i}"><input type="${alertas ? 'radio' : 'checkbox'}" name="cargo-picker-cargo" data-indice="${i}"><span>${escaparHTML(cargo)}</span><span class="cargo-picker-count">${conteos.get(cargo)} activo${conteos.get(cargo)===1 ? '' : 's'}</span></label>`).join('')}</div>
            <p class="cargo-picker-empty" hidden>No hay cargos que coincidan con la búsqueda.</p>
            ${!cargos.length ? `<p class="cargo-picker-note">No hay cargos con personal activo. Asigna cargos a los colaboradores antes de ${alertas ? 'consultar sus alertas' : 'planificar sus turnos'}.</p>` : ''}
            ${descartados ? '<p class="cargo-picker-note">Algunos cargos de tu última selección ya no tienen personal activo. Revisa la selección.</p>' : ''}
            ${activos.some(t=>!String(t.cargo || '').trim()) ? '<p class="cargo-picker-note">Los colaboradores sin cargo no se incluyen. Asígnales un cargo en Colaboradores para poder seleccionarlos.</p>' : ''}
        </div>
        <footer><span id="cargo-picker-resumen" aria-live="polite"></span><div><button type="button" class="cargo-picker-cancel">Cancelar</button><button type="submit" class="cargo-picker-confirm">${alertas ? 'Ver alertas' : 'Ver planificación'}</button></div></footer>
    </form>`
    const retirar = ()=>{
        if(!dialog.isConnected) return
        dialog.remove()
        if(origen?.isConnected) origen.focus()
    }
    const cerrar = ()=>{
        dialog.close()
        // close puede llegar en otra tarea del navegador. No dejar un
        // diálogo cerrado que bloquee la siguiente apertura por su ID.
        retirar()
    }
    const actualizar = ()=>{
        const todos=cargos.length>0 && seleccion.size===cargos.length
        const controlTodos=dialog.querySelector('[data-todos]')
        if(controlTodos) controlTodos.checked=todos
        dialog.querySelectorAll('.cargo-picker-option').forEach(fila=>{
            const cargo=cargos[Number(fila.dataset.indice)]
            fila.querySelector('input').checked=seleccion.has(cargo)
        })
        const cantidad=[...seleccion].reduce((n,c)=>n+conteos.get(c),0)
        dialog.querySelector('#cargo-picker-resumen').textContent=`${todos && !alertas ? 'Todos los cargos' : `${seleccion.size} cargo${seleccion.size===1 ? '' : 's'}`} · ${cantidad} colaboradores activos`
        dialog.querySelector('[type=submit]').disabled=alertas ? seleccion.size !== 1 : !seleccion.size
    }
    dialog.querySelector('[data-todos]')?.addEventListener('change',e=>{
        seleccion.clear()
        if(e.target.checked) cargos.forEach(c=>seleccion.add(c))
        actualizar()
    })
    dialog.querySelectorAll('.cargo-picker-option input').forEach(input=>input.addEventListener('change',()=>{
        const cargo=cargos[Number(input.dataset.indice)]

        if(alertas) seleccion.clear()
        if(input.checked) seleccion.add(cargo); else seleccion.delete(cargo)
        actualizar()
    }))
    dialog.querySelector('[type=search]').addEventListener('input',e=>{
        const texto=normalizarTexto(e.target.value)
        let visibles=0
        dialog.querySelectorAll('.cargo-picker-option').forEach(fila=>{
            fila.hidden=!normalizarTexto(cargos[Number(fila.dataset.indice)]).includes(texto)
            if(!fila.hidden) visibles++
        })
        dialog.querySelector('.cargo-picker-empty').hidden=visibles>0 || !cargos.length
    })
    dialog.querySelector('form').addEventListener('submit',e=>{
        e.preventDefault()
        if(!seleccion.size || (alertas && seleccion.size !== 1)) return
        window.cargosSeleccionados=[...seleccion]
        // Una búsqueda anterior de personas no debe ocultar el equipo elegido.
        window.busquedaPlanificacion=''
        const busqueda=document.getElementById('busqueda-planificacion')
        if(busqueda) busqueda.value=''
        guardarPreferenciaCargos()
        cargarCargos()
        cerrar()
        if(alertas) mostrarVistaAlertas(false)
        else mostrarVistaPlanificacion(false)
    })
    const cancelar = ()=>{
        cerrar()
        if(obligatorio && typeof mostrarVistaTrabajadores === 'function') mostrarVistaTrabajadores()
    }
    dialog.querySelectorAll('.cargo-picker-close,.cargo-picker-cancel').forEach(b=>b.addEventListener('click',cancelar))
    dialog.addEventListener('cancel',e=>{e.preventDefault();cancelar()})
    dialog.addEventListener('close',retirar,{once:true})
    document.body.appendChild(dialog)
    actualizar()
    dialog.showModal()
}

function abrirSelectorCargosAlertas(){
    abrirSelectorCargosPlanificacion(false, 'alertas')
}
