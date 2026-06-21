export type Disp = { on: number; long: number; short: number; left: number; right: number };
export type Club = { club: string; loft: string; yards: number; n: number; prox: number; sg: number; disp: Disp };

export const CLUBS_ALL: Club[] = [
  { club: "5 iron", loft: "25°", yards: 178, n: 84,  prox: 51, sg: -0.18, disp: { on: 38, long: 9,  short: 30, left: 12, right: 11 } },
  { club: "6 iron", loft: "28°", yards: 168, n: 102, prox: 44, sg: -0.09, disp: { on: 44, long: 11, short: 24, left: 10, right: 11 } },
  { club: "7 iron", loft: "32°", yards: 156, n: 141, prox: 36, sg:  0.04, disp: { on: 52, long: 16, short: 12, left: 9,  right: 11 } },
  { club: "8 iron", loft: "36°", yards: 144, n: 138, prox: 31, sg:  0.11, disp: { on: 58, long: 12, short: 10, left: 10, right: 10 } },
  { club: "9 iron", loft: "40°", yards: 132, n: 126, prox: 27, sg:  0.14, disp: { on: 61, long: 8,  short: 8,  left: 8,  right: 15 } },
  { club: "PW",     loft: "45°", yards: 118, n: 119, prox: 22, sg:  0.19, disp: { on: 64, long: 9,  short: 9,  left: 9,  right: 9  } },
  { club: "GW",     loft: "50°", yards: 102, n: 88,  prox: 21, sg:  0.08, disp: { on: 59, long: 16, short: 9,  left: 8,  right: 8  } },
  { club: "SW",     loft: "54°", yards: 86,  n: 73,  prox: 19, sg: -0.04, disp: { on: 55, long: 17, short: 10, left: 9,  right: 9  } },
  { club: "LW",     loft: "58°", yards: 68,  n: 49,  prox: 18, sg: -0.21, disp: { on: 47, long: 11, short: 22, left: 10, right: 10 } },
];

export const CLUBS_L20: Club[] = [
  { club: "5 iron", loft: "25°", yards: 179, n: 31, prox: 47, sg: -0.11, disp: { on: 42, long: 10, short: 26, left: 11, right: 11 } },
  { club: "6 iron", loft: "28°", yards: 169, n: 38, prox: 41, sg: -0.03, disp: { on: 47, long: 11, short: 21, left: 10, right: 11 } },
  { club: "7 iron", loft: "32°", yards: 157, n: 52, prox: 33, sg:  0.09, disp: { on: 56, long: 13, short: 11, left: 10, right: 10 } },
  { club: "8 iron", loft: "36°", yards: 145, n: 50, prox: 29, sg:  0.15, disp: { on: 60, long: 10, short: 10, left: 10, right: 10 } },
  { club: "9 iron", loft: "40°", yards: 133, n: 47, prox: 25, sg:  0.18, disp: { on: 63, long: 8,  short: 8,  left: 8,  right: 13 } },
  { club: "PW",     loft: "45°", yards: 119, n: 44, prox: 20, sg:  0.24, disp: { on: 67, long: 8,  short: 9,  left: 8,  right: 8  } },
  { club: "GW",     loft: "50°", yards: 103, n: 33, prox: 19, sg:  0.13, disp: { on: 62, long: 13, short: 9,  left: 8,  right: 8  } },
  { club: "SW",     loft: "54°", yards: 87,  n: 28, prox: 18, sg:  0.02, disp: { on: 58, long: 15, short: 9,  left: 9,  right: 9  } },
  { club: "LW",     loft: "58°", yards: 69,  n: 19, prox: 16, sg: -0.12, disp: { on: 52, long: 10, short: 20, left: 9,  right: 9  } },
];

export const topMiss = (d: Disp): [string, number] =>
  ([["Short", d.short], ["Long", d.long], ["Left", d.left], ["Right", d.right]] as [string, number][])
    .sort((a, b) => b[1] - a[1])[0];

export const sgTone  = (sg: number) => (sg >= 0.1 ? "good" : sg <= -0.1 ? "bad" : "mid");
export const sgColor = (sg: number) => (sgTone(sg) === "good" ? "var(--green)" : sgTone(sg) === "bad" ? "var(--accent-deep)" : "var(--ink-soft)");
