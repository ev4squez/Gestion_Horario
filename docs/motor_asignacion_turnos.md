# Motor de Asignación Automática de Turnos

## Descripción general

Diseño e implementación de un motor que genera propuestas mensuales de asignación de personal de forma inteligente, analizando:

- Personal disponible
- Restricciones legales
- Reglas por cargo
- Cobertura operativa requerida
- Balance de carga laboral

---

## Fuente de cobertura operativa

El motor utiliza la tabla `planificacion_cobertura`, que define la cobertura mínima requerida por franja horaria.

Cada registro contiene:

- Tipo de cobertura (CECO o Cargo)
- Área / CECO
- Cargo (opcional)
- Día de la semana
- Hora inicio / Hora fin
- Mínimo de personas requeridas
- Estado (activa / inactiva)

### Ejemplo

| Tipo | Área  | Día     | Inicio | Fin   | Mínimo |
|------|-------|---------|--------|-------|--------|
| CECO | SLOTS | Lunes   | 09:00  | 03:00 | 1      |
| CECO | SLOTS | Viernes | 09:00  | 06:00 | 2      |

El motor debe garantizar que todas las coberturas activas sean satisfechas.

---

## Restricciones legales (Hard Rules)

Estas restricciones son obligatorias e inviolables.

### Descanso entre jornadas

Mínimo de **12 horas continuas** entre el fin de una jornada y el inicio de la siguiente.

### Horas semanales

No se puede superar:

- Máximo contractual del colaborador
- Máximo legal vigente

### Descanso semanal

Se debe respetar el descanso semanal obligatorio, controlando:

- Domingos trabajados
- Distribución del descanso
- Jornadas consecutivas

### Días consecutivos máximos

No asignar trabajo continuo más allá del máximo permitido por ley o contrato.

---

## Objetivos de optimización

Una vez cumplidas las restricciones legales, optimizar en el siguiente orden de prioridad:

### 1. Cobertura mínima *(máxima prioridad)*

Para cada regla de cobertura activa:

```
personal_asignado >= minimo_personas
```

Si no se cumple, generar una **brecha operativa**:

```json
{
  "tipo": "BRECHA_COBERTURA",
  "area": "SLOTS",
  "franja": "17:30-18:30",
  "requerido": 1,
  "asignado": 0
}
```

### 2. Distribución equitativa

Balancear entre colaboradores:

- Horas trabajadas
- Turnos nocturnos
- Domingos y fines de semana
- Turnos complejos

Evitar sobrecargar sistemáticamente a los mismos colaboradores.

### 3. Optimización de costos

Minimizar:

- Horas extra
- Sobredotación
- Costos laborales innecesarios

### 4. Preferencias individuales

Considerar, solo si no afectan prioridades superiores:

- Disponibilidad declarada
- Restricciones personales
- Preferencias de turno

---

## Reglas por cargo

Cada cargo puede tener reglas propias definidas con la siguiente estructura:

```yaml
turnos_permitidos:
jornadas_validas:
restricciones_especificas:
prioridad_operacional:
```

### Ejemplos por cargo

**Croupier**
- Cobertura continua por mesas activas
- Turnos rotativos obligatorios

**Operador Slots**
- Mayor presencia en horarios peak
- Refuerzo en fines de semana

**Supervisor**
- Cobertura crítica en apertura y cierre
- No puede quedar sin cobertura en estos momentos

**Administrativo**
- Horario estable preferido
- Sin turnos nocturnos salvo excepción

---

## Flujo del motor

```
1. Cargar colaboradores disponibles
2. Cargar reglas de cobertura (planificacion_cobertura)
3. Analizar demanda operativa por franja y día
4. Buscar candidatos válidos para cada franja
5. Asignar turnos respetando hard rules
6. Validar restricciones legales
7. Detectar y registrar conflictos
8. Generar propuesta final (estado: PENDIENTE_APROBACION)
```

---

## Reglas de aprobación

La propuesta generada:

- **Nunca** debe aplicarse automáticamente.
- **Siempre** queda en estado `PENDIENTE_APROBACION` hasta revisión manual.

---

## Conflictos detectables

El motor debe registrar y explicar cada conflicto encontrado.

### Tipos de conflicto

**Brecha de cobertura**
```json
{
  "tipo": "BRECHA_COBERTURA",
  "area": "SLOTS",
  "franja": "17:30-18:30",
  "requerido": 1,
  "asignado": 0
}
```

**Descanso insuficiente**
```json
{
  "tipo": "DESCANSO_INSUFICIENTE",
  "colaborador_id": 42,
  "turno_anterior_fin": "2025-07-01T06:00:00",
  "turno_siguiente_inicio": "2025-07-01T14:00:00",
  "horas_descanso": 8
}
```

**Exceso de horas**
```json
{
  "tipo": "EXCESO_HORAS",
  "colaborador_id": 42,
  "horas_asignadas": 50,
  "maximo_legal": 45
}
```

**Turno inválido para cargo**
```json
{
  "tipo": "TURNO_INVALIDO_CARGO",
  "colaborador_id": 42,
  "cargo": "Administrativo",
  "turno_intentado": "NOCTURNO"
}
```

---

## Arquitectura interna del motor

### Componentes principales

```
MotorAsignacion
├── Loader
│   ├── CargarColaboradores()
│   ├── CargarCobertura()
│   └── CargarReglasCargoS()
├── Analizador
│   ├── GenerarDemandaOperativa()
│   └── EvaluarCandidatos()
├── Asignador
│   ├── AsignarTurnos()
│   └── ResolverConflictos()
├── Validador
│   ├── ValidarHardRules()
│   └── ValidarReglasCargoS()
├── Optimizador
│   ├── EquilibrarCarga()
│   └── MinimizarCostos()
└── GeneradorPropuesta
    ├── RegistrarConflictos()
    └── EmitirPropuesta()
```

### Algoritmo de asignación (pseudocódigo)

```
FUNCIÓN AsignarTurnos(mes, año):

  colaboradores = CargarColaboradores()
  franjas = GenerarFranjasDesdeCobertura(mes, año)
  conflictos = []
  asignaciones = []

  PARA CADA franja EN franjas ORDENADAS_POR_PRIORIDAD:
    candidatos = FiltrarCandidatosValidos(colaboradores, franja)

    SI candidatos.cantidad < franja.minimo_requerido:
      conflictos.agregar(BRECHA_COBERTURA(franja))
      CONTINUAR

    seleccionados = SeleccionarPorEquidad(candidatos, franja.minimo_requerido)

    PARA CADA seleccionado EN seleccionados:
      SI ValidarHardRules(seleccionado, franja):
        asignaciones.agregar(Asignacion(seleccionado, franja))
        ActualizarEstado(seleccionado, franja)
      SINO:
        conflictos.agregar(ConflictoDetectado(seleccionado, franja))

  RETORNAR Propuesta(asignaciones, conflictos, estado=PENDIENTE_APROBACION)


FUNCIÓN FiltrarCandidatosValidos(colaboradores, franja):
  RETORNAR colaboradores DONDE:
    - cargo compatible con franja
    - no tiene turno solapado
    - descanso mínimo respetado (>= 12h desde turno anterior)
    - no excede horas semanales
    - no excede días consecutivos


FUNCIÓN SeleccionarPorEquidad(candidatos, cantidad):
  // Ordenar por score de equidad (menor carga acumulada = mayor prioridad)
  RETORNAR candidatos
    .ORDENAR_POR(horas_mes ASC, turnos_nocturnos ASC, domingos_mes ASC)
    .TOMAR(cantidad)
```

### Estrategia de optimización

La optimización se aplica en capas secuenciales:

| Capa | Objetivo | Técnica |
|------|----------|---------|
| 1 | Cobertura mínima | Búsqueda greedy por franja, priorizando las más restrictivas |
| 2 | Equidad | Score multivariable por colaborador |
| 3 | Costo | Penalización de horas extra y sobredotación |
| 4 | Preferencias | Bonus si coincide con disponibilidad declarada |

---

## Extensibilidad y escalabilidad

El motor está diseñado para crecer sin romper lo existente:

- **Nuevas reglas**: agregar validadores implementando la interfaz `IReglasValidacion`
- **Nuevos cargos**: registrar en tabla de configuración `reglas_cargo`, sin tocar código
- **Algoritmos avanzados**: la capa `Optimizador` puede reemplazarse por **OR-Tools** o modelos de IA sin afectar el resto del flujo
- **Múltiples fuentes**: `Loader` abstrae la fuente de datos; puede apuntar a SQLite, PostgreSQL o API externa

### Hoja de ruta para optimización avanzada

```
Fase 1 (actual):   Greedy + Score de equidad
Fase 2 (próxima):  Constraint Programming con OR-Tools (Google)
Fase 3 (futura):   Reinforcement Learning sobre histórico de propuestas aprobadas
```

---

*Documento técnico — Motor de Asignación Automática de Turnos*
*Gestión de Horario — Ovalle Casino Resort*