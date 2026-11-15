/** A kickoff in the viewer's own time zone, as "Sat, Dec 30 · 12:00 PM CST". */
export function formatKickoff(iso: string) {
  const at = new Date(iso);
  const date = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return `${date.format(at)} · ${time.format(at)}`;
}
