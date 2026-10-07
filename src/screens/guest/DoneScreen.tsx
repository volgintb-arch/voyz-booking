import { Link, useParams } from 'react-router-dom';
import { Screen } from '../../components/Layout';
import { useT } from '../../i18n';

export function DoneScreen() {
  const { id = '' } = useParams();
  const { t } = useT();
  return (
    <Screen title={t.done.title}>
      <div className="card" style={{ textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 48 }} aria-hidden>
          ✓
        </div>
        <h2>{t.done.title}</h2>
        <p className="strong">{t.done.number(id)}</p>
        <p className="muted">{t.done.next}</p>
      </div>
      <div className="actions">
        <Link className="btn" to="/guest/trips">
          {t.done.toTrips}
        </Link>
        <Link className="btn secondary" to="/guest">
          {t.done.toSearch}
        </Link>
      </div>
    </Screen>
  );
}
