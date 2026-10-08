-- Voyz Booking — initial schema.
-- Money: bigint minor units. Stay dates: date (calendar days of the property).
-- Moments: timestamptz (UTC).

create extension if not exists btree_gist;

create table hosts (
  id           text primary key,
  telegram_id  bigint unique,
  name         text not null,
  username     text,
  lang         text not null default 'ru',
  created_at   timestamptz not null default now()
);

create table sessions (
  token_hash  text primary key,
  host_id     text not null references hosts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index sessions_host on sessions(host_id);

-- "Войти через Telegram": the app shows a code, the bot confirms it.
create table login_codes (
  code          text primary key,
  host_id       text references hosts(id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  confirmed_at  timestamptz,
  consumed_at   timestamptz
);

create table properties (
  id                      text primary key,
  slug                    text not null unique,
  owner_id                text not null references hosts(id),
  kind                    text not null,
  name                    jsonb not null,
  region                  jsonb not null,
  description             jsonb not null,
  lat                     double precision not null default 0,
  lng                     double precision not null default 0,
  timezone                text not null default 'Asia/Bishkek',
  currency                text not null default 'KGS',
  check_in_time           text not null default '14:00',
  check_out_time          text not null default '12:00',
  prepayment_percent      int not null default 0 check (prepayment_percent between 0 and 100),
  free_cancel_days        int not null default 0 check (free_cancel_days >= 0),
  non_refundable          boolean not null default false,
  payment_methods         text[] not null default '{cash}',
  amenities               text[] not null default '{}',
  hue                     int not null default 165,
  pay_qr_image            text,
  pay_recipient           text not null default '',
  pay_details             text not null default '',
  hold_hours              int not null default 24 check (hold_hours between 1 and 168),
  published               boolean not null default true,
  aynes_key_enc           text,
  aynes_key_hint          text,
  aynes_share_guest_name  boolean not null default true,
  created_at              timestamptz not null default now()
);
create index properties_owner on properties(owner_id);

create table categories (
  id                 text primary key,
  property_id        text not null references properties(id) on delete cascade,
  name               jsonb not null,
  capacity           int not null check (capacity >= 1),
  base_occupancy     int not null check (base_occupancy >= 1),
  base_price         bigint not null check (base_price >= 0),
  extra_guest_price  bigint not null default 0 check (extra_guest_price >= 0),
  min_nights         int not null default 1 check (min_nights >= 1),
  sort               int not null default 0
);
create index categories_property on categories(property_id);

create table units (
  id           text primary key,
  property_id  text not null references properties(id) on delete cascade,
  category_id  text not null references categories(id),
  name         text not null,
  sort         int not null default 0,
  ical_token   text not null unique
);
create index units_property on units(property_id);

create table seasons (
  id           text primary key,
  property_id  text not null references properties(id) on delete cascade,
  category_id  text references categories(id) on delete cascade,
  name         jsonb not null,
  date_from    date not null,
  date_to      date not null check (date_to >= date_from),
  price        bigint not null check (price >= 0),
  min_nights   int check (min_nights >= 1)
);
create index seasons_property on seasons(property_id);

create table ical_channels (
  id            text primary key,
  unit_id       text not null references units(id) on delete cascade,
  platform      text not null,
  import_url    text not null,
  last_sync_at  timestamptz,
  last_error    text
);

create table blocks (
  id               text primary key,
  unit_id          text not null references units(id) on delete cascade,
  date_from        date not null,
  date_to          date not null check (date_to > date_from),
  reason           text not null check (reason in ('closed', 'ical')),
  label            text not null default '',
  ical_channel_id  text references ical_channels(id) on delete cascade
);
create index blocks_unit on blocks(unit_id);

create sequence booking_seq start 1000;
create sequence payment_seq start 1000;

create table bookings (
  id                         text primary key,
  version                    int not null default 1,
  property_id                text not null references properties(id),
  unit_id                    text not null references units(id),
  category_id                text not null references categories(id),
  check_in                   date not null,
  check_out                  date not null,
  guests                     int not null check (guests >= 1),
  guest_name                 text not null,
  guest_phone                text not null default '',
  channel                    text not null,
  status                     text not null check (status in ('pending','confirmed','checked_in','checked_out','cancelled','no_show')),
  currency                   text not null,
  total                      bigint not null check (total >= 0),
  prepayment_due             bigint not null default 0 check (prepayment_due >= 0),
  non_refundable_prepayment  boolean not null default false,
  note                       text not null default '',
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  cancelled_at               timestamptz,
  cancel_reason              text,
  created_by                 text not null check (created_by in ('guest', 'host')),
  source                     text,
  hold_until                 timestamptz,
  guest_reported_paid_at     timestamptz,
  guest_token_hash           text,
  check (check_out > check_in),
  -- One yurt is never sold twice: no two holding bookings may share a night.
  constraint bookings_no_overlap exclude using gist (
    unit_id with =,
    daterange(check_in, check_out) with &&
  ) where (status in ('pending', 'confirmed', 'checked_in', 'checked_out'))
);
create index bookings_property_dates on bookings(property_id, check_in);
create index bookings_hold on bookings(hold_until) where status = 'pending';

create table payments (
  id          text primary key,
  booking_id  text not null references bookings(id) on delete cascade,
  kind        text not null check (kind in ('prepayment', 'payment', 'refund')),
  method      text not null check (method in ('qr', 'card', 'transfer', 'cash', 'ota')),
  provider    text,
  amount      bigint not null check (amount > 0),
  fee         bigint not null default 0 check (fee >= 0),
  currency    text not null,
  paid_at     timestamptz not null,
  status      text not null default 'succeeded' check (status in ('succeeded', 'cancelled'))
);
create index payments_booking on payments(booking_id);

-- Requests to Aynes, sent by a worker with retries (offline-first, idempotent PUTs).
create table outbox (
  id               bigserial primary key,
  property_id      text not null references properties(id) on delete cascade,
  path             text not null,
  body             jsonb not null,
  status           text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts         int not null default 0,
  next_attempt_at  timestamptz not null default now(),
  last_error       text,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz
);
create index outbox_due on outbox(next_attempt_at) where status = 'pending';
create index outbox_path on outbox(path) where status = 'pending';

-- Telegram notifications already sent (morning summary once per day).
create table notification_log (
  key         text primary key,
  created_at  timestamptz not null default now()
);
