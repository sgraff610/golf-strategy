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
      id: "how_feeling" | "focus" | "weather";
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
    id: "how_feeling",
    q: "How's your game feeling going in?",
    sub: "This tunes how aggressive your plan will be.",
    kind: "choice",
    opts: [
      { v: "dialed", label: "Dialed in", sub: "Last rounds were clean", emoji: "🎯" },
      { v: "steady", label: "Steady", sub: "Normal, no fireworks", emoji: "⛳" },
      { v: "rusty",  label: "A bit rusty", sub: "Haven't played in a while", emoji: "🌧" },
    ],
  },
  {
    id: "focus",
    q: "What's the one thing you want to protect today?",
    sub: "We'll weight decisions to minimize this.",
    kind: "choice",
    opts: [
      { v: "doubles", label: "No doubles", sub: "Bogey golf is fine", emoji: "🛡" },
      { v: "pace",    label: "Steady pace", sub: "No blow-up holes", emoji: "⏱" },
      { v: "lowest",  label: "Lowest score", sub: "Worth some risk", emoji: "📉" },
    ],
  },
  {
    id: "weather",
    q: "What's the weather doing?",
    sub: "Wind + wet cost ~½ club. We'll recalibrate yardages.",
    kind: "choice",
    opts: [
      { v: "calm",  label: "Calm & dry",  sub: "Play normal distances", emoji: "☀️" },
      { v: "windy", label: "Breezy",      sub: "10–15 mph",             emoji: "🌬" },
      { v: "wet",   label: "Wet / soft",  sub: "Fairways holding",       emoji: "🌧" },
    ],
  },
  {
    id: "form",
    q: "Real quick — how are your clubs feeling at the range?",
    sub: "Drag to show what's hot and what's cold. This biases live recommendations.",
    kind: "form",
  },
  {
    id: "goal",
    q: "What's your target score today?",
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
