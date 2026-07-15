// =====================================================
// MODULO: auxiliares
// =====================================================
// Funciones auxiliares puras (sin estado, sin side-effects) que
// re-exportan pdf.js como globales para mantener compatibilidad con
// llamadas existentes (`obtenerNombreMes(...)`, `obtenerIconoPDF(...)`).
//
// Extraido de pdf.js como parte del refactor modular. Mismas firmas,
// mismo comportamiento, sin dependencias externas.

function obtenerNombreMes(mes){

    const meses = [

        'Enero',
        'Febrero',
        'Marzo',
        'Abril',
        'Mayo',
        'Junio',
        'Julio',
        'Agosto',
        'Septiembre',
        'Octubre',
        'Noviembre',
        'Diciembre'

    ]

    return meses[mes]

}

function obtenerIconoPDF(tipo, color = '#ffffff'){

    const iconos = {
        calendario:
            '<path d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm12 7H5V7h14v2zm0 10H-8h14v8z"/>',
        personas:
            '<path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm6 0a3 3 0 1 0 0-6c-.35 0-.69.06-1 .17A5.98 5.98 0 0 1 14 10.83c.31.11.65.17 1 .17zM9 13c-4.42 0-8 2.24-8 5v2h16v-2c0-2.76-3.58-5-8-5zm6.5.1c1.49 1.14 2.5 2.68 2.5 4.4V20h5v-2c0-2.41-3.03-4.43-7.5-4.9z"/>',
        trabajo:
            '<path d="M9 4V2h6v2h5a2 2 0 0 1 2 2v5H2V6a2 2 0 0 1 2-2h5zm2 0h2V4h-2zm11 9v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7h8v2h4v-2h8z"/>',
        reloj:
            '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5.59l3.7 3.7-1.41 1.42L11 13.41V7h2z"/>',
        alerta:
            '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>',
        cobertura:
            '<path d="M12 2 4 5v6c0 5.05 3.41 9.74 8 11 4.59-1.26 8-5.95 8-11V5l-8-3zm-1 14-4-4 1.41-1.41L11 13.17l4.59-4.58L17 10l-6 6z"/>'
    }

    return `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="${color}">
            ${iconos[tipo] || iconos.calendario}
        </svg>
    `

}