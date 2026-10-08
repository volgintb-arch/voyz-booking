import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Screen } from '../../components/Layout';
import { useToast } from '../../components/Toast';
import { nowWithOffset } from '../../domain/dates';
import { bookingMoney } from '../../domain/ledger';
import { formatMoney } from '../../domain/money';
import { reportPaid } from '../../data/state';
import { useStore } from '../../data/store';
import { useT } from '../../i18n';
import { copyText } from '../../share/clipboard';

/** Deposit straight to the host's QR or account (D-001, stage 1). */
export function PayScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state, update } = useStore();
  const { t, lang, fmtInstant } = useT();
  const toast = useToast();
  const booking = state.bookings.find((b) => b.id === id);
  const property = state.properties.find((p) => p.id === booking?.propertyId);
  if (!booking || !property) {
    return (
      <Screen title={t.pay.title} back="/guest/trips">
        <p className="muted">{t.detail.notFound}</p>
      </Screen>
    );
  }
  const due = Math.max(0, booking.prepaymentDue - bookingMoney(booking, state.payments).paid);
  const { payment } = property;
  const copy = async (v: string) => toast.show((await copyText(v)) ? t.promo.copied : t.promo.copyFailed);

  const paid = () => {
    update((s) => reportPaid(s, booking.id, nowWithOffset(property.timezone)));
    navigate(`/guest/done/${booking.id}`, { replace: true });
  };

  if (booking.status === 'cancelled') {
    return (
      <Screen title={t.pay.title} back="/guest/trips">
        <div className="card">
          <p>{booking.cancelReason === 'hold_expired' ? t.pay.expired : t.status.cancelled}</p>
        </div>
      </Screen>
    );
  }

  return (
    <Screen title={t.pay.title} back="/guest/trips">
      <div className="card accent" style={{ alignItems: 'center', textAlign: 'center' }}>
        <span className="muted">{property.name[lang]}</span>
        <span className="pricePill big">{formatMoney(due, booking.currency, lang)}</span>
        {payment.qrImage ? (
          <>
            <img className="hostQr" src={payment.qrImage} alt={t.payment.qr} />
            <p>{t.pay.scan}</p>
          </>
        ) : (
          <p className="muted small">{t.pay.noQr}</p>
        )}
      </div>

      <div className="panel">
        <div className="row between">
          <div className="stack" style={{ gap: 2 }}>
            <span className="muted small">{t.payment.recipient}</span>
            <b>{payment.recipient || '—'}</b>
          </div>
        </div>
        {payment.details && (
          <div className="row between">
            <div className="stack" style={{ gap: 2 }}>
              <span className="muted small">{t.payment.details}</span>
              <b>{payment.details}</b>
            </div>
            <button type="button" className="roundBtn lime small" aria-label={t.promo.copy} onClick={() => copy(payment.details)}>
              <Icon name="copy" size={18} />
            </button>
          </div>
        )}
        <div className="row between">
          <div className="stack" style={{ gap: 2 }}>
            <span className="muted small">{t.pay.comment}</span>
            <b>{booking.id}</b>
          </div>
          <button type="button" className="roundBtn lime small" aria-label={t.promo.copy} onClick={() => copy(booking.id)}>
            <Icon name="copy" size={18} />
          </button>
        </div>
      </div>

      {booking.holdUntil && <p className="center strong">{t.pay.deadline(fmtInstant(booking.holdUntil))}</p>}
      <p className="muted small center">{t.pay.recipientNote}</p>

      {booking.guestReportedPaidAt ? (
        <p className="banner info">{t.pay.reported}</p>
      ) : (
        <div className="actions">
          <button type="button" className="btn" onClick={paid}>
            {t.pay.paid}
          </button>
          <button type="button" className="btn lime" onClick={() => navigate('/guest/trips', { replace: true })}>
            {t.pay.later}
          </button>
        </div>
      )}
      {toast.node}
    </Screen>
  );
}
