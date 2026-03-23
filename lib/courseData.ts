export type DoglegDirection =
  | "severe_left"
  | "moderate_left"
  | "slight_left"
  | "straight"
  | "slight_right"
  | "moderate_right"
  | "severe_right"
  | null;

export type Hole = {
  hole: number;
  par: 3 | 4 | 5;
  yards: number;
  dogleg_direction?: DoglegDirection;
};

export type Course = {
  name: string;
  holes: Hole[];
};

export const courses: Course[] = [
  {
    name: "Sample Course",
    holes: [
      { hole: 1, par: 4, yards: 410, dogleg_direction: "slight_left" },
      { hole: 2, par: 3, yards: 180, dogleg_direction: null },
      { hole: 3, par: 5, yards: 520, dogleg_direction: "moderate_right" },
      { hole: 4, par: 4, yards: 385, dogleg_direction: "straight" },
      { hole: 5, par: 3, yards: 155, dogleg_direction: null },
      { hole: 6, par: 5, yards: 545, dogleg_direction: "slight_left" },
      { hole: 7, par: 4, yards: 425, dogleg_direction: "moderate_left" },
      { hole: 8, par: 3, yards: 210, dogleg_direction: null },
      { hole: 9, par: 4, yards: 460, dogleg_direction: "slight_right" },
      { hole: 10, par: 4, yards: 395, dogleg_direction: "straight" },
      { hole: 11, par: 5, yards: 560, dogleg_direction: "moderate_right" },
      { hole: 12, par: 3, yards: 140, dogleg_direction: null },
      { hole: 13, par: 4, yards: 415, dogleg_direction: "severe_left" },
      { hole: 14, par: 4, yards: 370, dogleg_direction: "slight_right" },
      { hole: 15, par: 5, yards: 530, dogleg_direction: "straight" },
      { hole: 16, par: 3, yards: 175, dogleg_direction: null },
      { hole: 17, par: 4, yards: 440, dogleg_direction: "moderate_right" },
      { hole: 18, par: 4, yards: 450, dogleg_direction: "slight_left" },
    ],
  },
];

export function getHole(courseName: string, holeNumber: number): Hole | null {
  const course = courses.find((c) => c.name === courseName);
  if (!course) return null;
  return course.holes.find((h) => h.hole === holeNumber) ?? null;
}
