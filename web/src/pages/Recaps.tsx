import { useMemo, useState } from "react";
import { RecapCard } from "../components/Recaps";
import { OFFICIAL_INDEX, RECAPS, RECAP_LABEL } from "../data/recaps";
import { PageHead } from "./Teams";

export function Recaps() {
  const seasons = useMemo(() => [...new Set(RECAPS.map((r) => r.season))].sort((a, b) => b - a), []);
  const [q, setQ] = useState("");
  const list = RECAPS.filter((r) => !q || `${r.grandPrix} ${r.season} ${RECAP_LABEL[r.kind]}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
      <PageHead title="Race recaps" note="Official highlights from Formula 1. Every link below was opened and checked against its own page; no link is guessed or substituted. Videos open on formula1.com and are not embedded.">
        <input className="input w-56" placeholder="Search Grand Prix or year" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search recaps" />
      </PageHead>
      {seasons.map((s) => {
        const rows = list.filter((r) => r.season === s);
        if (!rows.length) return null;
        return (
          <section key={s} className="flex flex-col gap-2">
            <h2 className="font-display text-2xl font-black">{s}</h2>
            <ul className="grid gap-3 md:grid-cols-2">{rows.map((r) => <li key={r.url}><RecapCard recap={r} /></li>)}</ul>
          </section>
        );
      })}
      {list.length === 0 && <p className="text-sm text-muted">No verified recap matches that search.</p>}
      <div className="panel p-4 text-sm">
        <div className="label mb-1">Everything else</div>
        <p className="text-muted">The verified list is short and grows as links are checked. For any other race, open the official sources directly:</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {OFFICIAL_INDEX.map((o) => <li key={o.url}><a className="btn" href={o.url} target="_blank" rel="noopener noreferrer">{o.label} ↗</a></li>)}
        </ul>
      </div>
    </div>
  );
}
