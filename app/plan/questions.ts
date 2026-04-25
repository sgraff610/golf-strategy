// app/plan/questions.ts
// Question schema for the pre-round planner. Edit copy here, not in page.tsx.

export type QuestionOption = {
  v: string;
  label: string;
  sub: string;
  emoji: string;
};

export type Question =
  | {
      id: "focus" | "weather";
      q: string;
      sub: string;
      kind: "choice";
      opts: QuestionOption[];
    }
  | {
      id: "form";
      q: string;
      sub: string;
      kind: "form";
    }
  | {
      id: "goal";
      q: string;
      sub: string;
      kind: "score_dial";
    };

export const QUESTIONS: Question[] = [
  {
    id: "form",
    q: "The Range: How are your clubs feeling?",
    sub: "Drag to show what's hot and what's cold. This biases live recommendations.",
    kind: "form",
  },
  {
    id: "weather",
    q: "Conditions: What's the weather doing?",
    sub: "Wind + wet cost ~½ club. We'll recalibrate yardages.",
    kind: "choice",
    opts: [
      { v: "calm",  label: "Calm & dry",  sub: "Play normal distances", emoji: "☀️" },
      { v: "windy", label: "Breezy",      sub: "10–15 mph",             emoji: "🌬" },
      { v: "wet",   label: "Wet / soft",  sub: "Fairways holding",       emoji: "🌧" },
    ],
  },
  {
    id: "focus",
    q: "Strategy: What do you want to protect?",
    sub: "We'll weight decisions to minimize this.",
    kind: "choice",
    opts: [
      { v: "pace",    label: "Steady pace", sub: "No blow-up holes", emoji: "⏱" },
      { v: "doubles", label: "No doubles", sub: "Bogey golf is fine", emoji: "🛡" },
      { v: "lowest",  label: "Lowest score", sub: "Worth some risk", emoji: "📉" },
    ],
  },
  {
    id: "goal",
    q: "Goal: What's your target score?",
    sub: "Drag or tap ± to set your goal. Defaults to your expected score for this course.",
    kind: "score_dial",
  },
];

export const FORM_CLUBS = [
  { k: "Driver" as const,      default: 65 },
  { k: "3W" as const,          default: 70 },
  { k: "5W" as const,          default: 68 },
  { k: "7W" as const,          default: 65 },
  { k: "Long Irons" as const,  default: 62 },
  { k: "Short Irons" as const, default: 63 },
];
