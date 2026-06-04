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
- Radnja 10

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
  ('AUTH_USER_ID_RADNJA_11', 'radnja11@firma.local', 'store', 'STORE_ID_RADNJA_10');
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
```

Iste promenljive dodajte u Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

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
