-- Sprint 12R-P1: allow safe contacts materialized from canonical operational matches.
alter table public.contacts drop constraint if exists contacts_contact_type_check;
alter table public.contacts add constraint contacts_contact_type_check
  check (contact_type in ('driver','driver_operational','customer','recipient','shipper','employee','third_party','unknown'));
