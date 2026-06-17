# Sistema Web de Planificación de Turnos

## Stack
- Frontend: HTML5 + TailwindCSS + JavaScript Vanilla (SPA)
- Backend: Python + FastAPI + SQLAlchemy
- DB: SQLite
- Despliegue: Docker + Docker Compose

## Arquitectura
- API REST con FastAPI
- SPA con render dinámico y modales
- Persistencia SQLite con volumen Docker

## Tablas DB
### trabajadores
- id, rut, nombre, area, jornada, responsable, ceco

### planificacion
- turnos por fecha, horas por jornada, relacion con trabajador

## Funcionalidades implementadas
- [x] Planificación mensual de turnos (vista semanal)
- [x] Resumen domingos trabajados
- [x] Validación descansos mínimos (12h) con alertas
- [x] Exportación PDF con cabecera corporativa
- [x] CRUD colaboradores con autenticación
- [x] Filtros por Área y CECO
- [x] Configuración y validación de cobertura por Área/CECO
- [x] Despliegue Docker

## Reglas de negocio clave
- Descanso mínimo entre jornadas: 12 horas
- Jornada sábado que termina después de 00:00 cuenta como domingo
- Módulo admin protegido por contraseña
- Cobertura operativa configurable por Área o CECO: día, hora inicio, hora fin y dotación mínima

## Roadmap pendiente
- [ ] Usuarios múltiples + roles y permisos
- [ ] Cambiar de responsable  <select id="filtro-responsable" a filtrar por Cargo 
- [ ] Auditoría y bitácora de cambios
- [ ] Exportación Excel en formato admitido por Defontana
- [ ] Dashboard KPI obtimizacion de los recursos
- [ ] Exportar reporte de brechas de cobertura
- [ ] Botón de sugerencia de programación automática de turnos
  - **Restricciones legales (límite duro, inviolables):**
    - Descanso mínimo de 12h entre el fin de una jornada y el inicio de la siguiente
    - Máximo de horas semanales (jornada ordinaria legal)
    - Descanso semanal garantizado y regla de domingos trabajados
    - Máximo de días consecutivos trabajados sin descanso
  - **Objetivos de optimización (dentro del marco legal):**
    - Cobertura mínima requerida por área/franjaa
    - Equidad en el reparto de horas y domingos entre colaboradores
    - Minimizar horas/costo total para cubrir la demanda
    - Respetar disponibilidad/preferencias de colaboradores y responsables
  - **Entrega:** el botón genera una propuesta que se **previsualiza para revisar y aprobar** antes de aplicarla a la planificación
  - 
