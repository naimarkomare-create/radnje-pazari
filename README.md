# Interna aplikacija za dnevne izveštaje

Next.js MVP za internu upotrebu u 10 maloprodajnih radnji. Aplikacija koristi Supabase Auth, Supabase PostgreSQL i Row Level Security. Podaci se ne čuvaju lokalno.

## Tehnologije

- Next.js
- TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase PostgreSQL
- Supabase Row Level Security
- Vercel

## 1. Kreiranje Supabase projekta

1. Otvorite Supabase i napravite novi projekat.
2. Sačuvajte `Project URL` i `anon public` key iz `Project Settings > API`.
3. U `Authentication > Providers` proverite da je email login uključen.

## 2. Pokretanje SQL migracije

1. Otvorite `SQL Editor` u Supabase.
2. Kopirajte ceo sadržaj fajla `supabase/migrations/001_initial_schema.sql`.
3. Pokrenite SQL.

Migracija pravi tabele, RLS funkcije, RLS politike i seed podatke za:

- Radnja 1
- Radnja 2
- Radnja 3
- Radnja 4
- Radnja 5
- Radnja 6
- Radnja 7
- Radnja 8
- Radnja 9
- Radnja 11

Za strukturisana trebovanja voća i povrća zatim pokrenite ceo sadržaj fajla:

```text
supabase/migrations/002_structured_produce_requests.sql
```

Ova migracija:

- čuva postojeću `produce_requests` tabelu i stare podatke
- dodaje katalog artikala i batch/item strukturu trebovanja
- dodaje stroge RLS politike za nove tabele
- dodaje funkciju za transakciono slanje jednog trebovanja
- menja postojeći naziv `Radnja 10` u `Radnja 11`

Za kontrolu police voća i povrća zatim pokrenite ceo sadržaj fajla:

```text
supabase/migrations/003_produce_shelf_photo_checks.sql
```

Ova migracija:

- dodaje tabelu `produce_shelf_photo_checks`
- kreira privatni Storage bucket `shelf-photos`
- dodaje Storage politike za upload i pregled slika
- dozvoljava store korisniku upload samo u folder svoje radnje
- dozvoljava adminima pregled svih slika

## Supabase Storage bucket

Migracija automatski kreira bucket:

- bucket: `shelf-photos`
- public: `false`
- dozvoljeni tipovi: `image/jpeg`, `image/png`, `image/webp`
- maksimalna veličina: 5 MB

Slike se čuvaju kao:

```text
shelf-photos/YYYY-MM-DD/store-id/timestamp.jpg
```

Ako bucket pravite ručno, mora biti privatan i mora imati iste RLS politike iz migracije `003_produce_shelf_photo_checks.sql`.

## 3. Kreiranje 10 store korisnika

1. U Supabase otvorite `Authentication > Users`.
2. Kliknite `Add user`.
3. Za svaku radnju napravite jedan email/password nalog sa internom `@firma.local` adresom.
4. Ako ne želite potvrdu emaila, označite opciju da je email potvrđen.

Korisnici u aplikaciji unose samo korisničko ime. Aplikacija automatski dodaje `@firma.local` pre prijave na Supabase.

Store Auth nalozi:

- `radnja1@firma.local` - korisničko ime `radnja1`
- `radnja2@firma.local` - korisničko ime `radnja2`
- `radnja3@firma.local` - korisničko ime `radnja3`
- `radnja4@firma.local` - korisničko ime `radnja4`
- `radnja5@firma.local` - korisničko ime `radnja5`
- `radnja6@firma.local` - korisničko ime `radnja6`
- `radnja7@firma.local` - korisničko ime `radnja7`
- `radnja8@firma.local` - korisničko ime `radnja8`
- `radnja9@firma.local` - korisničko ime `radnja9`
- `radnja11@firma.local` - korisničko ime `radnja11`, dodeljeno Radnji 10

## 4. Kreiranje 2 admin korisnika

1. U `Authentication > Users` dodajte dva admin naloga.
2. Napravite interne Auth naloge:
   - `admin1@firma.local` - korisničko ime `admin1`
   - `admin2@firma.local` - korisničko ime `admin2`

## 5. Dodela store_id store korisnicima

Posle kreiranja Auth korisnika, otvorite `SQL Editor` i prvo proverite ID vrednosti:

```sql
select id, email from auth.users order by email;
select id, name from public.stores order by name;
```

Zatim unesite profile za store korisnike. Zamenite UUID vrednosti stvarnim vrednostima iz prethodna dva upita:

```sql
insert into public.profiles (id, email, role, store_id)
values
  ('AUTH_USER_ID_RADNJA_1', 'radnja1@firma.local', 'store', 'STORE_ID_RADNJA_1'),
  ('AUTH_USER_ID_RADNJA_2', 'radnja2@firma.local', 'store', 'STORE_ID_RADNJA_2'),
  ('AUTH_USER_ID_RADNJA_3', 'radnja3@firma.local', 'store', 'STORE_ID_RADNJA_3'),
  ('AUTH_USER_ID_RADNJA_4', 'radnja4@firma.local', 'store', 'STORE_ID_RADNJA_4'),
  ('AUTH_USER_ID_RADNJA_5', 'radnja5@firma.local', 'store', 'STORE_ID_RADNJA_5'),
  ('AUTH_USER_ID_RADNJA_6', 'radnja6@firma.local', 'store', 'STORE_ID_RADNJA_6'),
  ('AUTH_USER_ID_RADNJA_7', 'radnja7@firma.local', 'store', 'STORE_ID_RADNJA_7'),
  ('AUTH_USER_ID_RADNJA_8', 'radnja8@firma.local', 'store', 'STORE_ID_RADNJA_8'),
  ('AUTH_USER_ID_RADNJA_9', 'radnja9@firma.local', 'store', 'STORE_ID_RADNJA_9'),
  ('AUTH_USER_ID_RADNJA_11', 'radnja11@firma.local', 'store', 'STORE_ID_RADNJA_11');
```

## 6. Podešavanje admin korisnika

Admin korisnici moraju imati `role = 'admin'` i `store_id = null`.

```sql
insert into public.profiles (id, email, role, store_id)
values
  ('AUTH_USER_ID_ADMIN_1', 'admin1@firma.local', 'admin', null),
  ('AUTH_USER_ID_ADMIN_2', 'admin2@firma.local', 'admin', null);
```

## 7. Environment promenljive

Lokalno napravite `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CLEANUP_SECRET=your-long-random-cleanup-secret
CRON_SECRET=your-long-random-cleanup-secret
```

Iste promenljive dodajte u Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLEANUP_SECRET`
- `CRON_SECRET`

`SUPABASE_SERVICE_ROLE_KEY` se koristi samo na serveru za cleanup starih slika. Nikada ga ne dodavati sa `NEXT_PUBLIC_` prefiksom.

`CRON_SECRET` treba da ima istu vrednost kao `CLEANUP_SECRET` da bi Vercel Cron mogao da pozove cleanup rutu preko `Authorization` headera.

## Cleanup starih slika

Aplikacija ima API rutu:

```text
/api/cleanup-shelf-photos
```

Ruta briše slike starije od 30 dana iz `shelf-photos` bucket-a i zatim briše odgovarajuće redove iz `produce_shelf_photo_checks`.

Ručni test sa query secret-om:

```bash
curl "https://your-vercel-domain.vercel.app/api/cleanup-shelf-photos?secret=YOUR_CLEANUP_SECRET"
```

Bezbedan test:

1. Prvo proverite u Supabase da li postoje redovi stariji od 30 dana:

```sql
select id, check_date, storage_path
from public.produce_shelf_photo_checks
where check_date < current_date - interval '30 days';
```

2. Ako nema starih redova, cleanup treba da vrati `deletedFiles: 0`.
3. Ako želite test brisanja, napravite samo jedan test red i test sliku u `shelf-photos` bucket-u, sa datumom starijim od 30 dana.

## Vercel Cron

`vercel.json` pokreće cleanup jednom dnevno:

```json
{
  "crons": [
    {
      "path": "/api/cleanup-shelf-photos",
      "schedule": "0 3 * * *"
    }
  ]
}
```

Vercel šalje `Authorization: Bearer <CRON_SECRET>` kada je `CRON_SECRET` podešen u environment promenljivama.

## Podsetnik za slikanje police

Store korisnici imaju osnovu za notifikacije na strani `/store/kontrola-police`.

Trenutno dugme `Uključi notifikacije` traži browser dozvolu na uređaju. Web Push slanje dnevnog podsetnika u 12:30 nije lažno implementirano; sledeći korak je dodavanje push subscription tabele, VAPID ključeva i cron rute koja šalje stvarne Web Push poruke.

## 8. Lokalno pokretanje

```bash
npm install
npm run dev
```

Otvorite `http://localhost:3000`.

Za proveru TypeScript builda:

```bash
npm run typecheck
npm run build
```

## 9. Deploy na Vercel

1. Pushujte projekat na GitHub/GitLab/Bitbucket.
2. U Vercel kliknite `Add New Project`.
3. Izaberite repo.
4. Dodajte environment promenljive:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Kliknite `Deploy`.

Posle deploymenta aplikacija radi online na Vercel-u. Vaš računar ne mora da bude uključen jer su frontend na Vercel-u, a podaci u Supabase-u.

## Finalna ručna provera

1. Store korisnik može da se prijavi.
2. Store korisnik može da pošalje dnevni pazar.
3. Store korisnik može da pošalje temperaturu.
4. Store korisnik može da pošalje trebovanje voća/povrća.
5. Store korisnik vidi samo svoje unose.
6. Store korisnik ne može da otvori `/admin`.
7. Admin 1 može da otvori `/admin`.
8. Admin 2 može da otvori `/admin`.
9. Oba admina vide sve radnje i sve izveštaje.
10. Admin vidi `Poslato danas` i `Nije poslato danas`.
11. `npm run build` prolazi bez TypeScript grešaka.

## Ograničenja MVP verzije

- Nema editovanja i brisanja unosa.
- Nema grafikona.
- Nema Excel izvoza.
- Nema file upload funkcija.
- Nema notifikacija.
- Nema admin forme za kreiranje korisnika; korisnici i profili se podešavaju u Supabase-u.
