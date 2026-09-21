import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppProvider } from './state/AppProvider';
import { createAppStore } from './state/createAppStore';
import { localStorageRepository } from './data/localStorageRepository';
import { ErrorBoundary } from './components/ErrorBoundary';
import { createBusinessService } from './services/api';
import { createServerStore } from './state/serverStore';
import { ServerProvider } from './state/serverProvider';
import { LiveApp } from './live/LiveApp';
import './styles/tokens.css';
import './styles/global.css';
import './styles/app.css';
import './live/live.css';
import './styles/redesign.css';
import './styles/figma.css';
const root=createRoot(document.getElementById('root')!);
if(new URLSearchParams(window.location.search).get('demo')==='1'){
 const store=createAppStore(localStorageRepository());store.initialize();
 if(import.meta.hot)import.meta.hot.dispose(()=>store.dispose());
 root.render(<StrictMode><ErrorBoundary><AppProvider store={store}><App/></AppProvider></ErrorBoundary></StrictMode>);
}else{
 const store=createServerStore(createBusinessService());void store.initialize();
 root.render(<StrictMode><ErrorBoundary><ServerProvider store={store}><LiveApp/></ServerProvider></ErrorBoundary></StrictMode>);
}
