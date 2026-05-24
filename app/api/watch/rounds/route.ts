import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(_req: NextRequest) {
  const { data: rounds, error } = await supabase
    .from("rounds")
    .select("id, date, course_id, holes_played, holes")
    .order("date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const courseIds = [...new Set((rounds ?? []).map((r: any) => r.course_id).filter(Boolean))];
  const courseNames: Record<string, string> = {};
  if (courseIds.length) {
    const { data: courses } = await supabase
      .from("courses")
      .select("id, name")
      .in("id", courseIds);
    for (const c of courses ?? []) courseNames[c.id] = c.name;
  }

  const result = (rounds ?? []).map((r: any) => {
    const holes: any[] = r.holes ?? [];
    const incomplete = holes.some(h => !h.score || Number(h.score) === 0);
    return {
      id: r.id,
      date: r.date,
      course_id: r.course_id,
      course_name: courseNames[r.course_id] ?? "Unknown Course",
      holes_played: r.holes_played ?? holes.length,
      incomplete,
      holes: holes.map(h => ({
        hole: h.hole,
        par: h.par,
        yards: h.yards,
        stroke_index: h.stroke_index,
        score: h.score !== "" && h.score !== null && h.score !== undefined ? Number(h.score) : null,
        putts: h.putts !== "" && h.putts !== null && h.putts !== undefined ? Number(h.putts) : null,
      })),
    };
  });

  // Sort: incomplete rounds first, then by date descending
  result.sort((a, b) => {
    if (a.incomplete !== b.incomplete) return a.incomplete ? -1 : 1;
    return b.date.localeCompare(a.date);
  });

  return NextResponse.json({ rounds: result });
}
