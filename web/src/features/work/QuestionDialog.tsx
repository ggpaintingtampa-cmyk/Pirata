import type { RegisteredDialogProps } from '../../live/dialogRegistry';
import { WorkDialog } from '../tasks-time/WorkDialog';
import { EmptyState } from '../../components/EmptyState';
import { useT } from '../../i18n';
/** Stub dialog created by the foundation; opened from the Add menu; the owning chunk replaces it. */
export function QuestionDialog({onClose}:RegisteredDialogProps) { const t=useT(); return <WorkDialog title={t('shell.add.question')} onClose={onClose}><EmptyState>{t('shell.comingSoon')}</EmptyState></WorkDialog>; }
