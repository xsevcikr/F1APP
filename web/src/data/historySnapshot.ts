import raw from "./historySnapshot.json";

export interface SnapPodium { pos: number; driverId: string; driver: string; constructorId: string; constructor: string; time: string }
export interface SnapRace { round: number; name: string; date: string; podium: SnapPodium[] }
export interface SnapDriver { position: number; driverId: string; driver: string; teams: string; points: number; wins: number }
export interface SnapConstructor { position: number; constructorId: string; name: string; points: number; wins: number }
export interface SnapSeason { standingsRound: number; races: SnapRace[]; drivers: SnapDriver[]; constructors: SnapConstructor[] }

const snapshot = raw as unknown as { researchedOn: string; source: string; method: string; seasons: Record<string, SnapSeason> };

export const SNAPSHOT_DATE = snapshot.researchedOn;
export const SNAPSHOT_SOURCE = snapshot.source;
export const SNAPSHOT_METHOD = snapshot.method;
export const SNAPSHOT_SEASONS = Object.keys(snapshot.seasons).map(Number).sort((a, b) => b - a);

export const snapshotSeason = (year: number): SnapSeason | null => snapshot.seasons[String(year)] ?? null;
export const snapshotRace = (year: number, round: number): SnapRace | null => snapshotSeason(year)?.races.find((r) => r.round === round) ?? null;
