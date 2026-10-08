import { z } from 'zod';
import { isIsoDate } from '../../src/domain/dates';

export const IsoDate = z.string().refine(isIsoDate, 'Expected YYYY-MM-DD');
export const Money = z.number().int().min(0).max(100_000_000_00);
export const LinkSource = z.enum(['instagram', 'whatsapp', 'telegram', 'qr', 'site', 'direct']);
export const PaymentMethod = z.enum(['qr', 'card', 'transfer', 'cash', 'ota']);
export const Channel = z.enum(['voyz', 'whatsapp', 'telegram', 'instagram', 'phone', 'walk_in', 'booking_com', 'airbnb']);
const Phone = z.string().trim().max(30).refine((v) => v.replace(/\D/g, '').length >= 9, 'Phone is too short');
const Name = z.string().trim().min(1).max(60);
const Time = z.string().regex(/^\d{2}:\d{2}$/);
const Localized = z.object({ ru: z.string().max(2000), ky: z.string().max(2000), en: z.string().max(2000) });

export const GuestBookingBody = z.object({
  categoryId: z.string().min(1),
  checkIn: IsoDate,
  checkOut: IsoDate,
  guests: z.number().int().min(1).max(30),
  guestName: Name,
  guestPhone: Phone,
  consent: z.literal(true),
  source: LinkSource.default('direct'),
});

export const HostBookingBody = z.object({
  unitId: z.string().min(1),
  checkIn: IsoDate,
  checkOut: IsoDate,
  guests: z.number().int().min(1).max(30),
  guestName: Name,
  guestPhone: z.string().trim().max(30).default(''),
  channel: Channel.default('whatsapp'),
  total: Money.optional(),
  confirm: z.boolean().default(true),
  note: z.string().max(500).default(''),
});

export const OtaBookingBody = z.object({
  guestName: Name,
  guestPhone: z.string().trim().max(30).default(''),
  guests: z.number().int().min(1).max(30),
  channel: Channel,
  total: Money.refine((v) => v > 0, 'Total must be positive'),
  commission: Money.default(0),
  note: z.string().max(500).default(''),
});

export const StatusBody = z.object({ status: z.enum(['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show']) });

export const PaymentBody = z.object({
  kind: z.enum(['prepayment', 'payment', 'refund']),
  method: PaymentMethod,
  amount: Money.refine((v) => v > 0, 'Amount must be positive'),
  fee: Money.default(0),
  provider: z.string().trim().max(40).nullable().default(null),
});

export const DepositBody = z.object({ method: PaymentMethod.default('qr') });
export const ExtendBody = z.object({ hours: z.number().int().min(1).max(72).default(12) });

export const Amenity = z.enum(['breakfast', 'parking', 'shower', 'wifi', 'horse', 'sauna', 'beach', 'heating']);
export const Kind = z.enum(['yurt_camp', 'guest_house', 'glamping', 'resort']);

export const PropertyPatchBody = z.object({
  kind: Kind.optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  amenities: z.array(Amenity).max(20).optional(),
  name: Localized.optional(),
  region: Localized.optional(),
  description: Localized.optional(),
  checkInTime: Time.optional(),
  checkOutTime: Time.optional(),
  cancellation: z
    .object({ prepaymentPercent: z.number().int().min(0).max(100), freeCancelDays: z.number().int().min(0).max(365), nonRefundable: z.boolean() })
    .optional(),
  paymentMethods: z.array(PaymentMethod).min(1).optional(),
  payment: z
    .object({
      // A downscaled screenshot of the bank QR (data URL), ~100 KB at most.
      qrImage: z.string().max(400_000).regex(/^data:image\/(png|jpeg|webp);base64,/).nullable(),
      recipient: z.string().trim().max(60),
      details: z.string().trim().max(80),
      holdHours: z.number().int().min(1).max(168),
    })
    .optional(),
  published: z.boolean().optional(),
});

export const CategoryPatchBody = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  baseOccupancy: z.number().int().min(1).max(50).optional(),
  basePrice: Money,
  extraGuestPrice: Money,
  minNights: z.number().int().min(1).max(60),
  capacity: z.number().int().min(1).max(50),
});

export const NewCategoryBody = z.object({
  name: z.string().trim().min(1).max(60),
  capacity: z.number().int().min(1).max(50),
  baseOccupancy: z.number().int().min(1).max(50),
  basePrice: Money,
  extraGuestPrice: Money.default(0),
  minNights: z.number().int().min(1).max(60).default(1),
  units: z.array(z.string().trim().min(1).max(40)).min(1).max(100),
});

export const UnitBody = z.object({ name: z.string().trim().min(1).max(40) });

export const SeasonBody = z.object({
  categoryId: z.string().nullable().default(null),
  name: z.string().trim().min(1).max(40),
  from: IsoDate,
  to: IsoDate,
  price: Money,
  minNights: z.number().int().min(1).max(60).nullable().default(null),
});

export const BlockBody = z.object({ from: IsoDate, to: IsoDate, label: z.string().trim().max(40).default('') });

export const IcalBody = z.object({
  platform: z.enum(['booking_com', 'airbnb', 'other']),
  importUrl: z.string().url().max(1000).refine((u) => /^https?:\/\//.test(u), 'http(s) only'),
});

export const AynesBody = z.object({
  key: z.string().trim().regex(/^fsk_[A-Za-z0-9_-]{8,200}$/, 'Key starts with fsk_'),
  shareGuestName: z.boolean().default(true),
});

export const NewPropertyBody = z.object({
  kind: z.enum(['yurt_camp', 'guest_house', 'glamping', 'resort']),
  name: z.string().trim().min(2).max(80),
  region: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).default(''),
  lat: z.number().min(-90).max(90).default(0),
  lng: z.number().min(-180).max(180).default(0),
  checkInTime: Time.default('14:00'),
  checkOutTime: Time.default('12:00'),
  categories: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        capacity: z.number().int().min(1).max(50),
        baseOccupancy: z.number().int().min(1).max(50),
        basePrice: Money,
        extraGuestPrice: Money.default(0),
        units: z.array(z.string().trim().min(1).max(40)).min(1).max(100),
      }),
    )
    .min(1)
    .max(20),
});
