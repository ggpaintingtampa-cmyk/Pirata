import { useState } from 'react';
import { useApp } from '../../state/AppProvider';
import { titleSchema, dateSchema, moneyInputSchema } from '../../domain/schema';
import type { Expense } from '../../domain/types';
import { newId } from '../../lib/ids';
import { parseMoneyToCents } from '../../lib/money';
import { Field, FormFooter, fieldProps, useForm, type Errors } from './formUtils';
export function ExpenseForm({ recordId }: { recordId?: string }) {
  const { state, date, execute } = useApp();
  const existing = state!.expenses.find(e => e.id === recordId);
  const [id] = useState(() => existing?.id ?? newId());
  const [createdAt] = useState(() => existing?.createdAt ?? Date.now());
  const form = useForm({ description: existing?.description ?? '', amount: existing ? (existing.amountCents / 100).toFixed(2) : '', date: existing?.purchaseDate ?? date, category: existing?.category ?? 'materials', project: existing?.projectId ?? '' });
  const v = form.values;
  return <form noValidate onSubmit={event => {
    const errors: Errors = {};
    form.check('description', v.description, titleSchema, errors); form.check('amount', v.amount, moneyInputSchema, errors); form.check('date', v.date, dateSchema, errors);
    form.submit(event, errors, () => execute({ type: 'expense', expense: { id, createdAt, description: v.description.trim(), amountCents: parseMoneyToCents(v.amount)!, purchaseDate: v.date, category: v.category as Expense['category'], projectId: v.project || null } }, existing ? 'Expense updated.' : 'Expense added.'));
  }}>
    <Field name="description" label="Description" error={form.errors.description}><input {...fieldProps('description', form)} /></Field>
    <div className="form-grid"><Field name="amount" label="Amount ($)" error={form.errors.amount}><input {...fieldProps('amount', form)} inputMode="decimal" placeholder="0.00" /></Field><Field name="date" label="Purchase date" error={form.errors.date}><input {...fieldProps('date', form)} type="date" /></Field></div>
    <Field name="category" label="Category"><select {...fieldProps('category', form)}>{['materials', 'tools', 'fuel', 'maintenance', 'other'].map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}</select></Field>
    <Field name="project" label="Project"><select {...fieldProps('project', form)}><option value="">General business</option>{state!.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
    <p className="muted">Records spending only. Update stock separately.</p>
    <FormFooter form={form} label={existing ? 'Save expense' : 'Add expense'} />
  </form>;
}
