import { Link } from 'react-router-dom';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/Layout';
import { useT } from '../i18n';

export function WelcomeScreen() {
  const { t } = useT();
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
        <p className="muted small center">{t.common.demo}</p>
      </main>
    </div>
  );
}
