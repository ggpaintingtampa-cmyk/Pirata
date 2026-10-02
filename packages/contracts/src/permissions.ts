// Roles and named capabilities. Screens and handlers ask `can(role, capability)`;
// separating manager/sales/owner later means editing CAPABILITIES only.
export const ROLES=['owner','manager','sales','worker'] as const;
export type Role=typeof ROLES[number];
export const ROLE_CAPS:Readonly<Record<Role,number>>={owner:2,manager:5,sales:5,worker:10};
export type Capability=
 |'money.costs'          // expenses, pay rates, labor cost, profit, Spending and Pay screens
 |'money.sales'          // project salesPriceCents / materialsPriceCents / laborPriceCents / salesNote
 |'team.admin'|'ask.admin'|'settings.admin'|'data.admin'
 |'project.review'       // sold -> scheduled, sold -> draft (send back)
 |'shift.approve'        // approve / reject / edit anyone's shift
 |'shift.enterForOthers' // attendance-grid rows for other people
 |'task.editDone'        // edit or reopen a done task outside the 10-minute undo window
 |'plan.others'          // edit another person's or a project's day list, set presence, answer questions
 |'equipment.admin'      // requires-sign-out flag, resolve broken reports
 |'facts.hidden'         // read facts with workerVisible=0
 |'template.manage'      // save project / task templates
 |'records.delete'       // delete anything into the Trash and restore from it; creators may delete their own unprocessed items
 |'records.bulkDelete'   // owner-only batch deletion with a reviewed preview (2026-09-29)
 |'translation.manage'   // glossary and translation corrections for everyone's records (2026-09-29)
 |'integration.admin'    // Camino work-feed tokens (2026-09-29)
 |'order.suggest';       // AI task-order proposals for a project (2026-09-29)
const OFFICE:readonly Role[]=['owner','manager','sales'];
export const CAPABILITIES:Readonly<Record<Capability,readonly Role[]>>={
 'money.costs':['owner'],'money.sales':OFFICE,'team.admin':['owner'],'ask.admin':['owner'],'settings.admin':['owner'],'data.admin':['owner'],
 'project.review':['owner','manager'],'shift.approve':['owner','manager'],'shift.enterForOthers':['owner','manager'],'task.editDone':['owner'],
 'plan.others':OFFICE,'equipment.admin':['owner','manager'],'facts.hidden':OFFICE,'template.manage':OFFICE,'records.delete':['owner','manager'],
 'records.bulkDelete':['owner'],'translation.manage':['owner','manager'],'integration.admin':['owner'],'order.suggest':OFFICE,
};
export function can(role:Role|string|undefined|null,capability:Capability):boolean {
 return !!role&&(CAPABILITIES[capability] as readonly string[]).includes(role);
}
export const isOfficeRole=(role:Role|string|undefined|null):boolean=>!!role&&(OFFICE as readonly string[]).includes(role);
/** Private journals belong only to the primary owner account. */
export const canAccessProjectJournals=(ownerId:string,userId:string,role:string|undefined):boolean=>role==='owner'&&userId===ownerId;
/** Command types that need a capability before the handler runs. Every other command is open to every signed-in role;
 * record-level rules live in the handlers. Keyed by string to avoid an import cycle with index.ts. */
export const COMMAND_CAPABILITY:Readonly<Record<string,Capability>>={
 'expense.create':'money.costs','expense.update':'money.costs','payRate.set':'money.costs','payRate.remove':'money.costs',
 'settings.update':'settings.admin',
 'shift.enter':'shift.enterForOthers','shift.approve':'shift.approve','shift.reject':'shift.approve',
 'dayList.setPresence':'plan.others',
 'equipment.setSignOutRequired':'equipment.admin','equipment.resolveReport':'equipment.admin',
 'projectTemplate.save':'template.manage','projectTemplate.fromProject':'template.manage','taskTemplate.saveTree':'template.manage','taskTemplate.updateTree':'template.manage','projectTemplate.update':'template.manage',
 'record.bulkDelete':'records.bulkDelete','record.bulkRestore':'records.delete','task.applyOrder':'order.suggest',
 'glossary.save':'translation.manage','glossary.remove':'translation.manage',
};
