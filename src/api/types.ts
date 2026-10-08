import type { Block, Booking, Category, IcalChannel, Localized, OutboxItem, Payment, Photo, Property, Season, Unit } from '../domain/types';

/** Server answer for GET /api/host/state (and every host change). */
export interface HostSnapshot {
  host: { id: string; name: string; username: string | null; lang: string };
  properties: (Property & { aynes: { connected: boolean; keyHint: string | null; shareGuestName: boolean } })[];
  categories: Category[];
  units: (Unit & { icalExportUrl: string })[];
  seasons: Season[];
  bookings: Booking[];
  payments: Payment[];
  blocks: Block[];
  icalChannels: (IcalChannel & { lastError: string | null })[];
  outbox: OutboxItem[];
  photos: Photo[];
  result?: unknown;
}

/** Public catalog: no guest data, occupancy only. */
export interface Catalog {
  properties: (Omit<Property, 'ownerId' | 'payment'> & { payment: { holdHours: number } })[];
  categories: Category[];
  units: Unit[];
  seasons: Season[];
  occupancy: { unitId: string; from: string; to: string }[];
  photos: Photo[];
}

/** What a guest sees about their own booking. */
export interface GuestView {
  booking: Booking;
  paid: number;
  property: { slug: string; name: Localized; region: Localized; timezone: string; checkInTime: string; checkOutTime: string };
  payment: { qrImage: string | null; recipient: string; details: string };
  categoryName: Localized;
  refundIfCancelled: number;
  /** Follow the booking in the Telegram bot (server mode only). */
  telegram: { available: boolean; linked: boolean };
}
