import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DateRange } from '../../components/DateRange';
import { Icon } from '../../components/Icon';
import { Screen, SectionHead } from '../../components/Layout';
import { QrCode } from '../../components/QrCode';
import { Stepper } from '../../components/Stepper';
import { useToast } from '../../components/Toast';
import { PUBLIC_URL } from '../../config';
import { addDays, todayIn } from '../../domain/dates';
import { formatMoney } from '../../domain/money';
import type { LinkSource } from '../../domain/types';
import { useStore } from '../../data/store';
import { useT } from '../../i18n';
import { copyText, shareNative } from '../../share/clipboard';
import { appUrl, LINK_SOURCES, shareUrl } from '../../share/links';
import { PropertySwitch } from './PropertySwitch';
import { hostTabs } from './tabs';
import { useHostProperty } from './useHostProperty';

const LINK_CHOICES: LinkSource[] = ['instagram', 'whatsapp', 'telegram', 'direct'];

export function PromoScreen() {
  const { state } = useStore();
  const { t, lang } = useT();
  const toast = useToast();
  const { properties, property, select } = useHostProperty();
  const [src, setSrc] = useState<LinkSource>('instagram');
  const [withDates, setWithDates] = useState(false);
  const today = todayIn('Asia/Bishkek');
  const [dates, setDates] = useState({ checkIn: addDays(today, 7), checkOut: addDays(today, 9) });
  const [guests, setGuests] = useState(2);

  if (!property) {
    return (
      <Screen title={t.promo.title} back="/host" tabs={hostTabs(t)}>
        <p className="muted">{t.host.noProperties}</p>
      </Screen>
    );
  }

  const url = shareUrl(PUBLIC_URL, property.slug, { src, ...(withDates ? { ...dates, guests } : {}) });
  const name = property.name[lang];
  const text = `${t.promo.shareText(name)} ${url}`;
  const copy = async (value: string) => toast.show((await copyText(value)) ? t.promo.copied : t.promo.copyFailed);
  const minPrice = Math.min(...state.categories.filter((c) => c.propertyId === property.id).map((c) => c.basePrice));

  const buttonCode = `<script src="${PUBLIC_URL}widget.js" data-property="${property.slug}" async></script>`;
  const inlineCode = `<div data-voyz-booking="${property.slug}" data-height="760"></div>\n<script src="${PUBLIC_URL}widget.js" async></script>`;

  const own = state.bookings.filter((b) => b.propertyId === property.id && b.status !== 'cancelled');
  const bySource = LINK_SOURCES.map((s) => ({ s, n: own.filter((b) => b.source === s).length })).filter((r) => r.n > 0);
  const manual = own.filter((b) => b.source === null).length;

  return (
    <Screen title={t.promo.title} back="/host" tabs={hostTabs(t)}>
      <PropertySwitch properties={properties} value={property} onChange={select} />

      <SectionHead>{t.promo.linkTitle}</SectionHead>
      <div className="chips">
        {LINK_CHOICES.map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={src === s} onClick={() => setSrc(s)}>
            {t.promo.source[s]}
          </button>
        ))}
      </div>
      <p className="muted small">{t.promo.hint[src]}</p>
      <label className="check">
        <input type="checkbox" checked={withDates} onChange={(e) => setWithDates(e.target.checked)} />
        <span>{t.promo.withDates}</span>
      </label>
      {withDates && (
        <div className="stack">
          <DateRange
            checkIn={dates.checkIn}
            checkOut={dates.checkOut}
            min={today}
            labels={[t.search.checkIn, t.search.checkOut]}
            onChange={(p) =>
              setDates((d) => {
                const next = { ...d, ...p };
                return next.checkOut <= next.checkIn ? { ...next, checkOut: addDays(next.checkIn, 1) } : next;
              })
            }
          />
          <Stepper label={t.search.guests} value={guests} min={1} max={10} onChange={setGuests} />
        </div>
      )}

      <div className="linkBox">
        <code>{url.replace(/^https?:\/\//, '')}</code>
        <button type="button" className="roundBtn lime small" aria-label={t.promo.copy} onClick={() => copy(url)}>
          <Icon name="copy" size={18} />
        </button>
      </div>

      <div className="previewCard" aria-label={t.promo.previewLabel}>
        <img src="./og.png" alt="" />
        <div>
          <span className="tiny muted">{new URL(PUBLIC_URL).host}</span>
          <b>{name}</b>
          <span className="small">
            {property.region[lang]} · {t.search.fromPrice(formatMoney(minPrice, property.currency, lang))}
          </span>
        </div>
      </div>
      <p className="muted tiny center">{t.promo.previewNote}</p>

      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            if (!(await shareNative(name, url))) await copy(url);
          }}
        >
          <Icon name="share" /> {t.promo.share}
        </button>
        <a className="btn outline" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
        <a
          className="btn outline"
          href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(t.promo.shareText(name))}`}
          target="_blank"
          rel="noreferrer"
        >
          Telegram
        </a>
      </div>

      <SectionHead>{t.promo.posterTitle}</SectionHead>
      <div className="card accent" style={{ alignItems: 'center', textAlign: 'center' }}>
        <QrCode value={shareUrl(PUBLIC_URL, property.slug, { src: 'qr' })} size={180} label={t.promo.posterTitle} />
        <p className="small">{t.promo.posterHint}</p>
        <Link className="btn lime block" to={`/host/poster?p=${property.slug}`}>
          <Icon name="printer" /> {t.promo.openPoster}
        </Link>
      </div>

      <SectionHead>{t.promo.widgetTitle}</SectionHead>
      <p className="small">{t.promo.widgetHint}</p>
      <div className="codeBlock">
        <span className="section-title">{t.promo.widgetButton}</span>
        <pre>{buttonCode}</pre>
        <button type="button" className="btn small lime" onClick={() => copy(buttonCode)}>
          <Icon name="copy" size={18} /> {t.promo.copyCode}
        </button>
      </div>
      <div className="codeBlock">
        <span className="section-title">{t.promo.widgetInline}</span>
        <pre>{inlineCode}</pre>
        <button type="button" className="btn small lime" onClick={() => copy(inlineCode)}>
          <Icon name="copy" size={18} /> {t.promo.copyCode}
        </button>
      </div>
      <a className="btn outline" href={appUrl(PUBLIC_URL, property.slug, { src: 'site', embed: true })} target="_blank" rel="noreferrer">
        <Icon name="code" /> {t.promo.widgetPreview}
      </a>
      <p className="muted tiny">{t.promo.noSite}</p>

      <SectionHead>{t.promo.statsTitle}</SectionHead>
      <div className="card">
        {bySource.length === 0 && manual === 0 && <p className="muted small">{t.list.empty}</p>}
        {bySource.map(({ s, n }) => (
          <div key={s} className="row between">
            <span>{t.promo.source[s]}</span>
            <span className="pricePill">{n}</span>
          </div>
        ))}
        {manual > 0 && (
          <div className="row between">
            <span className="muted">{t.promo.manual}</span>
            <span className="tag">{manual}</span>
          </div>
        )}
      </div>
      {toast.node}
    </Screen>
  );
}
