// The guest's own bookings: from the server by secret token, or from the device in demo mode.

import { useCallback, useEffect, useState } from 'react';
import { apiMode, call, guestTrips } from '../api/client';
import type { GuestView } from '../api/types';
import { todayIn } from '../domain/dates';
import { bookingMoney } from '../domain/ledger';
import { refundOnCancel } from '../domain/pricing';
import type { AppState } from './state';
import { useStore } from './store';

function localView(state: AppState, id: string): GuestView | null {
  const booking = state.bookings.find((b) => b.id === id);
  const p = state.properties.find((x) => x.id === booking?.propertyId);
  const cat = state.categories.find((c) => c.id === booking?.categoryId);
  if (!booking || !p) return null;
  const paid = bookingMoney(booking, state.payments).paid;
  return {
    booking,
    paid,
    property: { slug: p.slug, name: p.name, region: p.region, timezone: p.timezone, checkInTime: p.checkInTime, checkOutTime: p.checkOutTime },
    payment: { qrImage: p.payment.qrImage, recipient: p.payment.recipient, details: p.payment.details },
    categoryName: cat?.name ?? p.name,
    refundIfCancelled: refundOnCancel(p.cancellation, paid, booking.checkIn, todayIn(p.timezone)),
  };
}

export function useGuestView(id: string | undefined): { view: GuestView | null; loading: boolean; reload: () => void } {
  const { state } = useStore();
  const [remote, setRemote] = useState<GuestView | null>(null);
  const [loading, setLoading] = useState(apiMode);
  const reload = useCallback(() => {
    if (!apiMode || !id) return;
    setLoading(true);
    call<GuestView>('GET', `api/public/bookings/${encodeURIComponent(id)}`, undefined, { guestToken: guestTrips.token(id) ?? '' })
      .then(setRemote)
      .catch(() => setRemote(null))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(reload, [reload]);
  return { view: apiMode ? remote : id ? localView(state, id) : null, loading, reload };
}

export function useGuestTrips(): { trips: GuestView[]; loading: boolean; reload: () => void } {
  const { state } = useStore();
  const [remote, setRemote] = useState<GuestView[]>([]);
  const [loading, setLoading] = useState(apiMode);
  const reload = useCallback(() => {
    if (!apiMode) return;
    setLoading(true);
    Promise.all(
      guestTrips.list().map((t) =>
        call<GuestView>('GET', `api/public/bookings/${encodeURIComponent(t.id)}`, undefined, { guestToken: t.token }).catch(() => null),
      ),
    )
      .then((views) => setRemote(views.filter((v): v is GuestView => v !== null)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(reload, [reload]);
  const local = state.guestBookingIds.map((id) => localView(state, id)).filter((v): v is GuestView => v !== null);
  const trips = (apiMode ? remote : local).sort((a, b) => b.booking.createdAt.localeCompare(a.booking.createdAt));
  return { trips, loading, reload };
}
