import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { LANGS, useT } from '../i18n';
import { isEmbedded } from '../share/links';
import { Icon, type IconName } from './Icon';

/** Round button that cycles ru → ky → en. */
export function LangSwitch() {
  const { lang, setLang, t } = useT();
  const i = LANGS.findIndex((l) => l.code === lang);
  const next = LANGS[(i + 1) % LANGS.length]!;
  return (
    <button type="button" className="roundBtn langBtn" aria-label={t.common.language} onClick={() => setLang(next.code)}>
      {lang}
    </button>
  );
}

export interface Tab {
  to: string;
  icon: IconName;
  label: string;
  /** Label under the icon on phones, when the full one does not fit. */
  short?: string;
  end?: boolean;
  /** Nested screens of this section: the tab stays highlighted there. */
  also?: string[];
}

function tabActive(tab: Tab, path: string): boolean {
  if (tab.end ? path === tab.to : path === tab.to || path.startsWith(`${tab.to}/`)) return true;
  return (tab.also ?? []).some((p) => path.startsWith(p));
}

interface ScreenProps {
  title: string;
  back?: string | true;
  tabs?: Tab[];
  /** Fixed bar at the bottom instead of the tab bar (price + "Book"). */
  bar?: ReactNode;
  children: ReactNode;
}

export function Screen({ title, back, tabs, bar, children }: ScreenProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { online } = useStore();
  const { t } = useT();
  // Inside the site widget there is no app around the booking flow.
  const embedded = isEmbedded();
  if (embedded) tabs = undefined;
  return (
    <div className={`app${tabs ? ' withTabs' : ''}${bar ? ' withBar' : ''}${embedded ? ' embedded' : ''}`}>
      <header className="header">
        {back ? (
          <button
            type="button"
            className="roundBtn"
            aria-label={t.common.back}
            onClick={() => (back === true ? navigate(-1) : navigate(back))}
          >
            <Icon name="back" />
          </button>
        ) : (
          <span className="spacer" />
        )}
        <h1>{title}</h1>
        <LangSwitch />
      </header>
      {tabs && !bar && (
        <div className="tabbar">
          <nav>
            {tabs.map((tab) => {
              const active = tabActive(tab, pathname);
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  aria-label={tab.label}
                  aria-current={active ? 'page' : undefined}
                  title={tab.label}
                  data-short={tab.short ?? tab.label}
                  className={active ? 'active' : ''}
                >
                  <Icon name={tab.icon} size={26} />
                </Link>
              );
            })}
          </nav>
        </div>
      )}
      {!online && <div className="banner">{t.common.offline}</div>}
      <main className="content">{children}</main>
      {bar && (
        <div className="bookbar">
          <div>{bar}</div>
        </div>
      )}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function SectionHead({ children }: { children: ReactNode }) {
  return <h2 className="section-head">{children}</h2>;
}

/** Voyz accordion row: icon, label, chevron. */
export function AccRow({ icon, title, open, children }: { icon: IconName; title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="acc" open={open}>
      <summary>
        <Icon name={icon} size={26} />
        <span>{title}</span>
        <span className="chev">
          <Icon name="down" />
        </span>
      </summary>
      <div className="accBody">{children}</div>
    </details>
  );
}
