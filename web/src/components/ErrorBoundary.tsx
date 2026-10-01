import { Component, type ErrorInfo, type ReactNode } from 'react';
import { tx } from '../i18n';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Prototype rendering error', error, info.componentStack); }
  render() {
    return this.state.failed ? <main className="recovery card"><h1>{tx('Something interrupted the app')}</h1><p>{tx('Your saved data has not been reset. Reload to try again.')}</p><button className="primary" onClick={() => window.location.reload()}>{tx('Reload')}</button></main> : this.props.children;
  }
}
