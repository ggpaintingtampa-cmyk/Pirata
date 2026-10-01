import { lazy, type ComponentType } from 'react';
import type { ModuleProps } from '../services/moduleProps';
/** Dialogs owned by chunks but opened from the shell's Add menu. Each chunk fills its own component; the shell never changes. */
export interface RegisteredDialogProps {app:ModuleProps;projectId?:string;taskId?:string;/** P04: a calendar day or a person to prefill (hours dialog). */date?:string;userId?:string;onClose():void;onDone():void}
export type RegisteredDialogName='material-request'|'shift'|'tool-signout'|'question'|'project-new';
export const dialogRegistry:Record<RegisteredDialogName,ComponentType<RegisteredDialogProps>>={
  'material-request':lazy(()=>import('../features/materials/RequestDialog').then(m=>({default:m.RequestDialog}))),
  'shift':lazy(()=>import('../features/hours/ShiftDialog').then(m=>({default:m.ShiftDialog}))),
  'tool-signout':lazy(()=>import('../features/tools/SignOutDialog').then(m=>({default:m.SignOutDialog}))),
  'question':lazy(()=>import('../features/work/QuestionDialog').then(m=>({default:m.QuestionDialog}))),
  'project-new':lazy(()=>import('../features/sales/CaptureFlow').then(m=>({default:m.CaptureDialog}))),
};
