import { Icon } from "./Icon";
import { cx } from "./ui";
import { OFFICIAL_INDEX, RECAP_LABEL, recapsFor, type Recap, type RecapKind } from "../data/recaps";

export function RecapCard({ recap }: { recap: Recap }) {
  return (
    <a href={recap.url} target="_blank" rel="noopener noreferrer" className="panel group flex gap-3 p-3 transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      <div className="grid h-16 w-28 shrink-0 place-items-center rounded-lg bg-black/60 text-white" aria-hidden="true">
        <Icon name="play" size={22} filled />
      </div>
      <div className="min-w-0">
        <div className="label">{RECAP_LABEL[recap.kind]}</div>
        <div className="truncate font-display text-base font-bold uppercase italic">{recap.grandPrix} · {recap.season}</div>
        <div className="num text-[11px] text-muted">{recap.source}{recap.duration ? ` · ${recap.duration}` : ""}{recap.published ? ` · ${recap.published}` : ""}</div>
        <div className="mt-1 text-xs font-semibold text-accent">Watch recap on formula1.com ↗</div>
        <div className="text-[10px] text-faint" title={recap.availability}>Checked {recap.verifiedOn}. {recap.availability}</div>
      </div>
    </a>
  );
}

const WANTED: { kind: RecapKind; sprintOnly?: boolean }[] = [
  { kind: "race-highlights" },
  { kind: "qualifying-highlights" },
  { kind: "sprint-qualifying-highlights", sprintOnly: true },
  { kind: "sprint-highlights", sprintOnly: true },
];

/** Recap section of a race page: verified links only, otherwise an explicit "Recap unavailable". */
export function RaceRecaps({ season, grandPrix, hasSprint }: { season: number; grandPrix: string; hasSprint: boolean }) {
  const found = recapsFor(season, grandPrix);
  const missing = WANTED.filter((w) => (!w.sprintOnly || hasSprint) && !found.some((f) => f.kind === w.kind));
  return (
    <section aria-label="Race recap" className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-black uppercase italic">Race recap</h2>
      {found.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {found.map((r) => <li key={r.url}><RecapCard recap={r} /></li>)}
        </ul>
      )}
      <ul className="flex flex-wrap gap-2 text-xs">
        {missing.map((m) => (
          <li key={m.kind} className={cx("rounded-full bg-raised px-3 py-1 text-muted")}>{RECAP_LABEL[m.kind]}: recap unavailable</li>
        ))}
      </ul>
      <p className="text-[11px] text-muted">
        Only links that were opened and checked are listed; none are guessed. Not listed here does not mean no recap exists. Browse all official videos and the FIA stewards' decision documents:{" "}
        {OFFICIAL_INDEX.map((o, i) => (
          <span key={o.url}>{i > 0 && " · "}<a className="underline" href={o.url} target="_blank" rel="noopener noreferrer">{o.label} ↗</a></span>
        ))}
      </p>
    </section>
  );
}
