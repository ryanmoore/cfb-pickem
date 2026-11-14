# First deploy

Site: `pickem.example.com` on a domain already in Cloudflare. Items marked
**unverified** have not run against real Cloudflare or AWS yet; if one fails,
the error is in the Worker's logs (dashboard: Compute > Workers & Pages >
pickem > Logs) or the Actions run.

Everything runs from `crates/worker` unless noted. Use `npx wrangler@4.152.0`.

## 1. Cloudflare account and API tokens

Open Compute > Workers & Pages in the dashboard once. That creates the
account's `workers.dev` subdomain, without which Cloudflare refuses the cron
trigger. The Worker itself is not served there (`workers_dev = false`).

Two tokens (My Profile > API Tokens). On each, **Account Resources must include
this account**; otherwise every call fails with code 7403, "account is not
valid or is not authorized".

- **Deploy** (GitHub secret `CLOUDFLARE_API_TOKEN`): Account > Workers Scripts
  Edit, Account > D1 Edit, Zone > Workers Routes Edit, Zone > DNS Edit (for the
  custom domain).
- **Export** (Worker secret `D1_EXPORT_TOKEN`): Account > D1 Edit only.

Also add the account id as GitHub secret `CLOUDFLARE_ACCOUNT_ID`; both are
repository secrets. Add three repository **variables** (not secrets, which mask
them in logs): `PICKEM_HOSTNAME`, the site's hostname; `S3_BUCKET`; and
`ACCESS_TEAM_DOMAIN` (section 3). The deploy workflow writes them into
`wrangler.toml`, so the names stay out of git.

## 2. D1

```sh
npx wrangler@4.152.0 d1 create pickem
```

Put the printed `database_id` in `wrangler.toml`, in both `[[d1_databases]]`
and `[vars] D1_DATABASE_ID`. Fill `CF_ACCOUNT_ID` too. Leave the binding as
`DB`, whatever `d1 create` suggests: the Worker looks the database up by that
name.

## 3. Access

Zero Trust dashboard:

1. Integrations > Identity providers > add **One-time PIN**. Newer orgs default
   to the Cloudflare identity provider and don't add it automatically.
2. Access controls > Applications > Add > Self-hosted. Domain
   `pickem.example.com`, **path `login`** only. Login methods: turn off "accept
   all available identity providers" and tick only One-time PIN. Policy: Allow,
   emails = the users' addresses. Nothing else is protected; the rest of the
   site is public by design.
3. Copy the **Application Audience (AUD) Tag** (Configure on the application,
   under Additional settings or Basic information) to `ACCESS_AUD`.
4. Copy the team domain (Settings) to the `ACCESS_TEAM_DOMAIN` repository
   variable. The team is account-wide, so name it after the account, not the
   app. Renaming it later changes the token issuer: update the variable and
   redeploy, or sign-in stops working.

Each user who signs in takes one of the free plan's 50 seats. A PIN is sent
only to addresses the policy allows, so an email list keeps strangers out.

Sign-in flow: the SPA links to `/login`; Access authenticates and sets
`CF_Authorization`, and the Worker redirects to `/`. The Worker reads that
cookie on public routes.

## 4. S3 backup

Bucket in the global namespace, private. IAM user with only this policy:

```json
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:PutObject",
 "Resource":"arn:aws:s3:::BUCKET/pickem/*"}]}
```

Set `S3_REGION` and `S3_PREFIX` in `wrangler.toml`; the bucket name is the
`S3_BUCKET` repository variable (section 1). Dumps land at
`<prefix>/pickem-YYYY-MM-DD.sql` at 09:00 UTC. A deployed Worker's cron cannot
be triggered by hand, so check the first scheduled run in the Logs tab. The
export call to the D1 REST API and its polling loop are **unverified**. A
failed backup fails the invocation.

## 5. Deploy

Push to `rust-rewrite` or `main`; the Deploy workflow tests, builds the
frontend, applies migrations, and deploys. A manual run (Actions > Deploy > Run
workflow) is offered only once the workflow file is on the default branch.

## 6. Secrets

The Worker must exist first, so this follows the first deploy. `secret put`
prompts for each value, which keeps it out of shell history.

```sh
openssl rand -hex 32    # the EMAIL_HASH_KEY; store it outside D1 and the backups first
npx wrangler@4.152.0 secret put EMAIL_HASH_KEY
npx wrangler@4.152.0 secret put AWS_ACCESS_KEY_ID
npx wrangler@4.152.0 secret put AWS_SECRET_ACCESS_KEY
npx wrangler@4.152.0 secret put D1_EXPORT_TOKEN
```

Losing `EMAIL_HASH_KEY` orphans every account (see `adr/0001`).

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

Imported accounts cannot sign in until they have an address digest: the
HMAC-SHA256 of the trimmed, lowercased address under `EMAIL_HASH_KEY`, in hex.
Reading the key into a variable keeps it out of shell history:

```sh
npx wrangler@4.152.0 d1 execute pickem --remote --command "SELECT legacy_username, display_name FROM app_user"
read -rs KEY
printf '%s' 'player@example.com' | openssl dgst -sha256 -hmac "$KEY" | awk '{print $NF}'
unset KEY
npx wrangler@4.152.0 d1 execute pickem --remote \
  --command "UPDATE app_user SET email_hash = '<digest>' WHERE legacy_username = '<legacy_username>'"
```

`cargo run -p pickem-devserver -- attach-email` computes the same digest
against a local database. Add the address to the Access policy too, then sign
in at `https://pickem.example.com/login` and check `/api/me`.

## Local development

```sh
cargo run -p pickem-devserver -- import "$LEGACY" /tmp/pickem.sqlite3
PICKEM_DEV_EMAIL=you@example.com cargo run -p pickem-devserver -- serve /tmp/pickem.sqlite3
```

Serves the API and `frontend/dist` on port 8787, signed in as that address.
