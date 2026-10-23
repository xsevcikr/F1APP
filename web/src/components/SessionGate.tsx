import type { ReactNode } from "react";
import { useState } from "react";
import { useSession } from "../store/session";
import { SessionPicker } from "./SessionPicker";
import { ErrorState, Loading } from "./ui";

/** Shows loading, error and empty states until a session is ready. */
export function SessionGate({ children }: { children: ReactNode }) {
  const phase = useSession((s) => s.phase);
  const error = useSession((s) => s.error);
  const key = useSession((s) => s.sessionKey);
  const load = useSession((s) => s.load);
  const [picker, setPicker] = useState(false);

  if (phase === "ready") return <>{children}</>;
  if (phase === "loading") return <Loading label="Loading session data (first load of a session can take a minute because of upstream rate limits)" />;
  if (phase === "error")
    return (
      <div className="max-w-xl">
        <ErrorState title="Could not load this session" message={error ?? undefined} onRetry={() => key !== null && load(key)} />
      </div>
    );
  return (
    <div className="panel max-w-xl p-6">
      <h2 className="font-display text-lg font-bold uppercase tracking-wide">No session selected</h2>
      <p className="mt-1 text-sm text-muted">Choose a Grand Prix session to follow live or replay.</p>
      <button className="btn btn-accent mt-4" onClick={() => setPicker(true)}>
        Select session
      </button>
      {picker && <SessionPicker onClose={() => setPicker(false)} />}
    </div>
  );
}
