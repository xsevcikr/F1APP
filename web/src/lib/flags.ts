// Country flag from the three-letter code OpenF1 gives for a session. Unknown codes return null, never a guess.
const A3_TO_A2: Record<string, string> = {
  AUS: "AU", AUT: "AT", AZE: "AZ", BHR: "BH", BEL: "BE", BRA: "BR", CAN: "CA", CHN: "CN", ESP: "ES", FRA: "FR", GBR: "GB", HUN: "HU", ITA: "IT", JPN: "JP",
  KSA: "SA", SAU: "SA", MEX: "MX", MON: "MC", MCO: "MC", NED: "NL", NLD: "NL", POR: "PT", PRT: "PT", QAT: "QA", SGP: "SG", SIN: "SG", UAE: "AE", ARE: "AE", USA: "US",
  MYS: "MY", MAL: "MY", RUS: "RU", TUR: "TR", DEU: "DE", GER: "DE", ARG: "AR", KOR: "KR", IND: "IN", VNM: "VN", ZAF: "ZA", SWE: "SE", MAR: "MA",
};

export function flagEmoji(a3: string | null | undefined): string | null {
  const a2 = a3 ? A3_TO_A2[a3.toUpperCase()] : undefined;
  return a2 ? String.fromCodePoint(...[...a2].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : null;
}
