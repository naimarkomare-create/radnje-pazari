# Kontrolna lista za pilot u jednoj radnji

## FINALNI REDOSLED ZA PRODUKCIJU

### PRE-PRODUCTION

- [ ] Supabase backup je potvrđen.
- [ ] Vercel production promenljive su proverene bez prikazivanja njihovih vrednosti.
- [ ] BizniSoft akreditivi i sesije su rotirani ili opozvani ako su ranije bili izloženi.
- [ ] Lokalna validacija je uspešna: typecheck, lint, security testovi, build, audit i `git diff --check`.

### CLEAN START

- [ ] Pregledan je Storage cleanup dry run.
- [ ] Primenjeno je samo brisanje pouzdanih povezanih operativnih Storage fajlova.
- [ ] SQL cleanup je prvo pokrenut u `REVIEW_ONLY` režimu.
- [ ] SQL cleanup je zatim jednom pokrenut sa potvrdom `DELETE_OPERATIONAL_DATA`.
- [ ] Operativne tabele su prazne, a master podaci su sačuvani.

### SECURITY

- [ ] Pokrenut je read-only `scripts/verify-security.sql`.
- [ ] Kreirani ili povezani su produkcioni store nalozi.
- [ ] Pokrenut je read-only `scripts/maintenance/verify-production-accounts.sql`.
- [ ] Ne postoji nalog `radnja10`.
- [ ] Postoji tačno deset očekivanih store naloga: `radnja1`-`radnja9` i `radnja11`.
- [ ] Postojeći admin nalozi su sačuvani.

### DEPLOY

- [ ] Napravljen je finalni commit.
- [ ] Produkcioni branch `main` je poslat na udaljeni repozitorijum.
- [ ] Vercel deployment je uspešno završen.

### REAL TEST

- [ ] Admin prijava radi.
- [ ] Prijava naloga `radnja1` radi.
- [ ] Zatvaranje i ponovno otvaranje browsera čuva važeću sesiju.
- [ ] Radnja 1 ne može da pristupi podacima Radnje 2.
- [ ] Store korisnik ne može da pozove admin API rute.
- [ ] Pazar radi.
- [ ] Negativna temperatura radi.
- [ ] Trebovanje radi.
- [ ] Zadatak radi.
- [ ] Povrat radi.
- [ ] Fotografija police radi.
- [ ] BizniSoft sinhronizacija dobavljača radi.
- [ ] BizniSoft sinhronizacija veza artikala i dobavljača radi.
- [ ] Promet uživo radi.
- [ ] XLSX export se ispravno otvara.
- [ ] ZIP export se ispravno otvara.
- [ ] Aplikacija je proverena na stvarnom Android telefonu.

### PILOT

- [ ] Radnja 1 koristi aplikaciju 2-3 stvarna radna dana.
- [ ] Nema pristupa podacima druge radnje.
- [ ] Nema duplih zapisa.
- [ ] Nema neočekivane odjave.
- [ ] Nema većih Vercel ili Supabase grešaka.
- [ ] Tek zatim su uključene ostale radnje.

## PRE-DEPLOY

- [ ] Pregledan je `git diff`; nema slučajno dodatih tajni, `.env` fajlova ili lokalnih logova.
- [ ] Pokrenuti su `npm run typecheck`, `npm run lint`, `npm run test:security` i `npm run build`.
- [ ] `npm audit --omit=dev` nema critical/high nalaz. Preostali moderate nalazi su pregledani.
- [ ] Vercel koristi Node.js 20+ i produkcioni branch.
- [ ] Istorijski BizniSoft akreditivi/sesije su rotirani ili opozvani prema `docs/RECOVERY.md`.

## PRODUCTION SQL

- [ ] Napravljen je svež Supabase backup pre SQL promena.
- [ ] U staging-u je uspešno i ponovljivo pokrenuta migracija `supabase/migrations/20260915120000_security_hardening.sql`.
- [ ] Ista migracija je, posle odobrenja, primenjena u produkciji. Ne menjati njen sadržaj ručno u SQL Editor-u.
- [ ] Posle migracije je pokrenut read-only `scripts/verify-security.sql`.
- [ ] Svaka važna tabela ima `rls_enabled=true`; nema neobjašnjenih PUBLIC/anon write grantova.
- [ ] `biznisoft_article_lookup` ima `security_invoker=true` i anon nema SELECT.
- [ ] `claim_security_operation` i turnover refresh funkcija nisu izvršive običnom store korisniku.

## ENVIRONMENT

- [ ] U bezbednom terminalu sa Vercel Production vrednostima pokrenuto je `npm run check:env -- --live`.
- [ ] Komanda je završila bez nedostajućih/loših promenljivih; vrednosti nisu kopirane u izveštaj.
- [ ] Samo `NEXT_PUBLIC_SUPABASE_URL` i `NEXT_PUBLIC_SUPABASE_ANON_KEY` imaju `NEXT_PUBLIC_` prefiks.
- [ ] `CRON_SECRET` i `CLEANUP_SECRET` su različite duge nasumične vrednosti.
- [ ] `AUTO_CREATE_PRICE_TASKS=false`.
- [ ] `BIZNISOFT_PASSWORD` je izostavljen ili prazan za nalog bez lozinke; nije dodat placeholder, navodnik ili razmak.

## SECURITY TEST

- [ ] Postoje dva test store naloga iz različitih radnji i jedan test admin nalog.
- [ ] Lokalno su privremeno podešeni samo `PROD_BASE_URL`, javne Supabase promenljive i `TEST_STORE1_*`, `TEST_STORE2_*`, `TEST_ADMIN_*` vrednosti.
- [ ] Pokrenuto je `npm run test:production-security`; komanda je završila kodom 0.
- [ ] Ako test nalozi nemaju po jednu najavu povrata, ručno je potvrđen cross-store UUID pristup i mutation tampering bez pravih poslovnih zapisa.
- [ ] Store korisnik dobija 403/401 na admin API; admin read-only API radi.

## AUTH TEST

- [ ] Admin login preživi refresh, zatvaranje celog browsera i ponovno otvaranje dok je sesija važeća.
- [ ] Store login preživi isti postupak.
- [ ] Posle odjave protected URL vraća korisnika na `/login`.
- [ ] Opozvana/istekla test sesija vraća na prijavu; privremena Supabase greška ne briše važeću sesiju.
- [ ] Login stranica preusmerava već prijavljenog admina/store korisnika na odgovarajući dashboard.

## PERSISTENT LOGIN TEST

1. Prijavite se kao `radnja1`.
2. Osvežite stranicu.
3. Potpuno zatvorite browser.
4. Ponovo otvorite browser.
5. Otvorite produkcionu aplikaciju.
6. Potvrdite da je korisnik i dalje prijavljen.
7. Restartujte ili ponovo deployujte aplikaciju ako je praktično.
8. Potvrdite da je sesija i dalje važeća.
9. Pritisnite `Odjavi se`.
10. Potvrdite da zaštićena stranica sada zahteva prijavu.

## OPORAVAK STORE NALOGA

- [ ] Zaboravljena lozinka resetuje se samo kroz Supabase Dashboard (`Authentication > Users`) ili odobrenu server-side administratorsku proceduru; lozinka se nikada ne šalje kroz chat, tiket ili Git.
- [ ] Za privremeno isključivanje naloga koristi se Supabase Auth zabrana korisnika. Ne menja se `profiles.role` i nalog se ne prebacuje na drugu radnju kao zamena za zabranu.
- [ ] Ako nalog mora da se zameni, kreira se novi Auth korisnik sa internim emailom, zatim tačno jedan `profiles` red sa `role='store'` i odgovarajućim `store_id`; stari Auth nalog se tek posle provere zabrani ili ukloni.
- [ ] Posle resetovanja ili zamene pokreće se read-only `scripts/maintenance/verify-production-accounts.sql`, zatim se prijavom proverava da nalog vidi samo svoju radnju.
- [ ] Admin nalozi se ne menjaju production account skriptom; njihov oporavak radi ovlašćeni vlasnik Supabase projekta kroz Dashboard.

## BIZNISOFT

- [ ] `BIZNISOFT_SOAP_URL` radi iz Vercel okruženja i ne dolazi do browsera.
- [ ] Ako URL koristi HTTP, saobraćaj ide samo kroz pouzdan LAN, VPN ili zaštićen tunel; rizik je formalno prihvaćen.
- [ ] Turnover prikazuje tačne mapirane radnje i poslednje uspešno vreme.
- [ ] Tokom kontrolisanog prekida BizniSoft-a turnover zadržava poslednje dobre podatke i upozorenje, bez nula.
- [ ] Pazar, temperature, trebovanja, zadaci i povrati rade dok BizniSoft nije dostupan.

## ANDROID TEST

- [ ] Pazar, temperature, trebovanja, zadaci i povrati provereni su na širinama 320, 360, 390 i 430 px ili odgovarajućim uređajima.
- [ ] Nema horizontalnog pomeranja cele stranice, prekrivenih dugmadi ni dijaloga van ekrana.
- [ ] Tastatura ne prekriva aktivno polje; dugački nazivi artikala se prelamaju.
- [ ] Prekid mreže prikazuje čitljivu poruku i ne pravi dupli zapis posle ponovnog pokušaja.

## EXPORT TEST

- [ ] Pazar export otvara zvanični template, čuva formule/format i pravi ispravan fajl za izabranu radnju/mesec.
- [ ] Trebovanje export čuva blank vrednosti i ne izvršava tekst koji počinje sa `=`, `+`, `-` ili `@` kao formulu.
- [ ] Temperatura export čuva `-18` i `-18,5` kao negativne brojeve i redosled 07:00/14:00/20:00.
- [ ] Bulk ZIP ima tačno jedan odgovarajući fajl po aktivnom uređaju i nema podatke druge radnje.

## BACKUP

- [ ] Supabase production backup/PITR status verified in dashboard.
- [ ] Zabeleženi su dostupnost poslednjeg backup-a, retention window i da li je PITR enabled/disabled.
- [ ] Administrator razume recovery postupak i vraćanje u zaseban projekat iz `docs/RECOVERY.md`.

## PILOT DAY 1

- [ ] Jedna radnja i jedan admin rade puni tok: pazar, 07/14/20 temperature, trebovanje, fotografija police, zadatak i test povrat.
- [ ] Na kraju dana broj očekivanih zapisa odgovara admin prikazu; nema duplikata ili cross-store podataka.
- [ ] Provereni su Vercel/Supabase logovi bez tajni i neočekivanih 500 grešaka.

## PILOT DAY 2-3

- [ ] Dnevni tok je ponovljen najmanje dva uzastopna dana bez problema sa izolacijom, datumom, sesijom ili duplikatima.
- [ ] Dnevni cron je završen; postojeći podaci nisu obrisani pri delimičnom BizniSoft neuspehu.
- [ ] Provereni su svi admin exporti i Storage putanje/fajlovi.
- [ ] Kratak kontrolisani BizniSoft prekid nije zaustavio Supabase poslovne module.
- [ ] Tek posle uspešnog trećeg dana odobreno je širenje na ostale radnje.

## CLEAN PRODUCTION START

- [ ] U Supabase dashboard-u je potvrđen svež produkcioni backup i poznat je postupak vraćanja.
- [ ] Sa produkcionim Supabase promenljivama pokrenut je dry run: `npm run maintenance:clean-storage`.
- [ ] Pregledan je broj isključivo povezanih fotografija. Zatim je pokrenuto: `npm run maintenance:clean-storage -- --apply --confirm=DELETE_LINKED_OPERATIONAL_PHOTOS`.
- [ ] Sadržaj `scripts/maintenance/production-clean-start.sql` kopiran je u Supabase SQL Editor i prvo pokrenut neizmenjen. Skripta je prikazala pre-clean brojeve i zaustavila se porukom `REVIEW ONLY`, bez brisanja.
- [ ] Posle pregleda brojeva, samo u kopiji unutar SQL Editor-a vrednost `REVIEW_ONLY` zamenjena je sa `DELETE_OPERATIONAL_DATA`, pa je skripta izvršena jednom.
- [ ] Završni upiti skripte pokazuju nula operativnih redova, dok stores, profiles, artikli, dobavljači, veze dobavljača, uređaji i BizniSoft master/current tabele ostaju sa očekivanim brojevima.
- [ ] Nova binding migracija nije potrebna: postojeći `profiles_admin_store_null` constraint i odsustvo store UPDATE politike nad `profiles` su provereni sa `scripts/maintenance/verify-production-accounts.sql` i `scripts/verify-security.sql`.
- [ ] Pokrenut je account dry run: `npm run maintenance:create-accounts`.
- [ ] Potvrđeno je da plan sadrži tačno `radnja1`-`radnja9` i `radnja11`, bez `radnja10`, i da admin nalozi nisu obuhvaćeni.
- [ ] Ako dry run prijavi neočekivan razvojni store profil, nalog je ručno pregledan u Supabase Auth/profiles; nije automatski obrisan niti je nastavljen apply dok nije bezbedno uklonjen ili ispravljen.
- [ ] Za postojeće razvojne store naloge odobren je reset, pa je pokrenuto: `npm run maintenance:create-accounts -- --apply --reset-existing-passwords`. Ako postojeći password-i treba da ostanu, izostavljen je samo poslednji parametar.
- [ ] Prikazane početne lozinke odmah su sačuvane u odobrenom password manager-u; nisu kopirane u Git, chat, tiket ili fajl.
- [ ] U Supabase SQL Editor-u pokrenut je read-only `scripts/maintenance/verify-production-accounts.sql`; svih deset binding redova imaju `OK`, `radnja10` rezultat je prazan, a admin profili su prisutni.
- [ ] Pokrenut je `npm run test:production-security` sa dva test store naloga i test adminom.
- [ ] Prijava kao `radnja1` prikazuje samo Radnju 1. Pokušaj URL/query/body/store_id/resource-ID pristupa Radnji 2 vraća 403/404 ili ostaje ograničen na Radnju 1.
- [ ] Admin prijava, istorijski pregledi i eksporti rade nakon čišćenja i kreiranja naloga.
- [ ] Tek nakon svih prethodnih potvrda odobren je deployment i pilot jedne radnje.
