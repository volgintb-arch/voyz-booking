import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { LANGS, useT } from '../i18n';
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
  end?: boolean;
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
  const { online } = useStore();
  const { t } = useT();
  return (
    <div className={`app${tabs ? ' withTabs' : ''}${bar ? ' withBar' : ''}`}>
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
      {!online && <div className="banner">{t.common.offline}</div>}
      <main className="content">{children}</main>
      {tabs && !bar && (
        <div className="tabbar">
          <nav>
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                aria-label={tab.label}
                title={tab.label}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <Icon name={tab.icon} size={28} />
              </NavLink>
            ))}
          </nav>
        </div>
      )}
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
