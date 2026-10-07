import { eachNight, nightsBetween } from './dates';
import { percentOf } from './money';
import type { CancellationPolicy, Category, IsoDate, Season } from './types';

export interface NightPrice {
  date: IsoDate;
  price: number;
  seasonId: string | null;
}

export interface Quote {
  nights: NightPrice[];
  extraGuests: number;
  extraGuestTotal: number;
  total: number;
  minNights: number;
  prepaymentDue: number;
}

/** The most specific season wins: category season over property-wide season. */
function seasonFor(date: IsoDate, category: Category, seasons: Season[]): Season | undefined {
  const matching = seasons.filter(
    (s) =>
      s.propertyId === category.propertyId &&
      (s.categoryId === null || s.categoryId === category.id) &&
      s.from <= date &&
      date <= s.to,
  );
  return matching.find((s) => s.categoryId === category.id) ?? matching[0];
}

export function quoteStay(
  category: Category,
  seasons: Season[],
  checkIn: IsoDate,
  checkOut: IsoDate,
  guests: number,
  policy: CancellationPolicy,
): Quote {
  const nights = eachNight(checkIn, checkOut).map((date) => {
    const season = seasonFor(date, category, seasons);
    return { date, price: season?.price ?? category.basePrice, seasonId: season?.id ?? null };
  });
  const extraGuests = Math.max(0, guests - category.baseOccupancy);
  const extraGuestTotal = extraGuests * category.extraGuestPrice * nights.length;
  const total = nights.reduce((sum, n) => sum + n.price, 0) + extraGuestTotal;
  const minNights = Math.max(
    category.minNights,
    ...nights.map((n) => seasons.find((s) => s.id === n.seasonId)?.minNights ?? 0),
  );
  return {
    nights,
    extraGuests,
    extraGuestTotal,
    total,
    minNights,
    prepaymentDue: percentOf(total, policy.prepaymentPercent),
  };
}

export type StayProblem = 'bad_dates' | 'too_short' | 'too_many_guests';

export function validateStay(
  category: Category,
  quote: Quote,
  checkIn: IsoDate,
  checkOut: IsoDate,
  guests: number,
): StayProblem | null {
  if (nightsBetween(checkIn, checkOut) < 1) return 'bad_dates';
  if (guests > category.capacity || guests < 1) return 'too_many_guests';
  if (quote.nights.length < quote.minNights) return 'too_short';
  return null;
}

/**
 * Refund on guest cancellation per the property's rules.
 * Returns the amount of `paid` that goes back to the guest.
 */
export function refundOnCancel(
  policy: CancellationPolicy,
  paid: number,
  checkIn: IsoDate,
  today: IsoDate,
): number {
  if (policy.nonRefundable) return 0;
  return nightsBetween(today, checkIn) >= policy.freeCancelDays ? paid : 0;
}
