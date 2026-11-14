// Throwaway prototype for choosing a pick-entry design. Delete this directory
// and the /try/picks branch in main.tsx once a design is chosen.

export type Team = {
  name: string;
  abbr: string;
  mascot: string;
  conf: string;
  color: string;
  record: string;
  rank?: number;
};
// The favourite's index and the points it is favoured by; 0 is a pick'em.
export type Line = { fav: 0 | 1; pts: number };
export type Game = {
  id: string;
  bowl: string;
  date: string;
  teams: [Team, Team];
  line: Line;
  fact?: string;
  fixed: boolean;
};

// name|abbr|mascot|conf|color
const TEAMS = `Alabama|ALA|Crimson Tide|SEC|#9e1b32
Georgia|UGA|Bulldogs|SEC|#ba0c2f
LSU|LSU|Tigers|SEC|#461d7c
Tennessee|TEN|Volunteers|SEC|#e07a10
Texas A&M|TAMU|Aggies|SEC|#6b1e2e
Ole Miss|MISS|Rebels|SEC|#14213d
Auburn|AUB|Tigers|SEC|#0c2340
Florida|FLA|Gators|SEC|#0a5bd1
Missouri|MIZ|Tigers|SEC|#c99400
Kentucky|UK|Wildcats|SEC|#0033a0
Ohio State|OSU|Buckeyes|Big Ten|#bb0000
Kansas|KU|Jayhawks|Big 12|#0051ba
Penn State|PSU|Nittany Lions|Big Ten|#1e407c
Northwestern|NW|Wildcats|Big Ten|#4e2a84
Wisconsin|WIS|Badgers|Big Ten|#c5050c
Iowa|IOWA|Hawkeyes|Big Ten|#2b2b2b
Washington|WASH|Huskies|Big Ten|#4b2e83
Nebraska|NEB|Cornhuskers|Big Ten|#d00000
Minnesota|MINN|Golden Gophers|Big Ten|#7a0019
Illinois|ILL|Fighting Illini|Big Ten|#e84a27
Clemson|CLEM|Tigers|ACC|#f56600
Miami|MIA|Hurricanes|ACC|#f47321
Florida State|FSU|Seminoles|ACC|#782f40
North Carolina|UNC|Tar Heels|ACC|#4b9cd3
Louisville|LOU|Cardinals|ACC|#ad0000
NC State|NCST|Wolfpack|ACC|#cc0000
Virginia Tech|VT|Hokies|ACC|#861f41
Duke|DUKE|Blue Devils|ACC|#003087
Pittsburgh|PITT|Panthers|ACC|#003594
SMU|SMU|Mustangs|ACC|#c8102e
Texas|TEX|Longhorns|SEC|#bf5700
Oklahoma|OU|Sooners|SEC|#841617
Utah|UTAH|Utes|Big 12|#cc0000
Kansas State|KSU|Wildcats|Big 12|#512888
Iowa State|ISU|Cyclones|Big 12|#a6192e
Baylor|BAY|Bears|Big 12|#154734
TCU|TCU|Horned Frogs|Big 12|#4d1979
Oklahoma State|OKST|Cowboys|Big 12|#ff7300
West Virginia|WVU|Mountaineers|Big 12|#002855
Colorado|COLO|Buffaloes|Big 12|#cfb87c
Arizona State|ASU|Sun Devils|Big 12|#8c1d40
BYU|BYU|Cougars|Big 12|#002e5d
Notre Dame|ND|Fighting Irish|Ind.|#0c2340
USC|USC|Trojans|Big Ten|#990000
UCLA|UCLA|Bruins|Big Ten|#2d68c4
UNLV|UNLV|Rebels|MWC|#cf0a2c
Fresno State|FRES|Bulldogs|MWC|#db0032
San Diego State|SDSU|Aztecs|MWC|#a6192e
Air Force|AF|Falcons|MWC|#003087
Tulane|TUL|Green Wave|AAC|#006747
Memphis|MEM|Tigers|AAC|#003087
Navy|NAVY|Midshipmen|AAC|#00205b
South Florida|USF|Bulls|AAC|#006747
UTSA|UTSA|Roadrunners|AAC|#0c2340
East Carolina|ECU|Pirates|AAC|#592a8a
Liberty|LIB|Flames|CUSA|#c8102e
Jacksonville State|JVST|Gamecocks|CUSA|#cc0000
Western Kentucky|WKU|Hilltoppers|CUSA|#c60c30
Louisiana Tech|LT|Bulldogs|CUSA|#002f8b
Toledo|TOL|Rockets|MAC|#15397f
Miami (OH)|M-OH|RedHawks|MAC|#b61e2e
Ohio|OHIO|Bobcats|MAC|#00694e
Northern Illinois|NIU|Huskies|MAC|#ba0c2f
Ball State|BALL|Cardinals|MAC|#ba0c2f
App State|APP|Mountaineers|Sun Belt|#222222
Troy|TROY|Trojans|Sun Belt|#8a2432
Georgia Southern|GASO|Eagles|Sun Belt|#011e41
Louisiana|ULL|Ragin' Cajuns|Sun Belt|#ce181e
James Madison|JMU|Dukes|Sun Belt|#450084
Marshall|MRSH|Thundering Herd|Sun Belt|#00b140
South Alabama|USA|Jaguars|Sun Belt|#00205b
Arkansas|ARK|Razorbacks|SEC|#9d2235
South Carolina|SC|Gamecocks|SEC|#73000a
Vanderbilt|VAN|Commodores|SEC|#866d4b
Mississippi State|MSST|Bulldogs|SEC|#660000
Maryland|MD|Terrapins|Big Ten|#e03a3e
Rutgers|RUTG|Scarlet Knights|Big Ten|#cc0033
Purdue|PUR|Boilermakers|Big Ten|#8e6f3e
Indiana|IND|Hoosiers|Big Ten|#990000
Syracuse|SYR|Orange|ACC|#d44500
Boston College|BC|Eagles|ACC|#8a1538
Cincinnati|CIN|Bearcats|Big 12|#e00122
Houston|HOU|Cougars|Big 12|#c8102e
Texas Tech|TTU|Red Raiders|Big 12|#cc0000
Arizona|ARIZ|Wildcats|Big 12|#0c234b
Wake Forest|WAKE|Demon Deacons|ACC|#9e7e38
Georgia Tech|GT|Yellow Jackets|ACC|#b3a369`
  .split("\n")
  .map((l) => l.split("|"));

const BOWLS = `Palm Harbor,Lakefront,Gulf Coast,Desert Sun,Harvest,Bayou,Mountain West,Old Mill,Redwood,Gateway,Sunbelt Classic,Capital City,Peach Orchard,Prairie,Lighthouse,Riverwalk,Cactus Ridge,Magnolia,Boardwalk,Cornerstone,Evergreen,Skyline,Music City,Pinecone,Silver Dollar,Harborfront,Hill Country,Freedom Trail,Orange Grove,Tidewater,Bluegrass,Great Plains,Lone Star,Copper State,Sandhills,Pacific Rim,Rosewood,Granite State`.split(",");
const PLAYOFF = ["Playoff Quarterfinal · Lone Pine", "Playoff Quarterfinal · Crescent", "Playoff Quarterfinal · Summit", "Playoff Quarterfinal · Beacon"];

const FACTS = [
  "The home side has not lost a bowl game since the last coaching change.",
  "Combined, these two offenses average over 70 points a game.",
  "The kicker on one sideline has never missed inside 40 yards.",
  "Last meeting went to overtime on a late field goal.",
  "Both teams finished the regular season on a three-game win streak.",
  "A walk-on running back leads the nation in yards after contact.",
  "The game is played in a stadium with a retractable roof that stays open.",
  "Neither team has turned the ball over in the last two weeks.",
  "The winner's mascot gets a trophy that weighs more than the mascot.",
];

const lineFor = (i: number): Line => ({
  fav: (i % 2) as 0 | 1,
  pts: i % 9 === 4 ? 0 : (((i * 7) % 13) + 1) / 2 + 0.5,
});

let t = 0;
const mk = (): Team => {
  const [name, abbr, mascot, conf, color] = TEAMS[t];
  const w = 6 + ((t * 5) % 7);
  const rank = t % 3 === 0 && t / 3 + 1 <= 25 ? t / 3 + 1 : undefined;
  t++;
  return { name, abbr, mascot, conf, color, record: `${w}-${12 - w}`, rank };
};

const build = (name: string, i: number, fixed: boolean): Game => {
  const teams: [Team, Team] = [mk(), mk()];
  return {
    id: `${fixed ? "f" : "g"}${i}`,
    bowl: fixed ? name : `${name} Bowl`,
    date: new Date(2026, 11, 18 + ((i * 3) % 14)).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    teams,
    line: lineFor(i),
    fact: i % 4 === 3 ? undefined : FACTS[i % FACTS.length],
    fixed,
  };
};

export const GAMES: Game[] = BOWLS.map((b, i) => build(b, i, false));
export const FIXED: Game[] = PLAYOFF.map((b, i) => build(b, i, true));
export const FIXED_POINTS = 10;
