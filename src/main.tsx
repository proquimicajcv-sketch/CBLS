import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerServiceWorker } from './utils/registerSw';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  public state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Fallo inesperado en la interfaz de campo.',
    };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Bitácora CBLS ErrorBoundary:', error, info);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex min-h-dvh flex-col items-center justify-center bg-background p-6 text-center text-foreground"
        >
          <div className="max-w-md space-y-4 rounded-card border border-border bg-surface p-6">
            <h1 className="text-xl font-semibold text-foreground">
              Interrupción temporal en Bitácora CBLS
            </h1>
            <p className="text-sm text-muted">
              Tus datos de campo permanecen resguardados en la memoria local del dispositivo ({this.state.message}).
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-12 items-center justify-center rounded-control bg-primary px-5 text-sm font-semibold text-primary-foreground"
            >
              Recargar plataforma
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
