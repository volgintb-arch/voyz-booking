import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Screen } from '../../components/Layout';
import { ARTICLES, articleById, type Block } from '../../help/articles';
import { useT } from '../../i18n';
import { hostTabs } from './tabs';

const TONES = ['paid', 'confirmed', 'pending', 'stay', 'ical', 'closed'] as const;

/** Настройки → Обучение: the list of articles. */
export function HelpScreen() {
  const { t } = useT();
  return (
    <Screen title={t.help.title} back="/host/settings" tabs={hostTabs(t)}>
      <p className="muted">{t.help.subtitle}</p>
      {t.help.ruOnly && <p className="muted small">{t.help.ruOnly}</p>}
      <div className="stack">
        {ARTICLES.map((a) => (
          <Link key={a.id} to={`/host/help/${a.id}`} className="articleCard">
            <span className="roundBtn lime small" aria-hidden>
              <Icon name={a.icon} size={20} />
            </span>
            <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
              <b>{a.title}</b>
              <span className="muted small">{a.summary}</span>
            </span>
            <span className="tag">{t.help.minutes(a.minutes)}</span>
          </Link>
        ))}
      </div>
    </Screen>
  );
}

export function ArticleScreen() {
  const { id = '' } = useParams();
  const { t } = useT();
  const navigate = useNavigate();
  const article = articleById(id);
  if (!article) {
    return (
      <Screen title={t.help.title} back="/host/help" tabs={hostTabs(t)}>
        <Link to="/host/help">{t.help.all}</Link>
      </Screen>
    );
  }
  const next = ARTICLES[ARTICLES.indexOf(article) + 1];

  const block = (b: Block, i: number) => {
    switch (b.type) {
      case 'p':
        return <p key={i}>{b.text}</p>;
      case 'h':
        return <h3 key={i}>{b.text}</h3>;
      case 'steps':
        return (
          <ol key={i} className="steps">
            {b.items.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        );
      case 'list':
        return (
          <ul key={i}>
            {b.items.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        );
      case 'tip':
        return (
          <p key={i} className="note tip">
            {b.text}
          </p>
        );
      case 'warn':
        return (
          <p key={i} className="note warn">
            {b.text}
          </p>
        );
      case 'legend':
        return (
          <div key={i} className="legend">
            {TONES.map((tone) => (
              <span key={tone}>
                <i className={`bar ${tone}`} />
                {t.host.legend[tone]}
              </span>
            ))}
          </div>
        );
      case 'action':
        return (
          <button key={i} type="button" className="btn lime block" onClick={() => navigate(b.to)}>
            {b.label}
          </button>
        );
    }
  };

  return (
    <Screen title={t.help.title} back="/host/help" tabs={hostTabs(t)}>
      <article className="article">
        <span className="muted small">
          {t.help.minutes(article.minutes)} · {article.summary}
        </span>
        <h2>{article.title}</h2>
        {article.blocks.map(block)}
      </article>
      {next ? (
        <Link to={`/host/help/${next.id}`} className="articleCard">
          <span className="stack" style={{ gap: 2, flex: 1 }}>
            <span className="muted small">{t.help.next}</span>
            <b>{next.title}</b>
          </span>
          <Icon name="chevron" />
        </Link>
      ) : (
        <Link to="/host/help" className="btn outline block">
          {t.help.all}
        </Link>
      )}
    </Screen>
  );
}
