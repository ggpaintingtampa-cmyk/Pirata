import type { BusinessService, BusinessSnapshot } from '@pirata/contracts/index';
export interface ModuleProps {
  service:BusinessService;
  snapshot:BusinessSnapshot;
  businessDate:string;
  /** Fetch and publish an acknowledged snapshot; integration must retain dirty drafts. */
  refresh():Promise<void>;
  onClose():void;
  onSaved(message:string):void;
  selection?:{clientId?:string;projectId?:string;taskId?:string;expenseId?:string;materialId?:string;equipmentId?:string;maintenanceId?:string;leadId?:string};
  onOpenTask(taskId:string):void;
  onAddTask(projectId:string|null):void;
  onOpenExpense(expenseId:string):void;
  onAddExpense(projectId:string|null):void;
  onOpenProject(projectId:string):void;
  onOpenClient(clientId:string):void;
}
