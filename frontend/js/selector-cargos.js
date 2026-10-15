// Preferencia local por empresa y usuario; el borrador no cambia el filtro.
function clavePreferenciaCargos(){
    const empresa = obtenerEmpresa()
    return `planificacion:cargos:${empresa?.id ?? empresa?.slug ?? 'global'}:${obtenerNombreUsuario()}`
}

function guardarPreferenciaCargos(){
    try{localStorage.setItem(clavePreferenciaCargos(),JSON.stringify(window.cargosSeleccionados || []))}catch(e){}
}

function abrirSelectorCargosPlanificacion(){
    if(document.getElementById('selector-cargos-planificacion')) return
    const activos = trabajadoresGlobal.filter(t=>t.activo !== false)
    const conteos = new Map()
    activos.forEach(t=>{if(String(t.cargo || '').trim()) conteos.set(t.cargo,(conteos.get(t.cargo)||0)+1)})
    const cargos = [...conteos.keys()].sort((a,b)=>a.localeCompare(b,'es'))
    let anterior = window.cargosSeleccionados || []
    try{
        const guardado=JSON.parse(localStorage.getItem(clavePreferenciaCargos()))
        if(Array.isArray(guardado) && guardado.every(c=>typeof c==='string')) anterior=guardado
    }catch(e){}
    const seleccion = new Set(anterior.filter(c=>conteos.has(c)))
    let todos = anterior.length===0
    const descartados = anterior.filter(c=>!conteos.has(c)).length
    const origen = document.activeElement
    const dialog = document.createElement('dialog')
    dialog.id = 'selector-cargos-planificacion'
    dialog.className = 'cargo-picker'
    dialog.setAttribute('aria-labelledby','cargo-picker-title')
    dialog.innerHTML = `<form class="cargo-picker-shell">
        <header><div><p class="cargo-picker-eyebrow">Planificación del equipo</p><h2 id="cargo-picker-title">¿Qué cargo quieres planificar?</h2><p>Selecciona uno o varios cargos para revisar sus turnos.</p></div>
            <button type="button" class="cargo-picker-close" aria-label="Cerrar selector">×</button></header>
        <div class="cargo-picker-content">
            <label class="cargo-picker-search"><span class="sr-only">Buscar cargo</span><input type="search" placeholder="Buscar cargo…" autofocus></label>
            <label class="cargo-picker-all"><input type="checkbox" data-todos><span><strong>Todos los cargos</strong><small>Ver el equipo completo</small></span><span class="cargo-picker-count">${activos.length} activos</span></label>
            <div class="cargo-picker-list">${cargos.map((cargo,i)=>`<label class="cargo-picker-option" data-indice="${i}"><input type="checkbox" data-indice="${i}"><span>${escaparHTML(cargo)}</span><span class="cargo-picker-count">${conteos.get(cargo)} activo${conteos.get(cargo)===1 ? '' : 's'}</span></label>`).join('')}</div>
            <p class="cargo-picker-empty" hidden>No hay cargos que coincidan con la búsqueda.</p>
            ${!cargos.length ? '<p class="cargo-picker-note">No hay cargos con personal activo. Puedes abrir la planificación con todos los cargos.</p>' : ''}
            ${descartados ? '<p class="cargo-picker-note">Algunos cargos de tu última selección ya no tienen personal activo. Revisa la selección.</p>' : ''}
            ${activos.some(t=>!String(t.cargo || '').trim()) ? '<p class="cargo-picker-note">Los colaboradores sin cargo se incluyen al elegir todos los cargos.</p>' : ''}
        </div>
        <footer><span id="cargo-picker-resumen" aria-live="polite"></span><div><button type="button" class="cargo-picker-cancel">Cancelar</button><button type="submit" class="cargo-picker-confirm">Ver planificación</button></div></footer>
    </form>`
    const actualizar = ()=>{
        dialog.querySelector('[data-todos]').checked=todos
        dialog.querySelectorAll('.cargo-picker-option').forEach(fila=>{
            const cargo=cargos[Number(fila.dataset.indice)]
            fila.querySelector('input').checked=!todos && seleccion.has(cargo)
        })
        const cantidad=todos ? activos.length : [...seleccion].reduce((n,c)=>n+conteos.get(c),0)
        dialog.querySelector('#cargo-picker-resumen').textContent=`${todos ? 'Todos los cargos' : `${seleccion.size} cargo${seleccion.size===1 ? '' : 's'}`} · ${cantidad} colaboradores activos`
        dialog.querySelector('[type=submit]').disabled=!todos && !seleccion.size
    }
    dialog.querySelector('[data-todos]').addEventListener('change',e=>{
        todos=e.target.checked;seleccion.clear();actualizar()
    })
    dialog.querySelectorAll('.cargo-picker-option input').forEach(input=>input.addEventListener('change',()=>{
        const cargo=cargos[Number(input.dataset.indice)]
        if(todos){seleccion.clear();todos=false}
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
        if(!todos && !seleccion.size) return
        window.cargosSeleccionados=todos ? [] : [...seleccion]
        // Una búsqueda anterior de personas no debe ocultar el equipo elegido.
        window.busquedaPlanificacion=''
        const busqueda=document.getElementById('busqueda-planificacion')
        if(busqueda) busqueda.value=''
        guardarPreferenciaCargos()
        cargarCargos()
        dialog.close()
        mostrarVistaPlanificacion(false)
    })
    dialog.querySelectorAll('.cargo-picker-close,.cargo-picker-cancel').forEach(b=>b.addEventListener('click',()=>dialog.close()))
    dialog.addEventListener('close',()=>{dialog.remove();if(origen?.isConnected) origen.focus()},{once:true})
    document.body.appendChild(dialog)
    actualizar()
    dialog.showModal()
}
