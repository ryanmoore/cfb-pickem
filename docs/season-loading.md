# Loading a season

A season is loaded from one reviewed JSON document. It goes in as a draft that
only admins can see, is previewed in the app, then published. Commands run
from the repository root against a local database; the admin routes do the
same against a live site.

## 1. Draft the document

Save the schedule source's postseason games response once (the generator's
module header names the request) and generate from the file, so rehearsals
cost no API calls:

```sh
cargo run -p pickem-devserver -- draft-season games.json pickem.sqlite3 > season.json
```

Only FBS-vs-FBS games are kept; `--from YYYY-MM-DD` keeps games from that UTC date on. A team matches an
existing one only when its school name equals the stored name (any case); `--teams teams.json` (the source's
saved teams list) fills mascot and colors on the teams the draft declares. Stderr reports how many bowls and
teams matched an existing one and lists every `REVIEW` line.

## 2. The document

```jsonc
{
  "year": 2025,
  "locks_at": "2025-12-14T01:00:00Z",   // optional; default is the earliest kickoff
  "playoff_format": "rank",             // "fixed" (default) or "rank"
  "practice": false,
  "new_bowls": { "la-bowl": "LA Bowl" },        // slug -> name, only for bowls not in the database
  "new_teams": { "troy": "Troy",                // same for teams; an object adds mascot and #rrggbb colors
                 "indiana": { "name": "Indiana", "mascot": "Hoosiers", "color": "#990000", "alt_color": "#eeedeb" } },
  "teams": { "troy": {}, "indiana": { "rank": 1, "record": "13-0" } },
  "games": [
    { "bowl": "la-bowl",                 // names the game; one game per bowl per season
      "name": "Bucked Up LA Bowl",       // this season's sponsored name, if different
      "kickoff_at": "2025-12-14T01:00:00Z", "external_id": 401778302,
      "fixed_wager": 5,                  // optional; omit for a confidence game
      "playoff": false,
      "slots": [ { "team": "troy" }, { "team": "indiana", "seed": 1 } ] },
    { "bowl": "national-championship", "kickoff_at": "2026-01-20T00:30:00Z", "playoff": true,
      "slots": [ { "winner_of": "peach" }, { "winner_of": "fiesta" } ] }
  ]
}
```

## 3. Review checklist

- Every `REVIEW:` name resolved: either set the real name (bowls: the name
  without the sponsor), or delete the entry and use the existing slug in the
  games and `teams`. Validation refuses a `REVIEW:` name. Mascot and colors apply only to teams the
  document creates; an existing team is never changed.
- Each `name` on a game is the sponsored name for this season.
- A ranked playoff (`"playoff_format": "rank"`): mark every bracket game
  `"playoff": true`; each team appears once, at its first game, with its seed
  (1 to the field size); every later slot is `winner_of` the game it comes from;
  exactly one final. Drafts list playoff teams in every game they play, so
  replace the later appearances.

## 4. Dry run, apply, preview, publish

```sh
cargo run -p pickem-devserver -- apply-season season.json pickem.sqlite3 --dry-run
cargo run -p pickem-devserver -- apply-season season.json pickem.sqlite3
```

Applying creates the season as a draft and applies again to replace it
wholesale, as often as needed. A published season is refused.

Against a running site, send the document with a JSON content type, signed in
as an admin:

| Route | Effect |
| --- | --- |
| `POST /api/admin/seasons/{year}/draft/dry-run` | validate and summarise |
| `PUT /api/admin/seasons/{year}/draft` | apply as a draft, replacing an earlier draft |
| `POST /api/admin/seasons/{year}/publish` | make the draft visible to everyone |
| `DELETE /api/admin/seasons/{year}/draft` | delete a draft and its picks |

Until published, the season is absent from every read route for everyone but
admins, who see `"draft": true` in the season list and can save picks to try
the page. Bowls and teams created by a draft stay if the draft is deleted;
declaring them again in a later document is accepted when the names match.

## 5. The automation

An automation can load and preview drafts without being a player. It signs in
with an Access service token (add a Service Auth policy for it to the
application that protects `/api/admin`) and sends the headers
`CF-Access-Client-Id` and `CF-Access-Client-Secret` on every request.

The Worker treats a token as the automation only when its client id equals the
`AUTOMATION_CLIENT_ID` secret (`wrangler secret put AUTOMATION_CLIENT_ID`); with it
unset, or for any other service token, the caller is anonymous.

The automation can apply, replace, dry-run and delete drafts, and read draft
seasons on the read routes to check the result. It cannot publish, record
results or save picks (all 403), and it is not a player: `/api/me` reports it
as not signed in and it appears in no standings or progress. Locally, set
`PICKEM_DEV_AUTOMATION=1` on the devserver to make every request the automation.

## 6. Cutting the document to a later start date

Regenerate with `--from`, or delete the earlier games by hand, then the
`teams` and `new_*` entries the dry run says nothing uses; rewire any bracket
game whose feeder was deleted.
