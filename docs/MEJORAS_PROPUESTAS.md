# Mejoras propuestas

Este documento reúne mejoras posibles que no reemplazan los pendientes actuales. La idea es tener una lista separada de oportunidades para elevar calidad, operación y experiencia de uso.

## Calidad técnica
- [ ] Agregar pruebas automáticas para reglas críticas: descanso mínimo, horas semanales, días consecutivos, cálculo de colación y cobertura.
- [ ] Separar lógica de negocio del frontend en módulos más pequeños para que el motor de asignación, cobertura y horas sean más fáciles de probar.
- [ ] Crear datos de prueba controlados para simular meses completos, brechas de cobertura y casos límite.
- [ ] Agregar validación de formato JavaScript y Python en un comando único de verificación.
- [ ] Evitar versionar archivos generados como `__pycache__`, base de datos local y archivos temporales de Obsidian.

## Base de datos y datos
- [ ] Implementar migraciones versionadas para cambios de tablas y columnas.
- [ ] Agregar respaldo automático de la base de datos antes de aplicar cambios masivos.
- [ ] Registrar fecha de creación y actualización en tablas principales donde falte trazabilidad.
- [ ] Normalizar catálogos clave: cargos, áreas, CECO, responsables y tipos de turno.
- [ ] Agregar validaciones contra duplicados y datos incompletos al importar trabajadores.

## Experiencia de usuario
- [ ] Mostrar indicadores visuales de cambios no guardados en el planificador.
- [ ] Agregar confirmación detallada antes de aplicar acciones masivas.
- [x] Mejorar los mensajes de error para indicar causa y acción recomendada.
- [x] Agregar filtros rápidos por estado del colaborador, cargo, CECO y responsable.
- [x] Permitir búsqueda textual en tablas largas de trabajadores, usuarios y planificación.

## Motor de asignación
- [ ] Explicar el motivo de selección de cada trabajador en la propuesta automática.
- [ ] Mostrar alternativas descartadas por descanso, exceso de horas o días consecutivos.
- [ ] Permitir configurar pesos de optimización: equidad, horas, turnos nocturnos y domingos.
- [ ] Agregar comparación entre planificación actual y propuesta automática.
- [ ] Generar un reporte de impacto antes de aprobar: cambios por trabajador, horas agregadas y turnos modificados.

## Operación y seguridad
- [ ] Agregar expiración configurable para sesiones.
- [ ] Bloquear temporalmente intentos repetidos de login fallido.
- [ ] Agregar pantalla o endpoint de salud para verificar backend, base de datos y versión.
- [ ] Registrar errores del backend con contexto suficiente para diagnóstico.
- [ ] Documentar procedimiento de respaldo, restauración y actualización del sistema.

## Reportabilidad
- [ ] Agregar vista de diferencias entre meses para detectar cambios de dotación y horas.
- [x] Mostrar indicadores de sobrecarga por trabajador.
- [x] Mostrar distribución de turnos nocturnos, domingos y libres por colaborador.
- [ ] Exportar reportes en CSV además de PDF/Excel para análisis externo.
- [ ] Agregar resumen ejecutivo mensual para jefatura.

## Despliegue y mantenimiento
- [ ] Crear un comando simple para levantar entorno local, validar dependencias y revisar salud.
- [ ] Documentar variables de entorno y valores por defecto.
- [ ] Separar configuración de desarrollo y producción.
- [ ] Agregar revisión de formato y pruebas antes de publicar cambios.
- [ ] Mantener un changelog con mejoras funcionales y correcciones importantes.
