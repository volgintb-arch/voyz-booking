import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FakeQr } from '../../components/FakeQr';
import { Screen } from '../../components/Layout';
import { nowWithOffset } from '../../domain/dates';
import { bookingMoney } from '../../domain/ledger';
import { formatMoney } from '../../domain/money';
import type { PaymentMethod } from '../../domain/types';
import { addPayment } from '../../data/state';
import { useStore } from '../../data/store';
import { useT } from '../../i18n';

const METHODS: PaymentMethod[] = ['qr', 'card', 'transfer'];

export function PayScreen() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { state, update } = useStore();
  const { t, lang } = useT();
  const booking = state.bookings.find((b) => b.id === id);
  const property = state.properties.find((p) => p.id === booking?.propertyId);
  if (!booking || !property) {
    return (
      <Screen title={t.pay.title} back="/guest/trips">
        <p className="muted">{t.detail.notFound}</p>
      </Screen>
    );
  }
  const raw = params.get('m') as PaymentMethod | null;
  const method: PaymentMethod = raw && METHODS.includes(raw) ? raw : 'qr';
  const due = Math.max(0, booking.prepaymentDue - bookingMoney(booking, state.payments).paid);

  const paid = () => {
    if (due > 0) {
      update((s) =>
        addPayment(s, {
          bookingId: booking.id,
          kind: 'prepayment',
          method,
          provider: method === 'qr' ? 'elqr' : null,
          amount: due,
          fee: 0,
          currency: booking.currency,
          paidAt: nowWithOffset(property.timezone),
          status: 'succeeded',
        }),
      );
    }
    navigate(`/guest/done/${booking.id}`, { replace: true });
  };

  return (
    <Screen title={t.pay.title} back="/guest/trips">
      <div className="card accent" style={{ textAlign: 'center' }}>
        <p className="muted">{property.name[lang]}</p>
        <p className="price" style={{ fontSize: 28 }}>
          {formatMoney(due, booking.currency, lang)}
        </p>
        <FakeQr seed={booking.id} />
        <p>{t.pay.scan}</p>
        <p className="muted small">{t.pay.recipient}</p>
      </div>
      <p className="banner info" style={{ borderRadius: 10 }}>
        {t.pay.demo}
      </p>
      <div className="actions">
        <button type="button" className="btn" onClick={paid}>
          {t.pay.paid}
        </button>
        <button type="button" className="btn lime" onClick={() => navigate(`/guest/done/${booking.id}`, { replace: true })}>
          {t.pay.later}
        </button>
      </div>
    </Screen>
  );
}
