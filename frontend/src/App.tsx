import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMe } from "./api";
import { Admin } from "./Admin";
import { History } from "./History";
import { MyPicks } from "./picks/MyPicks";
import { PicksPage } from "./Progress";
import { SignIn } from "./SignIn";
import { Standings } from "./Standings";
import { PanelError, SeasonPill, SeasonProvider, seasonHref, useSeason } from "./ui";

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
  if (!me.signed_in) return <a className="me" href="/signin">Sign in</a>;
  const [text, label] = me.known
    ? [me.display_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase(), `Signed in as ${me.display_name}`]
    : ["?", "Signed in, but this email isn't linked to a player yet"];
  return (
    <>
      {me.known && me.is_admin && (
        <a className="me admin-link" href="/admin" aria-label="Admin" title="Admin">
          ⚙️
        </a>
      )}
      <span className="me" role="img" aria-label={label} title={label}>
        {text}
      </span>
    </>
  );
}

/** Tells an admin that the season on screen is a draft nobody else can see. */
function DraftBanner() {
  const { year, seasons } = useSeason();
  if (!seasons?.find((s) => s.year === year)?.draft) return null;
  return (
    <p className="draft-banner" role="status">
      Draft: this season is visible to admins only. <a href="/admin">Back to Admin</a>
    </p>
  );
}

function Tabs({ className, current }: { className: string; current: string }) {
  const { chosen } = useSeason();
  return (
    <nav className={className} aria-label="Pages">
      {PAGES.map((p) => (
        <a key={p.path} href={seasonHref(p.path, chosen)} aria-current={p.path === current ? "page" : undefined}>
          <span aria-hidden>{p.icon}</span>
          {p.label}
        </a>
      ))}
    </nav>
  );
}

export function App() {
  const path = location.pathname.replace(/(.)\/$/, "$1");
  const page = PAGES.find((p) => p.path === path) ?? (path === "/signin"
      ? { path, seasonal: false, view: <SignIn /> }
      : path === "/admin"
        ? { path, seasonal: false, view: <Admin /> }
        : PAGES[0]);
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
      <main>
        {page.seasonal && <DraftBanner />}
        {page.view}
      </main>
      <Tabs className="botnav" current={page.path} />
    </SeasonProvider>
  );
}
