import type { TrashKind } from '@pirata/contracts/index';
import type { TableName } from '../../core/repositories.js';
/** Table behind each deletable kind. Keep in step with DELETABLE in core/repositories.ts and migration 004. */
export const TRASH_TABLE: Record<TrashKind, TableName> = {
  project: 'projects', task: 'tasks', client: 'clients', lead: 'leads', expense: 'expenses', materialRequest: 'shopping_items', toolSignOut: 'tool_sign_outs',
  question: 'task_questions', shift: 'work_shifts', taskTemplate: 'task_templates', projectTemplate: 'project_templates', equipment: 'equipment', material: 'materials',
  maintenance: 'maintenance_items', equipmentReport: 'equipment_reports', projectNote: 'project_notes',
};
