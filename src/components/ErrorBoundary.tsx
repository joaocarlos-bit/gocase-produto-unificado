import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; label?: string; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: 'var(--red, #ef4444)' }}>
          <strong>{this.props.label ?? 'Erro ao renderizar tela'}</strong>
          <pre style={{ marginTop: 12, fontSize: 11, whiteSpace: 'pre-wrap', opacity: 0.7 }}>
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
