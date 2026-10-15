# Planificación automática

La propuesta se construye con una lectura actual y consistente del servidor. No se guarda hasta aprobarla.

## Aplicación y conflictos

- `GET /planificacion/contexto-automatico`: devuelve trabajadores, turnos, planificación, cobertura, colación y una revisión del contexto de la empresa autenticada.
- `POST /planificacion/automatica`: recibe `asignaciones`, `revision`, `mes` (1–12) y `anio`.
- Si cambió la planificación o la configuración desde la generación, responde 409. La interfaz ofrece **Volver a generar** y conserva los cambios manuales.
- En SQLite, la comprobación de revisión y la escritura se ejecutan bajo `BEGIN IMMEDIATE`. Se valida el lote entero antes de modificar registros.
- Se comprueban empresa, actividad del colaborador, turno fijo, fechas, estados protegidos, compatibilidad con la cobertura o con el catálogo para completar jornada, descanso mínimo configurado (12h), jornada individual y máximo configurado de días consecutivos (6). Las horas se recalculan en el servidor.
- La edición manual y el modal de carga semanal mantienen sus rutas existentes; pueden corregir planificación previa que tenga inconsistencias.

## Completar jornadas semanales

Después de priorizar cobertura, se buscan combinaciones semanales del catálogo del CECO para acercarse al 100% de la jornada individual, sin excederla. La cobertura mínima ya cumplida y los días sin regla no bloquean esta fase. Los fijos usan únicamente sus días y horarios configurados.

La búsqueda mantiene los turnos manuales y los estados protegidos. Puede ajustar horarios generados por cobertura si conserva toda su cobertura dentro de las reglas. Utiliza cotas de combinaciones en minutos y hasta 6000 nodos por trabajador/semana; si alcanza ese límite se informa en las horas pendientes. No se garantiza un óptimo global entre todos los trabajadores.

Si no es posible alcanzar la jornada con el catálogo y las restricciones, el resumen muestra las horas faltantes por trabajador y semana. Las semanas que cruzan de mes se completan únicamente en fechas del mes seleccionado; también se consideran turnos ya guardados del mes vecino al validar horas y descansos.

## Diagnóstico de personal

El modal diferencia cobertura cumplida, falta de dotación compatible, ausencia/disponibilidad y turnos o restricciones que requieren revisión. Permite desplegar fechas, sectores, dotación requerida/asignada y motivos por colaborador.

**Alcance actual:** se evalúa toda la franja, dividida en segmentos por cada inicio o fin de turno. En el interior se exige el menor mínimo de apertura y cierre; los extremos conservan sus mínimos específicos. Se incluyen relevos y turnos de días vecinos, también al cruzar medianoche. Los descansos de colación no tienen horario definido, por lo que no se descuentan de la presencia durante una franja. La cifra de personal adicional es un mínimo por grupo/punto exigente; no suma indiscriminadamente reglas solapadas ni garantiza que ese número cierre todo el calendario. Una propuesta con brechas no prueba por sí sola falta de personal.

## Modal de revisión

El modal presenta una conclusión y tres contadores compactos. Las pestañas **Resumen**, **Turnos** y **Problemas** separan el diagnóstico del listado. Las pestañas admiten flechas, Inicio y Fin; el diálogo mantiene el foco y permite cerrar con Escape cuando no se está guardando.

**Revisar turnos de esta semana** muestra la planificación resultante del sector afectado, combinando turnos actuales y propuesta, incluidos libres y ausencias. Esta revisión es de solo lectura y no cambia la propuesta. La búsqueda de problemas y la de turnos son independientes.

Al guardar, se vuelve a Resumen, se oculta la aprobación y aparece **Cerrar resumen**. Una revisión desactualizada sigue ofreciendo **Volver a generar**.

## Verificación

- `python -m unittest discover -s tests -p 'test_automatizacion.py' -v`
- `TZ=America/Santiago node tests/test_motor_asignacion.cjs`
- `TZ=America/Santiago node tests/test_alertas_descanso.cjs`
- `JSDOM_PATH=/ruta/a/node_modules/jsdom TZ=America/Santiago node tests/test_motor_modal.cjs` (requiere jsdom en el entorno de pruebas; no es dependencia de ejecución).

Después de actualizar el sistema, reiniciar el backend y recargar el navegador para cargar las nuevas rutas y scripts.
