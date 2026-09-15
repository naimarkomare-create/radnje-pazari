# Production Security Audit

Date: 2026-09-15. Scope: current working tree; Next.js 14.2.35, Supabase SSR/Data API/Storage, existing store modules and BizniSoft integration.

## 1. Overall Status: NOT READY

Conservative code fixes and automated tests are complete. Production sign-off is blocked by the **unapplied security migration**, **unverified deployed RLS/grants**, and **applicable Next.js advisories requiring an upgrade outside this task's permitted scope**. BizniSoft HTTP remains a material transport risk.

No commit, push, deployment, production SQL, live account login or production business mutation was performed. Supplier/return/export work was preserved. No historical migration was changed, no file was deleted by this audit, and the existing daily cron schedule was not changed.

| Required Question | Answer | Evidence Boundary |
| --- | --- | --- |
| CAN RADNJA 1 ACCESS RADNJA 2 DATA? | **UNVERIFIED** in production | Mocked API/action isolation tests pass. Source RLS fixes await deployment; the legacy lookup view is a pre-migration risk. |
| CAN A STORE USER CALL ADMIN APIS? | **UNVERIFIED** in production | All 20 exported admin API handlers return 403 for mocked store sessions and 401 for anonymous sessions. Real store-token tests remain necessary. |
| IS THE SERVICE ROLE KEY EXPOSED TO THE BROWSER? | **NO** in audited source/build | Server-only boundary, client import graph and built browser-file scans found no exposure. Actual Vercel environment settings were not inspected. |

## 2. Security Architecture

- `middleware.ts` verifies Supabase users and forwards refreshed cookies. It is not the only authorization boundary. Confirmed invalid sessions redirect; temporary auth outages do not intentionally clear valid sessions.
- `lib/auth.ts` uses verified `auth.getUser()`, then looks up `profiles` by that user ID. Role/store are database values, not browser metadata or body fields. React profile caching is request-scoped.
- Layouts protect admin/store/proposal pages. Admin Server Actions independently call `requireAdmin`; worker actions use `requireStore`.
- New `lib/security/api.ts` centralizes API authentication, admin role checks, same-origin validation and safe auth errors. Aliased APIs delegate to protected handlers.
- User-scoped server clients enforce RLS for report forms, return CRUD, task completion and ordinary exports.
- `lib/supabase/service.ts` is server-only. Privileged uses are authenticated admin sync/deletion, turnover cache/locks, secret-protected cron/cleanup and restricted authenticated catalog/supplier lookups.
- Shared article ID/name/barcode/unit and supplier choices are intentionally available to workers through lookup APIs. Store stock amounts/raw price rows and other stores' reports are not part of that public-to-workers catalog response. Worker lookup calls Supabase, not BizniSoft.
- Mutations use explicit payload fields. Trusted profile values supply store/user ownership. No confirmed arbitrary-body insert/update, raw SQL injection or alternate role mechanism was found.

## 3. Findings

**Fixed in migration means implemented locally, not yet enforced in production.** Conditional severity is marked explicitly; no production exploit was attempted.

| ID / Severity | Area | Problem / Exploit Scenario | Fix or Disposition |
| --- | --- | --- | --- |
| S01 **CRITICAL if Data API grants expose the view** | `biznisoft_article_lookup` (018) | Owner-executed view includes stock `raw`/store fields and bypasses underlying admin RLS under normal Supabase grants. A worker/anonymous request may read foreign stock data. | New migration sets security-invoker and revokes anonymous access. Current catalog API does not depend on this view. Live grants still require verification. |
| S02 **HIGH** | Return history INSERT policy | Checking only the actor's user ID allows forged history against another store's known proposal UUID. | Migration requires own proposal/store and matching item/proposal; admin access retained. |
| S03 **HIGH** | Pazar `created_at` | Direct insertion with a future timestamp extends the worker's 20-minute edit window. | Migration stamps store-created rows with server time. Existing current-day, duplicate and historical correction rules retained. |
| S04 **HIGH integrity** | Return proposals/items | Direct Data API writes can forge creator/reviewer fields or move items between editable proposals, bypassing route allowlists. | Migration stamps actor fields and protects review metadata, ownership and parent IDs. Existing supplier snapshot trigger preserved. |
| S05 **HIGH integrity** | Task assignment updates | Direct completion could omit required photo evidence, reference nonexistent files, or rewrite completed evidence. | Active-task/existing-own-object checks in migration/action; server timestamp and completed-write guard. Admin photo deletion retained. |
| S06 **MEDIUM** | API/form/page errors | Raw PostgREST messages exposed table/constraint/schema details. | Central safe browser errors; specific safe validation messages preserved. Next production error boundaries still hide uncaught server-rendering details. |
| S07 **MEDIUM / defense-in-depth** | Mutations, manual cleanup | Cookie APIs lacked explicit origin checks; cleanup used state-changing GET/query secrets. | Cross-site/sibling-origin browser requests rejected. Manual cleanup now POST with bearer header only. Cron GET remains a protected Vercel exception; turnover GET only warms its read cache. |
| S08 **MEDIUM** | Payload validation | Malformed UUID/date/status values reached queries, null JSON could crash handlers, aggregate revenue could become nonfinite. | Object parsing, UUID/calendar checks, valid status/integer ID checks, finite input/total validation. Valid negative temperatures/corrections unchanged. |
| S09 **MEDIUM** | Return-item quantity | Direct API writes bypassed positive/finite quantity validation. | New NOT VALID database check protects writes without rewriting historical rows. Invalid historical quantities must be corrected when those rows are edited. |
| S10 **MEDIUM** | Auth cookies | SDK defaults did not explicitly set Secure; a non-Secure cookie may be transmitted on HTTP before a redirect. | Shared production Secure option in browser/server clients and middleware. No changes to persistent expiry, SameSite or refresh flow. |
| S11 **MEDIUM availability** | Expensive sync APIs | Repeated authenticated requests could start simultaneous syncs across Vercel instances. | Shared service-only five-minute lease; busy=409, unavailable=503. Awaited execution/release. Existing turnover lock retained. Not a full rate quota. |
| S12 **LOW** | Storage path checks | Prefix-only validation did not fully bind deletion paths to their record. No arbitrary-file deletion exploit was demonstrated. | Exact image path validation, store/assignment binding, existing-object verification and stricter storage policies. Private 5 MB JPEG/PNG/WebP bucket retained. |
| S13 **LOW** | Headers/cache | No common defensive headers. | nosniff, referrer policy, frame denial, limited frame/object/base CSP, camera/mic/geolocation disabled, private API cache headers. No strict script CSP that could break Next/Supabase. |
| S14 **HIGH, REQUIRES REVIEW** | BizniSoft HTTP | Credentials/session/XML can be intercepted or altered in transit. | Connectivity preserved. Operator must provide verified HTTPS/private transport before switching. |
| S15 **HIGH if still reusable, REQUIRES REVIEW** | Git history | Earlier SOAP sample usernames/session values remain in previous commits despite current placeholders. | Re-scan confirms current samples sanitized. Invalidate sessions/rotate affected credentials; no automatic history rewrite. |
| S16 **HIGH applicable; CRITICAL conditional, REQUIRES REVIEW** | Next dependency | App Router/Server Actions match a DoS advisory. Critical Windows/AVIF advisories have deployment prerequisites. | No forbidden major upgrade. Plan supported patched Next upgrade/regression tests. Never expose the local Windows server publicly. |

Owner-executed views can bypass RLS; caller policies apply with security-invoker. See [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

This app matches the prerequisites in the [Next Server Actions DoS advisory](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj); application role checks do not fix framework request parsing. The [Windows RCE advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) concerns Windows hosting rather than the expected Vercel Linux deployment. [AVIF optimization RCE](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) is conditional: this app uses plain images, private JPEG/PNG/WebP uploads, and no configured remote optimizer source. The deployed optimizer was not penetration-tested.

## 4. RLS Matrix

Static review found RLS enablement for all **29 public tables** declared in migrations, including the new lease table. No RLS was disabled. This does not establish which migrations/grants are actually deployed.

| Tables | Worker SELECT | Worker INSERT / UPDATE / DELETE | Admin / Server |
| --- | --- | --- | --- |
| `profiles`, `stores` | Own profile/assigned store | None | Admin reads; privileged provisioning unchanged. |
| `daily_revenue_reports` | Own store | Own user/store today; own recent/current-day update; no delete | Admin reads/corrections retained. |
| `temperature_devices` | Own active devices | None | Admin select/insert/update/deactivation. |
| `temperature_reports` | Own store | Own active device/user/store insert; no update/delete | Admin reads; slot uniqueness retained. |
| `produce_requests` | Own store | Own user/store insert; no update/delete | Existing admin reads. |
| `produce_items` | Active shared catalog | None | Existing admin policies. |
| `produce_request_batches`, `produce_request_items` | Own store/batch | Existing own-store inserts/RPC; no worker update/delete | Existing admin access; submit RPC security-invoker. |
| `produce_shelf_photo_checks` | Own store | Own user/store insert with matching existing object; no update/delete | Admin reads/clears images, privileged cleanup. |
| `store_tasks` | Assigned active tasks | None | Admin management. |
| `store_task_assignments` | Own store | Own completion/photo update only; no insert/delete | Admin management. |
| `return_proposals` | Own store | Own draft/submitted insert/update; no worker proposal delete | Admin management. |
| `return_proposal_items` | Own proposal | Own editable proposal insert/update/delete, protected attribution/parent | Admin management; supplier provenance trigger retained. |
| `return_proposal_history` | None | Own-user/own-proposal append after migration | Admin reads/inserts. |
| `biznisoft_sale_actions`, `biznisoft_articles` | None directly | None | Existing admin policies, privileged sync. |
| `biznisoft_price_current`, `biznisoft_price_snapshots`, `biznisoft_article_modified_current`, `biznisoft_pos_price_current`, `biznisoft_stock_price_current`, `biznisoft_stock_price_snapshots`, `biznisoft_price_changes` | None directly | None | Existing admin/server policies. Restricted catalog API is intentional, not general cache-table access. |
| `biznisoft_suppliers`, `article_suppliers`, `biznisoft_supplier_relation_documents` | None directly | None | Admin reads; authorized server writes/restricted catalog responses. |
| `biznisoft_turnover_cache` | None | None | Admin read; service-only cache/claim RPC. |
| `security_operation_locks` | None | None | RLS, revoked public/anon/authenticated grants, service-only table/RPC. |

Existing joined/group views use security-invoker where defined. The migration fixes the legacy lookup exception. Store Storage SELECT/INSERT is restricted to its allowed paths; task uploads require own pending assignment/active task. No worker overwrite/delete policy is added. Admin viewing remains unchanged.

## 5. Other Audit Results

- **Sessions:** login/logout destinations, internal username mapping and architecture unchanged. Production cookies explicitly Secure; SDK SameSite=Lax, path and persistent expiry defaults remain. Cookies intentionally remain JS-readable for browser auth/Storage; HttpOnly would require an architectural change. XSS prevention is important.
- **Service role:** no client import path or serialized environment value found. Privileged APIs authorize before service use; mock tests fail if unexpected privileged work runs before denial.
- **Mass assignment/IDOR:** return routes use allowlists and object-level checks; foreign-store read/update/item-delete tests fail closed even when the mock DB returns a foreign object. Profile role/store changes are denied by existing RLS. Direct Data API policy tests remain mandatory.
- **SQL/XSS/redirects:** no confirmed raw SQL injection or unsafe business-text HTML found. React escaping retained; map HTML uses controlled marker styles. Login navigation is application-relative, not a user-supplied external destination.
- **Uploads:** private bucket, size/type restrictions, client compression and expiring signed URLs retained. An issued signed URL is a bearer link usable until expiry (currently one hour); revocation is not instantaneous. MIME/size checks are not antivirus/content inspection.
- **Exports:** protected independently of layouts. Actual trusted-template tests verify text starting `=`, `+`, `-`, `@` stays text; negative temperatures stay numeric; intentional SUM formulas remain. Filenames/private downloads retained. No Excel template changed.
- **CSRF:** same-origin checks supplement cookie/session/RLS protection. Non-browser requests lacking Origin/Fetch-Metadata still need authentication. Direct Supabase access is separately governed by RLS.
- **Caching:** private/no-store API responses, dynamic protected pages, preserved server-only admin turnover cache. No global private-user cache introduced.
- **Abuse:** new lease reduces concurrent sync overlap; turnover already has a shared short cache and refresh claim. Bulk exports/force-refresh still lack comprehensive per-user quotas. No Redis/queue/background worker introduced.

## 6. Secrets and HTTPS

Scanned 216 tracked non-binary current files for credential patterns and copies of configured local secrets; no findings. Browser build scanning found no service-role references or secret values. Only public Supabase URL/publishable key are expected client-side. No NEXT_PUBLIC password/service secret found.

`.env.local`, `.env.production` and `.env.production.local` are ignored; tracked examples contain placeholders. No secret environment file is tracked.

These six files were already sanitized before this pass and remain so: `login.xml`, `login-response.xml`, `get-saleactions.xml`, `get-article-modified.xml`, `get-pos-price-test.xml`, `get-stock-storage1.xml`. No further sample edits were needed. Earlier limited history inspection found live-looking values in commits `4ae18b0` and `9de14e7`; validity was not tested and values are not reproduced. History was not rewritten.

SOAP tests verify redaction of synthetic username/password/session/bearer values, no full-response echo, preserved vendor namespace and empty-password login XML. Diagnostic logs contain session length/braces, not the session value.

Configured endpoint and saved WSDL use HTTP. Earlier credential-free probes did not establish HTTPS: TLS on the service port reset and default HTTPS refused. A separate operator-provided gateway may exist; **HTTPS support is unverified**, so the URL is unchanged. Arrange verified HTTPS or a private transport before accepting this production risk.

## 7. Dependency Result

`npm audit` ran successfully as a check but exited 1 because vulnerabilities remain.

- Before: **16 vulnerable package groups** (1 critical, 11 high, 3 moderate, 1 low).
- After: **8 vulnerable package groups** (1 critical, 5 high, 2 moderate).
- Updated within existing ranges, lifecycle scripts disabled: axios 1.20.0, @xmldom/xmldom 0.8.15, brace-expansion patch lines, browserslist/baseline data, js-yaml 4.3.2, nanoid 3.3.19, postcss-selector-parser 6.1.4 and supporting browser data (15 lock entries).
- No packages removed; no Next/React/Supabase major changes. Local validation used Node 24. Verify Vercel uses Node 20+; one updated development dependency now requires it.

| Remaining Groups | npm Severity | Applicability / Review |
| --- | --- | --- |
| next | Critical | Applicable Server Action/RSC DoS; critical Windows/AVIF issues conditional. Requires separately reviewed framework upgrade. |
| glob, @next/eslint-plugin-next, eslint-config-next | High each | Development/lint chain. Vulnerable glob CLI command option is not used with untrusted input by app routes. Parent dependency upgrade needs review. |
| postcss | High | Build CSS/source maps, including Next's pinned nested copy. No user-uploaded CSS compiler found. Review with framework upgrade. |
| xlsx | High | Legacy workbook generation only, not untrusted file imports. Parsing pollution/ReDoS advisories remain; npm reports no registry fix. Review supported distribution/replacement. |
| uuid, exceljs | Moderate each | Transitive bounds advisory concerns optional buffers in v3/v5/v6. No untrusted use of that API found. Do not downgrade ExcelJS merely to satisfy audit. |

This is an applicability assessment, not a guarantee that every advisory is unreachable. No production exploit was attempted.

## 8. Migration and Rollout

**New file: `supabase/migrations/20260915120000_security_hardening.sql`.** It is the only new SQL migration; **not applied**. It contains policy/trigger hardening, a write-time quantity check and the service-only concurrency lease. No business data is deleted or rewritten.

1. Back up/clone Supabase to staging. Compare actual schema/grants with migrations 001-024. Pre-existing drift requires review: migration 021/runtime refer to `article_suppliers.is_primary` and `return_proposal_items.supplier_relation_source` without tracked column-creation SQL. Supplier schema was not improvised in this audit.
2. Run the entire new migration in staging SQL editor on PostgreSQL 15+. Verify success, then repeat to check idempotence against the actual schema.
3. Execute the manual role tests below. **SQL editor access is privileged and does not test worker RLS.** Use actual worker sessions/Data API instead.
4. Resolve readiness blockers and obtain separate rollout approval. Apply migration before deploying these wrappers: sync APIs intentionally fail closed with 503 if the lease RPC is missing.
5. Update external manual cleanup callers to POST plus existing `Authorization: Bearer <CLEANUP_SECRET>` header. Existing CRON_SECRET bearer is also accepted. Query secrets no longer work; GET returns 405.

No environment variable added. `vercel.json` remains one daily `0 5 * * *` schedule; cron work is awaited during the request, not claimed as reliable after a response.

## 9. Validation

| Command / Check | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run lint | PASS, no warnings/errors |
| npm run test:security | PASS: 18 groups, 40 denied admin API invocations, 12 denied admin Server Actions |
| npm run build | PASS: compilation, types, static generation and route tracing |
| git diff --check | PASS |
| Local production HTTP smoke tests | PASS: 9 checks for protected redirect/401, cleanup GET 405, cache/security headers; server stopped |
| SQL execution / deployed RLS | NOT RUN / UNVERIFIED |
| Production role sessions, Storage, Vercel env | NOT TESTED |

Build still reports the Supabase SDK `process.version` Edge-runtime warning and local webpack cache-snapshot warnings. These do not fail compilation. Auth was not replaced merely to silence them; no warning-free claim is made.

Tests: `scripts/security-tests.cjs` / `npm run test:security`. Actual handlers/actions run with mocked external services. The tests also inspect static boundaries/migrations and generate workbook buffers using actual templates; no production credentials required. They do not execute PostgreSQL policies.

## 10. Exact Manual Tests Still Required

Use staging, both admin accounts, Radnja 1/Radnja 2 users and disposable records. Do not mutate real production pazar/temperature history. Never share JWTs/cookies or paste secrets into shell history.

1. **Auth:** on HTTPS verify Secure, SameSite and expiry; browser restart, token refresh, logout and revoked sessions. Temporary auth outage must show a retryable error without permanently clearing a valid session. Verify Supabase signup is disabled and hosted Auth rate limits are appropriate.
2. **Admin denial:** as Radnja 1 call each admin API with its actual GET/POST/PATCH/DELETE method, including all exports, supplier sync/relations, turnover, tasks/returns delete and price/action sync. Expect 403/no mutation. Anonymous: 401. Both admins: intended operations succeed. Changing browser role state/user metadata must not grant access.
3. **Foreign UUIDs:** read/patch Radnja 2 return ID, add/update/delete its item ID, submit Radnja 2 pazar/temperature/task/photo IDs. Expect 403/404 or zero accessible/modified rows. Confirm foreign data unchanged as admin.
4. **Tamper payload:** change query, JSON and FormData `store_id`, `user_id`, `created_by`, `reviewed_by`, `role`, `status=completed`. Owner/actor must be trusted values; forbidden status transitions fail. Normal manual barcode lookup/quantity/add/supplier flows must still work.
5. **Direct Data API:** with each worker's own JWT/public key, SELECT/UPDATE/DELETE foreign-store rows for every applicable RLS matrix table. No foreign data/mutations. UPDATE profiles.role/store_id: denied. Query `biznisoft_article_lookup` as worker and anonymous: no stock/raw data. The authenticated restricted lookup API must still find articles.
6. **Direct integrity tests:** foreign proposal/item history INSERT denied; own return creator/reviewer spoof is stamped/protected; item parent reassignment denied. Supplier snapshot names/provenance must still be derived by the existing trigger.
7. **Pazar:** future created_at is server-stamped; yesterday/tomorrow, duplicate same-day insert and expired edits denied for workers. Today's allowed edit/admin historical correction/export work, historical shifts unchanged.
8. **Temperature/produce:** valid negative temperature/slot/device and normal multi-item request succeed. Foreign/inactive device, invalid date/slot/nonfinite quantity rejected. Foreign batch/store manipulation must not bypass RLS.
9. **Photos/tasks:** valid compressed upload/completion/admin preview works. Foreign-store/assignment path, traversal/encoded separators, >5 MB, SVG/HTML, worker overwrite/delete denied. Required-photo completion without a real object denied. Admin deletion removes only the exact object's file and retains required report/assignment history.
10. **CSRF:** authenticated mutation with hostile Origin and cross-site Fetch-Metadata returns 403. Same-origin phone submissions succeed. No wildcard credentialed CORS.
11. **Exports/XSS:** notes containing HTML and `=`, `+`, `-`, `@` are text in UI/XLSX. Test pazar, temperature, produce and bulk ZIP exports as admin; verify legitimate formulas, negative numbers, filenames, template layouts unchanged.
12. **Sync/cron/cache:** simultaneous syncs yield one accepted/one 409; release after success/failure. Wrong/missing cron secret=401. GET cleanup=405; authorized POST works only on staging disposable old photos. Turnover preserves stale data on upstream failure, shares its lock between admins and denies store access. Inspect no public caching on authenticated responses.
13. **Infrastructure:** verify Vercel Node 20+, secret/public-key roles, actual Supabase grants, bucket settings and framework upgrade plan. Invalidate historical session/credential exposures. Verify operator-provided HTTPS before changing BizniSoft configuration.

## 11. Residual Limitations

- No live policy execution was possible in this pass. Additional manually added permissive policies/grants would not be visible in repository migrations. Reconcile schema before production sign-off.
- Five-minute lease is not a background worker/durable queue. Existing long-running sync cancellation/timeouts were not rewritten. Work is not promised to continue after response/function termination.
- Comprehensive per-admin quotas, strict script CSP, content sniffing/antivirus and MFA are not introduced. Signed links remain bearer URLs; JS-readable auth requires continued XSS care.

## 12. Files Changed in This Pass

List is relative to the saved pre-audit working-tree fingerprint, not HEAD. Earlier cleanup, sample and supplier edits visible in git diff are excluded if untouched here. No files deleted by this pass.

- `README.md`
- `SECURITY_AUDIT.md`
- `app/admin/biznisoft-akcije/[groupKey]/page.tsx`
- `app/admin/biznisoft-akcije/actions.ts`
- `app/admin/biznisoft-akcije/page.tsx`
- `app/admin/biznisoft-promene-cena/actions.ts`
- `app/admin/ispravka-pazara/actions.ts`
- `app/admin/ispravka-pazara/page.tsx`
- `app/admin/kontrola-police/actions.ts`
- `app/admin/kontrola-police/page.tsx`
- `app/admin/mapa/page.tsx`
- `app/admin/pazari/page.tsx`
- `app/admin/radnje/page.tsx`
- `app/admin/status/page.tsx`
- `app/admin/temperature/page.tsx`
- `app/admin/temperature/uredjaji/actions.ts`
- `app/admin/temperature/uredjaji/page.tsx`
- `app/admin/trebovanja/page.tsx`
- `app/admin/zadaci/[id]/page.tsx`
- `app/admin/zadaci/actions.ts`
- `app/admin/zadaci/page.tsx`
- `app/api/admin/article-suppliers/route.ts`
- `app/api/admin/biznisoft/article-suppliers/sync/route.ts`
- `app/api/admin/biznisoft/suppliers/sync/route.ts`
- `app/api/admin/biznisoft/sync-action-articles/route.ts`
- `app/api/admin/biznisoft/sync-price-changes/route.ts`
- `app/api/admin/biznisoft/sync-prices/route.ts`
- `app/api/admin/biznisoft/sync-sale-actions/route.ts`
- `app/api/admin/biznisoft/sync-stock-prices/route.ts`
- `app/api/admin/biznisoft/turnover/route.ts`
- `app/api/admin/export/pazari/route.ts`
- `app/api/admin/export/temperature/bulk/route.ts`
- `app/api/admin/export/temperature/route.ts`
- `app/api/admin/export/trebovanje-voce-povrce/route.ts`
- `app/api/admin/exports/revenue/route.ts`
- `app/api/admin/exports/temperature/route.ts`
- `app/api/admin/return-proposals/[id]/route.ts`
- `app/api/admin/return-proposals/[id]/status/route.ts`
- `app/api/admin/return-proposals/delete-expired-drafts/route.ts`
- `app/api/admin/tasks/[id]/route.ts`
- `app/api/articles/lookup/route.ts`
- `app/api/cleanup-shelf-photos/route.ts`
- `app/api/cron/biznisoft-price-changes/route.ts`
- `app/api/cron/biznisoft-price-sync/route.ts`
- `app/api/cron/biznisoft-stock-price-sync/route.ts`
- `app/api/return-proposals/[id]/items/[itemId]/route.ts`
- `app/api/return-proposals/[id]/items/route.ts`
- `app/api/return-proposals/[id]/route.ts`
- `app/api/return-proposals/route.ts`
- `app/api/suppliers/search/route.ts`
- `app/store/actions.ts`
- `app/store/kontrola-police/actions.ts`
- `app/store/kontrola-police/page.tsx`
- `app/store/moji-unosi/page.tsx`
- `app/store/page.tsx`
- `app/store/pazari/page.tsx`
- `app/store/task-actions.ts`
- `app/store/temperature/page.tsx`
- `app/store/trebovanja/page.tsx`
- `lib/security/api.ts`
- `lib/security/request.ts`
- `lib/security/sync-lock.ts`
- `lib/security/validation.ts`
- `lib/shelf-photos.ts`
- `lib/supabase/client.ts`
- `lib/supabase/cookie-options.ts`
- `lib/supabase/server.ts`
- `middleware.ts`
- `next.config.mjs`
- `package-lock.json`
- `package.json`
- `scripts/security-tests.cjs`
- `supabase/migrations/20260915120000_security_hardening.sql`
