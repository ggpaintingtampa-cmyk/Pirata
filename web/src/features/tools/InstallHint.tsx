import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { useT } from '../../i18n';
import '../materials/styles.css';
type BeforeInstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
/** "Install this app" hint for the Menu: uses the browser prompt when offered, otherwise explains the iPhone Share sheet (R-X-2). */
export function InstallHint() {
  const t = useT(), [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone] = useState(() => Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  useEffect(() => {
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as BeforeInstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', capture);
    return () => window.removeEventListener('beforeinstallprompt', capture);
  }, []);
  if (standalone) return null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return <div className="install-hint"><strong><Download size={15} aria-hidden="true" /> {t('shell.install.title')}</strong><p className="muted">{t('shell.install.hint')}</p>
    {prompt ? <button type="button" onClick={() => { void prompt.prompt().then(() => prompt.userChoice).then(() => setPrompt(null)); }}>{t('shell.install.button')}</button> : ios ? <p className="muted">{t('shell.install.ios')}</p> : null}</div>;
}
