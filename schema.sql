-- =====================================================================
-- Trikitrueke · esquema de base de datos para Supabase
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- Se puede ejecutar más de una vez sin romper nada.
--
-- Qué crea:
--   profiles, consents      Alias público y registro de aceptación de normas
--   categories, zones       Listas que cualquier usuario puede ampliar (con límite diario)
--   listings                Anuncios (con estados: active, done, hidden)
--   offers, offer_messages  Propuestas de trueque y su conversación privada
--   reports                 Denuncias de anuncios
--   admins                  Quién puede moderar
--   Bucket "photos"         Fotos de los anuncios
--
-- Seguridad: todas las tablas tienen RLS activado. Sin una política que lo
-- permita, nadie puede leer ni escribir. La clave pública (anon) que va en la
-- web NO da acceso a nada que no permitan estas políticas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  alias       text not null check (alias ~ '^[A-Za-z0-9_.-]{3,30}$'),
  created_at  timestamptz not null default now()
);
create unique index if not exists profiles_alias_lower_key on public.profiles (lower(alias));

-- Prueba de que la persona aceptó las normas y confirmó su edad al registrarse.
create table if not exists public.consents (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  accepted_terms_at  timestamptz not null,
  age_confirmed      boolean not null,
  doc_version        text not null
);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.categories (
  id          text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name        text not null check (char_length(name) between 2 and 30),
  icon        text not null default 'tag',
  hue         int  not null default 200 check (hue between 0 and 360),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists categories_name_lower_key on public.categories (lower(name));

create table if not exists public.zones (
  name        text primary key check (char_length(name) between 2 and 30),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists zones_name_lower_key on public.zones (lower(name));

create table if not exists public.listings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  title            text not null check (char_length(btrim(title)) between 3 and 80),
  description      text not null default '' check (char_length(description) <= 500),
  category_id      text not null references public.categories(id),
  want             text not null default '' check (char_length(want) <= 100),
  open_to_offers   boolean not null default false,
  zone             text not null references public.zones(name) on update cascade,
  town             text not null default '' check (char_length(town) <= 40),
  photo_path       text check (photo_path is null or (char_length(photo_path) <= 200 and photo_path like user_id::text || '/%')),
  status           text not null default 'active' check (status in ('active','done','hidden')),
  moderation_note  text check (moderation_note is null or char_length(moderation_note) <= 300),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint listings_want_or_open check (btrim(want) <> '' or open_to_offers)
);
create index if not exists listings_status_created_idx on public.listings (status, created_at desc);
create index if not exists listings_category_idx on public.listings (category_id);
create index if not exists listings_zone_idx on public.listings (zone);
create index if not exists listings_user_idx on public.listings (user_id);

create table if not exists public.offers (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  from_user   uuid not null references public.profiles(id) on delete cascade,
  offer_text  text not null check (char_length(btrim(offer_text)) between 2 and 100),
  message     text not null default '' check (char_length(message) <= 400),
  status      text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  created_at  timestamptz not null default now()
);
-- Solo una propuesta pendiente por persona y anuncio.
create unique index if not exists offers_one_pending on public.offers (listing_id, from_user) where status = 'pending';
create index if not exists offers_listing_idx on public.offers (listing_id);
create index if not exists offers_from_idx on public.offers (from_user);

create table if not exists public.offer_messages (
  id          uuid primary key default gen_random_uuid(),
  offer_id    uuid not null references public.offers(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists offer_messages_offer_idx on public.offer_messages (offer_id, created_at);

create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  reporter_id  uuid not null references public.profiles(id) on delete cascade,
  reason       text not null check (reason in ('venta','prohibido','estafa','ofensivo','datos','otro')),
  details      text not null default '' check (char_length(details) <= 300),
  status       text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at   timestamptz not null default now(),
  unique (listing_id, reporter_id)
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);

-- ---------------------------------------------------------------------
-- 2. FUNCIONES AUXILIARES
-- ---------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.owns_listing(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.listings where id = lid and user_id = auth.uid());
$$;

create or replace function public.is_offer_party(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.offers o join public.listings l on l.id = o.listing_id
    where o.id = oid and (o.from_user = auth.uid() or l.user_id = auth.uid())
  );
$$;

-- ¿Está libre este alias? (la web lo consulta antes de registrar)
create or replace function public.alias_available(a text) returns boolean
language sql stable security definer set search_path = public as $$
  select a ~ '^[A-Za-z0-9_.-]{3,30}$'
     and not exists (select 1 from public.profiles where lower(alias) = lower(a));
$$;

-- Crea el perfil y guarda el consentimiento cuando alguien se registra.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a text;
  tries int := 0;
begin
  if coalesce(new.raw_user_meta_data->>'age_confirmed', 'false') <> 'true'
     or coalesce(new.raw_user_meta_data->>'terms_accepted', 'false') <> 'true' then
    raise exception 'consent_required';
  end if;
  a := coalesce(new.raw_user_meta_data->>'alias', '');
  if a !~ '^[A-Za-z0-9_.-]{3,30}$' then
    a := 'usuario' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  while exists (select 1 from public.profiles where lower(alias) = lower(a)) and tries < 5 loop
    a := left(a, 24) || (floor(random() * 9000 + 1000))::int::text;
    tries := tries + 1;
  end loop;
  insert into public.profiles (id, alias) values (new.id, a);
  insert into public.consents (user_id, accepted_terms_at, age_confirmed, doc_version)
  values (new.id, now(), true, coalesce(new.raw_user_meta_data->>'doc_version', '1'));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Borrar la propia cuenta y todo lo que cuelga de ella (derecho de supresión).
-- Las fotos las borra antes la propia web desde el navegador.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- 3. LÍMITES ANTI-SPAM Y REGLAS QUE NO SE PUEDEN SALTAR
--    (si auth.uid() es null, la operación viene del panel de Supabase o del
--     servidor: se considera de confianza y no se limita)
-- ---------------------------------------------------------------------

create or replace function public.trg_listings_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if (select count(*) from public.listings where user_id = new.user_id and created_at > now() - interval '1 day') >= 10 then
      raise exception 'rate_limit_listings';
    end if;
    if (select count(*) from public.listings where user_id = new.user_id and status in ('active','hidden')) >= 40 then
      raise exception 'listing_cap';
    end if;
    new.status := 'active';
    new.moderation_note := null;
  end if;
  return new;
end $$;
drop trigger if exists listings_before_insert on public.listings;
create trigger listings_before_insert before insert on public.listings
  for each row execute function public.trg_listings_insert();

create or replace function public.trg_listings_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null and not public.is_admin() then
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    new.moderation_note := old.moderation_note;
    -- Un anuncio oculto por moderación solo lo puede reactivar un administrador.
    if old.status = 'hidden' then
      new.status := 'hidden';
    elsif new.status = 'hidden' then
      new.status := old.status;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists listings_before_update on public.listings;
create trigger listings_before_update before update on public.listings
  for each row execute function public.trg_listings_update();

create or replace function public.trg_offers_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if (select count(*) from public.offers where from_user = new.from_user and created_at > now() - interval '1 day') >= 20 then
      raise exception 'rate_limit_offers';
    end if;
    new.status := 'pending';
  end if;
  return new;
end $$;
drop trigger if exists offers_before_insert on public.offers;
create trigger offers_before_insert before insert on public.offers
  for each row execute function public.trg_offers_insert();

create or replace function public.trg_offers_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.listing_id <> old.listing_id or new.from_user <> old.from_user
     or new.offer_text <> old.offer_text or new.message <> old.message
     or new.created_at <> old.created_at then
    raise exception 'offer_immutable';
  end if;
  select user_id into owner from public.listings where id = old.listing_id;
  if auth.uid() = old.from_user then
    -- Quien propone solo puede retirar su propuesta.
    if not (new.status = 'withdrawn' and old.status in ('pending','accepted')) and new.status <> old.status then
      raise exception 'offer_transition';
    end if;
  elsif auth.uid() = owner then
    -- Quien publicó el anuncio solo puede aceptar o rechazar una propuesta pendiente.
    if new.status <> old.status and not (old.status = 'pending' and new.status in ('accepted','declined')) then
      raise exception 'offer_transition';
    end if;
  else
    raise exception 'offer_forbidden';
  end if;
  return new;
end $$;
drop trigger if exists offers_before_update on public.offers;
create trigger offers_before_update before update on public.offers
  for each row execute function public.trg_offers_update();

create or replace function public.trg_messages_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  st text;
begin
  select status into st from public.offers where id = new.offer_id;
  if st in ('declined','withdrawn') then
    raise exception 'offer_closed';
  end if;
  if auth.uid() is not null and not public.is_admin() then
    if (select count(*) from public.offer_messages where sender_id = new.sender_id and created_at > now() - interval '1 day') >= 100 then
      raise exception 'rate_limit_messages';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists messages_before_insert on public.offer_messages;
create trigger messages_before_insert before insert on public.offer_messages
  for each row execute function public.trg_messages_insert();

-- Categorías y zonas nuevas: como máximo 3 al día por persona.
create or replace function public.trg_catalog_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_table_name = 'categories' then
      select count(*) into n from public.categories where created_by = auth.uid() and created_at > now() - interval '1 day';
    else
      select count(*) into n from public.zones where created_by = auth.uid() and created_at > now() - interval '1 day';
    end if;
    if n >= 3 then
      raise exception 'rate_limit_catalog';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists categories_before_insert on public.categories;
create trigger categories_before_insert before insert on public.categories
  for each row execute function public.trg_catalog_insert();
drop trigger if exists zones_before_insert on public.zones;
create trigger zones_before_insert before insert on public.zones
  for each row execute function public.trg_catalog_insert();

-- ---------------------------------------------------------------------
-- 4. VISTA CON EL NÚMERO DE ANUNCIOS POR CATEGORÍA
-- ---------------------------------------------------------------------

create or replace view public.category_counts with (security_invoker = true) as
  select category_id, count(*)::int as n
  from public.listings
  where status = 'active'
  group by category_id;

-- ---------------------------------------------------------------------
-- 5. SEGURIDAD A NIVEL DE FILA (RLS)
-- ---------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.consents       enable row level security;
alter table public.admins         enable row level security;
alter table public.categories     enable row level security;
alter table public.zones          enable row level security;
alter table public.listings       enable row level security;
alter table public.offers         enable row level security;
alter table public.offer_messages enable row level security;
alter table public.reports        enable row level security;

-- profiles: el alias es público; nadie lo cambia desde la web.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);

-- consents: cada persona ve solo el suyo.
drop policy if exists consents_read_own on public.consents;
create policy consents_read_own on public.consents for select to authenticated using (user_id = auth.uid());

-- admins: sin políticas = nadie accede desde la web (solo funciones internas).

-- categories y zones
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select using (true);
drop policy if exists categories_insert on public.categories;
create policy categories_insert on public.categories for insert to authenticated
  with check (created_by = auth.uid() and icon = 'tag');
drop policy if exists categories_delete_admin on public.categories;
create policy categories_delete_admin on public.categories for delete to authenticated using (public.is_admin());

drop policy if exists zones_read on public.zones;
create policy zones_read on public.zones for select using (true);
drop policy if exists zones_insert on public.zones;
create policy zones_insert on public.zones for insert to authenticated
  with check (created_by = auth.uid());
drop policy if exists zones_delete_admin on public.zones;
create policy zones_delete_admin on public.zones for delete to authenticated using (public.is_admin());

-- listings
drop policy if exists listings_read on public.listings;
create policy listings_read on public.listings for select
  using (status = 'active' or user_id = auth.uid() or public.is_admin());
drop policy if exists listings_insert on public.listings;
create policy listings_insert on public.listings for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists listings_update on public.listings;
create policy listings_update on public.listings for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
drop policy if exists listings_delete on public.listings;
create policy listings_delete on public.listings for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- offers: solo las ven quien propone y quien publicó el anuncio.
-- Los administradores NO leen conversaciones privadas.
drop policy if exists offers_read on public.offers;
create policy offers_read on public.offers for select to authenticated
  using (from_user = auth.uid() or public.owns_listing(listing_id));
drop policy if exists offers_insert on public.offers;
create policy offers_insert on public.offers for insert to authenticated
  with check (
    from_user = auth.uid()
    and exists (select 1 from public.listings l where l.id = listing_id and l.status = 'active' and l.user_id <> auth.uid())
  );
drop policy if exists offers_update on public.offers;
create policy offers_update on public.offers for update to authenticated
  using (from_user = auth.uid() or public.owns_listing(listing_id))
  with check (from_user = auth.uid() or public.owns_listing(listing_id));

-- offer_messages
drop policy if exists messages_read on public.offer_messages;
create policy messages_read on public.offer_messages for select to authenticated
  using (public.is_offer_party(offer_id));
drop policy if exists messages_insert on public.offer_messages;
create policy messages_insert on public.offer_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_offer_party(offer_id));

-- reports
drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
drop policy if exists reports_update_admin on public.reports;
create policy reports_update_admin on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 6. PERMISOS DE LAS TABLAS (las políticas de arriba afinan quién puede qué)
-- ---------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on public.profiles, public.categories, public.zones, public.listings, public.category_counts to anon;
grant select on public.profiles, public.categories, public.zones, public.listings, public.category_counts,
                public.offers, public.offer_messages, public.reports, public.consents to authenticated;
grant insert on public.categories, public.zones, public.listings, public.offers, public.offer_messages, public.reports to authenticated;
grant update on public.listings, public.offers, public.reports to authenticated;
grant delete on public.listings, public.categories, public.zones to authenticated;

grant execute on function public.alias_available(text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------
-- 7. FOTOS (almacenamiento)
--    Cada persona solo puede subir y borrar dentro de su carpeta: <id-de-usuario>/archivo.jpg
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists photos_select_own on storage.objects;
create policy photos_select_own on storage.objects for select to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists photos_insert_own on storage.objects;
create policy photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists photos_delete_own on storage.objects;
create policy photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------
-- 8. DATOS INICIALES
-- ---------------------------------------------------------------------

insert into public.categories (id, name, icon, hue) values
  ('vehiculos',    'Vehículos',         'car',    210),
  ('libros',       'Libros',            'book',    28),
  ('discos',       'Discos y música',   'disc',   330),
  ('ropa',         'Ropa',              'shirt',  350),
  ('casas',        'Casas y escapadas', 'home',   165),
  ('deporte',      'Deporte',           'bike',   120),
  ('tecnologia',   'Tecnología',        'laptop', 250),
  ('hogar',        'Hogar',             'sofa',    18),
  ('herramientas', 'Herramientas',      'tool',    45)
on conflict do nothing;

insert into public.zones (name) values
  ('Navarra'), ('La Rioja'), ('Aragón'), ('Soria'), ('Madrid'), ('Cataluña')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 9. TU CUENTA DE ADMINISTRADOR (ejecútalo DESPUÉS de registrarte en la web)
--    Cambia el correo por el tuyo y ejecuta solo esta línea:
--
--    insert into public.admins (user_id) select id from auth.users where email = 'TU-CORREO@ejemplo.com';
-- ---------------------------------------------------------------------
