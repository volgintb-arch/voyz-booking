import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { Icon } from './Icon';

/** "Как это работает?" next to a tricky feature → the article about it. */
export function HelpLink({ article }: { article: string }) {
  const { t } = useT();
  return (
    <Link className="helpLink" to={`/host/help/${article}`}>
      <Icon name="book" size={16} /> {t.help.how}
    </Link>
  );
}
