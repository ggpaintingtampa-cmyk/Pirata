import type { Strings } from '../../i18n';
export const strings:Strings={
  en:{
    'bulk.select':'Select','bulk.doneSelecting':'Done selecting','bulk.selectItem':'Select {label}','bulk.bar':'Selection','bulk.count':'{count} selected','bulk.cancel':'Cancel',
    'bulk.copy.action':'Copy to…','bulk.copy.tasksOnly':'Only tasks can be copied.','bulk.copy.title':'Copy selected tasks','bulk.copy.project':'Destination project','bulk.copy.parent':'Under task','bulk.copy.topLevel':'Top level of the project',
    'bulk.copy.options':'What to copy','bulk.copy.include.children':'Subtasks and tiny tasks','bulk.copy.include.requirements':'Materials, tools and preparation notes','bulk.copy.include.estimates':'Time estimates','bulk.copy.include.notes':'Task notes',
    'bulk.copy.include.assignments':'Keep the responsible person (otherwise inherited from the destination)','bulk.copy.include.schedule':'Keep planned dates that are still ahead','bulk.copy.explicitHint':'Off by default; choose explicitly:',
    'bulk.copy.excluded':'Completion is reset. Recorded work, hours, questions, photos and history are never copied.','bulk.copy.rootSummary':'{children} under it · {requirements} requirements','bulk.copy.tooDeep':'That would nest deeper than three levels. Choose the top level or a different task.',
    'bulk.copy.confirm':'Copy {count} tasks','bulk.copy.done':'{count} tasks copied.',
    'bulk.delete.action':'Move to trash','bulk.delete.title':'Move selected to Deleted items','bulk.delete.intro':'Everything below moves to Deleted items in one step and can be restored together. Hours, time history and payroll are never touched.',
    'bulk.delete.loading':'Checking what this would affect…','bulk.delete.cascaded':'moves with {count} linked records','bulk.delete.alone':'nothing else moves','bulk.delete.dropped':'{count} selected items are already covered by a selected project or task.',
    'bulk.delete.totals':'{roots} records, {cascaded} linked records move with them.','bulk.delete.blocked':'{count} items cannot be deleted right now (see the reasons above). Remove them to continue.','bulk.delete.removeBlocked':'Remove blocked from selection',
    'bulk.delete.restoreHint':'You can restore the whole batch from Deleted items.','bulk.delete.confirm':'Move {count} items to Deleted items','bulk.delete.done':'{count} records moved to Deleted items.',
  },
  es:{
    'bulk.select':'Seleccionar','bulk.doneSelecting':'Terminar selección','bulk.selectItem':'Seleccionar {label}','bulk.bar':'Selección','bulk.count':'{count} seleccionados','bulk.cancel':'Cancelar',
    'bulk.copy.action':'Copiar a…','bulk.copy.tasksOnly':'Solo se pueden copiar tareas.','bulk.copy.title':'Copiar las tareas seleccionadas','bulk.copy.project':'Proyecto de destino','bulk.copy.parent':'Debajo de la tarea','bulk.copy.topLevel':'Nivel superior del proyecto',
    'bulk.copy.options':'Qué copiar','bulk.copy.include.children':'Subtareas y tareas pequeñas','bulk.copy.include.requirements':'Materiales, herramientas y notas de preparación','bulk.copy.include.estimates':'Estimaciones de tiempo','bulk.copy.include.notes':'Notas de la tarea',
    'bulk.copy.include.assignments':'Conservar al responsable (si no, se hereda del destino)','bulk.copy.include.schedule':'Conservar las fechas planeadas que aún no llegan','bulk.copy.explicitHint':'Desactivado por defecto; elige explícitamente:',
    'bulk.copy.excluded':'Se reinicia el avance. El trabajo registrado, las horas, las preguntas, las fotos y el historial nunca se copian.','bulk.copy.rootSummary':'{children} debajo · {requirements} requerimientos','bulk.copy.tooDeep':'Quedaría a más de tres niveles. Elige el nivel superior u otra tarea.',
    'bulk.copy.confirm':'Copiar {count} tareas','bulk.copy.done':'{count} tareas copiadas.',
    'bulk.delete.action':'Mover a eliminados','bulk.delete.title':'Mover la selección a Elementos eliminados','bulk.delete.intro':'Todo lo de abajo pasa a Elementos eliminados en un solo paso y se puede recuperar junto. Las horas, el historial de tiempo y la nómina no se tocan.',
    'bulk.delete.loading':'Revisando qué afectaría…','bulk.delete.cascaded':'se mueve con {count} registros vinculados','bulk.delete.alone':'no se mueve nada más','bulk.delete.dropped':'{count} elementos seleccionados ya están cubiertos por un proyecto o una tarea seleccionados.',
    'bulk.delete.totals':'{roots} registros, {cascaded} registros vinculados se mueven con ellos.','bulk.delete.blocked':'{count} elementos no se pueden eliminar ahora (ve los motivos arriba). Quítalos para continuar.','bulk.delete.removeBlocked':'Quitar los bloqueados de la selección',
    'bulk.delete.restoreHint':'Puedes recuperar el lote completo desde Elementos eliminados.','bulk.delete.confirm':'Mover {count} elementos a Elementos eliminados','bulk.delete.done':'{count} registros movidos a Elementos eliminados.',
  },
};
