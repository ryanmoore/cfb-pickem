import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMe } from "./api";
import { History } from "./History";
import { MyPicks } from "./picks/MyPicks";
import { PicksPage } from "./Progress";
import { Standings } from "./Standings";
import { PanelError, SeasonPill, SeasonProvider } from "./ui";

const PAGES: { path: string; label: string; icon: string; seasonal: boolean; view: ReactNode }[] = [
  { path: "/", label: "Standings", icon: "🏆", seasonal: true, view: <Standings /> },
  { path: "/picks", label: "Picks", icon: "📋", seasonal: true, view: <PicksPage /> },
  { path: "/my-picks", label: "My picks", icon: "✏️", seasonal: true, view: <MyPicks /> },
  { path: "/history", label: "History", icon: "📜", seasonal: false, view: <History /> },
];

function MeBadge() {
  const { data: me, error } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  if (error) return <PanelError error={error} />;
  if (!me) return <div className="skeleton skeleton-inline" aria-busy="true" />;
  if (!me.signed_in) return <a className="me" href="/login">Sign in</a>;
  const [text, label] = me.known
    ? [me.display_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase(), `Signed in as ${me.display_name}`]
    : ["?", "Signed in, but this email isn't linked to a player yet"];
  return (
    <span className="me" role="img" aria-label={label} title={label}>
      {text}
    </span>
  );
}

function Tabs({ className, current }: { className: string; current: string }) {
  return (
    <nav className={className} aria-label="Pages">
      {PAGES.map((p) => (
        <a key={p.path} href={p.path + location.search} aria-current={p.path === current ? "page" : undefined}>
          <span aria-hidden>{p.icon}</span>
          {p.label}
        </a>
      ))}
    </nav>
  );
}

export function App() {
  const page = PAGES.find((p) => p.path === location.pathname.replace(/(.)\/$/, "$1")) ?? PAGES[0];
  return (
    <SeasonProvider>
      <header className="app-hd">
        <div className="hd-in">
          <span className="logo" aria-hidden />
          <h1>
            Bowl Pick'em<small>Confidence pool</small>
          </h1>
          <Tabs className="topnav" current={page.path} />
          <div className="hd-end">
            {page.seasonal && <SeasonPill />}
            <MeBadge />
          </div>
        </div>
      </header>
      <main>{page.view}</main>
      <Tabs className="botnav" current={page.path} />
    </SeasonProvider>
  );
}
