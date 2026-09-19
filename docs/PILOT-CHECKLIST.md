# Kontrolna lista za pilot u jednoj radnji

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
- [ ] `BIZNISOFT_PASSWORD` postoji i može imati praznu vrednost ako nalog tako radi.

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
