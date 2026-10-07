import { Link } from 'react-router-dom';
import { LangSwitch } from '../components/Layout';
import { useT } from '../i18n';

export function WelcomeScreen() {
  const { t } = useT();
  return (
    <div className="app">
      <main className="content" style={{ paddingTop: 'calc(24px + env(safe-area-inset-top))' }}>
        <div className="row between">
          <div className="logo">
            <img src="./icon.svg" alt="" width={40} height={40} />
            Voyz
          </div>
          <LangSwitch />
        </div>
        <div className="hero">
          <h1 style={{ fontSize: 28 }}>{t.welcome.tagline}</h1>
          <Link to="/guest" className="choice">
            <span className="ico" aria-hidden>
              ⛺
            </span>
            <span>
              <strong>{t.welcome.guest}</strong>
              <span className="muted">{t.welcome.guestHint}</span>
            </span>
          </Link>
          <Link to="/host" className="choice">
            <span className="ico" aria-hidden>
              🗝
            </span>
            <span>
              <strong>{t.welcome.host}</strong>
              <span className="muted">{t.welcome.hostHint}</span>
            </span>
          </Link>
        </div>
        <p className="muted small">{t.common.demo}</p>
      </main>
    </div>
  );
}
