import { Component, type ErrorInfo, type ReactNode } from 'react';
import ErrorState from './ErrorState';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// App-wide safety net (spec "MARTIALDEX 긴급 안정화" section 4/30-A) — before
// this, the app had ZERO error boundaries anywhere, so any single uncaught
// render exception (confirmed live for a corrupted sparring run, but the
// same is true for any other page) unmounted the entire React tree with no
// fallback, no message, nothing — a fully blank screen. This wraps the whole
// route tree once, reusing the existing ErrorState UI rather than a new
// design, and never swallows the error silently (logged via
// console.error so it's still visible during development/QA).
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary] uncaught render error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page">
          <div className="container">
            <ErrorState
              text="문제가 발생했습니다. 화면을 표시할 수 없습니다."
              onRetry={() => {
                this.setState({ error: null });
                window.location.hash = '#/';
              }}
            />
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
