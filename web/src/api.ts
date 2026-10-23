// Thin client for the app's own server. The browser never talks to upstream
// providers directly, so credentials stay on the server.
import type {
  CarSample,
  CircuitModel,
  LocationSample,
  SampleWindow,
  ServerStatus,
  SessionCore,
  SessionInfo,
  jolpica,
} from "@f1/shared";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError("Cannot reach the app server. Is it running?", 0);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      /* not JSON */
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

type Race<T> = jolpica.RaceWithRows<T> | null;

export const api = {
  status: () => get<ServerStatus>("/status"),
  sessions: (year: number) => get<SessionInfo[]>(`/sessions?year=${year}`),
  session: (key: number) => get<SessionInfo>(`/sessions/${key}`),
  core: (key: number, signal?: AbortSignal) => get<SessionCore>(`/sessions/${key}/core`, signal),
  circuit: (key: number) => get<{ circuit: CircuitModel; fromSession: SessionInfo }>(`/sessions/${key}/circuit`),
  locations: (key: number, from: number, to: number, driver?: number) =>
    get<SampleWindow<LocationSample>>(`/sessions/${key}/locations?from=${from}&to=${to}${driver !== undefined ? `&driver=${driver}` : ""}`),
  carData: (key: number, from: number, to: number, driver?: number) =>
    get<SampleWindow<CarSample>>(`/sessions/${key}/car-data?from=${from}&to=${to}${driver !== undefined ? `&driver=${driver}` : ""}`),

  seasons: () => get<number[]>("/archive/seasons"),
  schedule: (season: number | "current") => get<jolpica.ScheduleRace[]>(`/archive/${season}/schedule`),
  results: (season: number, round: number) => get<Race<jolpica.ClassificationRow>>(`/archive/${season}/${round}/results`),
  sprint: (season: number, round: number) => get<Race<jolpica.ClassificationRow>>(`/archive/${season}/${round}/sprint`),
  qualifying: (season: number, round: number) => get<Race<jolpica.QualifyingRow>>(`/archive/${season}/${round}/qualifying`),
  pitStops: (season: number, round: number) => get<jolpica.PitStopRow[]>(`/archive/${season}/${round}/pitstops`),
  lapPositions: (season: number, round: number) => get<jolpica.LapPositionRow[]>(`/archive/${season}/${round}/laps`),
  driverStandings: (season: number | "current", round?: number) =>
    get<ReturnType<typeof jolpica.driverStandings>>(`/archive/${season}/standings/drivers${round ? `?round=${round}` : ""}`),
  constructorStandings: (season: number | "current", round?: number) =>
    get<ReturnType<typeof jolpica.constructorStandings>>(`/archive/${season}/standings/constructors${round ? `?round=${round}` : ""}`),
  seasonResults: (season: number) => get<jolpica.RaceWithRows<jolpica.ClassificationRow>[]>(`/archive/${season}/results`),
  seasonSprints: (season: number) => get<jolpica.RaceWithRows<jolpica.ClassificationRow>[]>(`/archive/${season}/sprints`),
  seasonQualifying: (season: number) => get<jolpica.RaceWithRows<jolpica.QualifyingRow>[]>(`/archive/${season}/qualifying`),
  circuitWinners: (id: string) => get<jolpica.RaceWithRows<jolpica.ClassificationRow>[]>(`/archive/circuits/${id}/winners`),
  circuitFastest: (id: string) => get<jolpica.RaceWithRows<jolpica.ClassificationRow>[]>(`/archive/circuits/${id}/fastest`),
  driverCareer: (id: string) => get<jolpica.RaceWithRows<jolpica.ClassificationRow>[]>(`/archive/drivers/${id}/career`),
};
