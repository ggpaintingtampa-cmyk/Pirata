import { useState } from 'react';
import { useApp } from '../../state/AppProvider';
import { noteSchema, quantityInputSchema } from '../../domain/schema';
import type { MaterialAdjustment } from '../../domain/types';
import { newId } from '../../lib/ids';
import { parseQuantity } from '../../lib/money';
import { quantityLabel } from '../../domain/selectors';
import { Field, FormFooter, fieldProps, useForm, type Errors } from './formUtils';
export function MaterialAdjustmentForm({ materialId }: { materialId?: string }) {
  const { state, execute } = useApp();
  const [id] = useState(newId);
  const form = useForm({ material: materialId ?? state!.materials[0]?.id ?? '', quantity: '', reason: 'restock', note: '' });
  const v = form.values, material = state!.materials.find(m => m.id === v.material);
  return <form noValidate onSubmit={event => {
    const errors: Errors = {}; const delta = parseQuantity(v.quantity);
    form.check('quantity', v.quantity, quantityInputSchema, errors); form.check('note', v.note, noteSchema, errors);
    if (!material) errors.material = 'Choose a material.';
    if (material && delta !== null) {
      const reserved = state!.materialRequirements.filter(r => r.materialId === material.id).reduce((sum, r) => sum + r.reservedMinor, 0);
      if (material.unit === 'piece' && delta % 100) errors.quantity = 'Pieces require whole units.';
      else if (material.stockMinor + delta < 0) errors.quantity = 'Stock cannot be negative.';
      else if (material.stockMinor + delta < reserved) errors.quantity = 'Stock cannot fall below existing reservations (' + quantityLabel(reserved, material.unit) + ').';
    }
    form.submit(event, errors, () => execute({ type: 'materialAdjustment', adjustment: { id, materialId: v.material, deltaMinor: delta!, reason: v.reason as MaterialAdjustment['reason'], note: v.note.trim(), createdAt: Date.now() } }, 'Material quantity updated. Spending is unchanged.'));
  }}>
    <Field name="material" label="Material" error={form.errors.material}><select {...fieldProps('material', form)}>{state!.materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
    {material && <p className="info-panel">In stock: <strong>{quantityLabel(material.stockMinor, material.unit)}</strong></p>}
    <Field name="quantity" label={'Quantity adjustment (' + (material?.unit === 'gal' ? 'gallons' : 'pieces') + ')'} hint="Use a positive number to add stock or a minus sign to remove it." error={form.errors.quantity}><input {...fieldProps('quantity', form)} inputMode="text" placeholder="+3" /></Field>
    <Field name="reason" label="Reason"><select {...fieldProps('reason', form)}><option value="restock">Restock</option><option value="usage">Usage</option><option value="correction">Correction</option></select></Field>
    <Field name="note" label="Note (optional)" error={form.errors.note}><textarea {...fieldProps('note', form)} rows={3} /></Field>
    <p className="muted">Adjustments change quantities only. Add an expense separately for a purchase.</p><FormFooter form={form} label="Save adjustment" />
  </form>;
}
