import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Field, Screen } from '../../components/Layout';
import { freeUnits } from '../../domain/availability';
import { nowWithOffset } from '../../domain/dates';
import { formatMoney } from '../../domain/money';
import { quoteStay, validateStay } from '../../domain/pricing';
import { createBooking } from '../../data/state';
import { useStore } from '../../data/store';
import { useT } from '../../i18n';
import { channelFor, visitSource } from '../../share/links';
import { useStayParams } from './params';

export function BookScreen() {
  const { slug, categoryId } = useParams();
  const navigate = useNavigate();
  const { state, update } = useStore();
  const { t, lang, fmtRange, fmtDate } = useT();
  const [stay, , query] = useStayParams();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const property = state.properties.find((p) => p.slug === slug);
  const category = state.categories.find((c) => c.id === categoryId && c.propertyId === property?.id);

  if (!property || !category) {
    return (
      <Screen title={t.book.title} back="/guest">
        <p className="muted">{t.property.notFound}</p>
      </Screen>
    );
  }

  const policy = property.cancellation;
  const quote = quoteStay(category, state.seasons, stay.checkIn, stay.checkOut, stay.guests, policy);
  const problem = validateStay(category, quote, stay.checkIn, stay.checkOut, stay.guests);
  const money = (n: number) => formatMoney(n, property.currency, lang);
  const needsPrepayment = quote.prepaymentDue > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t.book.nameRequired);
    if (phone.replace(/\D/g, '').length < 9) return setError(t.book.phoneRequired);
    if (!consent) return setError(t.book.consentRequired);
    const unit = freeUnits(state.units, category.id, stay.checkIn, stay.checkOut, state.bookings, state.blocks)[0];
    if (!unit || problem) return setError(t.book.taken);
    const result = createBooking(
      state,
      {
        propertyId: property.id,
        unitId: unit.id,
        categoryId: category.id,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        guests: stay.guests,
        guestName: name.trim(),
        guestPhone: phone.trim(),
        channel: channelFor(visitSource()),
        status: 'pending',
        currency: property.currency,
        total: quote.total,
        prepaymentDue: quote.prepaymentDue,
        nonRefundablePrepayment: policy.nonRefundable,
        note: '',
        createdBy: 'guest',
        source: visitSource(),
      },
      nowWithOffset(property.timezone),
    );
    if (!result.ok) return setError(t.book.taken);
    update(() => result.state);
    navigate(needsPrepayment ? `/guest/pay/${result.booking.id}` : `/guest/done/${result.booking.id}`, { replace: true });
  };

  return (
    <Screen title={t.book.title} back={`/guest/p/${property.slug}?${query}`}>
      <div className="panel">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div className="stack" style={{ gap: 4 }}>
            <b className="title-caps" style={{ fontSize: 17 }}>
              {property.name[lang]}
            </b>
            <span className="muted">{category.name[lang]}</span>
          </div>
          <span className="pricePill">{money(quote.total)}</span>
        </div>
        <span>
          {fmtRange(stay.checkIn, stay.checkOut)} · {t.common.nights(quote.nights.length)} · {t.common.guests(stay.guests)}
        </span>
        <dl className="kv">
          {quote.nights.map((n) => (
            <div key={n.date} style={{ display: 'contents' }}>
              <dt>{fmtDate(n.date, { weekday: 'short', day: 'numeric', month: 'short' })}</dt>
              <dd>{money(n.price)}</dd>
            </div>
          ))}
          {quote.extraGuestTotal > 0 && (
            <>
              <dt>{t.book.extraGuests(quote.extraGuests)}</dt>
              <dd>{money(quote.extraGuestTotal)}</dd>
            </>
          )}
        </dl>
      </div>

      <form className="stack" onSubmit={submit} noValidate>
        <Field label={t.book.name}>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={60} />
        </Field>
        <Field label={t.book.phone} hint={t.book.phoneHint}>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="+996 …" />
        </Field>

        <div className="card accent">
          <span className="section-title">{t.book.payment}</span>
          {needsPrepayment ? (
            <>
              <p className="price">{t.book.prepayNow(money(quote.prepaymentDue))}</p>
              <p className="muted">{t.book.rest(money(quote.total - quote.prepaymentDue))}</p>
              <p className="small">{t.book.holdNote(property.payment.holdHours)}</p>
              <p className="muted small">
                {policy.nonRefundable ? t.property.nonRefundable : t.property.freeCancel(policy.freeCancelDays)}
              </p>
            </>
          ) : (
            <p>{t.book.payOnSite}</p>
          )}
        </div>

        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{t.book.consent}</span>
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn block" disabled={!!problem}>
          {t.book.submit}
        </button>
      </form>
    </Screen>
  );
}
