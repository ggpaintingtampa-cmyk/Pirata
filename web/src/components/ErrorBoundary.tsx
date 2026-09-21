import { Component, type ErrorInfo, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Prototype rendering error', error, info.componentStack); }
  render() {
    return this.state.failed ? <main className="recovery card"><h1>Something interrupted the demo</h1><p>Your saved data has not been reset. Reload to try again.</p><button className="primary" onClick={() => window.location.reload()}>Reload</button></main> : this.props.children;
  }
}
