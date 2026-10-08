// Every change the user makes goes through here. Demo mode applies the pure
// transitions from state.ts on the device; server mode calls the API and takes
// the fresh state the server answers with.

import { useMemo } from 'react';
import { ApiFailure, apiMode, call, guestTrips } from '../api/client';
import type { HostSnapshot } from '../api/types';
import { conflictsFor, type Conflict } from '../domain/availability';
import { nowWithOffset } from '../domain/dates';
import { percentOf } from '../domain/money';
import { quoteStay } from '../domain/pricing';
import type { Block, BookingStatus, Channel, IcalChannel, LinkSource, PaymentKind, PaymentMethod, Property } from '../domain/types';
import { channelFor } from '../share/links';
import {
  addBlock,
  addCategoryWithUnits,
  addIcalChannel,
  addUnit,
  removeCategoryIfFree,
  removeUnitIfFree,
  renameUnit,
  addPayment,
  addSeason,
  applySnapshot,
  confirmDepositReceived,
  createBooking,
  createProperty,
  extendHold,
  removeBlock,
  removeIcalChannel,
  removeSeason,
  reportPaid,
  updateBooking,
  updateCategory,
  updateProperty,
  type AppState,
  type NewPropertyInput,
} from './state';
import { useStore } from './store';

export type Result<T = null> = { ok: true; value: T } | { ok: false; code: string; conflicts?: Conflict[] };

const TZ = 'Asia/Bishkek';
const done = <T>(value: T): Result<T> => ({ ok: true, value });

function failure(e: unknown): Result<never> {
  if (e instanceof ApiFailure) {
    const conflicts = (e.details as { conflicts?: Conflict[] } | undefined)?.conflicts;
    return { ok: false, code: e.code, ...(conflicts ? { conflicts } : {}) };
  }
  return { ok: false, code: 'internal' };
}

export interface GuestBookingInput {
  propertySlug: string;
  categoryId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestName: string;
  guestPhone: string;
  source: LinkSource;
}

export interface HostBookingInput {
  propertyId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestName: string;
  guestPhone: string;
  channel: Channel;
  total: number;
  confirm: boolean;
  note: string;
}

export function useActions() {
  const { state, update, replace } = useStore();

  return useMemo(() => {
    /** Host change on the server; the answer is the whole fresh workspace. */
    async function host<T = null>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<Result<T>> {
      try {
        const snap = await call<HostSnapshot>(method, path, body ?? {}, { auth: true });
        replace((s) => applySnapshot(s, snap));
        return done((snap.result ?? null) as T);
      } catch (e) {
        return failure(e);
      }
    }
    const local = (fn: (s: AppState) => AppState): Result => {
      update(fn);
      return done(null);
    };
    const now = () => nowWithOffset(TZ);

    return {
      // ---------- guest ----------
      async guestBook(input: GuestBookingInput): Promise<Result<{ id: string }>> {
        if (apiMode) {
          try {
            const r = await call<{ booking: { id: string }; guestToken: string }>('POST', `api/public/properties/${encodeURIComponent(input.propertySlug)}/bookings`, {
              categoryId: input.categoryId,
              checkIn: input.checkIn,
              checkOut: input.checkOut,
              guests: input.guests,
              guestName: input.guestName,
              guestPhone: input.guestPhone,
              consent: true,
              source: input.source,
            });
            guestTrips.add({ id: r.booking.id, token: r.guestToken });
            return done({ id: r.booking.id });
          } catch (e) {
            return failure(e);
          }
        }
        const property = state.properties.find((p) => p.slug === input.propertySlug);
        const category = state.categories.find((c) => c.id === input.categoryId);
        if (!property || !category) return { ok: false, code: 'not_found' };
        const quote = quoteStay(category, state.seasons, input.checkIn, input.checkOut, input.guests, property.cancellation);
        const unit = state.units
          .filter((u) => u.categoryId === category.id)
          .find((u) => conflictsFor(u.id, input.checkIn, input.checkOut, state.bookings, state.blocks).length === 0);
        if (!unit) return { ok: false, code: 'dates_taken' };
        const r = createBooking(
          state,
          {
            propertyId: property.id,
            unitId: unit.id,
            categoryId: category.id,
            checkIn: input.checkIn,
            checkOut: input.checkOut,
            guests: input.guests,
            guestName: input.guestName,
            guestPhone: input.guestPhone,
            channel: channelFor(input.source),
            status: 'pending',
            currency: property.currency,
            total: quote.total,
            prepaymentDue: quote.prepaymentDue,
            nonRefundablePrepayment: property.cancellation.nonRefundable,
            note: '',
            createdBy: 'guest',
            source: input.source,
          },
          now(),
        );
        if (!r.ok) return { ok: false, code: 'dates_taken', conflicts: r.conflicts };
        update(() => r.state);
        return done({ id: r.booking.id });
      },

      async reportPaid(bookingId: string): Promise<Result> {
        if (apiMode) {
          try {
            await call('POST', `api/public/bookings/${encodeURIComponent(bookingId)}/report-paid`, {}, { guestToken: guestTrips.token(bookingId) ?? '' });
            return done(null);
          } catch (e) {
            return failure(e);
          }
        }
        return local((s) => reportPaid(s, bookingId, now()));
      },

      async guestCancel(bookingId: string): Promise<Result> {
        if (apiMode) {
          try {
            await call('POST', `api/public/bookings/${encodeURIComponent(bookingId)}/cancel`, {}, { guestToken: guestTrips.token(bookingId) ?? '' });
            return done(null);
          } catch (e) {
            return failure(e);
          }
        }
        return local((s) => updateBooking(s, bookingId, { status: 'cancelled', cancelReason: 'guest' }, now()));
      },

      // ---------- host: bookings ----------
      async hostBook(input: HostBookingInput): Promise<Result<{ id: string }>> {
        if (apiMode) {
          const r = await host<{ id: string }>('POST', `api/host/properties/${input.propertyId}/bookings`, {
            unitId: input.unitId,
            checkIn: input.checkIn,
            checkOut: input.checkOut,
            guests: input.guests,
            guestName: input.guestName,
            guestPhone: input.guestPhone,
            channel: input.channel,
            total: input.total,
            confirm: input.confirm,
            note: input.note,
          });
          return r.ok ? done({ id: r.value.id }) : r;
        }
        const property = state.properties.find((p) => p.id === input.propertyId);
        const unit = state.units.find((u) => u.id === input.unitId);
        if (!property || !unit) return { ok: false, code: 'not_found' };
        const r = createBooking(
          state,
          {
            propertyId: property.id,
            unitId: unit.id,
            categoryId: unit.categoryId,
            checkIn: input.checkIn,
            checkOut: input.checkOut,
            guests: input.guests,
            guestName: input.guestName,
            guestPhone: input.guestPhone,
            channel: input.channel,
            status: input.confirm ? 'confirmed' : 'pending',
            currency: property.currency,
            total: input.total,
            prepaymentDue: percentOf(input.total, property.cancellation.prepaymentPercent),
            nonRefundablePrepayment: property.cancellation.nonRefundable,
            note: input.note,
            createdBy: 'host',
            source: null,
          },
          now(),
        );
        if (!r.ok) return { ok: false, code: 'dates_taken', conflicts: r.conflicts };
        update(() => r.state);
        return done({ id: r.booking.id });
      },

      setStatus: (bookingId: string, status: BookingStatus) =>
        apiMode
          ? host('POST', `api/host/bookings/${bookingId}/status`, { status })
          : Promise.resolve(local((s) => updateBooking(s, bookingId, status === 'cancelled' ? { status, cancelReason: 'host' } : { status }, now()))),

      addPayment: (bookingId: string, p: { kind: PaymentKind; method: PaymentMethod; amount: number; provider: string | null }) => {
        if (apiMode) return host('POST', `api/host/bookings/${bookingId}/payments`, p);
        const booking = state.bookings.find((b) => b.id === bookingId);
        return Promise.resolve(
          local((s) => addPayment(s, { bookingId, ...p, fee: 0, currency: booking?.currency ?? 'KGS', paidAt: now(), status: 'succeeded' })),
        );
      },

      confirmDeposit: (bookingId: string, method: PaymentMethod) =>
        apiMode
          ? host('POST', `api/host/bookings/${bookingId}/deposit-received`, { method })
          : Promise.resolve(local((s) => confirmDepositReceived(s, bookingId, method, null, now()))),

      extendHold: (bookingId: string, hours: number) =>
        apiMode ? host('POST', `api/host/bookings/${bookingId}/extend-hold`, { hours }) : Promise.resolve(local((s) => extendHold(s, bookingId, hours))),

      // ---------- host: settings ----------
      createProperty: async (input: NewPropertyInput): Promise<Result<{ propertyId: string }>> => {
        if (apiMode) return host<{ propertyId: string }>('POST', 'api/host/properties', input);
        const r = createProperty(state, input);
        update(() => r.state);
        return done({ propertyId: r.propertyId });
      },

      updateProperty: (
        propertyId: string,
        patch: Partial<
          Pick<Property, 'kind' | 'name' | 'region' | 'description' | 'checkInTime' | 'checkOutTime' | 'amenities' | 'lat' | 'lng' | 'cancellation' | 'paymentMethods' | 'payment'>
        >,
      ) =>
        apiMode ? host('PATCH', `api/host/properties/${propertyId}`, patch) : Promise.resolve(local((s) => updateProperty(s, propertyId, patch))),

      updateCategory: (
        id: string,
        patch: { name?: string; baseOccupancy?: number; basePrice: number; extraGuestPrice: number; minNights: number; capacity: number },
      ) =>
        apiMode
          ? host('PATCH', `api/host/categories/${id}`, patch)
          : Promise.resolve(
              local((s) => {
                const c = s.categories.find((x) => x.id === id);
                const { name, ...rest } = patch;
                return updateCategory(s, id, {
                  ...rest,
                  ...(name ? { name: { ru: name, ky: name, en: name } } : {}),
                  baseOccupancy: Math.min(patch.baseOccupancy ?? c?.baseOccupancy ?? patch.capacity, patch.capacity),
                });
              }),
            ),

      addCategory: (
        propertyId: string,
        c: { name: string; capacity: number; baseOccupancy: number; basePrice: number; extraGuestPrice: number; minNights: number; units: string[] },
      ) => (apiMode ? host('POST', `api/host/properties/${propertyId}/categories`, c) : Promise.resolve(local((s) => addCategoryWithUnits(s, propertyId, c)))),

      removeCategory: async (id: string): Promise<Result> => {
        if (apiMode) return host('DELETE', `api/host/categories/${id}`);
        const next = removeCategoryIfFree(state, id);
        if (!next) return { ok: false, code: 'conflict' };
        update(() => next);
        return done(null);
      },

      addUnit: (categoryId: string, name: string) =>
        apiMode ? host('POST', `api/host/categories/${categoryId}/units`, { name }) : Promise.resolve(local((s) => addUnit(s, categoryId, name))),

      renameUnit: (id: string, name: string) =>
        apiMode ? host('PATCH', `api/host/units/${id}`, { name }) : Promise.resolve(local((s) => renameUnit(s, id, name))),

      removeUnit: async (id: string): Promise<Result> => {
        if (apiMode) return host('DELETE', `api/host/units/${id}`);
        const next = removeUnitIfFree(state, id);
        if (!next) return { ok: false, code: 'conflict' };
        update(() => next);
        return done(null);
      },

      addSeason: (propertyId: string, se: { categoryId: string | null; name: string; from: string; to: string; price: number; minNights: number | null }) =>
        apiMode
          ? host('POST', `api/host/properties/${propertyId}/seasons`, se)
          : Promise.resolve(
              local((s) => addSeason(s, { propertyId, categoryId: se.categoryId, name: { ru: se.name, ky: se.name, en: se.name }, from: se.from, to: se.to, price: se.price, minNights: se.minNights })),
            ),

      removeSeason: (id: string) => (apiMode ? host('DELETE', `api/host/seasons/${id}`) : Promise.resolve(local((s) => removeSeason(s, id)))),

      addBlock: async (block: Omit<Block, 'id' | 'reason'>): Promise<Result> => {
        if (apiMode) return host('POST', `api/host/units/${block.unitId}/blocks`, { from: block.from, to: block.to, label: block.label });
        const r = addBlock(state, { ...block, reason: 'closed' });
        if (!r.ok) return { ok: false, code: 'dates_taken', conflicts: r.conflicts };
        update(() => r.state);
        return done(null);
      },

      removeBlock: (id: string) => (apiMode ? host('DELETE', `api/host/blocks/${id}`) : Promise.resolve(local((s) => removeBlock(s, id)))),

      addIcalChannel: (c: Pick<IcalChannel, 'unitId' | 'platform' | 'importUrl'>) =>
        apiMode
          ? host('POST', `api/host/units/${c.unitId}/ical-channels`, { platform: c.platform, importUrl: c.importUrl })
          : Promise.resolve(local((s) => addIcalChannel(s, c))),

      removeIcalChannel: (id: string) =>
        apiMode ? host('DELETE', `api/host/ical-channels/${id}`) : Promise.resolve(local((s) => removeIcalChannel(s, id))),

      syncIcal: (id: string) => (apiMode ? host<{ imported: number; error: string | null }>('POST', `api/host/ical-channels/${id}/sync`) : Promise.resolve(done(null))),

      connectAynes: (propertyId: string, key: string, shareGuestName: boolean) =>
        apiMode
          ? host('PUT', `api/host/properties/${propertyId}/aynes`, { key, shareGuestName })
          : Promise.resolve(local((s) => ({ ...s, aynes: { ...s.aynes, connected: true, keyHint: key.slice(-4) } }))),

      disconnectAynes: (propertyId: string) =>
        apiMode
          ? host('DELETE', `api/host/properties/${propertyId}/aynes`)
          : Promise.resolve(local((s) => ({ ...s, aynes: { ...s.aynes, connected: false, keyHint: null } }))),

      setShareGuestName: (propertyId: string, share: boolean) =>
        apiMode
          ? host('PATCH', `api/host/properties/${propertyId}/aynes`, { shareGuestName: share })
          : Promise.resolve(local((s) => ({ ...s, aynes: { ...s.aynes, shareGuestName: share } }))),

      flushOutbox: (propertyId: string) => (apiMode ? host('POST', `api/host/properties/${propertyId}/outbox/flush`) : Promise.resolve(done(null))),
    };
  }, [state, update, replace]);
}

/** Aynes connection of a property: per property on the server, one switch in demo mode. */
export function aynesOf(state: AppState, propertyId: string) {
  return state.aynesByProperty?.[propertyId] ?? state.aynes;
}
