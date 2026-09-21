import type { Material } from '@pirata/contracts/index';
import { parseQuantity } from '@pirata/domain/lib/money';
import type { ModuleProps } from '../../services/moduleProps';
import { RecordForm, type FormField } from './RecordForm';

export type InventoryMode = { type: 'material' | 'material-edit' | 'adjustment' | 'requirement' | 'requirement-remove' | 'equipment' | 'equipment-edit' | 'archive' | 'maintenance' | 'maintenance-edit' | 'complete'; id?: string; materialId?: string; equipmentId?: string };
const quantityError = (value: string, unit: Material['unit'], signed = false) => {
  const minor = parseQuantity(value);
  return minor === null || (!signed && minor < 0) || (signed && minor === 0) || (unit === 'piece' && minor % 100 !== 0)
    ? (unit === 'piece' ? 'Enter whole pieces' : 'Enter a quantity with at most two decimals') + (signed ? ', nonzero; use a minus sign to remove stock.' : ', zero or greater.') : '';
};
const quantityErrors = (values: Record<string, string>, names: string[], unit: Material['unit'], signed = false) => Object.fromEntries(names.flatMap(name => { const error = quantityError(values[name], unit, signed); return error ? [[name, error]] : []; }));
const projectOptions = (app: ModuleProps) => app.snapshot.projects.map(p => ({ value: p.id, label: p.name + (p.status === 'completed' ? ' (completed)' : '') }));

export function InventoryForm({ app, mode }: { app: ModuleProps; mode: InventoryMode }) {
  const material = app.snapshot.materials.find(m => m.id === (mode.materialId ?? mode.id));
  const equipment = app.snapshot.equipment.find(e => e.id === mode.id);
  const maintenance = app.snapshot.maintenance.find(m => m.id === mode.id);
  const requirement = app.snapshot.materialRequirements.find(r => r.id === mode.id);
  const done = app.onClose;
  if (mode.id && (
    (['material-edit', 'adjustment'].includes(mode.type) && !material) ||
    (['equipment-edit', 'archive'].includes(mode.type) && !equipment) ||
    (['maintenance-edit', 'complete'].includes(mode.type) && !maintenance) ||
    (['requirement', 'requirement-remove'].includes(mode.type) && !requirement)
  )) return <p>This record is unavailable. Close and refresh.</p>;
  if (mode.type === 'material-edit') {
    const fields: FormField[] = [{ name: 'name', label: 'Material name' }, { name: 'product', label: 'Product (optional)' }, { name: 'color', label: 'Color (optional)' }, { name: 'finish', label: 'Finish (optional)' }, { name: 'unit', label: 'Unit', type: 'select', options: [{ value: 'gal', label: 'Gallons' }, { value: 'piece', label: 'Pieces' }], hint: 'Units can change only before stock, requirements or history exist.' }];
    if (!material) fields.push({ name: 'stockMinor', label: 'Opening stock', hint: 'Gallons: up to two decimals. Pieces: whole numbers.' });
    return <RecordForm app={app} fields={fields} initial={{ name: material?.name ?? '', product: material?.product ?? '', color: material?.color ?? '', finish: material?.finish ?? '', unit: material?.unit ?? 'gal', stockMinor: '0' }} validate={v => material ? {} : quantityErrors(v, ['stockMinor'], v.unit as Material['unit'])} command={v => {
      const fields = { name: v.name, product: v.product, color: v.color, finish: v.finish, unit: v.unit as Material['unit'] };
      return material ? { type: 'material.update', id: material.id, ...fields } : { type: 'material.create', ...fields, stockMinor: parseQuantity(v.stockMinor)! };
    }} message={material ? 'Material updated.' : 'Material created.'} done={done} />;
  }
  if (mode.type === 'adjustment' && material) return <RecordForm app={app} initial={{ deltaMinor: '', reason: 'restock', note: '' }} fields={[{ name: 'deltaMinor', label: 'Stock change (' + (material.unit === 'gal' ? 'gallons' : 'pieces') + ')', hint: 'Use a negative quantity for usage. This adds to or subtracts from physical stock.' }, { name: 'reason', label: 'Reason', type: 'select', options: ['restock', 'usage', 'correction'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })) }, { name: 'note', label: 'Note (optional)', type: 'textarea' }]} validate={v => quantityErrors(v, ['deltaMinor'], material.unit, true)} command={v => ({ type: 'material.adjust', materialId: material.id, deltaMinor: parseQuantity(v.deltaMinor)!, reason: v.reason as 'restock' | 'usage' | 'correction', note: v.note })} message="Stock adjusted. History recorded." done={done}><p>Adjusting {material.name}. This does not record a purchase.</p></RecordForm>;
  if (mode.type === 'requirement' && material) return <RecordForm app={app} initial={{ projectId: requirement?.projectId ?? app.selection?.projectId ?? '', neededMinor: String((requirement?.neededMinor ?? 0) / 100), reservedMinor: String((requirement?.reservedMinor ?? 0) / 100) }} fields={[
    ...(!requirement ? [{ name: 'projectId', label: 'Project', type: 'select' as const, options: [{ value: '', label: 'Choose a project' }, ...projectOptions(app)] }] : []),
    { name: 'neededMinor', label: 'Needed (' + material.unit + ')' }, { name: 'reservedMinor', label: 'Reserved (' + material.unit + ')', hint: 'A reservation is included in physical stock, not added to it.' },
  ]} validate={v => {
    const errors = quantityErrors(v, ['neededMinor', 'reservedMinor'], material.unit);
    if (!v.projectId) errors.projectId = 'Choose a project.';
    if (!errors.neededMinor && !errors.reservedMinor && parseQuantity(v.reservedMinor)! > parseQuantity(v.neededMinor)!) errors.reservedMinor = 'Reserve no more than the amount needed.';
    return errors;
  }} command={v => ({ type: 'requirement.set', materialId: material.id, projectId: v.projectId, neededMinor: parseQuantity(v.neededMinor)!, reservedMinor: parseQuantity(v.reservedMinor)! })} message="Requirement and reservation saved." done={done}><p>{requirement ? 'Editing ' + app.snapshot.projects.find(p => p.id === requirement.projectId)?.name : 'One requirement per project. Saving an existing pair replaces its needed and reserved quantities.'}</p></RecordForm>;
  if (mode.type === 'requirement-remove' && requirement) return <RecordForm app={app} initial={{}} fields={[]} command={() => ({ type: 'requirement.remove', id: requirement.id })} message="Requirement removed. Reservation released." submitLabel="Remove requirement" done={done}><p>Remove this project requirement and release its reservation? Physical stock stays unchanged.</p></RecordForm>;
  if (mode.type === 'equipment-edit') return <RecordForm app={app} initial={{ name: equipment?.name ?? '', note: equipment?.note ?? '' }} fields={[{ name: 'name', label: 'Equipment name' }, { name: 'note', label: 'Note (optional)', type: 'textarea' }]} command={v => equipment ? { type: 'equipment.update', id: equipment.id, name: v.name, note: v.note } : { type: 'equipment.create', name: v.name, note: v.note }} message={equipment ? 'Equipment updated.' : 'Equipment created.'} done={done} />;
  if (mode.type === 'archive' && equipment) return <RecordForm app={app} initial={{}} fields={[]} command={() => ({ type: 'equipment.archive', id: equipment.id, archived: equipment.archivedAt === null })} message={equipment.archivedAt === null ? 'Equipment archived. History retained.' : 'Equipment restored.'} submitLabel={equipment.archivedAt === null ? 'Archive equipment' : 'Restore equipment'} done={done}><p>{equipment.name}: linked maintenance and history will remain available.</p></RecordForm>;
  if (mode.type === 'maintenance-edit') {
    const defaultEquipment = app.snapshot.equipment.find(e => e.id === mode.equipmentId);
    return <RecordForm app={app} initial={{ title: maintenance?.title ?? '', equipmentId: maintenance?.equipmentId ?? defaultEquipment?.id ?? '', equipmentName: maintenance?.equipmentName ?? defaultEquipment?.name ?? '', dueDate: maintenance?.dueDate ?? app.businessDate }} fields={[
      { name: 'title', label: 'Maintenance title' }, { name: 'equipmentId', label: 'Linked equipment (optional)', type: 'select', options: [{ value: '', label: 'No equipment link' }, ...app.snapshot.equipment.map(e => ({ value: e.id, label: e.name + (e.archivedAt !== null ? ' (archived)' : '') }))] }, { name: 'equipmentName', label: 'Equipment name / historical label', hint: 'Retained for history. For a new item, leave blank to use the linked equipment name.' }, { name: 'dueDate', label: 'Due date', type: 'date' },
    ]} command={v => {
      const fields = { title: v.title, equipmentId: v.equipmentId || null, equipmentName: v.equipmentName.trim() || app.snapshot.equipment.find(e => e.id === v.equipmentId)?.name || '', dueDate: v.dueDate };
      return maintenance ? { type: 'maintenance.update', id: maintenance.id, ...fields } : { type: 'maintenance.create', ...fields };
    }} message={maintenance ? 'Maintenance updated.' : 'Maintenance scheduled.'} done={done} />;
  }
  if (mode.type === 'complete' && maintenance) return <RecordForm app={app} initial={{}} fields={[]} command={() => ({ type: maintenance.completedAt === null ? 'maintenance.complete' : 'maintenance.reopen', id: maintenance.id })} message={maintenance.completedAt === null ? 'Maintenance completed.' : 'Maintenance reopened.'} submitLabel={maintenance.completedAt === null ? 'Complete maintenance' : 'Reopen maintenance'} done={done}><p>{maintenance.title} — {maintenance.completedAt === null ? 'Record completion now.' : 'Restore this item to the maintenance schedule.'}</p></RecordForm>;
  return <p>This record is unavailable. Close and refresh.</p>;
}
