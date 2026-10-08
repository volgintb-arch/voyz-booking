-- Property photos. Stored in the database so they move together with it
-- (Render → own server is one pg_dump). Phones shrink them to ~1600 px first.

create table photos (
  id           text primary key,
  property_id  text not null references properties(id) on delete cascade,
  sort         int not null default 0,
  mime         text not null check (mime in ('image/jpeg', 'image/webp', 'image/png')),
  width        int not null,
  height       int not null,
  size         int not null check (size <= 3000000),
  bytes        bytea not null,
  created_at   timestamptz not null default now()
);
create index photos_property on photos(property_id, sort);

alter table photos enable row level security;
