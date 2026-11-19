const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {JSDOM} = require(process.env.JSDOM_PATH || 'jsdom');

function contexto(){
    const dom = new JSDOM('<main><span id="total-trabajadores"></span><div id="contenedor-responsables"></div></main>');
    const c = vm.createContext({window: dom.window, document: dom.window.document, console});
    for(const archivo of ['api', 'calendario', 'resumen', 'cobertura', 'app']){
        vm.runInContext(fs.readFileSync(`frontend/js/${archivo}.js`, 'utf8'), c);
    }
    c.personas = Array.from({length: 100}, (_, i) => ({id: i + 1, nombre: `Persona ${i + 1}`, jornada: 42, ceco: 'Caja', cargo: 'Operador'}));
    c.feriadoDe = () => null;
    c.actualizarColor = () => {};
    vm.runInContext('mesActual=9; anioActual=2026; trabajadoresGlobal=personas;', c);
    c.window.cargosSeleccionados = ['Operador'];
    c.renderizarTrabajadores(c.personas);
    return {c, doc: dom.window.document};
}

test('repintar planificación mantiene ambos ejes de todas las semanas y el scroll exterior', () => {
    const {c, doc} = contexto();
    const scrollers = [...doc.querySelectorAll('.schedule-scroll')];
    scrollers.forEach((el, i) => { el.scrollTop = 1200 + i * 100; el.scrollLeft = 80 + i * 10; });
    doc.querySelector('main').scrollTop = 300;
    c.renderizarTrabajadores(c.personas);
    [...doc.querySelectorAll('.schedule-scroll')].forEach((el, i) => {
        assert.equal(el.scrollTop, 1200 + i * 100, `posición vertical de semana ${i + 1}`);
        assert.equal(el.scrollLeft, 80 + i * 10, `posición horizontal de semana ${i + 1}`);
    });
    assert.equal(doc.querySelector('main').scrollTop, 300);
});

test('un repintado conserva la celda en edición, su borrador y la selección de texto', () => {
    const {c, doc} = contexto();
    const input = doc.querySelectorAll('.schedule-scroll')[1].querySelector('[data-trabajador-id="80"] .turno-input');
    input.focus();
    input.value = '09:00 - 18:';
    input.setSelectionRange(8, 11);
    const fecha = input.dataset.fecha;
    c.renderizarTrabajadores(c.personas);
    assert.equal(doc.activeElement.dataset.fecha, fecha);
    assert.equal(doc.activeElement.closest('.fila-trabajador').dataset.trabajadorId, '80');
    assert.equal(doc.activeElement.value, '09:00 - 18:');
    assert.equal(doc.activeElement.selectionStart, 8);
    assert.equal(doc.activeElement.selectionEnd, 11);
});

test('guardar y repintar feriados mantiene la posición elegida durante la petición y otra celda en edición', async () => {
    const {c, doc} = contexto();
    c.adminAutorizado = true;
    c.obtenerToken = () => 'sesion-de-prueba';
    c.renderizarResumenDomingos = () => {};
    c.renderizarAlertas = () => {};
    c.renderizarCobertura = () => {};
    let completarGuardado, completarFeriados, enviado;
    c.guardarPlanificacion = datos => {
        enviado = datos;
        return new Promise(resolve => { completarGuardado = resolve; });
    };
    c.obtenerPlanificacion = async () => [enviado];
    c.precargarFeriados = () => new Promise(resolve => { completarFeriados = resolve; });
    const scroll = doc.querySelectorAll('.schedule-scroll')[2];
    const input = scroll.querySelector('[data-trabajador-id="80"] .turno-input');
    input.value = '09:00 - 17:30';
    const guardado = c.guardarTurno(input);
    scroll.scrollTop = 2200;
    scroll.scrollLeft = 150;
    const siguiente = scroll.querySelector('[data-trabajador-id="81"] .turno-input');
    siguiente.focus();
    siguiente.value = '10:00 - 18:';
    completarGuardado({ok: true});
    await guardado;
    function comprobar(){
        const actual = doc.querySelectorAll('.schedule-scroll')[2];
        assert.equal(actual.scrollTop, 2200);
        assert.equal(actual.scrollLeft, 150);
        assert.equal(actual.querySelector(`[data-trabajador-id="80"] [data-fecha="${enviado.fecha}"]`).value, enviado.turno);
        assert.equal(doc.activeElement.closest('.fila-trabajador').dataset.trabajadorId, '81');
        assert.equal(doc.activeElement.value, '10:00 - 18:');
    }
    comprobar();
    completarFeriados();
    await Promise.resolve();
    comprobar();
});

test('al cambiar de mes las semanas nuevas no heredan el desplazamiento por índice', () => {
    const {c, doc} = contexto();
    doc.querySelector('.schedule-scroll').scrollTop = 1500;
    vm.runInContext('mesActual=11;', c);
    c.renderizarTrabajadores(c.personas);
    assert.equal(doc.querySelector('.schedule-scroll').scrollTop, 0);
});
