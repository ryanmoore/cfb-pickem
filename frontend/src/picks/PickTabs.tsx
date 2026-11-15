export type Tab = "bowls" | "playoff";

/** `?tab=playoff` names the playoff tab; anything else is the bowls. */
export const tabInUrl = (): Tab => (new URLSearchParams(location.search).get("tab") === "playoff" ? "playoff" : "bowls");

/** Records the tab in the URL and scrolls to the top. */
export function showTab(t: Tab) {
  const q = new URLSearchParams(location.search);
  if (t === "bowls") q.delete("tab");
  else q.set("tab", t);
  history.replaceState(null, "", `?${q}`);
  scrollTo(0, 0);
}

export function PickTabs({ tab, labels, onChoose }: { tab: Tab; labels: Record<Tab, string>; onChoose: (t: Tab) => void }) {
  return (
    <div className="tabs" role="tablist" aria-label="Picks">
      {(["bowls", "playoff"] as const).map((t) => (
        <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => onChoose(t)}>
          {labels[t]}
        </button>
      ))}
    </div>
  );
}
