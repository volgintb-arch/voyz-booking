// Database rows ↔ domain objects shared with the app (../src/domain/types.ts).

import type {
  Block,
  Booking,
  Category,
  IcalChannel,
  Lang,
  Localized,
  OutboxItem,
  Payment,
  Photo,
  Property,
  Season,
  Unit,
} from '../../src/domain/types';
import { many, one, type Queryable } from './db';

export interface PropertyRow {
  id: string;
  slug: string;
  owner_id: string;
  kind: Property['kind'];
  name: Localized;
  region: Localized;
  description: Localized;
  lat: number;
  lng: number;
  timezone: string;
  currency: Property['currency'];
  check_in_time: string;
  check_out_time: string;
  prepayment_percent: number;
  free_cancel_days: number;
  non_refundable: boolean;
  payment_methods: Property['paymentMethods'];
  amenities: Property['amenities'];
  hue: number;
  pay_qr_image: string | null;
  pay_recipient: string;
  pay_details: string;
  hold_hours: number;
  published: boolean;
  aynes_key_enc: string | null;
  aynes_key_hint: string | null;
  aynes_share_guest_name: boolean;
}

export function toProperty(r: PropertyRow): Property {
  return {
    id: r.id,
    slug: r.slug,
    ownerId: r.owner_id,
    kind: r.kind,
    name: r.name,
    region: r.region,
    description: r.description,
    lat: r.lat,
    lng: r.lng,
    timezone: r.timezone,
    currency: r.currency,
    checkInTime: r.check_in_time,
    checkOutTime: r.check_out_time,
    cancellation: {
      prepaymentPercent: r.prepayment_percent,
      freeCancelDays: r.free_cancel_days,
      nonRefundable: r.non_refundable,
    },
    paymentMethods: r.payment_methods,
    amenities: r.amenities,
    hue: r.hue,
    payment: {
      qrImage: r.pay_qr_image,
      recipient: r.pay_recipient,
      details: r.pay_details,
      holdHours: r.hold_hours,
    },
  };
}

export interface CategoryRow {
  id: string;
  property_id: string;
  name: Localized;
  capacity: number;
  base_occupancy: number;
  base_price: number;
  extra_guest_price: number;
  min_nights: number;
}

export const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  propertyId: r.property_id,
  name: r.name,
  capacity: r.capacity,
  baseOccupancy: r.base_occupancy,
  basePrice: r.base_price,
  extraGuestPrice: r.extra_guest_price,
  minNights: r.min_nights,
});

export interface UnitRow {
  id: string;
  property_id: string;
  category_id: string;
  name: string;
  ical_token: string;
}

export const toUnit = (r: UnitRow): Unit => ({ id: r.id, propertyId: r.property_id, categoryId: r.category_id, name: r.name });

export interface SeasonRow {
  id: string;
  property_id: string;
  category_id: string | null;
  name: Localized;
  date_from: string;
  date_to: string;
  price: number;
  min_nights: number | null;
}

export const toSeason = (r: SeasonRow): Season => ({
  id: r.id,
  propertyId: r.property_id,
  categoryId: r.category_id,
  name: r.name,
  from: r.date_from,
  to: r.date_to,
  price: r.price,
  minNights: r.min_nights,
});

export interface BlockRow {
  id: string;
  unit_id: string;
  date_from: string;
  date_to: string;
  reason: Block['reason'];
  label: string;
}

export const toBlock = (r: BlockRow): Block => ({ id: r.id, unitId: r.unit_id, from: r.date_from, to: r.date_to, reason: r.reason, label: r.label });

export interface IcalRow {
  id: string;
  unit_id: string;
  platform: IcalChannel['platform'];
  import_url: string;
  last_sync_at: string | null;
  last_error: string | null;
}

export const toIcal = (r: IcalRow): IcalChannel & { lastError: string | null } => ({
  id: r.id,
  unitId: r.unit_id,
  platform: r.platform,
  importUrl: r.import_url,
  lastSyncAt: r.last_sync_at,
  lastError: r.last_error,
});

export interface BookingRow {
  id: string;
  version: number;
  property_id: string;
  unit_id: string;
  category_id: string;
  check_in: string;
  check_out: string;
  guests: number;
  guest_name: string;
  guest_phone: string;
  channel: Booking['channel'];
  status: Booking['status'];
  currency: Booking['currency'];
  total: number;
  prepayment_due: number;
  non_refundable_prepayment: boolean;
  note: string;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancel_reason: Booking['cancelReason'];
  created_by: Booking['createdBy'];
  source: Booking['source'];
  hold_until: string | null;
  guest_reported_paid_at: string | null;
  guest_token_hash: string | null;
  guest_chat_id: string | null;
  guest_lang: Lang;
  guest_link_code: string | null;
  guest_token_enc: string | null;
}

export const toBooking = (r: BookingRow): Booking => ({
  id: r.id,
  version: r.version,
  propertyId: r.property_id,
  unitId: r.unit_id,
  categoryId: r.category_id,
  checkIn: r.check_in,
  checkOut: r.check_out,
  guests: r.guests,
  guestName: r.guest_name,
  guestPhone: r.guest_phone,
  channel: r.channel,
  status: r.status,
  currency: r.currency,
  total: r.total,
  prepaymentDue: r.prepayment_due,
  nonRefundablePrepayment: r.non_refundable_prepayment,
  note: r.note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  cancelledAt: r.cancelled_at,
  cancelReason: r.cancel_reason,
  createdBy: r.created_by,
  source: r.source,
  holdUntil: r.hold_until,
  guestReportedPaidAt: r.guest_reported_paid_at,
});

export interface PaymentRow {
  id: string;
  booking_id: string;
  kind: Payment['kind'];
  method: Payment['method'];
  provider: string | null;
  amount: number;
  fee: number;
  currency: Payment['currency'];
  paid_at: string;
  status: Payment['status'];
}

export const toPayment = (r: PaymentRow): Payment => ({
  id: r.id,
  bookingId: r.booking_id,
  kind: r.kind,
  method: r.method,
  provider: r.provider,
  amount: r.amount,
  fee: r.fee,
  currency: r.currency,
  paidAt: r.paid_at,
  status: r.status,
});

export interface OutboxRow {
  id: number;
  property_id: string;
  path: string;
  body: unknown;
  status: OutboxItem['status'];
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
}

export const toOutbox = (r: OutboxRow): OutboxItem => ({
  id: String(r.id),
  method: 'PUT',
  path: r.path,
  body: r.body,
  createdAt: r.created_at,
  attempts: r.attempts,
  status: r.status,
  lastError: r.last_error,
});

/** Everything needed to price and place a stay at one property. */
export interface PropertyBundle {
  row: PropertyRow;
  property: Property;
  categories: Category[];
  units: Unit[];
  seasons: Season[];
  bookings: Booking[];
  blocks: Block[];
}

export async function loadBundle(q: Queryable, where: { id?: string; slug?: string }, from?: string): Promise<PropertyBundle | undefined> {
  const row = where.id
    ? await one<PropertyRow>(q, 'select * from properties where id = $1', [where.id])
    : await one<PropertyRow>(q, 'select * from properties where slug = $1', [where.slug]);
  if (!row) return undefined;
  const since = from ?? '1900-01-01';
  const [categories, units, seasons, bookings, blocks] = await Promise.all([
    many<CategoryRow>(q, 'select * from categories where property_id = $1 order by sort, id', [row.id]),
    many<UnitRow>(q, 'select * from units where property_id = $1 order by sort, name', [row.id]),
    many<SeasonRow>(q, 'select * from seasons where property_id = $1 order by date_from', [row.id]),
    many<BookingRow>(
      q,
      `select * from bookings where property_id = $1 and check_out > $2
         and status in ('pending','confirmed','checked_in','checked_out')`,
      [row.id, since],
    ),
    many<BlockRow>(q, 'select b.* from blocks b join units u on u.id = b.unit_id where u.property_id = $1 and b.date_to > $2', [row.id, since]),
  ]);
  return {
    row,
    property: toProperty(row),
    categories: categories.map(toCategory),
    units: units.map(toUnit),
    seasons: seasons.map(toSeason),
    bookings: bookings.map(toBooking),
    blocks: blocks.map(toBlock),
  };
}

export interface PhotoRow {
  id: string;
  property_id: string;
  width: number;
  height: number;
  mime: string;
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };

export const toPhoto = (r: PhotoRow, apiUrl: string): Photo => ({
  id: r.id,
  propertyId: r.property_id,
  url: `${apiUrl}photos/${r.id}.${EXT[r.mime] ?? 'jpg'}`,
  width: r.width,
  height: r.height,
});

/** Photo list without the bytes. */
export const PHOTO_COLUMNS = 'id, property_id, width, height, mime, sort';
