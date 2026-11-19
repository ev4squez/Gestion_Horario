const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require(process.env.JSDOM_PATH || 'jsdom');

function contexto(){
    const html = fs.readFileSync('frontend/index.html', 'utf8');
    const plantilla = new JSDOM(html);
    const modal = plantilla.window.document.getElementById('modal-trabajador').outerHTML;
    plantilla.window.close();
    const dom = new JSDOM(modal, {runScripts: 'dangerously'});
    const c = dom.window;
    c.trabajadoresGlobal = [];
    c.obtenerTurnosDisponibles = () => [];
    c.eval(fs.readFileSync('frontend/js/api.js', 'utf8'));
    c.eval(fs.readFileSync('frontend/js/admin/trabajadores.js', 'utf8'));
    return {c, doc: c.document};
}

test('el RUT se formatea automáticamente al escribir o pegar, incluyendo K y cuerpos de siete dígitos', () => {
    const {c, doc} = contexto();
    c.nuevoTrabajador();
    const input = doc.getElementById('trabajador-rut');
    for(const [valor, esperado] of [
        ['123456789', '12.345.678-9'],
        ['98765432', '9.876.543-2'],
        ['12345678k', '12.345.678-K'],
        [' 12.345.678-k ', '12.345.678-K'],
        ['', ''],
        ['1', '1'],
    ]){
        input.value = valor;
        input.dispatchEvent(new c.Event('input', {bubbles: true}));
        assert.equal(input.value, esperado);
    }
    c.close();
});

test('editar un trabajador muestra su RUT con el mismo formato', () => {
    const {c, doc} = contexto();
    c.trabajadoresGlobal = [{id: 7, nombre: 'Persona de prueba', rut: '12345678k'}];
    c.editarTrabajador(7);
    assert.equal(doc.getElementById('trabajador-rut').value, '12.345.678-K');
    c.close();
});

test('crear y actualizar envían el RUT formateado aunque no se haya disparado input', async () => {
    const {c, doc} = contexto();
    c.alert = () => {};
    c.leerMensajeRespuestaError = async () => 'Respuesta de prueba';
    let enviado;
    c.crearTrabajador = async data => { enviado = data; return {ok: false, status: 400}; };
    c.actualizarTrabajador = async (id, data) => { enviado = data; return {ok: false, status: 400}; };
    for(const id of ['', '7']){
        c.nuevoTrabajador();
        doc.getElementById('trabajador-id').value = id;
        doc.getElementById('trabajador-nombre').value = 'Persona de prueba';
        doc.getElementById('trabajador-rut').value = '12345678k';
        await c.guardarTrabajador();
        assert.equal(enviado.rut, '12.345.678-K');
        assert.equal(doc.getElementById('trabajador-rut').value, enviado.rut);
    }
    c.close();
});

test('formatear conserva la selección al editar en medio y no altera datos inválidos', () => {
    const {c, doc} = contexto();
    const input = doc.getElementById('trabajador-rut');
    input.value = '123456789';
    input.setSelectionRange(2, 5, 'backward');
    c.formatearRutTrabajador(input);
    assert.equal(input.selectionStart, 2);
    assert.equal(input.selectionEnd, 6);
    assert.equal(input.selectionDirection, 'backward');
    for(const valor of ['1234567890', '1234567X', '12K345678']){
        input.value = valor;
        c.formatearRutTrabajador(input);
        assert.equal(input.value, valor);
    }
    c.close();
});
