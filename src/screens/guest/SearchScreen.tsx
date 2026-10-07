import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cover } from '../../components/Cover';
import { Screen } from '../../components/Layout';
import { freeUnits } from '../../domain/availability';
import { nightsBetween } from '../../domain/dates';
import { formatMoney } from '../../domain/money';
import { useStore } from '../../data/store';
import { useT } from '../../i18n';
import { useStayParams } from './params';
import { StayPicker } from './StayPicker';
import { guestTabs } from './tabs';

export function SearchScreen() {
  const { state } = useStore();
  const { t, lang } = useT();
  const [stay, setStay, query] = useStayParams();
  const [region, setRegion] = useState<string | null>(null);
  const validDates = nightsBetween(stay.checkIn, stay.checkOut) > 0;

  const regions = [...new Set(state.properties.map((p) => p.region[lang].split(',').pop()!.trim()))];
  const list = state.properties
    .filter((p) => !region || p.region[lang].includes(region))
    .map((p) => {
      const cats = state.categories.filter((c) => c.propertyId === p.id && c.capacity >= stay.guests);
      const free = validDates
        ? cats.reduce((n, c) => n + freeUnits(state.units, c.id, stay.checkIn, stay.checkOut, state.bookings, state.blocks).length, 0)
        : 0;
      const minPrice = Math.min(...state.categories.filter((c) => c.propertyId === p.id).map((c) => c.basePrice));
      return { p, free, minPrice };
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
      {list.map(({ p, free, minPrice }) => (
        <Link key={p.id} to={`/guest/p/${p.slug}?${query}`} className="card link">
          <Cover kind={p.kind} hue={p.hue} />
          <div className="body">
            <span className="muted small">
              {t.kind[p.kind]} · {p.region[lang]}
            </span>
            <h2>{p.name[lang]}</h2>
            <div className="row between">
              <span>{t.search.fromPrice(formatMoney(minPrice, p.currency, lang))}</span>
              <span className={free > 0 ? 'tag' : 'tag danger'}>{free > 0 ? t.search.free(free) : t.search.noneFree}</span>
            </div>
          </div>
        </Link>
      ))}
    </Screen>
  );
}
