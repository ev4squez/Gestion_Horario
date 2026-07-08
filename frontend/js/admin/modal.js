function marcarMenuActivo(idBoton) {

    document
        .querySelectorAll("#sidebar nav .menu-item")
        .forEach(boton => {

            const activo = boton.id === idBoton

            boton.classList.toggle("active", activo)

            boton.classList.toggle("text-white", activo)

            boton.classList.toggle("text-slate-400", !activo)

        })

}

// Oculta todas las vistas principales (planificación, cobertura, trabajadores,
// usuarios, alertas). Cada mostrarVistaX() la usa y luego revela solo la suya.
// Además oculta el panel derecho: solo es visible dentro de la vista
// planificación (los stats / alertas de cobertura no aplican a las otras).
// Helper: muestra una vista. Quita la clase `hidden` y limpia el inline
// `display` que dejó ocultarTodasLasVistas, dejando que las clases
// responsivas (p.ej. `xl:flex`) tomen efecto.
function mostrarVista(id){
    const vista = document.getElementById(id)
    if(vista){
        vista.classList.remove("hidden")
        vista.style.display = ""
    }
}

function ocultarTodasLasVistas() {

    // Usamos `style.display = "none"` inline además de la clase `hidden` para
    // ganar siempre (la clase `hidden` de Tailwind puede tener conflictos de
    // especificidad con las clases responsivas del elemento, p.ej. `xl:flex`
    // en el SaaS view). El inline gana por specificity.
    [
        "vista-planificacion",
        "vista-trabajadores",
        "vista-cobertura",
        "vista-usuarios",
        "vista-alertas",
        "vista-saas-admin",
    ].forEach(id => {
        const vista = document.getElementById(id)
        if(vista){
            vista.classList.add("hidden")
            vista.style.display = "none"
        }
    })

    // Ocultar el panel derecho. Usamos `style.display = "none"` inline porque
    // el panel tiene clases `grid ... xl:flex` que ganan sobre `hidden` por
    // orden de declaración en el CSS compilado de Tailwind; sin el inline,
    // el panel quedaba visible y desbordaba a la siguiente fila del grid.
    const rightPanel = document.getElementById("right-panel")
    const mainContent = document.getElementById("main-content")
    if(rightPanel){
        rightPanel.style.display = "none"
    }
    if(mainContent){
        mainContent.classList.remove("xl:col-span-9")
        mainContent.classList.add("xl:col-span-12")
    }

}

// Muestra el panel derecho (stats, alertas, carga mensual) y ajusta el ancho
// del contenido principal para convivir en el grid 12-cols. También
// resetea el flag del toggle para que el botón funcione correctamente aunque
// el usuario haya entrado/salido de la vista en distintas sesiones.
// Usamos `style.display = ""` para limpiar el inline y dejar que el CSS de
// clase (`xl:flex`, `grid`) determine cómo se ve.
function mostrarPanelDerecho(){

    const rightPanel = document.getElementById("right-panel")
    const mainContent = document.getElementById("main-content")

    if(rightPanel){
        // El panel tiene class="hidden ..." además del style inline. Hay
        // que quitar la clase `hidden` y limpiar el style para que el CSS
        // responsive de Tailwind (xl:flex) defina la visualización.
        rightPanel.classList.remove("hidden")
        rightPanel.style.display = ""
    }
    if(mainContent){
        mainContent.classList.remove("xl:col-span-12")
        mainContent.classList.add("xl:col-span-9")
    }

    if(typeof rightPanelCollapsed !== "undefined"){
        rightPanelCollapsed = false
    }

}

window.busquedaTrabajadores = window.busquedaTrabajadores || ""

function mostrarVistaTrabajadores() {

    marcarMenuActivo("menu-colaboradores")

    ocultarTodasLasVistas()

    mostrarVista("vista-trabajadores")

    cargarFiltrosTrabajadores()

    aplicarFiltrosTrabajadores()

}

function mostrarVistaPlanificacion() {

    // La planificación ahora exige sesión: el backend rechaza GET/POST sin
    // token, así que el cliente también bloquea el render hasta loguearse.
    if(!(adminAutorizado && obtenerToken())){
        iniciarSesion()
        return
    }

    marcarMenuActivo("menu-planificacion")

    ocultarTodasLasVistas()

    mostrarVista("vista-planificacion")

    // El panel derecho (stats + alertas + carga mensual) solo se muestra
    // dentro de la vista planificación.
    mostrarPanelDerecho()

}

function mostrarVistaCobertura() {

    // Cobertura solo está disponible con sesión iniciada.
    if(!(adminAutorizado && obtenerToken())){
        iniciarSesion()
        return
    }

    marcarMenuActivo("menu-cobertura")

    ocultarTodasLasVistas()

    mostrarVista("vista-cobertura")

    if(typeof renderizarCobertura === "function"){
        renderizarCobertura()
    }

}

function mostrarVistaAlertas(){

    // Alertas solo está disponible con sesión iniciada.
    if(!(adminAutorizado && obtenerToken())){
        iniciarSesion()
        return
    }

    marcarMenuActivo("menu-alertas")

    ocultarTodasLasVistas()

    mostrarVista("vista-alertas")

    if(typeof renderizarAlertasVista === "function"){
        renderizarAlertasVista()
    }

}

function aplicarFiltrosTrabajadores() {

    const filtrados =
        filtrarTrabajadoresCRUD(
            trabajadoresGlobal
        )

    renderizarTrabajadoresCRUD(
        filtrados
    )

}

function filtrarTrabajadoresCRUD(lista){

    const texto =
        normalizarTexto(
            document.getElementById("busqueda-trabajadores")?.value
        )

    const estado =
        normalizarTexto(
            document.getElementById("filtro-estado")?.value
        )

    const cargo =
        normalizarTexto(
            document.getElementById("filtro-cargo")?.value
        )

    const responsable =
        normalizarTexto(
            document.getElementById("filtro-responsable")?.value
        )

    const area =
        normalizarTexto(
            document.getElementById("filtro-area")?.value
        )

    const ceco =
        normalizarTexto(
            document.getElementById("filtro-ceco")?.value
        )

    return (lista || []).filter(t => {

        if(estado === "activo" && t.activo === false){ return false }
        if(estado === "inactivo" && t.activo !== false){ return false }

        if(cargo && normalizarTexto(t.cargo) !== cargo){ return false }
        if(responsable && normalizarTexto(t.responsable) !== responsable){ return false }
        if(area && normalizarTexto(t.area) !== area){ return false }
        if(ceco && normalizarTexto(t.ceco) !== ceco){ return false }

        if(!texto){ return true }

        const searchable = [
            t.nombre,
            t.responsable,
            t.area,
            t.ceco,
            t.cargo,
            t.rut,
            t.activo === false ? "inactivo" : "activo"
        ].map(normalizarTexto).join(" | ")

        return searchable.includes(texto)

    })

}

function cargarFiltrosTrabajadores() {

    const areas = [
        ...new Set(
            trabajadoresGlobal.map(
                t => t.area
            )
        )
    ]

    const cecos = [
        ...new Set(
            trabajadoresGlobal.map(
                t => t.ceco
            )
        )
    ]

    const cargos = [
        ...new Set(
            trabajadoresGlobal.map(
                t => t.cargo
            )
        )
    ]

    const responsables = [
        ...new Set(
            trabajadoresGlobal.flatMap(t => [
                t.responsable,
                t.nombre
            ])
        )
    ]

    const selectEstado =
        document.getElementById("filtro-estado")

    const selectCargo =
        document.getElementById("filtro-cargo")

    const selectResponsable =
        document.getElementById("filtro-responsable")

    const selectArea =
        document.getElementById(
            "filtro-area"
        )

    const selectCeco =
        document.getElementById(
            "filtro-ceco"
        )

    if (selectEstado) {

        const actual = selectEstado.value

        selectEstado.innerHTML = `
            <option value="">
                Todos los estados
            </option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
        `

        selectEstado.value = actual

    }

    if (selectCargo) {

        const actual = selectCargo.value

        selectCargo.innerHTML = `
            <option value="">
                Todos los cargos
            </option>
        `

        cargos
            .filter(v => v && v.trim() !== "")
            .sort()
            .forEach(cargo => {
                selectCargo.innerHTML += `
                    <option value="${escaparHTML(cargo)}">
                        ${escaparHTML(cargo)}
                    </option>
                `
            })

        selectCargo.value = actual

    }

    if (selectResponsable) {

        const actual = selectResponsable.value

        selectResponsable.innerHTML = `
            <option value="">
                Todos los responsables
            </option>
        `

        responsables
            .filter(v => v && v.trim() !== "")
            .sort()
            .forEach(responsable => {
                selectResponsable.innerHTML += `
                    <option value="${escaparHTML(responsable)}">
                        ${escaparHTML(responsable)}
                    </option>
                `
            })

        selectResponsable.value = actual

    }

    if (selectArea) {

        const actual = selectArea.value

        selectArea.innerHTML = `
            <option value="">
                Todas las áreas
            </option>
        `

        areas
            .filter(v => v && v.trim() !== "")
            .sort()
            .forEach(area => {

                selectArea.innerHTML += `
                    <option value="${escaparHTML(area)}">
                        ${escaparHTML(area)}
                    </option>
                `

            })

        selectArea.value = actual

    }

    if (selectCeco) {

        const actual = selectCeco.value

        selectCeco.innerHTML = `
            <option value="">
                Todos los CECO
            </option>
        `

        cecos
            .filter(v => v && v.trim() !== "")
            .sort()
            .forEach(ceco => {

                selectCeco.innerHTML += `
                    <option value="${escaparHTML(ceco)}">
                        ${escaparHTML(ceco)}
                    </option>
                `

            })

        selectCeco.value = actual

    }

}

function limpiarFiltrosTrabajadores() {

    const buscador =
        document.getElementById("busqueda-trabajadores")

    if(buscador){ buscador.value = "" }

    const selectEstado =
        document.getElementById("filtro-estado")

    if(selectEstado){ selectEstado.value = "" }

    const selectCargo =
        document.getElementById("filtro-cargo")

    if(selectCargo){ selectCargo.value = "" }

    const selectResponsable =
        document.getElementById("filtro-responsable")

    if(selectResponsable){ selectResponsable.value = "" }

    document.getElementById(
        "filtro-area"
    ).value = ""

    document.getElementById(
        "filtro-ceco"
    ).value = ""

    aplicarFiltrosTrabajadores()

}

function renderizarTrabajadoresCRUD(
    lista = trabajadoresGlobal
) {

    const tbody =
        document.getElementById(
            "tabla-trabajadores-body"
        )

    if (!tbody) {
        console.error(
            "No existe tabla-trabajadores-body"
        )
        return
    }

    if(lista.length === 0){
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-5 text-center text-slate-400">
                    Sin coincidencias
                </td>
            </tr>
        `
        return
    }

    let html = ""

    lista.forEach(t => {

        html += `
            <tr class="hover:bg-slate-50 transition">

                <td class="p-4 font-semibold">
                    ${escaparHTML(t.nombre)}
                </td>

                <td class="p-4">
                    ${escaparHTML(t.responsable)}
                </td>

                <td class="p-4">
                    ${escaparHTML(t.area)}
                </td>

                <td class="p-4">
                    ${escaparHTML(t.ceco)}
                </td>

                <td class="p-4 text-center">

                    <span class="px-3 py-1 rounded-full text-xs font-bold ${
                        t.activo === false
                            ? "bg-slate-100 text-slate-500"
                            : "bg-green-100 text-green-700"
                    }">
                        ${t.activo === false ? "INACTIVO" : "ACTIVO"}
                    </span>

                </td>

                <td class="p-4 text-center">

                    <div class="
                        flex
                        items-center
                        justify-center
                        gap-2
                    ">

                        <button onclick="editarTrabajador(${t.id})" class="
                            px-3
                            py-2
                            rounded-xl
                            bg-blue-100
                            text-blue-700
                            hover:bg-blue-200
                        ">
                            Editar
                        </button>

                        <button onclick="eliminarTrabajadorCRUD(${t.id})" class="
                            px-3
                            py-2
                            rounded-xl
                            bg-red-100
                            text-red-700
                            hover:bg-red-200
                        ">
                            Eliminar
                        </button>

                    </div>

                </td>

            </tr>
        `

    })

    tbody.innerHTML = html

}

function volverPlanificacion() {

    cerrarModalTrabajador()

    mostrarVistaPlanificacion()

}


function cerrarModalTrabajador() {

    const modal =
        document.getElementById(
            "modal-trabajador"
        )

    if (modal) {

        modal.classList.add(
            "hidden"
        )

    }

}

// nuevoTrabajador() y guardarTrabajador() están implementados en
// admin/trabajadores.js (operan contra la API).

function mostrarVistaSaasAdmin(){

    // Guard defensivo: si el usuario no es super-admin, redirigir a
    // planificación en vez de mostrar la vista. Cubre el caso de un
    // localStorage con valor stale (ya no debería pasar con sessionStorage,
    // pero por las dudas).
    if(typeof obtenerEsSuperAdmin !== "function" || !obtenerEsSuperAdmin()){
        if(typeof obtenerToken !== "function" || !obtenerToken()){
            iniciarSesion()
        }else{
            // Usuario logueado pero no es super-admin: redirect a planificación
            // y mostrar el mensaje una sola vez.
            mostrarVistaPlanificacion()
            alert("Esta sección requiere permisos de super-admin. Si tu cuenta ES de super-admin, abre la consola del navegador (F12) y ejecuta: sessionStorage.getItem('authEsSuperAdmin') — debería devolver '1'. Si devuelve null, vuelve a iniciar sesión como super-admin.")
        }
        return
    }

    marcarMenuActivo("menu-saas-admin")

    // Defensa: cerrar cualquier modal que haya quedado abierto de una
    // sesión anterior (modal de login, etc.) para que no tape el overlay
    // de la vista SaaS Admin.
    if(typeof cerrarModalAdmin === "function"){ cerrarModalAdmin() }
    if(typeof cerrarModalCredenciales === "function"){ cerrarModalCredenciales() }

    ocultarTodasLasVistas()

    mostrarVista("vista-saas-admin")

    // Activar modo dedicado: oculta sidebar, header principal y panel
    // derecho. El CSS en <style> muestra el header SAAS dedicado.
    document.body.classList.add("modo-saas")

    // DEBUG: ayuda a diagnosticar si la vista no aparece.
    console.log("[SAAS Admin] modo-saas aplicado. Si no ves la vista, ejecuta en consola: document.body.classList.contains('modo-saas')")

    // Pintar el username del super-admin en el header dedicado.
    const ctx = (typeof window.__ctxSesion === "function") ? window.__ctxSesion() : null
    const userSpan = document.getElementById("saas-actor-username")
    if(userSpan && ctx && ctx.username){
        userSpan.textContent = ctx.username
    }

    if(typeof renderizarSaasAdmin === "function"){
        renderizarSaasAdmin()
    }

}

function salirModoSaas(){

    // Sale del modo fullscreen: oculta la vista SAAS (que ahora es
    // overlay absoluto) y vuelve a la vista de planificación.
    document.body.classList.remove("modo-saas")

    // Como la vista SAAS Admin es `position:fixed` en modo-saas,
    // tenemos que ocultar su display inline cuando salimos del modo
    // (de lo contrario queda "pegada" en pantalla porque las clases
    // responsivas no la ocultan). La vista-volverPlanificacion()
    // se encarga luego de mostrarla correctamente.
    const vista = document.getElementById("vista-saas-admin")
    if(vista){
        vista.classList.add("hidden")
        vista.style.display = "none"
    }

    if(typeof mostrarVistaPlanificacion === "function"){
        mostrarVistaPlanificacion()
    }

}
