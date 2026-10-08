// Domain model of Voyz Booking.
// Money: integer minor units (tyiyn, cents) + ISO 4217 currency.
// Dates of stay: calendar days 'YYYY-MM-DD' in the property's time zone.
// Statuses and payment fields mirror the Aynes bookings contract (BOOKINGS_API.md §4).

export type Lang = 'ru' | 'ky' | 'en';
export type Localized = Record<Lang, string>;

export type Currency = 'KGS' | 'USD' | 'RUB' | 'KZT';
export type IsoDate = string; // YYYY-MM-DD

export interface Money {
  amount: number; // minor units, integer
  currency: Currency;
}

export type PropertyKind = 'yurt_camp' | 'guest_house' | 'glamping' | 'resort';

export interface CancellationPolicy {
  prepaymentPercent: number; // 0 = pay on site allowed without prepayment
  freeCancelDays: number; // full refund if cancelled at least N days before check-in
  nonRefundable: boolean; // prepayment is never refunded
}

export interface Property {
  id: string;
  slug: string;
  ownerId: string;
  kind: PropertyKind;
  name: Localized;
  region: Localized;
  description: Localized;
  lat: number;
  lng: number;
  timezone: string; // IANA, e.g. Asia/Bishkek
  currency: Currency;
  checkInTime: string; // HH:mm
  checkOutTime: string;
  cancellation: CancellationPolicy;
  paymentMethods: PaymentMethod[];
  amenities: AmenityCode[];
  hue: number; // cover illustration colour until real photos exist
  payment: HostPayment;
}

/**
 * How guests pay the deposit before online acquiring exists (D-001):
 * straight to the host's own QR or account, the host confirms receipt.
 */
export interface HostPayment {
  qrImage: string | null; // data URL of the host's bank QR (ELQR, MBANK…)
  recipient: string; // name as the guest sees it in the bank app
  details: string; // phone, card or account number for a transfer
  holdHours: number; // unpaid booking is released after this many hours
}

export type AmenityCode =
  | 'breakfast'
  | 'parking'
  | 'shower'
  | 'wifi'
  | 'horse'
  | 'sauna'
  | 'beach'
  | 'heating';

/** A photo of the property; the first one is the cover. */
export interface Photo {
  id: string;
  propertyId: string;
  url: string;
  width: number;
  height: number;
}

export interface Category {
  id: string;
  propertyId: string;
  name: Localized;
  capacity: number; // max guests
  baseOccupancy: number; // guests included in the nightly price
  basePrice: number; // per night, minor units
  extraGuestPrice: number; // per extra guest per night
  minNights: number;
}

export interface Unit {
  id: string;
  propertyId: string;
  categoryId: string;
  name: string;
}

/** Price override for a date range. Applies to one category or all. */
export interface Season {
  id: string;
  propertyId: string;
  categoryId: string | null;
  name: Localized;
  from: IsoDate; // inclusive
  to: IsoDate; // inclusive (last night)
  price: number;
  minNights: number | null;
}

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'no_show';

export type Channel =
  | 'voyz'
  | 'whatsapp'
  | 'telegram'
  | 'instagram'
  | 'phone'
  | 'walk_in'
  | 'booking_com'
  | 'airbnb';

/** Where the guest came from: the link the host shared (D-004, share links). */
export type LinkSource = 'instagram' | 'whatsapp' | 'telegram' | 'qr' | 'site' | 'direct';

export type CancelReason = 'guest' | 'host' | 'hold_expired';

export interface Booking {
  id: string; // external id sent to Aynes, e.g. VZ-2027-0714
  version: number; // grows on every change (Aynes rejects older versions)
  propertyId: string;
  unitId: string;
  categoryId: string;
  checkIn: IsoDate;
  checkOut: IsoDate; // departure day, not a night
  guests: number;
  guestName: string;
  guestPhone: string; // stays in Voyz, never sent to Aynes
  channel: Channel;
  status: BookingStatus;
  currency: Currency;
  total: number;
  prepaymentDue: number;
  nonRefundablePrepayment: boolean;
  note: string;
  createdAt: string; // ISO instant
  updatedAt: string;
  cancelledAt: string | null;
  cancelReason: CancelReason | null;
  createdBy: 'guest' | 'host';
  source: LinkSource | null;
  holdUntil: string | null; // deposit deadline; the unit is released after it
  guestReportedPaidAt: string | null; // guest pressed "I have paid"
  channelCommission?: number; // Booking.com / Airbnb commission on this booking, minor units
}

export type PaymentKind = 'prepayment' | 'payment' | 'refund';
export type PaymentMethod = 'qr' | 'card' | 'transfer' | 'cash' | 'ota';
export type PaymentStatus = 'succeeded' | 'cancelled';

export interface Payment {
  id: string;
  bookingId: string;
  kind: PaymentKind;
  method: PaymentMethod;
  provider: string | null; // gopay, mbank, megapay, elqr…
  amount: number;
  fee: number;
  currency: Currency;
  paidAt: string; // ISO instant with offset
  status: PaymentStatus;
}

/** Dates closed by the host or imported from an OTA calendar. */
export interface Block {
  id: string;
  unitId: string;
  from: IsoDate; // first blocked night
  to: IsoDate; // day after the last blocked night
  reason: 'closed' | 'ical';
  label: string;
}

export interface IcalChannel {
  id: string;
  unitId: string;
  platform: 'booking_com' | 'airbnb' | 'other';
  importUrl: string;
  lastSyncAt: string | null;
}

export type OutboxStatus = 'pending' | 'sent' | 'failed';

/** A request to Aynes waiting for the network (offline-first). */
export interface OutboxItem {
  id: string;
  method: 'PUT';
  path: string;
  body: unknown;
  createdAt: string;
  attempts: number;
  status: OutboxStatus;
  lastError: string | null;
}
