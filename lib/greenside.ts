import { CourseRecord } from "@/lib/types";

// ─── Greenside data sharing across tee versions ────────────────────────────────
// Greenside aim + the green-surround positions describe the GREEN, which is the
// same physical green for every tee box on a course. They're stored per tee-row,
// though, so aim entered on one tee won't show when planning/playing another. Fill
// any hole that has no greenside info from a sibling tee version that does.

export const GREENSIDE_POSITIONS = [
  "long_left", "long_middle", "long_right", "middle_left",
  "middle_right", "short_left", "short_middle", "short_right",
] as const;

export function holeHasAim(h: Record<string, any> | undefined | null): boolean {
  return !!(h && h.aim_dir);
}

export function holeHasPositions(h: Record<string, any> | undefined | null): boolean {
  if (!h) return false;
  for (const p of GREENSIDE_POSITIONS) {
    if (h[`approach_green_${p}`] || h[`approach_bunker_${p}`]) return true;
  }
  return false;
}

// Returns a course whose holes are filled with greenside aim/positions borrowed
// from sibling tee versions (same course name, different id) wherever this tee's
// hole has none. Existing data is never overwritten.
export function mergeGreensideAcrossTees(
  course: CourseRecord | null | undefined,
  siblings: CourseRecord[],
): CourseRecord | null {
  if (!course) return null;
  if (siblings.length === 0) return course;
  const holes = (course.holes ?? []).map((h: any) => {
    let merged = h;

    // Aim is green-character — share it from a sibling tee when this hole has none.
    if (!holeHasAim(h)) {
      for (const sib of siblings) {
        const sh = (sib.holes ?? []).find((x: any) => x.hole === h.hole) as Record<string, any> | undefined;
        if (holeHasAim(sh)) {
          merged = { ...merged, aim_dir: sh!.aim_dir, aim_level: sh!.aim_level ?? 0 };
          break;
        }
      }
    }

    // Same for the green-surround positions (bunkers / extra green around the green).
    if (!holeHasPositions(h)) {
      for (const sib of siblings) {
        const sh = (sib.holes ?? []).find((x: any) => x.hole === h.hole) as Record<string, any> | undefined;
        if (holeHasPositions(sh)) {
          const add: Record<string, any> = {};
          for (const p of GREENSIDE_POSITIONS) {
            add[`approach_green_${p}`] = !!sh![`approach_green_${p}`];
            add[`approach_bunker_${p}`] = !!sh![`approach_bunker_${p}`];
          }
          merged = { ...merged, ...add };
          break;
        }
      }
    }

    return merged;
  });
  return { ...course, holes };
}

// Convenience: pick the sibling tee versions of a course from a full course list.
export function siblingTees(course: CourseRecord | null | undefined, all: CourseRecord[]): CourseRecord[] {
  if (!course) return [];
  return all.filter((c) => c.name === course.name && c.id !== course.id);
}
