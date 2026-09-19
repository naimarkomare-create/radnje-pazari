# Recovery runbook

Ovaj dokument opisuje bezbedan odgovor na incident. Ne menja produkciju automatski i nije zamena za proverenu rezervnu kopiju.

## Prvih 15 minuta

1. Zaustavite rad pogođenog modula. Ako postoji rizik od daljih upisa, privremeno pauzirajte Vercel deployment ili ograničite pristup, ali ne brišite podatke.
2. Zabeležite vreme incidenta u `Europe/Belgrade`, korisnika/radnju, modul, ID zapisa i poslednju poznatu ispravnu radnju.
3. Sačuvajte Vercel i Supabase logove za taj period. Ne kopirajte auth kolačiće, service-role ključ, BizniSoft lozinku, session handle ili pun SOAP XML u tiket/poruku.
4. Proverite obim pomoću read-only SQL upita. Ne pokrećite masovni `UPDATE`, `DELETE`, rollback migracije ili ručno prepisivanje dok obim nije potvrđen.
5. Ako su pristupni podaci mogli biti izloženi, prvo opozovite aktivne sesije i rotirajte pogođenu tajnu u Supabase/Vercel/BizniSoft sistemu.

## Rezervne kopije i PITR

- Proverite status Supabase backup-a pre incidenta. Pro plan obično ima automatske backup-e, ali dostupnost i period čuvanja proverite u konkretnom projektu.
- Point-in-Time Recovery koristite samo ako je za projekat stvarno uključen. Ne pretpostavljajte da je PITR dostupan.
- Najbezbednije je vratiti backup u zaseban privremeni projekat, proveriti podatke, pa selektivno vratiti potvrđene redove u produkciju.
- Pre svake korektivne SQL operacije napravite novi export pogođenih tabela i zapišite broj redova pre/posle.

## HISTORICAL CREDENTIAL ROTATION

Brisanje korisničkog imena ili session handle-a iz trenutnog koda ne uklanja vrednost iz starih Git commit-a. Pre produkcije:

1. Promenite svaki BizniSoft password koji je mogao biti istorijski sačuvan, čak i ako više nije u trenutnom branch-u.
2. Opozovite ili pustite da isteknu istorijski SOAP session handle/session ID vrednosti, gde BizniSoft to omogućava.
3. Rotirajte svaku drugu ponovo upotrebljivu tajnu koja se pojavila u istoriji i ažurirajte je samo u Vercel/Supabase secret podešavanjima.
4. Ne upisujte novu vrednost u Git, tiket, chat ili log. Potvrdite rotaciju samo nazivom promenljive i vremenom promene.
5. Promena istorije repozitorijuma je poseban koordinisan postupak; sama po sebi ne zamenjuje rotaciju aktivnih akreditiva.

## Slučajno brisanje ili pogrešan upis

1. Odredite tabelu, primarni ključ, `store_id`, poslovni datum i tačan vremenski opseg.
2. Proverite povezane redove i Storage objekte. Ne vraćajte roditeljski red bez potrebnih veza.
3. Uporedite produkciju sa obnovljenom kopijom u zasebnom projektu.
4. Pripremite najmanji mogući transakcioni SQL za selektivno vraćanje. Neka ga pregleda druga osoba.
5. Izvršite prvo u staging/obnovljenom projektu, zatim u odobrenom terminu u produkciji.
6. Proverite RLS, broj redova, prikaz u admin/store UI i odgovarajući Excel export.

Za fotografije proverite i bucket (`shelf-photos` ili `task-photos`). Brisanje reda ne vraća obrisan Storage objekat; potreban je backup same datoteke.

## Loša migracija

1. Ne menjajte već primenjenu migraciju i ne pokrećite naslepo suprotan SQL.
2. Pauzirajte novi deployment ako očekuje neuspešnu šemu.
3. Sačuvajte tačnu PostgreSQL grešku i stanje `supabase_migrations.schema_migrations`.
4. Napravite novu forward-fix migraciju, idempotentnu gde je moguće, i testirajte je nad kopijom produkcione šeme/podataka.
5. Ako je došlo do gubitka podataka, pratite postupak selektivnog vraćanja iz backup-a.

## Važne poslovne tabele

- Korisnici/radnje: `profiles`, `stores`.
- Pazar: `daily_revenue_reports`.
- Temperature: `temperature_devices`, `temperature_reports`.
- Trebovanja: `produce_request_batches`, `produce_request_items`, `produce_items`.
- Fotografije police: `produce_shelf_photo_checks` i Storage bucket `shelf-photos`.
- Zadaci: `store_tasks`, `store_task_assignments` i eventualni `task-photos` objekti.
- Povrati/dobavljači: `return_proposals`, `return_proposal_items`, `return_proposal_history`, `biznisoft_suppliers`, `article_suppliers`.
- BizniSoft lokalni cache: `biznisoft_articles`, `biznisoft_sale_actions`, `biznisoft_stock_price_current`, `biznisoft_price_changes`, `biznisoft_turnover_cache`.

BizniSoft cache tabele nisu zamena za izvorne BizniSoft podatke. Ne vraćajte ih preko poslovnih tabela i ne brišite poslednje dobre podatke samo zato što je integracija trenutno nedostupna.

## Završna provera

- Potvrdite da Radnja 1 ne vidi podatke druge radnje.
- Potvrdite admin istorijske filtere i exporte.
- Proverite broj redova i najmanje jedan poznat zapis pre i posle incidenta.
- Ponovo uključite cron/deployment tek kada je korekcija završena.
- Dokumentujte uzrok, izvršene SQL komande, ko je odobrio promenu i rezultat provere, bez tajni.
