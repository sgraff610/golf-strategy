import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type ScorePatch = {
  roundId: string;
  holeNumber: number;
  score?: number;
  putts?: number;
  chips?: number;
  first_putt_distance?: string;
  club?: string;
  tee_accuracy?: string;
  appr_distance?: string;
  appr_accuracy?: string;
  water_penalty?: number;
  drop_or_out?: number;
  tree_haz?: number;
  fairway_bunker?: number;
  greenside_bunker?: number;
};

export async function PATCH(req: NextRequest) {
  let body: ScorePatch;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { roundId, holeNumber, ...fields } = body;
  if (!roundId || !holeNumber)
    return NextResponse.json({ error: "Missing roundId and holeNumber" }, { status: 400 });

  const { data: round, error: fetchErr } = await supabase
    .from("rounds")
    .select("holes")
    .eq("id", roundId)
    .single();

  if (fetchErr || !round)
    return NextResponse.json({ error: "Round not found" }, { status: 404 });

  const holes: any[] = round.holes ?? [];
  const idx = holes.findIndex((h: any) => Number(h.hole) === Number(holeNumber));
  if (idx === -1)
    return NextResponse.json({ error: "Hole not found in round" }, { status: 404 });

  const updated = { ...holes[idx] };

  // Apply only the fields that were sent
  const allowed: (keyof Omit<ScorePatch, "roundId" | "holeNumber">)[] = [
    "score", "putts", "chips", "first_putt_distance",
    "club", "tee_accuracy", "appr_distance", "appr_accuracy",
    "water_penalty", "drop_or_out", "tree_haz", "fairway_bunker", "greenside_bunker",
  ];
  for (const key of allowed) {
    if (fields[key] !== undefined) updated[key] = fields[key];
  }

  const updatedHoles = [...holes];
  updatedHoles[idx] = updated;

  const { error: updateErr } = await supabase
    .from("rounds")
    .update({ holes: updatedHoles })
    .eq("id", roundId);

  if (updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
