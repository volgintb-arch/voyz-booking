import { Component, type ReactNode } from 'react';
import { DICTS } from '../i18n';

interface State {
  failed: boolean;
}

/** Any unexpected error shows a way back instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const lang = (document.documentElement.lang as keyof typeof DICTS) || 'ru';
    const t = (DICTS[lang] ?? DICTS.ru).common;
    return (
      <div className="app">
        <main className="content" style={{ paddingTop: 48, textAlign: 'center' }}>
          <h2>{t.crashed}</h2>
          <p className="muted">{t.crashedHint}</p>
          <button type="button" className="btn lime" onClick={() => window.location.reload()}>
            {t.reload}
          </button>
          <a className="btn outline" href="#/" onClick={() => setTimeout(() => window.location.reload(), 0)}>
            {t.toStart}
          </a>
        </main>
      </div>
    );
  }
}
