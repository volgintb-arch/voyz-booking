// What guests see: published properties with prices and occupancy (no guest data).

import { addDays, todayIn } from '../../../src/domain/dates';
import type { Category, Property, Season, Unit } from '../../../src/domain/types';
import type { Ctx } from '../context';
import { many } from '../db';
import { toCategory, toProperty, toSeason, toUnit, type CategoryRow, type PropertyRow, type SeasonRow, type UnitRow } from '../model';

export interface Occupancy {
  unitId: string;
  from: string;
  to: string;
}

export interface Catalog {
  properties: (Omit<Property, 'payment' | 'ownerId'> & { payment: { holdHours: number } })[];
  categories: Category[];
  units: Unit[];
  seasons: Season[];
  occupancy: Occupancy[];
}

export async function catalog(ctx: Ctx, slug?: string): Promise<Catalog> {
  const props = await many<PropertyRow>(ctx.db, `select * from properties where published ${slug ? 'and slug = $1' : ''} order by created_at`, slug ? [slug] : []);
  const ids = props.map((p) => p.id);
  if (ids.length === 0) return { properties: [], categories: [], units: [], seasons: [], occupancy: [] };
  const since = addDays(todayIn('Asia/Bishkek', ctx.now()), -1);
  const [categories, units, seasons, bookings, blocks] = await Promise.all([
    many<CategoryRow>(ctx.db, 'select * from categories where property_id = any($1) order by sort, id', [ids]),
    many<UnitRow>(ctx.db, 'select * from units where property_id = any($1) order by sort, name', [ids]),
    many<SeasonRow>(ctx.db, 'select * from seasons where property_id = any($1) and date_to >= $2', [ids, since]),
    many<Occupancy>(
      ctx.db,
      `select unit_id as "unitId", check_in as "from", check_out as "to" from bookings
        where property_id = any($1) and check_out > $2 and status in ('pending','confirmed','checked_in','checked_out')`,
      [ids, since],
    ),
    many<Occupancy>(
      ctx.db,
      `select b.unit_id as "unitId", b.date_from as "from", b.date_to as "to" from blocks b join units u on u.id = b.unit_id
        where u.property_id = any($1) and b.date_to > $2`,
      [ids, since],
    ),
  ]);
  return {
    properties: props.map((r) => {
      // Owner and payment details stay private until a guest has a booking.
      const p = toProperty(r);
      return {
        id: p.id, slug: p.slug, kind: p.kind, name: p.name, region: p.region, description: p.description, lat: p.lat, lng: p.lng,
        timezone: p.timezone, currency: p.currency, checkInTime: p.checkInTime, checkOutTime: p.checkOutTime,
        cancellation: p.cancellation, paymentMethods: p.paymentMethods, amenities: p.amenities, hue: p.hue,
        payment: { holdHours: p.payment.holdHours },
      };
    }),
    categories: categories.map(toCategory),
    units: units.map(toUnit),
    seasons: seasons.map(toSeason),
    occupancy: [...bookings, ...blocks],
  };
}
