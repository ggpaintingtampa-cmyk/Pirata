import { useState } from 'react';
import { z } from 'zod';
import { useApp } from '../../state/AppProvider';
import { nameSchema, titleSchema, emailSchema, dateSchema } from '../../domain/schema';
import { newId } from '../../lib/ids';
import { Field, FormFooter, fieldProps, useForm, type Errors } from './formUtils';
export function LeadForm() {
  const { execute } = useApp(); const [id] = useState(newId);
  const form = useForm({ name: '', phone: '', email: '', description: '', followup: '' }); const v = form.values;
  return <form noValidate onSubmit={event => {
    const errors: Errors = {};
    form.check('name', v.name, nameSchema, errors); form.check('phone', v.phone.trim(), z.string().max(100, 'Use 100 characters or fewer.'), errors); form.check('email', v.email.trim(), emailSchema, errors); form.check('description', v.description, titleSchema, errors);
    if (v.followup) form.check('followup', v.followup, dateSchema, errors);
    form.submit(event, errors, () => execute({ type: 'lead', lead: { id, name: v.name.trim(), phone: v.phone.trim(), email: v.email.trim(), workDescription: v.description.trim(), nextFollowUpDate: v.followup || null, followUps: [] } }, 'Lead added: ' + v.name.trim() + '. Saved in this browser.'));
  }}>
    <Field name="name" label="Name" error={form.errors.name}><input {...fieldProps('name', form)} autoComplete="name" /></Field>
    <Field name="phone" label="Phone (optional)" error={form.errors.phone}><input {...fieldProps('phone', form)} type="tel" autoComplete="tel" /></Field>
    <Field name="email" label="Email (optional)" error={form.errors.email}><input {...fieldProps('email', form)} type="email" autoComplete="email" /></Field>
    <Field name="description" label="Work description" error={form.errors.description}><textarea {...fieldProps('description', form)} rows={3} /></Field>
    <Field name="followup" label="Follow-up date (optional)" error={form.errors.followup}><input {...fieldProps('followup', form)} type="date" /></Field>
    <FormFooter form={form} label="Add lead" />
  </form>;
}
