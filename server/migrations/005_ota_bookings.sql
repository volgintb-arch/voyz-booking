-- Bookings from Booking.com / Airbnb. iCal brings only "taken" dates; the host
-- turns such a block into a booking with the sum and the OTA commission, so the
-- money reaches Aynes. The event UID ties the booking to the OTA calendar: the
-- next sync does not block those dates again and notices when the event is gone.

alter table blocks add column ical_uid text;

alter table bookings
  add column channel_commission bigint not null default 0 check (channel_commission >= 0),
  add column ical_channel_id    text references ical_channels(id) on delete set null,
  add column ical_uid           text;

create index bookings_ical on bookings(ical_channel_id) where ical_channel_id is not null;
