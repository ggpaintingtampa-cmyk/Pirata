import type { ModuleProps } from '../../services/moduleProps';
import { EmptyState } from '../../components/EmptyState';
import { useT } from '../../i18n';
/** Stub screen created by the foundation; the owning chunk replaces it. */
export function TemplatesView(props:ModuleProps) { void props; const t=useT(); return <section className="card"><EmptyState>{t('shell.comingSoon')}</EmptyState></section>; }
