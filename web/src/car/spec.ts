/** What the car renderer needs to dress a model. */
export interface CarSpec {
  /** Main livery colour. */
  colour: string;
  /** Secondary colour used for the wings and lower body. */
  accent: string;
  /** Colour of the race number, chosen to read on `colour`. */
  ink: string;
  number: number | null;
  /** 0 or 1: tells a team's two cars apart (helmet, nose stripe and fin). */
  variant: 0 | 1;
}

export const carKey = (s: CarSpec) => `${s.colour}|${s.accent}|${s.ink}|${s.number ?? "-"}|${s.variant}`;
