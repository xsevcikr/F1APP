import raw from "./recaps.json";

export type RecapKind =
  | "race-highlights"
  | "qualifying-highlights"
  | "sprint-highlights"
  | "sprint-qualifying-highlights"
  | "full-replay"
  | "interview"
  | "weekend-recap";

export interface Recap {
  season: number;
  /** Grand Prix name as the results archive spells it. */
  grandPrix: string;
  kind: RecapKind;
  title: string;
  url: string;
  source: string;
  duration: string | null;
  published: string | null;
  verifiedOn: string;
  availability: string;
}

export const RECAP_LABEL: Record<RecapKind, string> = {
  "race-highlights": "Race Highlights",
  "qualifying-highlights": "Qualifying Highlights",
  "sprint-highlights": "Sprint Highlights",
  "sprint-qualifying-highlights": "Sprint Qualifying Highlights",
  "full-replay": "Full Race Replay",
  interview: "Post-race Interviews",
  "weekend-recap": "Weekend Recap",
};

export const RECAPS = raw.entries as Recap[];

export const recapsFor = (season: number, grandPrix: string) => RECAPS.filter((r) => r.season === season && r.grandPrix === grandPrix);

/** Official sources that are not tied to one video: opened, not embedded. */
export const OFFICIAL_INDEX = [
  { label: "All Formula 1 race videos", url: "https://www.formula1.com/en/video", source: "Formula 1 (formula1.com)" },
  { label: "FIA Formula One documents (stewards' decisions)", url: "https://www.fia.com/documents/championships/fia-formula-one-world-championship-14", source: "FIA" },
] as const;
