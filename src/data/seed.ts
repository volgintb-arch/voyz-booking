// Demo data: two hosts, four properties. Bookings are placed around "today"
// so the chessboard is never empty, whatever day the demo is opened.

import { addDays, todayIn } from '../domain/dates';
import type {
  Block,
  Booking,
  Category,
  IcalChannel,
  Payment,
  Property,
  Season,
  Unit,
} from '../domain/types';

export const DEMO_HOST_ID = 'host-1';
const TZ = 'Asia/Bishkek';

export interface SeedData {
  properties: Property[];
  categories: Category[];
  units: Unit[];
  seasons: Season[];
  bookings: Booking[];
  payments: Payment[];
  blocks: Block[];
  icalChannels: IcalChannel[];
}

const properties: Property[] = [
  {
    id: 'p-sonkul',
    slug: 'son-kul-aiyl',
    ownerId: 'host-1',
    kind: 'yurt_camp',
    name: { ru: 'Юрточный лагерь «Сон-Куль Айыл»', ky: '«Соң-Көл Айыл» боз үй лагери', en: 'Son-Kul Aiyl Yurt Camp' },
    region: { ru: 'Сон-Куль, Нарын', ky: 'Соң-Көл, Нарын', en: 'Son-Kul, Naryn' },
    description: {
      ru: 'Восемь юрт на северном берегу озера, 3016 м над уровнем моря. Ужин и завтрак из местных продуктов, конные прогулки к пастбищам.',
      ky: 'Көлдүн түндүк жээгинде сегиз боз үй, деңиз деңгээлинен 3016 м бийиктикте. Жергиликтүү азыктан кечки тамак жана эртең мененки тамак, жайлоого ат менен сейилдөө.',
      en: 'Eight yurts on the north shore of the lake at 3,016 m. Dinner and breakfast from local produce, horse rides to the summer pastures.',
    },
    lat: 41.85,
    lng: 75.12,
    timezone: TZ,
    currency: 'KGS',
    checkInTime: '14:00',
    checkOutTime: '11:00',
    cancellation: { prepaymentPercent: 30, freeCancelDays: 7, nonRefundable: false },
    paymentMethods: ['qr', 'transfer', 'cash'],
    amenities: ['breakfast', 'horse', 'shower', 'parking'],
    hue: 165,
  },
  {
    id: 'p-karakol',
    slug: 'karakol-house',
    ownerId: 'host-1',
    kind: 'guest_house',
    name: { ru: 'Гостевой дом «Каракол Хаус»', ky: '«Каракол Хаус» конок үйү', en: 'Karakol House Guesthouse' },
    region: { ru: 'Каракол, Иссык-Куль', ky: 'Каракол, Ысык-Көл', en: 'Karakol, Issyk-Kul' },
    description: {
      ru: 'Семейный дом в тихом квартале, 10 минут до центра. Баня, сад, трансфер на горнолыжную базу зимой.',
      ky: 'Тынч кварталдагы үй-бүлөлүк үй, борборго чейин 10 мүнөт. Мунча, бак, кышында тоо лыжа базасына трансфер.',
      en: 'Family-run house in a quiet street, 10 minutes from the centre. Sauna, garden, ski-base transfer in winter.',
    },
    lat: 42.49,
    lng: 78.39,
    timezone: TZ,
    currency: 'KGS',
    checkInTime: '13:00',
    checkOutTime: '12:00',
    cancellation: { prepaymentPercent: 20, freeCancelDays: 3, nonRefundable: false },
    paymentMethods: ['qr', 'card', 'cash'],
    amenities: ['wifi', 'breakfast', 'sauna', 'heating', 'parking'],
    hue: 28,
  },
  {
    id: 'p-bosteri',
    slug: 'bosteri-glamp',
    ownerId: 'host-2',
    kind: 'glamping',
    name: { ru: 'Глэмпинг «Бостери Бич»', ky: '«Бостери Бич» глэмпинги', en: 'Bosteri Beach Glamping' },
    region: { ru: 'Бостери, Иссык-Куль', ky: 'Бостери, Ысык-Көл', en: 'Bosteri, Issyk-Kul' },
    description: {
      ru: 'Четыре купола в 50 метрах от воды. Свой пляж, панорамные окна на горы Кунгей-Ала-Тоо.',
      ky: 'Суудан 50 метр алыстыкта төрт күмбөз. Өз пляжы, Күңгөй Ала-Тоого карай панорамалык терезелер.',
      en: 'Four domes 50 m from the water. Private beach, panoramic windows facing the Kungey Ala-Too.',
    },
    lat: 42.65,
    lng: 77.18,
    timezone: TZ,
    currency: 'KGS',
    checkInTime: '15:00',
    checkOutTime: '12:00',
    cancellation: { prepaymentPercent: 50, freeCancelDays: 14, nonRefundable: false },
    paymentMethods: ['qr', 'card'],
    amenities: ['beach', 'wifi', 'breakfast', 'parking'],
    hue: 205,
  },
  {
    id: 'p-tashrabat',
    slug: 'tash-rabat-eco',
    ownerId: 'host-2',
    kind: 'yurt_camp',
    name: { ru: 'Эко-юрты «Таш-Рабат»', ky: '«Таш-Рабат» эко боз үйлөрү', en: 'Tash-Rabat Eco Yurts' },
    region: { ru: 'Таш-Рабат, Нарын', ky: 'Таш-Рабат, Нарын', en: 'Tash-Rabat, Naryn' },
    description: {
      ru: 'Четыре юрты у караван-сарая XV века. Связи почти нет — бронь сохранится и уйдёт, когда хозяин поймает сеть.',
      ky: 'XV кылымдагы кербен сарайдын жанында төрт боз үй. Байланыш дээрлик жок — брондоо сакталып, ээси тармакка кошулганда жөнөтүлөт.',
      en: 'Four yurts next to the 15th-century caravanserai. Barely any signal — bookings are kept and sent once the host is back online.',
    },
    lat: 40.82,
    lng: 75.29,
    timezone: TZ,
    currency: 'KGS',
    checkInTime: '14:00',
    checkOutTime: '10:00',
    cancellation: { prepaymentPercent: 0, freeCancelDays: 1, nonRefundable: false },
    paymentMethods: ['cash'],
    amenities: ['breakfast', 'horse', 'heating'],
    hue: 95,
  },
];

const categories: Category[] = [
  { id: 'c-sk-std', propertyId: 'p-sonkul', name: { ru: 'Юрта стандарт', ky: 'Стандарттык боз үй', en: 'Standard yurt' }, capacity: 4, baseOccupancy: 2, basePrice: 350000, extraGuestPrice: 80000, minNights: 1 },
  { id: 'c-sk-fam', propertyId: 'p-sonkul', name: { ru: 'Семейная юрта', ky: 'Үй-бүлөлүк боз үй', en: 'Family yurt' }, capacity: 6, baseOccupancy: 4, basePrice: 500000, extraGuestPrice: 80000, minNights: 1 },
  { id: 'c-kh-dbl', propertyId: 'p-karakol', name: { ru: 'Двухместный номер', ky: 'Эки орундуу бөлмө', en: 'Double room' }, capacity: 2, baseOccupancy: 2, basePrice: 250000, extraGuestPrice: 0, minNights: 1 },
  { id: 'c-kh-fam', propertyId: 'p-karakol', name: { ru: 'Семейный номер', ky: 'Үй-бүлөлүк бөлмө', en: 'Family room' }, capacity: 4, baseOccupancy: 2, basePrice: 400000, extraGuestPrice: 50000, minNights: 2 },
  { id: 'c-bb-dome', propertyId: 'p-bosteri', name: { ru: 'Купол у озера', ky: 'Көл жээгиндеги күмбөз', en: 'Lakeside dome' }, capacity: 2, baseOccupancy: 2, basePrice: 700000, extraGuestPrice: 0, minNights: 2 },
  { id: 'c-tr-yurt', propertyId: 'p-tashrabat', name: { ru: 'Юрта', ky: 'Боз үй', en: 'Yurt' }, capacity: 5, baseOccupancy: 3, basePrice: 300000, extraGuestPrice: 70000, minNights: 1 },
];

const units: Unit[] = [
  ...[1, 2, 3, 4, 5].map((n) => ({ id: `u-sk-${n}`, propertyId: 'p-sonkul', categoryId: 'c-sk-std', name: `Юрта ${n}` })),
  ...[6, 7, 8].map((n) => ({ id: `u-sk-${n}`, propertyId: 'p-sonkul', categoryId: 'c-sk-fam', name: `Юрта ${n}` })),
  ...[1, 2, 3].map((n) => ({ id: `u-kh-${n}`, propertyId: 'p-karakol', categoryId: 'c-kh-dbl', name: `№ ${n}` })),
  ...[4, 5].map((n) => ({ id: `u-kh-${n}`, propertyId: 'p-karakol', categoryId: 'c-kh-fam', name: `№ ${n}` })),
  ...['A', 'B', 'C', 'D'].map((n) => ({ id: `u-bb-${n}`, propertyId: 'p-bosteri', categoryId: 'c-bb-dome', name: `Купол ${n}` })),
  ...[1, 2, 3, 4].map((n) => ({ id: `u-tr-${n}`, propertyId: 'p-tashrabat', categoryId: 'c-tr-yurt', name: `Юрта ${n}` })),
];

function seasons(year: number): Season[] {
  return [year, year + 1].flatMap((y) => [
    { id: `s-sk-high-${y}`, propertyId: 'p-sonkul', categoryId: null, name: { ru: 'Высокий сезон', ky: 'Жогорку сезон', en: 'High season' }, from: `${y}-07-01`, to: `${y}-08-31`, price: 450000, minNights: 2 },
    { id: `s-kh-ski-${y}`, propertyId: 'p-karakol', categoryId: 'c-kh-fam', name: { ru: 'Горнолыжный сезон', ky: 'Тоо лыжа сезону', en: 'Ski season' }, from: `${y}-12-20`, to: `${y + 1}-03-10`, price: 500000, minNights: 3 },
    { id: `s-bb-summer-${y}`, propertyId: 'p-bosteri', categoryId: null, name: { ru: 'Пляжный сезон', ky: 'Пляж сезону', en: 'Beach season' }, from: `${y}-06-15`, to: `${y}-08-31`, price: 950000, minNights: 3 },
  ]);
}

export function buildSeed(now: Date = new Date()): SeedData {
  const today = todayIn(TZ, now);
  const d = (offset: number) => addDays(today, offset);
  const stamp = now.toISOString();
  const year = Number(today.slice(0, 4));

  const booking = (
    n: number,
    unitId: string,
    categoryId: string,
    propertyId: string,
    from: number,
    nights: number,
    guestName: string,
    total: number,
    status: Booking['status'],
    channel: Booking['channel'],
    prepaymentDue: number,
  ): Booking => ({
    id: `VZ-${year}-${String(n).padStart(4, '0')}`,
    version: 1,
    propertyId,
    unitId,
    categoryId,
    checkIn: d(from),
    checkOut: d(from + nights),
    guests: 2,
    guestName,
    guestPhone: '+996 700 000 000',
    channel,
    status,
    currency: 'KGS',
    total,
    prepaymentDue,
    nonRefundablePrepayment: false,
    note: '',
    createdAt: stamp,
    updatedAt: stamp,
    cancelledAt: null,
    createdBy: channel === 'voyz' ? 'guest' : 'host',
  });

  const bookings: Booking[] = [
    booking(1, 'u-sk-1', 'c-sk-std', 'p-sonkul', -2, 3, 'Айгерим', 1050000, 'checked_in', 'instagram', 315000),
    booking(2, 'u-sk-2', 'c-sk-std', 'p-sonkul', 1, 2, 'Daniel K.', 700000, 'confirmed', 'voyz', 210000),
    booking(3, 'u-sk-3', 'c-sk-std', 'p-sonkul', 2, 4, 'Нурлан', 1400000, 'pending', 'voyz', 420000),
    booking(4, 'u-sk-6', 'c-sk-fam', 'p-sonkul', 0, 2, 'Семья Токтогуловых', 1000000, 'confirmed', 'whatsapp', 300000),
    booking(5, 'u-sk-7', 'c-sk-fam', 'p-sonkul', 5, 3, 'Марина', 1500000, 'confirmed', 'telegram', 450000),
    booking(6, 'u-kh-1', 'c-kh-dbl', 'p-karakol', -1, 2, 'Lena M.', 500000, 'checked_in', 'voyz', 100000),
    booking(7, 'u-kh-4', 'c-kh-fam', 'p-karakol', 3, 3, 'Бакыт', 1200000, 'pending', 'voyz', 240000),
    booking(8, 'u-kh-2', 'c-kh-dbl', 'p-karakol', 6, 2, 'Азамат', 500000, 'confirmed', 'phone', 100000),
  ];

  const payment = (id: string, bookingId: string, amount: number, method: Payment['method'], provider: string | null): Payment => ({
    id,
    bookingId,
    kind: 'prepayment',
    method,
    provider,
    amount,
    fee: 0,
    currency: 'KGS',
    paidAt: stamp,
    status: 'succeeded',
  });

  const payments: Payment[] = [
    payment('P-1', bookings[0]!.id, 315000, 'transfer', null),
    payment('P-2', bookings[1]!.id, 210000, 'qr', 'elqr'),
    payment('P-3', bookings[3]!.id, 300000, 'cash', null),
    payment('P-4', bookings[5]!.id, 100000, 'qr', 'mbank'),
  ];

  const blocks: Block[] = [
    { id: 'bl-1', unitId: 'u-kh-3', from: d(1), to: d(4), reason: 'ical', label: 'Booking.com' },
    { id: 'bl-2', unitId: 'u-sk-8', from: d(8), to: d(11), reason: 'closed', label: 'Ремонт' },
  ];

  const icalChannels: IcalChannel[] = [
    { id: 'ic-1', unitId: 'u-kh-3', platform: 'booking_com', importUrl: 'https://admin.booking.com/hotel/hoteladmin/ical.html?t=demo', lastSyncAt: stamp },
  ];

  return { properties, categories, units, seasons: seasons(year), bookings, payments, blocks, icalChannels };
}
