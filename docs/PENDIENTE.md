# Pendientes

## Prioridad Alta

### Motor de asignación automática
- [x] Reoptimizar la planificación existente, incluyendo turnos ya asignados.
  - Decisión tomada: cuando ya existe una planificación, el motor debe reoptimizar incluyendo los turnos existentes.
  - Implementado: el motor evalúa reemplazos temporales del turno existente dentro de la propuesta.
- [x] Crear turnos a medida dentro de la franja de cobertura operativa cuando no exista un turno predefinido adecuado.
  - Decisión tomada: el motor debe crear turnos a medida en la franja de cobertura.
  - Implementado: el motor agrega un turno a medida para cubrir la brecha detectada, además de los turnos predefinidos compatibles.
- [x] Indicar si el personal actual más lo indicado en el planificador es suficiente para cumplir la cobertura.
- [x] Informar claramente cuando se requiere más personal para cumplir la cobertura.

### Cobertura Operativa — configuración semanal por dotación mínima (inicio / fin)
- [x] La configuración semanal de la Cobertura Operativa debe definirse por dotación mínima de personal en el **inicio de cobertura** y en el **fin de cobertura**.
  - **Implementado** (interpretación "solo dos puntos"): `models.py` (`minimo_inicio`/`minimo_fin`, `minimo_personas` conservado como `max`), migración `_migrar_columnas_cobertura` con backfill, `CoberturaSchema`/`_normalizar_cobertura`/`_serializar_cobertura`, formulario e tabla en `index.html`, `cobertura.js` (`calcularBrechasIntervalo` reescrito + `dotacionEnInstante`/`etiquetaPuntoBrecha`), y motor (`motorReglasActivas`/`motorMinimoRegla`, `motorBrechasRegla`, `motorTurnosParaBrecha`).
  - Migración verificada sobre `data/turnos.db` (7 reglas backfilleadas); lógica de brechas validada con casos (hueco intermedio ya no genera brecha, solo apertura/cierre).

**Requerimiento**
Poder indicar, por cada regla de cobertura, cuánto personal se necesita **al inicio** de la franja y cuánto **al final**, de forma independiente. Reemplaza el `minimo_personas` único actual.

**Decisión de diseño (tomada): interpretación "solo dos puntos"**
El mínimo se exige exactamente en dos instantes:
- `minimo_inicio` → dotación que cubre el instante de apertura (`hora_inicio`).
- `minimo_fin` → dotación que cubre el instante previo al cierre (`hora_fin`).
- En el resto de la franja NO se exige un mínimo explícito. (No hay rampa ni escalón intermedio.)

**Impacto: afecta al planificador automático** (`motor_asignacion.js`) además de la vista de Cobertura. El supuesto actual de "un mínimo plano en toda la franja" (`calcularBrechasIntervalo(requerido, intervalos, regla.minimo_personas)`) deja de valer.

**Cambios por capa**

1. **Modelo** — `backend/models.py` · `ConfiguracionCobertura` (línea 88)
   - Añadir `minimo_inicio = Column(Integer, default=1, nullable=False)` y `minimo_fin = Column(Integer, default=1, nullable=False)`.
   - Mantener `minimo_personas` por compatibilidad hacia atrás (lectores legados / alertas), poblándolo como `max(minimo_inicio, minimo_fin)`; o eliminarlo si se actualizan todos sus usos (ver punto 6).

2. **Migración** — `backend/app.py` · seguir el patrón de `_migrar_columna_cargo` (línea 68) / `_migrar_columna_es_responsable`, porque `create_all()` no altera tablas existentes.
   - Nueva `_migrar_columnas_cobertura()`: inspeccionar `configuracion_cobertura`; si falta `minimo_inicio`/`minimo_fin`, `ALTER TABLE ... ADD COLUMN ... INTEGER DEFAULT 1`.
   - Backfill de filas existentes: `UPDATE configuracion_cobertura SET minimo_inicio = minimo_personas, minimo_fin = minimo_personas` (una regla vieja pasa a exigir el mismo mínimo en inicio y fin ⇒ comportamiento equivalente al actual).
   - Registrar la llamada en `crear_tablas()` (línea 38), junto a las otras migraciones.

3. **Schema/serialización** — `backend/app.py`
   - `CoberturaSchema` (línea 310): añadir `minimo_inicio: int = 1` y `minimo_fin: int = 1`.
   - `_normalizar_cobertura` (línea 342): validar `minimo_inicio >= 1` y `minimo_fin >= 1` (reemplaza la validación de `minimo_personas`), e incluirlos en el dict devuelto; setear `minimo_personas = max(minimo_inicio, minimo_fin)` si se conserva la columna.
   - `_serializar_cobertura`: exponer ambos campos nuevos.
   - Endpoints POST/PUT `/cobertura/config` no cambian (usan `_normalizar_cobertura`).

4. **UI de configuración** — `frontend/index.html` (formulario de cobertura) + `frontend/js/cobertura.js`
   - En el form: reemplazar el input único `#cobertura-minimo` por dos: `#cobertura-minimo-inicio` y `#cobertura-minimo-fin`.
   - `limpiarFormularioCobertura` (línea 364) y `editarReglaCobertura` (línea 378): setear/leer los dos nuevos campos.
   - `guardarReglaCobertura` (línea 397): enviar `minimo_inicio` y `minimo_fin` en `data`.
   - `renderizarReglasCobertura` (línea 477): la tabla muestra hoy una sola columna de mínimo (línea 504) con `colspan="7"` en el estado vacío (línea 487). Mostrar "Inicio / Fin" (p. ej. `5 → 2`) y ajustar el `colspan`.

5. **Cálculo de brechas** — `frontend/js/cobertura.js`
   - `calcularBrechasIntervalo` (línea 177): hoy recibe un `minimoPersonas` plano y flagea cualquier sub-tramo por debajo. Nueva semántica "solo dos puntos": evaluar dotación **solo** en el tramo que contiene `requerido.inicio` (contra `minimo_inicio`) y en el que contiene el instante previo a `requerido.fin` (contra `minimo_fin`). Firma sugerida: `calcularBrechasIntervalo(requerido, intervalos, minimoInicio, minimoFin)`.
   - `calcularCobertura` (línea 228): pasar `regla.minimo_inicio` / `regla.minimo_fin`.
   - `calcularAlertasCobertura` (línea 290): el `detalle` (líneas 312, 321) y el `titulo` deben reflejar cuál punto falla (inicio vs fin) y su mínimo respectivo.

6. **Planificador automático** — `frontend/js/motor_asignacion.js`
   - `motorReglasActivas` (línea 108): hoy ordena por `minimo_personas`; ordenar por `max(minimo_inicio, minimo_fin)` (o el criterio de prioridad que se decida).
   - `motorBrechasRegla` (línea 515): pasa `regla.minimo_personas` a `calcularBrechasIntervalo`; cambiar a `regla.minimo_inicio` / `regla.minimo_fin` con la nueva firma.
   - `motorCrearConflicto` (línea 649): `requerido: regla.minimo_personas` → reportar el mínimo del punto en brecha (inicio/fin).
   - `motorTurnosParaBrecha` / `motorSeleccionarCandidato`: revisar que sigan generando turnos que cubran los instantes de inicio y fin (la brecha ya lleva `inicio`/`fin`, así que el impacto debería ser menor, pero verificar).

**Compatibilidad hacia atrás**
- BD existente (`data/turnos.db`): cubierta por la migración con backfill; reglas viejas quedan `minimo_inicio == minimo_fin == minimo_personas`.
- Si se decide **eliminar** `minimo_personas`, hay que barrer todos sus usos: `models.py`, `_normalizar_cobertura`/`_serializar_cobertura`, `cobertura.js` (`renderizarReglasCobertura`, `calcularAlertasCobertura`), `motor_asignacion.js` (`motorReglasActivas`, `motorBrechasRegla`, `motorCrearConflicto`). Recomendado conservarlo como derivado para minimizar riesgo.

**Verificación (no hay tests automatizados)**
- `uvicorn backend.app:app --reload`, crear una regla con `minimo_inicio=3`, `minimo_fin=1` y confirmar que:
  - La vista Cobertura marca brecha solo si falta gente en apertura o cierre, no en el medio.
  - El planificador automático propone/exige personal según el punto y lo refleja en las alertas de brecha.
- Reiniciar con una BD antigua y verificar que la migración backfillea y no rompe reglas existentes.

### Colación en planificador
- [ ] Permitir modificar el horario de colación asignado desde el planificador.
- [ ] Mostrar el horario de colación asignado en la vista de horario.

## Prioridad Media

### Seguridad
- [ ] Usuarios múltiples.
- [ ] Roles y permisos.
- [ ] Sesiones persistentes.

### Operación
- [ ] Auditoría de cambios.
- [ ] Historial de modificaciones.
- [ ] Bitácora de usuarios.

### Reportes
- [ ] Exportación Excel.
- [ ] Métricas mensuales.
- [ ] Dashboard KPI.

## Prioridad Baja

### Base de Datos
- [ ] Migración a PostgreSQL.
