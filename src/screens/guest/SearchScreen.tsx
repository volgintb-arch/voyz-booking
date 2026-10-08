import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PropertyPhoto } from '../../components/PropertyPhoto';
import { photosOf } from '../../data/state';
import { Screen } from '../../components/Layout';
import { freeUnits } from '../../domain/availability';
import { nightsBetween } from '../../domain/dates';
import { formatMoney } from '../../domain/money';
import { quoteStay } from '../../domain/pricing';
import { useStore } from '../../data/store';
import { useT } from '../../i18n';
import { useStayParams } from './params';
import { StayPicker } from './StayPicker';
import { guestTabs } from './tabs';

export function SearchScreen() {
  const { state } = useStore();
  const { t, lang, fmtRange } = useT();
  const [stay, setStay, query] = useStayParams();
  const [region, setRegion] = useState<string | null>(null);
  const nights = nightsBetween(stay.checkIn, stay.checkOut);

  const regions = [...new Set(state.properties.map((p) => p.region[lang].split(',').pop()!.trim()))];
  const list = state.properties
    .filter((p) => !region || p.region[lang].includes(region))
    .map((p) => {
      const cats = state.categories.filter((c) => c.propertyId === p.id && c.capacity >= stay.guests);
      const open = nights > 0 ? cats.filter((c) => freeUnits(state.units, c.id, stay.checkIn, stay.checkOut, state.bookings, state.blocks).length > 0) : [];
      const free = open.reduce((n, c) => n + freeUnits(state.units, c.id, stay.checkIn, stay.checkOut, state.bookings, state.blocks).length, 0);
      const totals = open.map((c) => quoteStay(c, state.seasons, stay.checkIn, stay.checkOut, stay.guests, p.cancellation).total);
      return { p, free, minTotal: totals.length ? Math.min(...totals) : null };
    })
    .sort((a, b) => Number(b.free > 0) - Number(a.free > 0));

  return (
    <Screen title={t.search.title} back="/" tabs={guestTabs(t)}>
      <StayPicker stay={stay} onChange={setStay} />
      <div className="chips">
        <button type="button" className="chip" aria-pressed={region === null} onClick={() => setRegion(null)}>
          {t.search.everywhere}
        </button>
        {regions.map((r) => (
          <button key={r} type="button" className="chip" aria-pressed={region === r} onClick={() => setRegion(r)}>
            {r}
          </button>
        ))}
      </div>
      {list.map(({ p, free, minTotal }) => (
        <Link key={p.id} to={`/guest/p/${p.slug}?${query}`} className="tile">
          <div className="photo">
            <PropertyPhoto kind={p.kind} hue={p.hue} photos={photosOf(state, p.id)} alt={p.name[lang]} />
          </div>
          <h3 className="title-caps" style={{ marginTop: 8 }}>
            {p.name[lang]}
          </h3>
          <span className="muted">{p.region[lang]}</span>
          <div className="row between" style={{ marginTop: 8 }}>
            <span>{nights > 0 ? fmtRange(stay.checkIn, stay.checkOut) : ''}</span>
            {minTotal !== null ? (
              <span className="pricePill">{t.search.tilePrice(nights, formatMoney(minTotal, p.currency, lang))}</span>
            ) : (
              <span className="tag danger">{t.search.noneFree}</span>
            )}
          </div>
          {free > 0 && <span className="muted small">{t.search.free(free)}</span>}
        </Link>
      ))}
    </Screen>
  );
}
