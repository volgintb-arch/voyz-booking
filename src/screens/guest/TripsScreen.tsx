import { Link } from 'react-router-dom';
import { Screen } from '../../components/Layout';
import { StatusBadge } from '../../components/StatusBadge';
import { nowWithOffset, todayIn } from '../../domain/dates';
import { bookingMoney } from '../../domain/ledger';
import { formatMoney } from '../../domain/money';
import { refundOnCancel } from '../../domain/pricing';
import { updateBooking } from '../../data/state';
import { useStore } from '../../data/store';
import { useT } from '../../i18n';
import { guestTabs } from './tabs';

export function TripsScreen() {
  const { state, update } = useStore();
  const { t, lang, fmtRange } = useT();
  const trips = state.bookings
    .filter((b) => state.guestBookingIds.includes(b.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Screen title={t.trips.title} back="/" tabs={guestTabs(t)}>
      {trips.length === 0 && <p className="muted">{t.trips.empty}</p>}
      {trips.map((b) => {
        const property = state.properties.find((p) => p.id === b.propertyId);
        const category = state.categories.find((c) => c.id === b.categoryId);
        if (!property || !category) return null;
        const money = bookingMoney(b, state.payments);
        const fmt = (n: number) => formatMoney(n, b.currency, lang);
        const canCancel = b.status === 'pending' || b.status === 'confirmed';
        const cancel = () => {
          const refund = refundOnCancel(property.cancellation, money.paid, b.checkIn, todayIn(property.timezone));
          const question =
            money.paid === 0 ? t.detail.confirmCancel : refund > 0 ? t.trips.cancelRefund(fmt(refund)) : t.trips.cancelNoRefund;
          if (window.confirm(question)) {
            update((s) => updateBooking(s, b.id, { status: 'cancelled' }, nowWithOffset(property.timezone)));
          }
        };
        const owesPrepayment = canCancel && money.paid < b.prepaymentDue;
        return (
          <div key={b.id} className="card">
            <div className="row between">
              <span className="muted small">{b.id}</span>
              <StatusBadge status={b.status} />
            </div>
            <h3>{property.name[lang]}</h3>
            <p className="muted">
              {category.name[lang]} · {fmtRange(b.checkIn, b.checkOut)} · {t.common.guests(b.guests)}
            </p>
            <div className="row between">
              <span>{t.trips.paid(fmt(money.paid))}</span>
              <span className="price">{fmt(b.total)}</span>
            </div>
            {canCancel && (
              <div className="actions">
                {owesPrepayment && (
                  <Link className="btn small" to={`/guest/pay/${b.id}`}>
                    {t.pay.title}
                  </Link>
                )}
                <button type="button" className="btn small danger" onClick={cancel}>
                  {t.trips.cancel}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </Screen>
  );
}
