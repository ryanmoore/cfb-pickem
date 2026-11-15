import { useQuery } from "@tanstack/react-query";
import { fetchMe } from "./api";
import { Picks } from "./picks/Picks";
import { Standings } from "./Standings";
import { PanelError } from "./ui";

function MeStatus() {
  const { data: me, error } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  if (error) return <PanelError error={error} />;
  if (!me) return <div className="skeleton skeleton-inline" aria-busy="true" />;
  if (!me.signed_in) return <a href="/login">Sign in</a>;
  if (!me.known)
    return <span>Signed in, but this email isn't linked to a player yet</span>;
  return <span>Signed in as {me.display_name}</span>;
}

export function App() {
  const onPicks = location.pathname.startsWith("/picks");
  const link = (path: string, label: string, current: boolean) => (
    <a href={path + location.search} aria-current={current ? "page" : undefined}>
      {label}
    </a>
  );
  return (
    <>
      <header>
        <h1>Bowl Pick'em</h1>
        <div className="me">
          <MeStatus />
        </div>
        <nav aria-label="Pages">
          {link("/", "Standings", !onPicks)}
          {link("/picks", "My picks", onPicks)}
        </nav>
      </header>
      <main>{onPicks ? <Picks /> : <Standings />}</main>
    </>
  );
}
