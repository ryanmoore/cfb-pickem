import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { applyDraft, deleteDraft, dryRunDraft, fetchMe, publishDraft, type AdminResult, type LoadSummary, type Season } from "./api";
import { documentYear } from "./admin";
import { formatKickoff } from "./picks/kickoff";
import { PanelError, Skeleton, useSeasons } from "./ui";
import "./admin.css";

type Failure = Exclude<AdminResult<never>, { kind: "ok" }>;
type View = { kind: "dry" | "applied"; summary: LoadSummary } | Failure;

function Failed({ result }: { result: Failure }) {
  if (result.kind === "problems") {
    return (
      <div role="alert" className="error">
        <b>{result.problems.length} problem{result.problems.length === 1 ? "" : "s"} in the document</b>
        <ul className="problems">
          {result.problems.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      </div>
    );
  }
  return (
    <p role="alert" className="error">
      {result.kind === "signedout" ? (
        <>The server couldn't be reached, or your sign-in has lapsed. <a href="/signin">Sign in again</a> and retry.</>
      ) : (
        result.message
      )}
    </p>
  );
}

const names = (m: Record<string, string>) => Object.values(m).join(", ") || "none";

function Summary({ s }: { s: LoadSummary }) {
  return (
    <dl className="summary">
      <dt>Season</dt><dd>{s.year}{s.replaces_draft && " (replaces the current draft)"}</dd>
      <dt>Games</dt><dd>{s.games}, of which {s.playoff_games} playoff</dd>
      <dt>Teams</dt><dd>{s.teams}</dd>
      <dt>Locks</dt><dd>{formatKickoff(s.locks_at)}</dd>
      <dt>New bowls</dt><dd>{names(s.new_bowls)}</dd>
      <dt>New teams</dt><dd>{names(s.new_teams)}</dd>
    </dl>
  );
}

function DocumentPanel() {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (apply: boolean) => {
    const year = documentYear(text);
    if (typeof year === "string") return setView({ kind: "failed", message: year });
    setBusy(true);
    const r = await (apply ? applyDraft : dryRunDraft)(year, text);
    setBusy(false);
    if (r.kind !== "ok") return setView(r);
    setView({ kind: apply ? "applied" : "dry", summary: r.body.summary });
    if (apply) qc.invalidateQueries({ queryKey: ["seasons"] });
  };

  return (
    <section className="panel">
      <h2>Season document</h2>
      <label className="file">
        Choose a .json file
        <input type="file" accept=".json,application/json" onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) { setText(await file.text()); setView(null); }
        }} />
      </label>
      <textarea
        aria-label="Season document"
        placeholder="Or paste the document here"
        spellCheck={false}
        value={text}
        onChange={(e) => { setText(e.target.value); setView(null); }}
      />
      <div className="actions">
        <button disabled={busy || !text.trim()} onClick={() => run(false)}>Dry run</button>
        <button className="primary" disabled={busy || view?.kind !== "dry"} onClick={() => run(true)}>Apply as draft</button>
      </div>
      {busy && <Skeleton />}
      {view && ("summary" in view ? (
        <div role="status">
          <p className="ok">
            {view.kind === "dry" ? "Valid. Applying would create:" : <>Applied as a draft. <a href={`/?season=${view.summary.year}`}>Preview {view.summary.year}</a></>}
          </p>
          <Summary s={view.summary} />
        </div>
      ) : (
        <Failed result={view} />
      ))}
    </section>
  );
}

function DraftRow({ season }: { season: Season }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const act = async (call: typeof publishDraft, ask: string) => {
    if (!confirm(ask)) return;
    setBusy(true);
    const r = await call(season.year);
    setBusy(false);
    if (r.kind === "ok") qc.invalidateQueries({ queryKey: ["seasons"] });
    else setFailure(r);
  };
  return (
    <li>
      <div className="draft">
        <b>{season.year}</b>
        <a href={`/?season=${season.year}`}>Preview</a>
        <button className="primary" disabled={busy} onClick={() => act(publishDraft, `Publish ${season.year}? Everyone will see it.`)}>Publish</button>
        <button disabled={busy} onClick={() => act(deleteDraft, `Delete the ${season.year} draft and any picks saved on it?`)}>Delete draft</button>
      </div>
      {failure && <Failed result={failure} />}
    </li>
  );
}

function Drafts() {
  const { data: seasons, error } = useSeasons();
  const drafts = seasons?.filter((s) => s.draft);
  return (
    <section className="panel">
      <h2>Drafts</h2>
      {error ? <PanelError error={error} /> : !drafts ? <Skeleton lines={2} /> : drafts.length ? (
        <ul className="drafts">{drafts.map((s) => <DraftRow key={s.year} season={s} />)}</ul>
      ) : (
        <p>No drafts.</p>
      )}
    </section>
  );
}

/** Loads a season from a document, previews the draft and publishes it; admins only. */
export function Admin() {
  const { data: me, error } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  if (error) return <PanelError error={error} />;
  if (!me) return <Skeleton lines={4} />;
  if (!me.signed_in || !me.known || !me.is_admin) return <p role="status">This page is for admins only.</p>;
  return (
    <div className="picks admin narrow">
      <h2 className="label">Admin</h2>
      <DocumentPanel />
      <Drafts />
    </div>
  );
}
