import { Link, useParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Screen } from '../../components/Layout';
import { useT } from '../../i18n';

export function DoneScreen() {
  const { id = '' } = useParams();
  const { t } = useT();
  return (
    <Screen title={t.done.title}>
      <div className="card accent" style={{ alignItems: 'center', textAlign: 'center', padding: 28 }}>
        <span className="roundBtn lime" style={{ width: 84, height: 84 }} aria-hidden>
          <Icon name="check" size={40} />
        </span>
        <h2>{t.done.title}</h2>
        <p className="strong">{t.done.number(id)}</p>
        <p className="muted">{t.done.next}</p>
      </div>
      <div className="actions">
        <Link className="btn" to="/guest/trips">
          {t.done.toTrips}
        </Link>
        <Link className="btn lime" to="/guest">
          {t.done.toSearch}
        </Link>
      </div>
    </Screen>
  );
}
