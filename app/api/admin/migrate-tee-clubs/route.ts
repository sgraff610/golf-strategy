import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// POST /api/admin/migrate-tee-clubs
// Copies plan_club → preferred_club and tee_land → preferred_landing
// for any course hole that has the old field names but is missing the new ones.
// Also returns a full report of current preferred_club state for all courses.

export async function POST(_req: NextRequest) {
  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, name, tee_box, holes");

  if (error || !courses) {
    return NextResponse.json({ error: error?.message ?? "Failed to load courses" }, { status: 500 });
  }

  const report: any[] = [];
  let totalUpdated = 0;

  for (const course of courses) {
    const holes: any[] = course.holes ?? [];
    let changed = false;

    const updatedHoles = holes.map((h: any) => {
      const updated = { ...h };
      let holeChanged = false;

      // Copy plan_club → preferred_club if preferred_club is missing
      if (!updated.preferred_club && updated.plan_club) {
        updated.preferred_club = updated.plan_club;
        holeChanged = true;
      }

      // Copy tee_land → preferred_landing if preferred_landing is missing
      if (!updated.preferred_landing && updated.tee_land) {
        updated.preferred_landing = updated.tee_land;
        holeChanged = true;
      }

      if (holeChanged) changed = true;
      return updated;
    });

    const courseReport: {
      id: any; name: any; tee_box: any; changed: boolean;
      holes: any[]; error?: string;
    } = {
      id: course.id,
      name: course.name,
      tee_box: course.tee_box,
      changed,
      holes: updatedHoles.map((h: any) => ({
        hole: h.hole,
        par: h.par,
        preferred_club: h.preferred_club ?? null,
        preferred_landing: h.preferred_landing ?? null,
        plan_club: h.plan_club ?? null,
        tee_land: h.tee_land ?? null,
      })),
    };
    report.push(courseReport);

    if (changed) {
      const { error: updateErr } = await supabase
        .from("courses")
        .update({ holes: updatedHoles })
        .eq("id", course.id);

      if (updateErr) {
        courseReport.error = updateErr.message;
      } else {
        totalUpdated++;
      }
    }
  }

  return NextResponse.json({ totalUpdated, courses: report });
}

// GET — read-only report showing current preferred_club state for all courses
export async function GET(_req: NextRequest) {
  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, name, tee_box, holes");

  if (error || !courses) {
    return NextResponse.json({ error: error?.message ?? "Failed to load courses" }, { status: 500 });
  }

  const report = courses.map((course: any) => ({
    id: course.id,
    name: course.name,
    tee_box: course.tee_box,
    holes: (course.holes ?? []).map((h: any) => ({
      hole: h.hole,
      par: h.par,
      preferred_club: h.preferred_club ?? null,
      preferred_landing: h.preferred_landing ?? null,
      plan_club: h.plan_club ?? null,
      tee_land: h.tee_land ?? null,
    })),
  }));

  return NextResponse.json({ courses: report });
}
