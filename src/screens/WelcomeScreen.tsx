import { Link } from 'react-router-dom';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/Layout';
import { apiMode, call, hostToken } from '../api/client';
import { useStore } from '../data/store';
import { useT } from '../i18n';

export function WelcomeScreen() {
  const { t } = useT();
  const { state, reset } = useStore();
  const signedIn = apiMode && hostToken.get() !== null;
  const logout = async () => {
    await call('POST', 'api/auth/logout', {}, { auth: true }).catch(() => undefined);
    hostToken.set(null);
    reset();
  };
  return (
    <div className="app">
      <header className="header">
        <span className="spacer" />
        <h1>Voyz</h1>
        <LangSwitch />
      </header>
      <main className="content">
        <div className="hero">
          <Cover kind="yurt_camp" hue={165} />
          <div className="wordmark">
            VOYZ
            <small>booking</small>
          </div>
        </div>
        <Link to="/guest" className="promo">
          <strong>
            {t.welcome.guest}
            <span className="muted">{t.welcome.guestHint}</span>
          </strong>
          <span className="roundBtn lime">
            <Icon name="search" />
          </span>
        </Link>
        <Link to="/host" className="promo">
          <strong>
            {t.welcome.host}
            <span className="muted">{t.welcome.hostHint}</span>
          </strong>
          <span className="roundBtn lime">
            <Icon name="grid" />
          </span>
        </Link>
        <div className="darkBand">
          <h2>
            {t.welcome.bandTitle}
            <em>{t.welcome.bandAccent}</em>
          </h2>
          <p>{t.welcome.bandText}</p>
        </div>
        {signedIn && (
          <div className="accountStrip">
            <span>
              {t.settings.signedInShort} <b>{state.host?.name ?? ''}</b>
            </span>
            <button type="button" className="btn small outline" onClick={logout}>
              {t.settings.logout}
            </button>
          </div>
        )}
        {!apiMode && <p className="muted small center">{t.common.demo}</p>}
      </main>
    </div>
  );
}
