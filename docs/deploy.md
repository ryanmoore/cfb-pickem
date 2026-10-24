# First deploy

Site: `pickem.example.com` on a domain already in Cloudflare. Items marked
**unverified** have not run against real Cloudflare or AWS yet; if one fails,
the error is in the Worker's logs (`wrangler tail`) or the Actions run.

Everything runs from `crates/worker` unless noted. Use `npx wrangler@4.152.0`.

## 1. Cloudflare API tokens

Two tokens (dashboard > My Profile > API Tokens):

- **Deploy** (GitHub secret `CLOUDFLARE_API_TOKEN`): Account > Workers Scripts
  Edit, Account > D1 Edit, Zone > Workers Routes Edit, Zone > DNS Edit (for the
  custom domain).
- **Export** (Worker secret `D1_EXPORT_TOKEN`): Account > D1 Edit only.

Also add the account id as GitHub secret `CLOUDFLARE_ACCOUNT_ID`; both go in
the repo's Actions secrets.

## 2. D1

```sh
npx wrangler@4.152.0 d1 create pickem
```

Put the printed `database_id` in `wrangler.toml`, in both `[[d1_databases]]`
and `[vars] D1_DATABASE_ID`. Fill `CF_ACCOUNT_ID` and the `routes` pattern too.

## 3. Access

Zero Trust dashboard:

1. Settings > Authentication > add **One-time PIN**.
2. Access > Applications > Add > Self-hosted. Domain `pickem.example.com`,
   **path `/login`** only. Policy: Allow, emails = the users' addresses.
   Nothing else is protected; the rest of the site is public by design.
3. Copy the application's **Audience (AUD) tag** to `ACCESS_AUD`.
4. Copy the team domain (Settings > Custom Pages shows `<team>.cloudflareaccess.com`)
   to `ACCESS_TEAM_DOMAIN`.

Sign-in flow: the SPA links to `/login`; Access authenticates, sets
`CF_Authorization`, and the Worker redirects to `/`. The Worker reads that
cookie on public routes (**unverified**: that the cookie reaches `/api/*`).

## 4. S3 backup

Bucket with a private ACL. IAM user with only this policy:

```json
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:PutObject",
 "Resource":"arn:aws:s3:::BUCKET/pickem/*"}]}
```

Set `S3_BUCKET`, `S3_REGION`, `S3_PREFIX` in `wrangler.toml`. Dumps land at
`<prefix>/pickem-YYYY-MM-DD.sql` at 09:00 UTC. The export call to the D1 REST
API and its polling loop are **unverified**; check the first run with
`wrangler tail` (trigger it from the dashboard: Worker > Settings > Triggers >
Cron). A failed backup fails the invocation.

## 5. Secrets

```sh
npx wrangler@4.152.0 secret put EMAIL_HASH_KEY       # long random string; keep a copy outside D1 and the backups
npx wrangler@4.152.0 secret put AWS_ACCESS_KEY_ID
npx wrangler@4.152.0 secret put AWS_SECRET_ACCESS_KEY
npx wrangler@4.152.0 secret put D1_EXPORT_TOKEN
```

Losing `EMAIL_HASH_KEY` orphans every account (see `adr/0001`).
If `secret put` says the Worker does not exist, run step 6 first (the first
run will deploy without secrets and `/api/me` will error until they are set).

## 6. Deploy

Actions > Deploy > Run workflow, branch `rust-rewrite` (it also runs on push to
`main`). It tests, builds the frontend, applies migrations, and deploys.

## 7. Load the archive

From the repo root, with the legacy database at `$LEGACY`:

```sh
cargo run -p pickem-devserver -- import "$LEGACY" /tmp/pickem.sqlite3
sqlite3 /tmp/pickem.sqlite3 .dump | grep '^INSERT INTO' > /tmp/pickem-data.sql
cd crates/worker && npx wrangler@4.152.0 d1 execute pickem --remote --file /tmp/pickem-data.sql
```

Rows only: the schema comes from the migrations, and D1 rejects the dump's
transaction statements. Keep these files out of git; they hold real names.

## 8. Attach an email to a player

Imported accounts cannot sign in until they have an address digest. Use the
same key as the `EMAIL_HASH_KEY` secret. Find the username with
`sqlite3 /tmp/pickem.sqlite3 'SELECT legacy_username, display_name FROM app_user'`.

```sh
PICKEM_EMAIL_KEY=<the key> cargo run -p pickem-devserver -- attach-email /tmp/pickem.sqlite3 <legacy_username> <email>
```

It prints the digest. Apply it to D1:

```sh
npx wrangler@4.152.0 d1 execute pickem --remote \
  --command "UPDATE app_user SET email_hash = '<digest>' WHERE legacy_username = '<legacy_username>'"
```

Then sign in at `https://pickem.example.com/login` and check `/api/me`.

## Local development

```sh
cargo run -p pickem-devserver -- import "$LEGACY" /tmp/pickem.sqlite3
PICKEM_DEV_EMAIL=you@example.com cargo run -p pickem-devserver -- serve /tmp/pickem.sqlite3
```

Serves the API and `frontend/dist` on port 8787, signed in as that address.
