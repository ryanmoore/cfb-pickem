const fmt = (o: Intl.DateTimeFormatOptions, iso: string) => new Intl.DateTimeFormat(undefined, o).format(new Date(iso));

/** A kickoff's weekday in the viewer's own time zone, as "Sat". */
export const formatWeekday = (iso: string) => fmt({ weekday: "short" }, iso);

/** A kickoff's date in the viewer's own time zone, as "Sat, Dec 30". */
export const formatDay = (iso: string) => fmt({ weekday: "short", month: "short", day: "numeric" }, iso);

/** A kickoff's time of day in the viewer's own time zone, as "12:00 PM". */
export const formatTime = (iso: string) => fmt({ hour: "numeric", minute: "2-digit" }, iso);

/** A kickoff in the viewer's own time zone without the zone name, as "Sat, Dec 30 · 12:00 PM". */
export const formatWhen = (iso: string) => `${formatDay(iso)} · ${formatTime(iso)}`;

/** A kickoff in the viewer's own time zone, as "Sat, Dec 30 · 12:00 PM CST". */
export const formatKickoff = (iso: string) =>
  `${formatDay(iso)} · ${fmt({ hour: "numeric", minute: "2-digit", timeZoneName: "short" }, iso)}`;

/** The viewer's calendar date of a kickoff, as "2030-12-30"; sorts and groups by day. */
export function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
