const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require(process.env.JSDOM_PATH || 'jsdom');

function contexto(){
    const plantilla = new JSDOM(fs.readFileSync('frontend/index.html', 'utf8'));
    const html = plantilla.window.document.getElementById('vista-turnos-frecuentes').outerHTML;
    plantilla.window.close();
    const dom = new JSDOM(html, {runScripts: 'dangerously'});
    const c = dom.window;
    for(const archivo of ['api', 'app', 'admin/turnos-frecuentes']){
        c.eval(fs.readFileSync(`frontend/js/${archivo}.js`, 'utf8'));
    }
    c.turnosFrecuentesGlobal = [];
    return {c, doc: c.document};
}

test('el listado muestra las horas de cada turno y mantiene los grupos por CECO', () => {
    const {c, doc} = contexto();
    c.eval(`turnosFrecuentesGlobal=[
        {id:1,ceco:'Caja',turno:'09:00 - 18:30'},
        {id:2,ceco:'Seguridad',turno:'19:30 - 06:00'},
        {id:3,ceco:'Caja',turno:'09:00 - 17:00'}
    ]`);
    c.renderizarTurnosFrecuentes();
    const filas = [...doc.querySelectorAll('[data-grupo-ceco-fila]')];
    assert.equal(filas.length, 3);
    for(const [turno, horas] of [['09:00 - 18:30','9h 30min'],['19:30 - 06:00','10h 30min'],['09:00 - 17:00','8h']]){
        const fila = filas.find(el => el.cells[1].textContent.trim() === turno);
        assert.equal(fila.cells[2].textContent.trim(), horas);
        assert.equal(fila.cells.length, 4);
    }
    assert.equal(doc.querySelectorAll('[data-grupo-ceco-toggle]').length, 2);
    assert([...doc.querySelectorAll('thead th')].some(el => el.textContent.includes('Horas')));
    c.close();
});

test('el formulario calcula las horas al abrir y actualiza al cambiar cualquiera de los horarios', () => {
    const {c, doc} = contexto();
    c.renderizarTurnosFrecuentes();
    const horas = doc.getElementById('turno-frecuente-duracion');
    assert(horas, 'Debe existir un indicador de duración en el formulario');
    assert.equal(horas.textContent, '9h 30min');
    const inicio = doc.getElementById('turno-frecuente-inicio');
    const fin = doc.getElementById('turno-frecuente-fin');
    inicio.value = '19:30';
    inicio.dispatchEvent(new c.Event('input', {bubbles:true}));
    assert.equal(horas.textContent, '23h');
    fin.value = '06:00';
    fin.dispatchEvent(new c.Event('input', {bubbles:true}));
    assert.equal(horas.textContent, '10h 30min');
    fin.value = '';
    fin.dispatchEvent(new c.Event('input', {bubbles:true}));
    assert.equal(horas.textContent, 'Completa ambos horarios');
    c.close();
});

test('horas de inicio y término iguales muestran 24 horas como el cálculo de planificación', () => {
    const {c} = contexto();
    assert.equal(c.formatearDuracionTurno('08:00 - 08:00'), '24h');
    assert.equal(c.formatearDuracionTurno('23:45 - 00:15'), '30min');
    c.close();
});

test('la fila vacía y las cabeceras de grupo cubren las cuatro columnas y los grupos siguen plegándose', () => {
    const {c, doc} = contexto();
    c.renderizarTurnosFrecuentes();
    assert.equal(doc.querySelector('#tabla-turnos-frecuentes-body td').colSpan, 4);
    c.turnosFrecuentesGlobal = [{id:1,ceco:'Caja',turno:'09:00 - 18:30'}];
    c.renderizarTurnosFrecuentes();
    assert.equal(doc.querySelector('[data-grupo-ceco-toggle]').closest('td').colSpan, 4);
    doc.querySelector('[data-grupo-ceco-toggle]').click();
    assert.equal(doc.querySelectorAll('[data-grupo-ceco-fila]').length, 0);
    doc.querySelector('[data-grupo-ceco-toggle]').click();
    assert.equal(doc.querySelector('[data-grupo-ceco-fila]').cells[2].textContent.trim(), '9h 30min');
    c.close();
});
