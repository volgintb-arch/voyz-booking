import { useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Gallery } from '../../components/PropertyPhoto';
import { photosOf } from '../../data/state';
import { Icon } from '../../components/Icon';
import { AccRow, Screen, SectionHead } from '../../components/Layout';
import { freeUnits } from '../../domain/availability';
import { formatMoney } from '../../domain/money';
import { quoteStay, validateStay } from '../../domain/pricing';
import { useStore } from '../../data/store';
import { useT } from '../../i18n';
import { useStayParams } from './params';
import { StayPicker } from './StayPicker';

export function PropertyScreen() {
  const { slug } = useParams();
  const { state } = useStore();
  const { t, lang } = useT();
  const [stay, setStay, query] = useStayParams();
  const roomsRef = useRef<HTMLHeadingElement>(null);
  const property = state.properties.find((p) => p.slug === slug);

  if (!property) {
    return (
      <Screen title={t.property.notFound} back="/guest">
        <p className="muted">{t.property.notFound}</p>
      </Screen>
    );
  }

  const { cancellation: policy } = property;
  const money = (n: number) => formatMoney(n, property.currency, lang);
  const mapUrl = `https://www.openstreetmap.org/?mlat=${property.lat}&mlon=${property.lng}#map=12/${property.lat}/${property.lng}`;
  const rooms = state.categories
    .filter((c) => c.propertyId === property.id)
    .map((c) => {
      const quote = quoteStay(c, state.seasons, stay.checkIn, stay.checkOut, stay.guests, policy);
      const problem = validateStay(c, quote, stay.checkIn, stay.checkOut, stay.guests);
      const free = problem === 'bad_dates' ? 0 : freeUnits(state.units, c.id, stay.checkIn, stay.checkOut, state.bookings, state.blocks).length;
      return { c, quote, problem, free };
    });
  const bookable = rooms.filter((r) => !r.problem && r.free > 0);
  const minTotal = bookable.length ? Math.min(...bookable.map((r) => r.quote.total)) : null;
  const minNight = Math.min(...rooms.map((r) => r.c.basePrice));
  const cancelText = policy.prepaymentPercent === 0 ? t.property.prepayment(0) : policy.nonRefundable ? t.property.nonRefundable : t.property.freeCancel(policy.freeCancelDays);

  const bar = (
    <>
      <span className="sum">
        {minTotal !== null ? t.property.fromTotal(money(minTotal)) : t.property.soldOut}
        <span>
          / <Icon name="user" size={16} />
          {stay.guests}
        </span>
      </span>
      <button type="button" className="btn white" onClick={() => roomsRef.current?.scrollIntoView({ behavior: 'smooth' })}>
        {t.book.submit}
      </button>
      <a className="roundBtn lime" href={mapUrl} target="_blank" rel="noreferrer" aria-label={t.property.map}>
        <Icon name="pin" />
      </a>
    </>
  );

  return (
    <Screen title={t.kind[property.kind]} back={`/guest?${query}`} bar={bar}>
      <div className="tile">
        <div className="photo">
          <Gallery kind={property.kind} hue={property.hue} photos={photosOf(state, property.id)} alt={property.name[lang]} />
        </div>
      </div>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="title-caps">{property.name[lang]}</h2>
          <span className="muted">{property.region[lang]}</span>
        </div>
        <span className="pricePill">{money(minNight)}</span>
      </div>

      <div className="panel">
        <div className="grid2">
          <div className="fact">
            <span className="ico"><Icon name="login" size={28} /></span>
            <b>{t.property.checkIn}</b>
            <span className="muted">{t.property.fromTime(property.checkInTime)}</span>
          </div>
          <div className="fact">
            <span className="ico"><Icon name="logout" size={28} /></span>
            <b>{t.property.checkOut}</b>
            <span className="muted">{t.property.untilTime(property.checkOutTime)}</span>
          </div>
          <div className="fact">
            <span className="ico"><Icon name="wallet" size={28} /></span>
            <b>{t.property.prepaymentShort}</b>
            <span className="muted">{policy.prepaymentPercent === 0 ? t.property.none : `${policy.prepaymentPercent}%`}</span>
          </div>
          <div className="fact">
            <span className="ico"><Icon name="people" size={28} /></span>
            <b>{t.property.freeNow}</b>
            <span className="muted">{bookable.reduce((n, r) => n + r.free, 0)}</span>
          </div>
        </div>
      </div>
      <p className="muted small center">{cancelText}</p>

      <SectionHead>{t.property.about}</SectionHead>
      <p>{property.description[lang]}</p>

      <StayPicker stay={stay} onChange={setStay} />

      <SectionHead>
        <span ref={roomsRef}>{t.property.rooms}</span>
      </SectionHead>
      {rooms.map(({ c, quote, problem, free }) => {
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
          <div key={c.id} className="panel">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div className="stack" style={{ gap: 4 }}>
                <b style={{ fontSize: 20 }}>
                  {money(c.basePrice)} / {t.common.perNight}
                </b>
                <span style={{ fontSize: 18 }}>{c.name[lang]}</span>
                <span className="muted small">
                  {t.property.capacity(c.capacity)}
                  {!problem && ` · ${t.search.free(free)}`}
                </span>
              </div>
              {!problem && <span className="pricePill">{money(quote.total)}</span>}
            </div>
            {!problem && <span>{t.common.nights(quote.nights.length)}</span>}
            {problemText ? (
              <p className="small" style={{ color: 'var(--warn)' }}>
                {problemText}
              </p>
            ) : (
              <Link className="btn lime" to={`/guest/p/${property.slug}/book/${c.id}?${query}`}>
                {t.property.choose}
              </Link>
            )}
          </div>
        );
      })}

      <SectionHead>{t.property.included}</SectionHead>
      <div>
        <AccRow icon="sparkle" title={t.property.amenities}>
          {property.amenities.map((a) => (
            <div key={a} className="row">
              <span className="icoLime" style={{ width: 32, height: 32 }}>
                <Icon name="check" size={18} />
              </span>
              {t.amenity[a]}
            </div>
          ))}
        </AccRow>
        <AccRow icon="clock" title={t.property.rules}>
          <p>{t.property.times(property.checkInTime, property.checkOutTime)}</p>
          <p>{t.property.prepayment(policy.prepaymentPercent)}</p>
          {policy.prepaymentPercent > 0 && <p>{cancelText}</p>}
        </AccRow>
        <AccRow icon="pin" title={t.property.map}>
          <a href={mapUrl} target="_blank" rel="noreferrer" className="btn outline small">
            OpenStreetMap ↗
          </a>
        </AccRow>
      </div>
    </Screen>
  );
}
