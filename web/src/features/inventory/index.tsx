import { useState } from 'react';
import { toLegacyState } from '@pirata/contracts/compatibility';
import { materialShortages, quantityLabel } from '@pirata/domain/domain/selectors';
import type { ModuleProps } from '../../services/moduleProps';
import { InventoryForm, type InventoryMode } from './forms';
import { RecordModal } from './RecordModal';
import './styles.css';
import { EquipmentCleanup, CleanupPanel } from '../collaboration';

const titleFor = (mode: InventoryMode) => ({ material: 'Material details', 'material-edit': mode.id ? 'Edit material' : 'Add material', adjustment: 'Adjust stock', requirement: 'Project requirement', 'requirement-remove': 'Remove requirement', equipment: 'Equipment details', 'equipment-edit': mode.id ? 'Edit equipment' : 'Add equipment', archive: 'Equipment archive', maintenance: 'Maintenance details', 'maintenance-edit': mode.id ? 'Edit maintenance' : 'Add maintenance', complete: 'Maintenance status' })[mode.type];
function MaterialContent({ app, id, navigate }: { app: ModuleProps; id?: string; navigate(mode: InventoryMode): void }) {
  const material = app.snapshot.materials.find(m => m.id === id);
  if (!material) return <p>Material unavailable.</p>;
  const requirements = app.snapshot.materialRequirements.filter(r => r.materialId === id), reserved = requirements.reduce((sum, r) => sum + r.reservedMinor, 0);
  const shortages = materialShortages(toLegacyState(app.snapshot)).filter(r => r.materialId === id);
  const history = app.snapshot.materialAdjustments.filter(a => a.materialId === id).sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  return <div className="iv-details"><h3>{material.name}</h3><p>{[material.product, material.color, material.finish].filter(Boolean).join(' · ') || 'No product details recorded.'}</p>
    <dl className="iv-metrics"><div><dt>Physical stock</dt><dd>{quantityLabel(material.stockMinor, material.unit)}</dd></div><div><dt>Reserved</dt><dd>{quantityLabel(reserved, material.unit)}</dd></div><div><dt>Free</dt><dd>{quantityLabel(material.stockMinor - reserved, material.unit)}</dd></div></dl>
    <div className="iv-actions"><button data-navigate onClick={() => navigate({ type: 'material-edit', id })}>Edit material</button><button data-navigate className="primary" onClick={() => navigate({ type: 'adjustment', id })}>Adjust stock</button></div>
    <h3>Project requirements</h3><p>Free stock is allocated in saved project order for this preview. Allocation is not a saved reservation.</p>
    <ul className="iv-records">{requirements.map(r => { const shortage = shortages.find(s => s.requirementId === r.id); return <li key={r.id}><strong>{app.snapshot.projects.find(p => p.id === r.projectId)?.name}</strong><p>Needed {quantityLabel(r.neededMinor, material.unit)} · Reserved {quantityLabel(r.reservedMinor, material.unit)}</p><p className={shortage ? 'iv-warning' : ''}>{shortage ? 'Shortage: ' + quantityLabel(shortage.missingMinor, material.unit) : 'No shortage'}</p><div className="iv-actions"><button data-navigate onClick={() => navigate({ type: 'requirement', id: r.id, materialId: id })}>Edit requirement</button><button data-navigate onClick={() => navigate({ type: 'requirement-remove', id: r.id })}>Remove requirement</button><button data-navigate onClick={() => app.onOpenProject(r.projectId)}>Open project</button></div></li>; })}</ul>
    {!requirements.length && <p>No project requirements.</p>}<button data-navigate onClick={() => navigate({ type: 'requirement', materialId: id })}>Add requirement</button>
    <h3>Adjustment history</h3><p>History is permanent. Record a new correction to fix stock.</p><ul className="iv-history">{history.map(a => <li key={a.id}><strong>{a.deltaMinor > 0 ? '+' : ''}{quantityLabel(a.deltaMinor, material.unit)} · {a.reason}</strong><time>{new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }).format(a.createdAt)}</time><p>{a.note || 'No note'}</p></li>)}</ul>{!history.length && <p>No adjustments yet.</p>}
  </div>;
}
function EquipmentContent({ app, id, navigate }: { app: ModuleProps; id?: string; navigate(mode: InventoryMode): void }) {
  const equipment = app.snapshot.equipment.find(e => e.id === id);
  if (!equipment) return <p>Equipment unavailable.</p>;
  return <div className="iv-details"><h3>{equipment.name}</h3><p>{equipment.archivedAt === null ? 'Active equipment' : 'Archived — history retained'}</p><p className="iv-note">{equipment.note || 'No note'}</p><div className="iv-actions"><button data-navigate onClick={() => navigate({ type: 'equipment-edit', id })}>Edit equipment</button><button data-navigate onClick={() => navigate({ type: 'archive', id })}>{equipment.archivedAt === null ? 'Archive equipment' : 'Restore equipment'}</button><button data-navigate onClick={() => navigate({ type: 'maintenance-edit', equipmentId: id })}>Add maintenance</button></div><EquipmentCleanup app={app} equipmentId={equipment.id} /><h3>Maintenance history</h3><ul className="iv-records">{app.snapshot.maintenance.filter(m => m.equipmentId === id).map(m => <li key={m.id}><button data-navigate onClick={() => navigate({ type: 'maintenance', id: m.id })}>{m.title} · {m.completedAt === null ? 'Due ' + m.dueDate : 'Completed'}</button></li>)}</ul></div>;
}
function MaintenanceContent({ app, id, navigate }: { app: ModuleProps; id?: string; navigate(mode: InventoryMode): void }) {
  const item = app.snapshot.maintenance.find(m => m.id === id);
  if (!item) return <p>Maintenance unavailable.</p>;
  const equipment = app.snapshot.equipment.find(e => e.id === item.equipmentId);
  return <div className="iv-details"><h3>{item.title}</h3><p>{equipment?.name ?? item.equipmentName}{equipment?.archivedAt != null ? ' (archived)' : ''}</p><p>Historical label: {item.equipmentName}</p><p>Due {item.dueDate}</p><p className={item.completedAt === null && item.dueDate <= app.businessDate ? 'iv-warning' : ''}>{item.completedAt !== null ? 'Completed ' + new Date(item.completedAt).toLocaleString('en-US', { timeZone: 'America/New_York' }) : item.dueDate <= app.businessDate ? 'Needs attention' : 'Upcoming'}</p><div className="iv-actions"><button data-navigate onClick={() => navigate({ type: 'maintenance-edit', id })}>Edit maintenance</button><button data-navigate className="primary" onClick={() => navigate({ type: 'complete', id })}>{item.completedAt === null ? 'Complete maintenance' : 'Reopen maintenance'}</button></div></div>;
}
function InventoryDialog({ app, initial }: { app: ModuleProps; initial: InventoryMode }) {
  const [mode, navigate] = useState(initial);
  const key = [mode.type, mode.id, mode.materialId, mode.equipmentId].join(':');
  return <RecordModal title={titleFor(mode)} onClose={app.onClose}>{mode.type === 'material' ? <MaterialContent app={app} id={mode.id} navigate={navigate} /> : mode.type === 'equipment' ? <EquipmentContent app={app} id={mode.id} navigate={navigate} /> : mode.type === 'maintenance' ? <MaintenanceContent app={app} id={mode.id} navigate={navigate} /> : <InventoryForm key={key} app={app} mode={mode} />}</RecordModal>;
}
export function MaterialDetail(app: ModuleProps) { return <InventoryDialog app={app} initial={{ type: 'material', id: app.selection?.materialId }} />; }
export function MaintenanceDetail(app: ModuleProps) { return <InventoryDialog app={app} initial={{ type: 'maintenance', id: app.selection?.maintenanceId }} />; }
export function InventoryView(app: ModuleProps) {
  const [search, setSearch] = useState(''), [tab, setTab] = useState<'materials' | 'equipment' | 'maintenance'>('materials');
  const [mode, setMode] = useState<InventoryMode | null>(() => app.selection?.materialId ? { type: 'material', id: app.selection.materialId } : app.selection?.equipmentId ? { type: 'equipment', id: app.selection.equipmentId } : app.selection?.maintenanceId ? { type: 'maintenance', id: app.selection.maintenanceId } : null);
  const [maintenanceFilter, setMaintenanceFilter] = useState('open');
  const match = (text: string) => text.toLowerCase().includes(search.trim().toLowerCase());
  const materials = app.snapshot.materials.filter(m => match([m.name, m.product, m.color, m.finish].join(' ')));
  const equipment = app.snapshot.equipment.filter(e => match(e.name + ' ' + e.note));
  const maintenance = app.snapshot.maintenance.filter(m => match(m.title + ' ' + (app.snapshot.equipment.find(e => e.id === m.equipmentId)?.name ?? m.equipmentName)) && (maintenanceFilter === 'all' || (maintenanceFilter === 'completed' ? m.completedAt !== null : m.completedAt === null && (maintenanceFilter !== 'due' || m.dueDate <= app.businessDate)))).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  const shortages = materialShortages(toLegacyState(app.snapshot));
  return <section className="iv-module" aria-label="Inventory"><header className="iv-header"><div><p className="iv-eyebrow">STOCK & UPKEEP</p><h2>Inventory</h2><p>Know what is ready for the next job.</p></div><button className="primary" onClick={() => setMode({ type: tab === 'materials' ? 'material-edit' : tab === 'equipment' ? 'equipment-edit' : 'maintenance-edit' })}>{tab === 'materials' ? 'Add material' : tab === 'equipment' ? 'Add equipment' : 'Add maintenance'}</button></header>
    <div className="iv-tabs" aria-label="Inventory sections">{(['materials', 'equipment', 'maintenance'] as const).map(value => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
    <label className="iv-search">Search inventory<input value={search} onChange={e => setSearch(e.target.value)} type="search" /></label>
    {tab === 'materials' && <><ul className="iv-grid">{materials.map(m => { const reserved = app.snapshot.materialRequirements.filter(r => r.materialId === m.id).reduce((sum, r) => sum + r.reservedMinor, 0); const missing = shortages.filter(r => r.materialId === m.id); return <li className="iv-card" key={m.id}><h3>{m.name}</h3><p>{[m.product, m.color, m.finish].filter(Boolean).join(' · ')}</p><dl className="iv-metrics"><div><dt>Stock</dt><dd>{quantityLabel(m.stockMinor, m.unit)}</dd></div><div><dt>Reserved</dt><dd>{quantityLabel(reserved, m.unit)}</dd></div><div><dt>Free</dt><dd>{quantityLabel(m.stockMinor - reserved, m.unit)}</dd></div></dl><p className={missing.length ? 'iv-warning' : ''}>{missing.length ? 'Shortage on ' + missing.length + ' project(s)' : 'No shortages'}</p><button onClick={() => setMode({ type: 'material', id: m.id })}>View {m.name}</button></li>; })}</ul>{!materials.length && <p className="iv-empty">No materials found. Add material to start tracking stock.</p>}</>}
    {tab === 'equipment' && <><ul className="iv-grid">{equipment.map(e => <li className="iv-card" key={e.id}><h3>{e.name}</h3><p>{e.archivedAt === null ? 'Active' : 'Archived'}</p><p className="iv-note">{e.note || 'No note'}</p><button onClick={() => setMode({ type: 'equipment', id: e.id })}>View {e.name}</button></li>)}</ul>{!equipment.length && <p className="iv-empty">No equipment found.</p>}</>}
    {tab === 'maintenance' && <><CleanupPanel app={app} /><label>Maintenance filter<select value={maintenanceFilter} onChange={e => setMaintenanceFilter(e.target.value)}><option value="open">All incomplete</option><option value="due">Due today or overdue</option><option value="completed">Completed</option><option value="all">All history</option></select></label><ul className="iv-records">{maintenance.map(m => <li key={m.id}><h3>{m.title}</h3><p>{app.snapshot.equipment.find(e => e.id === m.equipmentId)?.name ?? m.equipmentName}</p><p>Due {m.dueDate} · {m.completedAt !== null ? 'Completed' : m.dueDate <= app.businessDate ? 'Needs attention' : 'Upcoming'}</p><button onClick={() => setMode({ type: 'maintenance', id: m.id })}>View {m.title}</button></li>)}</ul>{!maintenance.length && <p className="iv-empty">No maintenance matches this filter.</p>}</>}
    {mode && <InventoryDialog app={{ ...app, onClose: () => setMode(null) }} initial={mode} />}
  </section>;
}
