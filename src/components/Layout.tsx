import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { LANGS, useT } from '../i18n';
import { Icon, type IconName } from './Icon';

export function LangSwitch() {
  const { lang, setLang } = useT();
  return (
    <div className="langs" role="group">
      {LANGS.map((l) => (
        <button key={l.code} type="button" aria-pressed={lang === l.code} onClick={() => setLang(l.code)}>
          {l.label}
        </button>
      ))}
    </div>
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
  children: ReactNode;
}

export function Screen({ title, back, tabs, children }: ScreenProps) {
  const navigate = useNavigate();
  const { online } = useStore();
  const { t } = useT();
  return (
    <div className={`app${tabs ? ' withTabs' : ''}`}>
      <header className="header">
        {back && (
          <button
            type="button"
            className="iconBtn"
            aria-label={t.common.back}
            onClick={() => (back === true ? navigate(-1) : navigate(back))}
          >
            ←
          </button>
        )}
        <h1>{title}</h1>
        <LangSwitch />
      </header>
      {!online && <div className="banner">{t.common.offline}</div>}
      <main className="content">{children}</main>
      {tabs && (
        <div className="tabbar">
          <nav>
            {tabs.map((tab) => (
              <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                <Icon name={tab.icon} />
                {tab.label}
              </NavLink>
            ))}
          </nav>
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
