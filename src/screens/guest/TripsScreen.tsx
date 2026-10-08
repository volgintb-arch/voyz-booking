import { Link } from 'react-router-dom';
import { FollowInTelegram } from '../../components/FollowInTelegram';
import { Screen } from '../../components/Layout';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { formatMoney } from '../../domain/money';
import { useActions } from '../../data/actions';
import { useGuestTrips } from '../../data/guest';
import { useT } from '../../i18n';
import { guestTabs } from './tabs';

export function TripsScreen() {
  const actions = useActions();
  const { t, lang, fmtRange, fmtInstant } = useT();
  const toast = useToast();
  const { trips, loading, reload } = useGuestTrips();

  return (
    <Screen title={t.trips.title} back="/" tabs={guestTabs(t)}>
      {trips.length === 0 && <p className="muted">{loading ? t.common.loading : t.trips.empty}</p>}
      {trips.map((view) => {
        const { booking: b, paid, property, categoryName, refundIfCancelled } = view;
        const fmt = (n: number) => formatMoney(n, b.currency, lang);
        const canCancel = b.status === 'pending' || b.status === 'confirmed';
        const owesPrepayment = canCancel && paid < b.prepaymentDue;
        const cancel = async () => {
          const question = paid === 0 ? t.detail.confirmCancel : refundIfCancelled > 0 ? t.trips.cancelRefund(fmt(refundIfCancelled)) : t.trips.cancelNoRefund;
          if (!window.confirm(question)) return;
          const r = await actions.guestCancel(b.id);
          if (!r.ok) return toast.show(r.code === 'offline' ? t.common.offline : t.common.serverDown);
          reload();
        };
        return (
          <div key={b.id} className="card accent">
            <div className="row between">
              <span className="muted small">{b.id}</span>
              <StatusBadge status={b.status} />
            </div>
            <h3 className="title-caps">{property.name[lang]}</h3>
            <span className="muted">
              {categoryName[lang]} · {t.common.guests(b.guests)}
            </span>
            <div className="row between">
              <span>{fmtRange(b.checkIn, b.checkOut)}</span>
              <span className="pricePill">{fmt(b.total)}</span>
            </div>
            <span className="small">{t.trips.paid(fmt(paid))}</span>
            {b.status === 'pending' && b.guestReportedPaidAt && <p className="banner info">{t.pay.reported}</p>}
            {b.status === 'pending' && !b.guestReportedPaidAt && b.holdUntil && owesPrepayment && (
              <p className="small strong">{t.pay.deadline(fmtInstant(b.holdUntil))}</p>
            )}
            {b.status === 'cancelled' && b.cancelReason === 'hold_expired' && <p className="small danger">{t.pay.expired}</p>}
            {canCancel && (
              <div className="actions">
                {owesPrepayment && !b.guestReportedPaidAt && (
                  <Link className="btn small lime" to={`/guest/pay/${b.id}`}>
                    {t.pay.title}
                  </Link>
                )}
                <button type="button" className="btn small danger" onClick={cancel}>
                  {t.trips.cancel}
                </button>
              </div>
            )}
            <FollowInTelegram view={view} onReturn={reload} />
          </div>
        );
      })}
      {toast.node}
    </Screen>
  );
}
