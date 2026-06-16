export type Cat = "Tee" | "Approach" | "Short game" | "Putting";
export const CATS: Cat[] = ["Tee", "Approach", "Short game", "Putting"];

export type Bar = { x: string; v: number; hi?: boolean };
export type Goal = { metric: string; current: number; target: number; unit: "" | "%"; note: string };
export type Fix = { tag: string; title: string; body: string; stat: string; proj: number; recommended?: boolean };

export type Leak = {
  id: string;
  rank: number;
  cat: Cat;
  label: string;
  impact: number;
  holes: number;
  freqPct: number;
  freqLabel: string;
  diagnosis: string;
  chart: Bar[];
  goals: { frequency: Goal; impact: Goal };
  fixes: Fix[];
};

export type Strength = { cat: Cat; metric: string; value: string; note: string };

export const PLAYER = { handicap: 12.4, rounds: 34, trend30d: -1.2 };
export const COACH = {
  name: "Coach Vance",
  title: "PGA Tour Pro · 14 yrs teaching",
  line: "Five things are bleeding most of your strokes. Let's decide which ones we attack — and how.",
};

export const LEAKS: Leak[] = [
  {
    id: "par3-tee", rank: 1, cat: "Tee", label: "Par 3 tee shots",
    impact: 1.42, holes: 38, freqPct: 61, freqLabel: "miss the green",
    diagnosis: "78% of your par-3 misses come up short. You're playing one club too little and aiming at flags you shouldn't.",
    chart: [{ x: "Par 3", v: 1.42, hi: true }, { x: "Par 4", v: 0.28 }, { x: "Par 5", v: 0.11 }],
    goals: {
      frequency: { metric: "Par-3 greens hit", current: 39, target: 55, unit: "%", note: "Hit more greens in regulation." },
      impact:    { metric: "Strokes lost / round", current: 1.42, target: 0.60, unit: "", note: "Turn the misses into easy pars." },
    },
    fixes: [
      { tag: "Club up", title: "Take one more club, every time", body: "Stop trying to flag a stock number.", stat: "Your 7i carries 158y; par-3 avg is 168y — you're a full club short.", proj: 0.5 },
      { tag: "Aim center", title: "Play to the fat of the green", body: "Pin-hunting is costing you.", stat: "Center-of-green misses cost 0.4 fewer strokes than pin-hunts.", proj: 0.3 },
    ],
  },
  {
    id: "drive-right", rank: 2, cat: "Tee", label: "Drive right into trees",
    impact: 1.18, holes: 22, freqPct: 34, freqLabel: "miss right",
    diagnosis: "Driver leaks right on holes with a tree line down the right. The recovery shot eats a stroke nearly every time.",
    chart: [{ x: "Fairway", v: -0.04 }, { x: "Miss left", v: 0.41 }, { x: "Right + trees", v: 1.18, hi: true }],
    goals: {
      frequency: { metric: "Right-miss rate, these holes", current: 34, target: 15, unit: "%", note: "Just keep it out of the trees." },
      impact:    { metric: "Strokes lost / round", current: 1.18, target: 0.40, unit: "", note: "Make the miss survivable." },
    },
    fixes: [
      { tag: "Club swap", title: "Bag the 5-wood off these tees", body: "It takes the trees out of play and you barely lose distance.", stat: "Your 5W misses right only 8% vs driver's 34%, and still flies 232y. On the 6 right-hazard holes that's a projected −0.7 / round.", proj: 0.7, recommended: true },
      { tag: "Setup", title: "Tee up on the right side", body: "Teeing right angles your start line away from the trouble.", stat: "Right-tee drives historically miss right 11% less often.", proj: 0.2 },
    ],
  },
  {
    id: "appr-long", rank: 3, cat: "Approach", label: "Approach shots long",
    impact: 0.96, holes: 19, freqPct: 41, freqLabel: "fly the green",
    diagnosis: "When the pin is back you fly it. You're swinging hot, not under-clubbing — your carry numbers are stale.",
    chart: [{ x: "On", v: -0.22 }, { x: "Short", v: 0.48 }, { x: "Long", v: 0.96, hi: true }],
    goals: {
      frequency: { metric: "Long-miss rate", current: 41, target: 20, unit: "%", note: "Stop flying the green." },
      impact:    { metric: "Strokes lost / round", current: 0.96, target: 0.35, unit: "", note: "Leave the easy chip." },
    },
    fixes: [
      { tag: "Gapping", title: "Re-gap your irons +4 yards", body: "Your carries crept up; your numbers didn't.", stat: "Tracked carries are 4y longer than the yardages you're playing.", proj: 0.4 },
      { tag: "Strategy", title: "Play to the front number on back pins", body: "Take the long miss out of play entirely.", stat: "Front-number approaches finish on the green 23% more often.", proj: 0.3 },
    ],
  },
  {
    id: "three-putt", rank: 4, cat: "Putting", label: "Three-putts",
    impact: 1.04, holes: 12, freqPct: 23, freqLabel: "from outside 30ft",
    diagnosis: "Twelve three-putts in ten rounds — every one from outside 20ft. It's speed control, not your stroke.",
    chart: [{ x: "1 putt", v: -0.78 }, { x: "2 putt", v: 0.12 }, { x: "3+ putt", v: 1.04, hi: true }],
    goals: {
      frequency: { metric: "3-putt rate, 30ft+", current: 23, target: 10, unit: "%", note: "Two-putt the long ones." },
      impact:    { metric: "Strokes lost / round", current: 1.04, target: 0.40, unit: "", note: "Kill the big numbers." },
    },
    fixes: [
      { tag: "Drill", title: "Lag to a 6-foot circle", body: "30ft → 6ft circle, five balls a day.", stat: "70% of your long first putts finish short — pure speed.", proj: 0.5 },
      { tag: "Aim", title: "Roll the first putt past the hole", body: "Give it a chance, take the short ones out of play.", stat: "Putts left short three-putt 3x as often as ones past.", proj: 0.3 },
    ],
  },
  {
    id: "gs-bunker", rank: 5, cat: "Short game", label: "Short-side bunkers",
    impact: 0.84, holes: 9, freqPct: 18, freqLabel: "miss short-side",
    diagnosis: "Short-side bunker shots leave you no green to work with. The damage starts on the approach, not in the sand.",
    chart: [{ x: "Long", v: 0.08 }, { x: "Safe side", v: 0.42 }, { x: "Short side", v: 0.84, hi: true }],
    goals: {
      frequency: { metric: "Short-side miss rate", current: 18, target: 8, unit: "%", note: "Miss to the fat side." },
      impact:    { metric: "Strokes lost / round", current: 0.84, target: 0.30, unit: "", note: "Always leave a putt." },
    },
    fixes: [
      { tag: "Strategy", title: "Aim 10ft past the pin on approach", body: "Trade the short-side for a long, safe miss.", stat: "Long misses cost 0.76 fewer strokes than short-side ones.", proj: 0.4 },
      { tag: "Technique", title: "Splash to the fat of the green", body: "Forget the flag from a buried short-side lie.", stat: "You get up-and-down 41% to fat targets vs 12% at tucked pins.", proj: 0.2 },
    ],
  },
];

export const STRENGTHS: Strength[] = [
  { cat: "Tee",        metric: "Fairways hit",            value: "62%",  note: "Top quartile for your handicap." },
  { cat: "Tee",        metric: "Driving distance",         value: "271y", note: "Length to attack the par 5s." },
  { cat: "Approach",   metric: "100–150 yd greens",        value: "58%",  note: "Your scoring-iron zone is sharp." },
  { cat: "Approach",   metric: "Approach from fairway",    value: "−0.2", note: "You gain strokes when you're in play." },
  { cat: "Short game", metric: "Scrambling",               value: "47%",  note: "Above average — rescues bogeys." },
  { cat: "Short game", metric: "Sand saves",               value: "38%",  note: "Solid from the safe-side bunkers." },
  { cat: "Putting",    metric: "Putts inside 6 ft",        value: "93%",  note: "Automatic from short range." },
  { cat: "Putting",    metric: "2-putt %, under 20 ft",    value: "94%",  note: "Dialed once you're close." },
];

export function fmt(v: number, unit: "" | "%") {
  return unit === "%" ? `${Math.round(v)}%` : `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
}
