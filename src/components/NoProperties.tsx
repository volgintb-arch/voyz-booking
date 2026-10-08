import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { Icon } from './Icon';

/** A host without properties gets a way forward instead of an empty screen. */
export function NoProperties() {
  const { t } = useT();
  return (
    <div className="card accent center" style={{ alignItems: 'center' }}>
      <p className="strong">{t.host.noProperties}</p>
      <p className="muted small">{t.onboarding.intro}</p>
      <Link className="btn lime block" to="/host/new-property">
        <Icon name="plus" /> {t.onboarding.addProperty}
      </Link>
    </div>
  );
}
