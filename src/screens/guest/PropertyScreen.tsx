import { Link, useParams } from 'react-router-dom';
import { Cover } from '../../components/Cover';
import { Screen } from '../../components/Layout';
import { freeUnits } from '../../domain/availability';
import { formatMoney } from '../../domain/money';
import { quoteStay, validateStay } from '../../domain/pricing';
import { useStore } from '../../data/store';
import { useT } from '../../i18n';
import { useStayParams } from './params';
import { StayPicker } from './StayPicker';
import { guestTabs } from './tabs';

export function PropertyScreen() {
  const { slug } = useParams();
  const { state } = useStore();
  const { t, lang } = useT();
  const [stay, setStay, query] = useStayParams();
  const property = state.properties.find((p) => p.slug === slug);

  if (!property) {
    return (
      <Screen title={t.property.notFound} back="/guest">
        <p className="muted">{t.property.notFound}</p>
      </Screen>
    );
  }

  const { cancellation: policy } = property;
  const categories = state.categories.filter((c) => c.propertyId === property.id);
  const mapUrl = `https://www.openstreetmap.org/?mlat=${property.lat}&mlon=${property.lng}#map=12/${property.lat}/${property.lng}`;

  return (
    <Screen title={property.name[lang]} back={`/guest?${query}`} tabs={guestTabs(t)}>
      <div className="card link">
        <Cover kind={property.kind} hue={property.hue} />
        <div className="body">
          <span className="muted small">
            {t.kind[property.kind]} · {property.region[lang]}
          </span>
          <p>{property.description[lang]}</p>
          <a href={mapUrl} target="_blank" rel="noreferrer" className="small">
            {t.property.map} ↗
          </a>
        </div>
      </div>

      <StayPicker stay={stay} onChange={setStay} />

      <h2>{t.property.rooms}</h2>
      {categories.map((c) => {
        const quote = quoteStay(c, state.seasons, stay.checkIn, stay.checkOut, stay.guests, policy);
        const problem = validateStay(c, quote, stay.checkIn, stay.checkOut, stay.guests);
        const free = problem === 'bad_dates' ? 0 : freeUnits(state.units, c.id, stay.checkIn, stay.checkOut, state.bookings, state.blocks).length;
        const problemText =
          problem === 'bad_dates'
            ? t.property.badDates
            : problem === 'too_many_guests'
              ? t.property.tooManyGuests
              : problem === 'too_short'
                ? t.property.minNights(quote.minNights)
                : free === 0
                  ? t.property.soldOut
                  : null;
        return (
          <div key={c.id} className="card">
            <div className="row between">
              <h3>{c.name[lang]}</h3>
              <span className="tag">{t.property.capacity(c.capacity)}</span>
            </div>
            {!problem && (
              <div className="row between">
                <span className="muted">{t.common.nights(quote.nights.length)}</span>
                <span className="price">{formatMoney(quote.total, property.currency, lang)}</span>
              </div>
            )}
            {problemText ? (
              <p className="small danger">{problemText}</p>
            ) : (
              <div className="row between">
                <span className="muted small">{t.search.free(free)}</span>
                <Link className="btn small" to={`/guest/p/${property.slug}/book/${c.id}?${query}`}>
                  {t.property.choose}
                </Link>
              </div>
            )}
          </div>
        );
      })}

      <div className="card">
        <h3>{t.property.rules}</h3>
        <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
          <li>{t.property.times(property.checkInTime, property.checkOutTime)}</li>
          <li>{t.property.prepayment(policy.prepaymentPercent)}</li>
          {policy.prepaymentPercent > 0 && (
            <li>{policy.nonRefundable ? t.property.nonRefundable : t.property.freeCancel(policy.freeCancelDays)}</li>
          )}
        </ul>
      </div>

      <div className="card">
        <h3>{t.property.amenities}</h3>
        <div className="row wrap">
          {property.amenities.map((a) => (
            <span key={a} className="tag">
              {t.amenity[a]}
            </span>
          ))}
        </div>
      </div>
    </Screen>
  );
}
