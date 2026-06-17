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

function mostrarVistaTrabajadores() {

    marcarMenuActivo("menu-colaboradores")

    document
        .getElementById(
            "vista-planificacion"
        )
        .classList.add(
            "hidden"
        )

    document
        .getElementById(
            "vista-trabajadores"
        )
        .classList.remove(
            "hidden"
        )

    document
        .getElementById(
            "vista-cobertura"
        )
        .classList.add(
            "hidden"
        )

    cargarFiltrosTrabajadores()

    renderizarTrabajadoresCRUD()

}

function mostrarVistaPlanificacion() {

    marcarMenuActivo("menu-planificacion")

    document
        .getElementById(
            "vista-planificacion"
        )
        .classList.remove(
            "hidden"
        )

    document
        .getElementById(
            "vista-trabajadores"
        )
        .classList.add(
            "hidden"
        )

    document
        .getElementById(
            "vista-cobertura"
        )
        .classList.add(
            "hidden"
        )

}

function mostrarVistaCobertura() {

    marcarMenuActivo("menu-cobertura")

    document
        .getElementById(
            "vista-planificacion"
        )
        .classList.add(
            "hidden"
        )

    document
        .getElementById(
            "vista-trabajadores"
        )
        .classList.add(
            "hidden"
        )

    document
        .getElementById(
            "vista-cobertura"
        )
        .classList.remove(
            "hidden"
        )

    if(typeof renderizarCobertura === "function"){
        renderizarCobertura()
    }

}

function aplicarFiltrosTrabajadores() {

    const area =
        document
            .getElementById("filtro-area")
            .value
            .toLowerCase()

    const ceco =
        document
            .getElementById("filtro-ceco")
            .value
            .toLowerCase()

    const filtrados =
        trabajadoresGlobal.filter(t => {

            const areaTrabajador =
                (t.area || "")
                    .toLowerCase()

            const cecoTrabajador =
                (t.ceco || "")
                    .toLowerCase()

            const coincideArea =
                !area ||
                areaTrabajador === area

            const coincideCeco =
                !ceco ||
                cecoTrabajador === ceco

            return (
                coincideArea &&
                coincideCeco
            )

        })

    renderizarTrabajadoresCRUD(
        filtrados
    )

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

    const selectArea =
        document.getElementById(
            "filtro-area"
        )

    const selectCeco =
        document.getElementById(
            "filtro-ceco"
        )

    if (selectArea) {

        selectArea.innerHTML = `
            <option value="">
                Todas las áreas
            </option>
        `

        areas.forEach(area => {

            selectArea.innerHTML += `
                <option value="${escaparHTML(area)}">
                    ${escaparHTML(area)}
                </option>
            `

        })

    }

    if (selectCeco) {

        selectCeco.innerHTML = `
            <option value="">
                Todos los CECO
            </option>
        `

        cecos.forEach(ceco => {

            selectCeco.innerHTML += `
                <option value="${escaparHTML(ceco)}">
                    ${escaparHTML(ceco)}
                </option>
            `

        })

    }

}

function limpiarFiltrosTrabajadores() {

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

                    <span class="
                        px-3
                        py-1
                        rounded-full
                        bg-green-100
                        text-green-700
                        text-xs
                        font-bold
                    ">
                        ACTIVO
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
