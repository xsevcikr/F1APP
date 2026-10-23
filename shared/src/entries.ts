// The 2026 entry list: teams, race drivers and their numbers.
//
// This is identity data only (who entered, under which number, in which
// colours). It carries no results. Points, positions and wins always come from
// the standings feed; the snapshot at the bottom is a labelled fallback for when
// that feed cannot be reached.
//
// Source: the 2026 Formula One World Championship entry table (Wikipedia),
// cross-checked against three standings sites on 2026-10-23. The official list is
// the FIA entry list at fia.com; no machine-readable official feed is available.
// Team colours are approximations of each livery's main colour. OpenF1 reports
// the official per-session colour, and the app uses that whenever it has it.

export interface DriverEntry {
  number: number;
  code: string;
  firstName: string;
  lastName: string;
  nationality: string;
  /** ISO 3166-1 alpha-3 country code used for the flag label. */
  country: string;
  teamId: string;
  /** Rounds the driver drove for this team, when it is not the whole season. */
  rounds?: string;
}

export interface ReserveEntry {
  name: string;
  teamId: string;
  role: string;
}

export interface TeamEntry {
  id: string;
  /** Short name used in standings and the team selector. */
  name: string;
  /** Official entrant name. */
  entrant: string;
  chassis: string;
  powerUnit: string;
  /** Main livery colour and a contrasting secondary. */
  colour: string;
  accent: string;
  /** Text colour that reads on the main colour. */
  ink: string;
  /** Lower-case fragments matched against the standings feed's constructor id and name. */
  match: string[];
  base: string;
}

export interface SeasonEntries {
  season: number;
  teams: TeamEntry[];
  drivers: DriverEntry[];
  reserves: ReserveEntry[];
  /** Drivers who took part in free practice for a team without a race seat. */
  practice: { name: string; teamId: string; sessions: string }[];
  source: string;
  asOf: string;
}

const T = (t: TeamEntry) => t;
const D = (number: number, code: string, firstName: string, lastName: string, nationality: string, country: string, teamId: string, rounds?: string): DriverEntry => ({
  number, code, firstName, lastName, nationality, country, teamId, ...(rounds ? { rounds } : {}),
});

export const ENTRIES_2026: SeasonEntries = {
  season: 2026,
  asOf: "2026-10-23",
  source: "2026 Formula One World Championship entry table (Wikipedia), checked against the FIA entry list on request. Not an official feed.",
  teams: [
    T({ id: "mercedes", name: "Mercedes", entrant: "Mercedes-AMG Petronas F1 Team", chassis: "F1 W17", powerUnit: "Mercedes-AMG F1 M17", colour: "#27F4D2", accent: "#0b0d0e", ink: "#06100f", match: ["mercedes"], base: "Brackley, United Kingdom" }),
    T({ id: "ferrari", name: "Ferrari", entrant: "Scuderia Ferrari HP", chassis: "SF-26", powerUnit: "Ferrari 067/6", colour: "#E8002D", accent: "#FFEB00", ink: "#ffffff", match: ["ferrari"], base: "Maranello, Italy" }),
    T({ id: "mclaren", name: "McLaren", entrant: "McLaren Mastercard F1 Team", chassis: "MCL40", powerUnit: "Mercedes-AMG F1 M17", colour: "#FF8000", accent: "#0b0d0e", ink: "#140800", match: ["mclaren"], base: "Woking, United Kingdom" }),
    T({ id: "red_bull", name: "Red Bull Racing", entrant: "Oracle Red Bull Racing", chassis: "RB22", powerUnit: "Red Bull Ford DM01", colour: "#3671C6", accent: "#FFD400", ink: "#ffffff", match: ["red_bull", "red bull"], base: "Milton Keynes, United Kingdom" }),
    T({ id: "rb", name: "Racing Bulls", entrant: "Visa Cash App Racing Bulls F1 Team", chassis: "VCARB 03", powerUnit: "Red Bull Ford DM01", colour: "#6692FF", accent: "#ffffff", ink: "#061023", match: ["racing bulls", "alphatauri", "rb f1", "visa cash app"], base: "Faenza, Italy" }),
    T({ id: "alpine", name: "Alpine", entrant: "BWT Alpine F1 Team", chassis: "A526", powerUnit: "Mercedes-AMG F1 M17", colour: "#FF87BC", accent: "#0093CC", ink: "#1f0a14", match: ["alpine"], base: "Enstone, United Kingdom" }),
    T({ id: "haas", name: "Haas", entrant: "TGR Haas F1 Team", chassis: "VF-26", powerUnit: "Ferrari 067/6", colour: "#B6BABD", accent: "#E6002B", ink: "#0c0d0e", match: ["haas"], base: "Kannapolis, United States" }),
    T({ id: "audi", name: "Audi", entrant: "Audi Revolut F1 Team", chassis: "R26", powerUnit: "Audi AFR 26 Hybrid", colour: "#F50537", accent: "#C0C3C7", ink: "#ffffff", match: ["audi", "sauber", "kick"], base: "Hinwil, Switzerland" }),
    T({ id: "williams", name: "Williams", entrant: "Atlassian Williams F1 Team", chassis: "FW48", powerUnit: "Mercedes-AMG F1 M17", colour: "#64C4FF", accent: "#041E42", ink: "#03121f", match: ["williams"], base: "Grove, United Kingdom" }),
    T({ id: "aston_martin", name: "Aston Martin", entrant: "Aston Martin Aramco F1 Team", chassis: "AMR26", powerUnit: "Honda RA626H", colour: "#229971", accent: "#CEDC00", ink: "#ffffff", match: ["aston"], base: "Silverstone, United Kingdom" }),
    T({ id: "cadillac", name: "Cadillac", entrant: "Cadillac Formula 1 Team", chassis: "MAC-26", powerUnit: "Ferrari 067/6", colour: "#C9CED6", accent: "#0b0d0e", ink: "#0b0d0e", match: ["cadillac"], base: "Fishers, United States" }),
  ],
  drivers: [
    D(63, "RUS", "George", "Russell", "British", "GBR", "mercedes"),
    D(12, "ANT", "Kimi", "Antonelli", "Italian", "ITA", "mercedes"),
    D(16, "LEC", "Charles", "Leclerc", "Monégasque", "MCO", "ferrari"),
    D(44, "HAM", "Lewis", "Hamilton", "British", "GBR", "ferrari"),
    D(1, "NOR", "Lando", "Norris", "British", "GBR", "mclaren"),
    D(81, "PIA", "Oscar", "Piastri", "Australian", "AUS", "mclaren"),
    D(3, "VER", "Max", "Verstappen", "Dutch", "NLD", "red_bull"),
    D(6, "HAD", "Isack", "Hadjar", "French", "FRA", "red_bull", "1–11, 15–17"),
    D(30, "LAW", "Liam", "Lawson", "New Zealander", "NZL", "rb", "1–11, 15–17"),
    D(41, "LIN", "Arvid", "Lindblad", "British", "GBR", "rb"),
    D(10, "GAS", "Pierre", "Gasly", "French", "FRA", "alpine"),
    D(43, "COL", "Franco", "Colapinto", "Argentine", "ARG", "alpine"),
    D(87, "BEA", "Oliver", "Bearman", "British", "GBR", "haas"),
    D(31, "OCO", "Esteban", "Ocon", "French", "FRA", "haas"),
    D(27, "HUL", "Nico", "Hülkenberg", "German", "DEU", "audi"),
    D(5, "BOR", "Gabriel", "Bortoleto", "Brazilian", "BRA", "audi"),
    D(55, "SAI", "Carlos", "Sainz", "Spanish", "ESP", "williams"),
    D(23, "ALB", "Alexander", "Albon", "Thai", "THA", "williams"),
    D(14, "ALO", "Fernando", "Alonso", "Spanish", "ESP", "aston_martin"),
    D(18, "STR", "Lance", "Stroll", "Canadian", "CAN", "aston_martin"),
    D(11, "PER", "Sergio", "Pérez", "Mexican", "MEX", "cadillac"),
    D(77, "BOT", "Valtteri", "Bottas", "Finnish", "FIN", "cadillac"),
  ],
  reserves: [{ name: "Yuki Tsunoda", teamId: "red_bull", role: "Test and reserve driver. Raced for Racing Bulls in rounds 12–14 (#22)." }],
  practice: [
    { name: "Paul Aron", teamId: "alpine", sessions: "Rounds 11, 13 (#61); also Audi, rounds 7–8 (#97)" },
    { name: "Jak Crawford", teamId: "aston_martin", sessions: "Rounds 3, 8, 10 (#34)" },
    { name: "Luke Browning", teamId: "williams", sessions: "Rounds 7–8, 13 (#46)" },
    { name: "Colton Herta", teamId: "cadillac", sessions: "Rounds 7, 11, 13 (#25)" },
    { name: "Dino Beganovic", teamId: "ferrari", sessions: "Rounds 7–8 (#38)" },
    { name: "Ryo Hirakawa", teamId: "haas", sessions: "Rounds 8, 11 (#50)" },
    { name: "Leonardo Fornaroli", teamId: "mclaren", sessions: "Rounds 7, 11 (#67)" },
    { name: "Frederik Vesti", teamId: "mercedes", sessions: "Rounds 7, 11 (#72)" },
    { name: "Ayumu Iwasa", teamId: "rb", sessions: "Round 8 (#90); also Red Bull, rounds 7, 13 (#36)" },
  ],
};

/** Entry list for a season, or null when the app has none for that year. */
export function entriesFor(season: number): SeasonEntries | null {
  return season === 2026 ? ENTRIES_2026 : null;
}

export function teamById(entries: SeasonEntries, id: string): TeamEntry | undefined {
  return entries.teams.find((t) => t.id === id);
}

export function driversOf(entries: SeasonEntries, teamId: string): DriverEntry[] {
  return entries.drivers.filter((d) => d.teamId === teamId);
}

export function driverByNumber(entries: SeasonEntries, n: number): DriverEntry | undefined {
  return entries.drivers.find((d) => d.number === n);
}

/** Finds the team a standings row (constructor id or name) belongs to. */
export function matchTeam(entries: SeasonEntries, ...names: (string | null | undefined)[]): TeamEntry | undefined {
  const hay = names.filter(Boolean).join(" ").toLowerCase();
  if (!hay) return undefined;
  // "red_bull" must not match inside "rb" lookups and vice versa, so test the longest fragments first.
  const frags = entries.teams.flatMap((t) => t.match.map((m) => ({ t, m }))).sort((a, b) => b.m.length - a.m.length);
  return frags.find(({ m }) => hay.includes(m))?.t;
}

export interface TeamStanding {
  team: TeamEntry;
  position: number;
  points: number;
  wins: number | null;
}

export interface DriverStandingRow {
  driver: DriverEntry;
  position: number | null;
  points: number;
  wins: number | null;
}

export interface SeasonTable {
  teams: TeamStanding[];
  drivers: DriverStandingRow[];
  /** Round the table is current after, when the feed says. */
  round: number | null;
  /** "feed" when it came from the standings provider; "snapshot" when it is the bundled fallback. */
  basis: "feed" | "snapshot";
  asOf: string | null;
}

export interface FeedConstructorRow {
  position: number | null;
  points: number;
  wins: number;
  constructor: { id: string; name: string };
}

export interface FeedDriverRow {
  position: number | null;
  points: number;
  wins: number;
  driver: { id: string; code: string | null; number: number | null; familyName: string };
}

/**
 * Joins the standings feed to the entry list. A team or driver the feed has not
 * listed yet is shown with zero points at the bottom, never dropped, so all 11
 * teams are always present. Rows in the feed that match no entry are ignored.
 */
export function joinStandings(
  entries: SeasonEntries,
  feed: { constructors: FeedConstructorRow[]; drivers: FeedDriverRow[]; round: number | null },
): SeasonTable {
  const teamRows = new Map<string, TeamStanding>();
  for (const r of feed.constructors) {
    const team = matchTeam(entries, r.constructor.id, r.constructor.name);
    if (team && !teamRows.has(team.id)) teamRows.set(team.id, { team, position: r.position ?? 0, points: r.points, wins: r.wins });
  }
  const missingTeams = entries.teams.filter((t) => !teamRows.has(t.id));
  const teams = [...teamRows.values()].sort((a, b) => b.points - a.points || a.position - b.position);
  const base = teams.length;
  const teamsAll = [...teams, ...missingTeams.map((team, i) => ({ team, position: base + i + 1, points: 0, wins: null as number | null }))].map((t, i) => ({ ...t, position: i + 1 }));

  const driverRows = new Map<number, DriverStandingRow>();
  for (const r of feed.drivers) {
    const d = entries.drivers.find((e) => (r.driver.code && e.code === r.driver.code.toUpperCase()) || (r.driver.number !== null && e.number === r.driver.number) || e.lastName.toLowerCase() === r.driver.familyName.toLowerCase());
    if (d && !driverRows.has(d.number)) driverRows.set(d.number, { driver: d, position: r.position, points: r.points, wins: r.wins });
  }
  const drivers = entries.drivers
    .map((d) => driverRows.get(d.number) ?? { driver: d, position: null, points: 0, wins: null as number | null })
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || b.points - a.points);
  return { teams: teamsAll, drivers, round: feed.round, basis: "feed", asOf: null };
}

/**
 * Standings as published by third-party standings sites after the 2026
 * Singapore Grand Prix (round 17, 11 October 2026). Shown only when the live
 * standings feed cannot be reached, and labelled as a snapshot. The constructors'
 * figures include points a driver scored at another team (Lawson at Red Bull,
 * rounds 12–14), so a team's total is not always the sum of its current drivers.
 */
export const SNAPSHOT_2026 = {
  round: 17,
  asOf: "2026-10-11",
  teams: [
    ["mercedes", 578], ["ferrari", 444], ["mclaren", 339], ["red_bull", 332], ["rb", 100], ["alpine", 68],
    ["haas", 30], ["audi", 23], ["williams", 12], ["aston_martin", 7], ["cadillac", 0],
  ] as [string, number][],
  drivers: [
    [12, 340], [63, 238], [44, 229], [3, 221], [16, 215], [1, 201], [81, 138], [6, 97], [30, 75], [10, 41], [41, 38],
    [43, 27], [87, 23], [27, 13], [5, 10], [31, 7], [14, 7], [55, 7], [23, 5], [18, 0], [77, 0], [11, 0],
  ] as [number, number][],
};

export function snapshotTable(entries: SeasonEntries = ENTRIES_2026): SeasonTable {
  const teams: TeamStanding[] = SNAPSHOT_2026.teams.map(([id, points], i) => ({ team: teamById(entries, id)!, position: i + 1, points, wins: null }));
  const drivers: DriverStandingRow[] = SNAPSHOT_2026.drivers.map(([n, points], i) => ({ driver: driverByNumber(entries, n)!, position: i + 1, points, wins: null }));
  return { teams, drivers, round: SNAPSHOT_2026.round, basis: "snapshot", asOf: SNAPSHOT_2026.asOf };
}
