// Provider abstraction. The UI talks only to these interfaces, so a different
// timing source (for example a licensed feed) can be added without touching it.
import type {
  CarSample,
  CircuitModel,
  LiveRecord,
  LocationSample,
  ProviderHealth,
  SampleWindow,
  SessionCore,
  SessionInfo,
} from "@f1/shared";

export interface TimingProvider {
  readonly id: "openf1" | "demo";
  /** Sessions for a season, oldest first. */
  listSessions(year: number): Promise<SessionInfo[]>;
  getSession(sessionKey: number): Promise<SessionInfo | null>;
  /** Everything except high-frequency channels. */
  getCore(sessionKey: number): Promise<SessionCore>;
  getLocations(sessionKey: number, from: number, to: number, driver?: number): Promise<SampleWindow<LocationSample>>;
  getCarData(sessionKey: number, from: number, to: number, driver?: number): Promise<SampleWindow<CarSample>>;
  getCircuit(sessionKey: number): Promise<{ circuit: CircuitModel; fromSession: SessionInfo } | null>;
  health(): ProviderHealth;
}

/** Push source for live sessions. */
export interface LiveSource {
  start(): void;
  stop(): void;
  onRecords(cb: (sessionKey: number, records: LiveRecord[]) => void): void;
}
