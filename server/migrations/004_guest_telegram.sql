-- Guests can follow their booking in Telegram (no account): the app asks for a
-- one-time link t.me/<bot>?start=g_<code>, the bot stores the guest's chat.

alter table bookings
  add column guest_chat_id    bigint,
  add column guest_lang       text not null default 'ru' check (guest_lang in ('ru', 'ky', 'en')),
  add column guest_link_code  text unique,
  -- The guest's access token, sealed with SERVER_SECRET: the bot's "Open booking"
  -- button restores the booking on any phone.
  add column guest_token_enc  text;
