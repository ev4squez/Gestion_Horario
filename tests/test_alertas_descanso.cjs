const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function contexto(turnos){
    const elementos = {'total-trabajadores': {}, 'contenedor-responsables': {}};
    const c = vm.createContext({
        window: {},
        document: {addEventListener(){}, getElementById: id => elementos[id], querySelectorAll: () => []},
        escaparHTML: s => String(s).replaceAll('"', '&quot;'),
    });
    for(const file of ['calendario', 'resumen', 'cobertura', 'app']){
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/js', file + '.js'), 'utf8'), c);
    }
    c.turnosPrueba = turnos;
    vm.runInContext('mesActual=9; anioActual=2026; planificacionGlobal=turnosPrueba;', c);
    return {c, elementos};
}
const persona = {id: 1, nombre: 'Prueba', jornada: 44};
const turno = (fecha, horario, id=1) => ({trabajador_id:id,fecha,turno:horario});

test('detecta descanso nocturno y lo dibuja en ambas fechas del colaborador', () => {
    const {c, elementos} = contexto([turno('2026-10-13','16:00 - 00:00'), turno('2026-10-14','08:00 - 16:00')]);
    const alertas = c.calcularAlertasDescanso([persona]);
    assert.equal(alertas.length, 1);
    assert.equal(alertas[0].descanso, 8);
    c.feriadoDe = () => null;
    c.renderizarTrabajadores([persona]);
    const html = elementos['contenedor-responsables'].innerHTML;
    assert.equal((html.match(/title="Descanso insuficiente entre jornadas/g) || []).length, 2);
    assert.equal((html.match(/class="planning-alert[\s\S]*?>8h<\/span>/g) || []).length, 2);
});

test('incluye el primer día del mes, IDs de texto y fechas serializadas', () => {
    const {c} = contexto([turno('2026-10-01T00:00:00','16:00 - 00:00','1'), turno('2026-10-02T00:00:00','08:00 - 16:00','1')]);
    const [a] = c.calcularAlertasDescanso([persona]);
    assert.equal(a.fecha1, '2026-10-01');
    assert.equal(a.descanso, 8);
});

test('detecta descansos entre meses', () => {
    const {c} = contexto([turno('2026-09-30','16:00 - 00:00'), turno('2026-10-01','08:00 - 16:00')]);
    assert.equal(c.calcularAlertasDescanso([persona])[0].descanso, 8);
});

test('un turno de 24 horas termina al día siguiente', () => {
    const {c} = contexto([turno('2026-10-13','08:00 - 08:00'), turno('2026-10-14','16:00 - 23:00')]);
    assert.equal(c.calcularAlertasDescanso([persona])[0].descanso, 8);
    assert.equal(c.calcularHorasSemana(['08:00 - 08:00'], 0.5), 23.5);
});

test('clasifica 11 horas como advertencia y no alerta por 12 horas', () => {
    for(const [inicio, cantidad] of [['11:00',1], ['12:00',0]]){
        const {c} = contexto([turno('2026-10-13','16:00 - 00:00'), turno('2026-10-14',`${inicio} - 20:00`)]);
        const a = c.calcularAlertasDescanso([persona]);
        assert.equal(a.length, cantidad);
        if(cantidad) assert.equal(a[0].tipo, 'warning');
    }
});

test('no mezcla colaboradores ni genera alertas de meses fuera de la grilla', () => {
    const {c} = contexto([turno('2026-10-13','16:00 - 00:00'), turno('2026-10-14','08:00 - 16:00',2), turno('2026-08-13','16:00 - 00:00'), turno('2026-08-14','08:00 - 16:00')]);
    assert.equal(c.calcularAlertasDescanso([persona]).length, 0);
});
