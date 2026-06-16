# Motor de Asignación Automática de Turnos

## Descripción general

Módulo de planificación inteligente que genera propuestas de turnos mensuales respetando restricciones legales y necesidades operativas por área y cargo.

> **Importante:** La generación automática nunca aplica cambios directamente al calendario oficial. Toda propuesta requiere revisión y aprobación explícita del administrador.

---

## Restricciones legales (reglas duras)

Estas reglas son **no negociables**. El motor debe rechazar cualquier propuesta que las vulnere.

| Restricción | Regla |
|---|---|
| Descanso entre jornadas | Mínimo **12 horas continuas** entre fin de una jornada e inicio de la siguiente |
| Horas semanales | No superar el máximo contractual ni el legal vigente |
| Descanso semanal | Cumplimiento obligatorio; controlar distribución de domingos trabajados |
| Días consecutivos | No asignar trabajo continuo más allá del máximo permitido sin descanso |

---

## Objetivos de optimización

Una vez cumplidas las restricciones legales, el motor optimiza en este orden de prioridad:

1. **Cobertura mínima** — Cada área debe tener la dotación mínima requerida por franja horaria.
2. **Distribución equitativa** — Balancear entre colaboradores:
   - Horas trabajadas totales
   - Turnos complejos o especiales
   - Domingos trabajados
   - Jornadas nocturnas
3. **Optimización de costos** — Minimizar horas extras, sobreasignaciones y costos laborales innecesarios.
4. **Preferencias individuales** — Considerar disponibilidades, restricciones personales y preferencias operativas cuando no comprometan los puntos anteriores.

---

## Reglas por cargo

> Cada cargo tiene reglas propias. El motor debe evaluar las restricciones del cargo antes de proponer cualquier turno.

### Atributos a definir por cargo

```
- turnos_permitidos: lista de turnos válidos para el cargo
- jornadas_validas: tipos de jornada aplicables
- restricciones_especificas: reglas adicionales del cargo
- cobertura_minima: dotación mínima requerida por franja/área
- prioridad_operacional: nivel de criticidad del cargo en la operación
```

### Ejemplos de reglas por cargo

| Cargo | Consideraciones principales |
|---|---|
| Croupier | Cobertura continua por mesas activas; turnos rotativos específicos |
| Operador de Slots | Mayor presencia en horarios peak y fines de semana |
| Supervisor | Cobertura en franjas críticas: apertura, cierre, cambios de turno |
| Personal administrativo | Horarios más estables; menor rotación |

---

## Flujo de generación

```
1. Cargar colaboradores activos
      ↓
2. Identificar cargo, jornada y restricciones individuales
      ↓
3. Evaluar demanda operativa por área y franja horaria
      ↓
4. Generar propuesta de turnos
      ↓
5. Validar cumplimiento de restricciones legales
      ↓
6. Detectar conflictos o alertas
      ↓
7. Mostrar propuesta al usuario para revisión
```

---

## Previsualización y aprobación

El flujo de aprobación es obligatorio antes de cualquier cambio al calendario oficial.

### Al presionar "Generar propuesta"
- Se construye una propuesta inicial (sin aplicar cambios).
- Se muestra previsualización completa con alertas o conflictos destacados.

### Acciones disponibles para el administrador
- Revisar la propuesta generada.
- Realizar ajustes manuales sobre la propuesta.
- **Aprobar** → aplica los cambios al calendario oficial.
- **Rechazar** → descarta la propuesta sin modificaciones.

---

## Notas de implementación

- Las restricciones legales se implementan como **validaciones bloqueantes**: si alguna falla, la propuesta no puede aprobarse.
- Los objetivos de optimización son **ponderables**: se puede ajustar el peso de cada criterio según la configuración del sistema.
- La capa de reglas por cargo debe ser **configurable** desde la interfaz de administración, sin requerir cambios en el código.
- El motor debe exponer el motivo de cada conflicto detectado para facilitar la corrección manual.
