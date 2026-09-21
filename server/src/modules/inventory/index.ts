import type { HandlerMap, HandlerResult, TransactionContext } from '../../core/context.js';
import { conflict, invalid } from '../../core/errors.js';
import { assertQuantity, assertReference } from '../../core/shared.js';

export const capability: 'blocked' | 'ready' = 'ready';
const record = (ctx: TransactionContext) => ({ id: ctx.newId(), createdAt: ctx.serverNow, updatedAt: ctx.serverNow });
const result = (kind: string, id: string, changed = true): HandlerResult => ({ changed, result: { kind, id } });
const differs = <T extends object>(previous: T, patch: Partial<T>) => (Object.keys(patch) as (keyof T)[]).some(key => previous[key] !== patch[key]);
// Compare sums exactly even at the safe-integer boundary; never round an overbooking down.
const reserved = (ctx: TransactionContext, materialId: string, exceptId?: string) => ctx.repo.list('material_requirements')
  .filter(r => r.materialId === materialId && r.id !== exceptId).reduce((sum, r) => sum + BigInt(r.reservedMinor), 0n);

export const handlers = {
  'material.create': (ctx, c) => {
    assertQuantity(c.unit, c.stockMinor);
    const { type: _, ...fields } = c; void _;
    const material = { ...record(ctx), ...fields };
    ctx.repo.insert('materials', material);
    if (c.stockMinor !== 0) ctx.repo.insert('material_adjustments', { ...record(ctx), materialId: material.id, deltaMinor: c.stockMinor, reason: 'correction', note: 'Opening stock' });
    return result('material', material.id);
  },
  'material.update': (ctx, c) => {
    const previous = ctx.repo.require('materials', c.id);
    if (c.unit !== previous.unit && (previous.stockMinor !== 0 || ctx.repo.list('material_adjustments').some(a => a.materialId === c.id) || ctx.repo.list('material_requirements').some(r => r.materialId === c.id))) {
      conflict('A material with stock, requirements or adjustment history cannot change units.', 'UNIT_HISTORY');
    }
    const { type: _, id, ...patch } = c; void _;
    const changed = differs(previous, patch);
    if (changed) ctx.repo.update('materials', id, { ...patch, updatedAt: ctx.serverNow });
    return result('material', id, changed);
  },
  'material.adjust': (ctx, c) => {
    const material = ctx.repo.require('materials', c.materialId);
    assertQuantity(material.unit, c.deltaMinor);
    const next = BigInt(material.stockMinor) + BigInt(c.deltaMinor);
    if (next < 0n || next > BigInt(Number.MAX_SAFE_INTEGER)) invalid('Stock must be a nonnegative safe quantity.', { deltaMinor: 'This adjustment would put stock outside the supported range.' });
    if (next < reserved(ctx, material.id)) conflict('Stock cannot fall below saved reservations. Release reservations explicitly first.', 'RESERVED_STOCK');
    ctx.repo.update('materials', material.id, { stockMinor: Number(next), updatedAt: ctx.serverNow });
    ctx.repo.insert('material_adjustments', { ...record(ctx), materialId: material.id, deltaMinor: c.deltaMinor, reason: c.reason, note: c.note });
    return result('material', material.id);
  },
  'requirement.set': (ctx, c) => {
    const material = ctx.repo.require('materials', c.materialId);
    assertReference(ctx, 'projects', c.projectId);
    assertQuantity(material.unit, c.neededMinor); assertQuantity(material.unit, c.reservedMinor);
    if (c.reservedMinor > c.neededMinor) invalid('Reserved quantity cannot exceed needed quantity.', { reservedMinor: 'Reserve no more than the amount needed.' });
    const previous = ctx.repo.list('material_requirements').find(r => r.materialId === c.materialId && r.projectId === c.projectId);
    if (reserved(ctx, c.materialId, previous?.id) + BigInt(c.reservedMinor) > BigInt(material.stockMinor)) conflict('There is not enough physical stock for this reservation.', 'RESERVED_STOCK');
    const patch = { neededMinor: c.neededMinor, reservedMinor: c.reservedMinor };
    if (previous) {
      const changed = differs(previous, patch);
      if (changed) ctx.repo.update('material_requirements', previous.id, { ...patch, updatedAt: ctx.serverNow });
      return result('requirement', previous.id, changed);
    }
    const requirement = { ...record(ctx), materialId: c.materialId, projectId: c.projectId, ...patch };
    ctx.repo.insert('material_requirements', requirement);
    return result('requirement', requirement.id);
  },
  'requirement.remove': (ctx, c) => {
    ctx.repo.remove('material_requirements', c.id);
    return result('requirement', c.id);
  },
  'equipment.create': (ctx, c) => {
    const equipment = { ...record(ctx), name: c.name, note: c.note, archivedAt: null };
    ctx.repo.insert('equipment', equipment);
    return result('equipment', equipment.id);
  },
  'equipment.update': (ctx, c) => {
    const previous = ctx.repo.require('equipment', c.id), patch = { name: c.name, note: c.note };
    const changed = differs(previous, patch);
    if (changed) ctx.repo.update('equipment', c.id, { ...patch, updatedAt: ctx.serverNow });
    return result('equipment', c.id, changed);
  },
  'equipment.archive': (ctx, c) => {
    const previous = ctx.repo.require('equipment', c.id), changed = (previous.archivedAt !== null) !== c.archived;
    if (changed) ctx.repo.update('equipment', c.id, { archivedAt: c.archived ? ctx.serverNow : null, updatedAt: ctx.serverNow });
    return result('equipment', c.id, changed);
  },
  'maintenance.create': (ctx, c) => {
    assertReference(ctx, 'equipment', c.equipmentId);
    const { type: _, ...fields } = c; void _;
    const maintenance = { ...record(ctx), ...fields, completedAt: null };
    ctx.repo.insert('maintenance_items', maintenance);
    return result('maintenance', maintenance.id);
  },
  'maintenance.update': (ctx, c) => {
    const previous = ctx.repo.require('maintenance_items', c.id);
    assertReference(ctx, 'equipment', c.equipmentId);
    const { type: _, id, ...patch } = c; void _;
    // Explicit fallback edits are allowed; clients send retained text on unrelated edits.
    const changed = differs(previous, patch);
    if (changed) ctx.repo.update('maintenance_items', id, { ...patch, updatedAt: ctx.serverNow });
    return result('maintenance', id, changed);
  },
  'maintenance.complete': (ctx, c) => {
    const previous = ctx.repo.require('maintenance_items', c.id), changed = previous.completedAt === null;
    if (changed) ctx.repo.update('maintenance_items', c.id, { completedAt: ctx.serverNow, updatedAt: ctx.serverNow });
    return result('maintenance', c.id, changed);
  },
  'maintenance.reopen': (ctx, c) => {
    const previous = ctx.repo.require('maintenance_items', c.id), changed = previous.completedAt !== null;
    if (changed) ctx.repo.update('maintenance_items', c.id, { completedAt: null, updatedAt: ctx.serverNow });
    return result('maintenance', c.id, changed);
  },
} satisfies Pick<HandlerMap, 'material.create' | 'material.update' | 'material.adjust' | 'requirement.set' | 'requirement.remove' | 'equipment.create' | 'equipment.update' | 'equipment.archive' | 'maintenance.create' | 'maintenance.update' | 'maintenance.complete' | 'maintenance.reopen'>;
