import raw from "./practiceSnapshot.json";

export interface PracticeRow { pos: number; number: number; acronym: string; driver: string; team: string; best: string; gap: string; laps: number }
export interface PracticeSession { sessionKey: number; name: string; start: string; end: string; rows: PracticeRow[] }

const snap = raw as unknown as { researchedOn: string; source: string; meeting: string; sessions: PracticeSession[] };

export const PRACTICE_READ_ON = snap.researchedOn;
export const PRACTICE_SOURCE = snap.source;
export const PRACTICE_MEETING = snap.meeting;
export const PRACTICE_SESSIONS = snap.sessions;
