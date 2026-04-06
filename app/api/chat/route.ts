import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function adjustedGrossScore(holes: any[]): number {
  return holes.reduce((s, h) => s + Math.min(Number(h.score) || 0, h.par + 2), 0);
}

function computeDiff(round: any, course: any): number | null {
  if (!course?.rating || !course?.slope) return null;
  const scored = (round.holes ?? []).filter((h: any) => h.score !== "" && h.score != null && Number(h.score) > 0);
  if (!scored.length) return null;
  const ags = adjustedGrossScore(scored);
  const holesPlayed = round.holes_played ?? scored.length;
  const is9Round = holesPlayed <= 9;
  const is9Course = (course.holes?.length ?? 18) <= 9;
  let rating = course.rating;
  if (is9Round && !is9Course) rating /= 2;
  else if (!is9Round && is9Course) rating *= 2;
  return is9Round
    ? ((113 / course.slope) * (ags - rating)) * 2
    : (ags - rating) * 113 / course.slope;
}

export async function POST(req: NextRequest) {
  let body: { messages: { role: string; content: string }[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { messages } = body;
  if (!messages?.length) return NextResponse.json({ error: "No messages" }, { status: 422 });

  // Load all rounds
  const roundsResult = await supabase.from("rounds").select("*").order("date", { ascending: false });
  const rounds = roundsResult.data;
  console.log("Rounds loaded:", rounds?.length, "Error:", roundsResult);
  if (!rounds?.length) return NextResponse.json({ reply: "No rounds found in your data yet. Add some rounds first!" });

  // Load all courses including AI summaries
  const { data: courses } = await supabase.from("courses").select("id, name, tee_box, rating, slope, hole_count, ai_summary");
  const courseMap: Record<string, any> = {};
  for (const c of courses ?? []) courseMap[c.id] = c;

  // Build a compact summary of all rounds
  const roundSummaries = rounds.map(round => {
    const course = courseMap[round.course_id];
    const holes = round.holes ?? [];
    const scored = holes.filter((h: any) => h.score !== "" && h.score != null && Number(h.score) > 0);
    const totalScore = scored.reduce((s: number, h: any) => s + Number(h.score), 0);
    const totalPar = scored.reduce((s: number, h: any) => s + h.par, 0);
    const putts = scored.reduce((s: number, h: any) => s + (Number(h.putts) || 0), 0);
    const drivingHoles = scored.filter((h: any) => h.par >= 4);
    const fairwaysHit = drivingHoles.filter((h: any) => h.tee_accuracy === "Hit").length;
    const girs = scored.filter((h: any) => h.gir).length;
    const diff = computeDiff(round, course);

    return {
      date: round.date,
      course: round.course_name,
      teeBox: round.tee_box,
      holesPlayed: round.holes_played,
      score: totalScore,
      scoreToPar: totalScore - totalPar,
      putts,
      fairwaysHit: `${fairwaysHit}/${drivingHoles.length}`,
      gir: `${girs}/${scored.length}`,
      handicapDiff: diff != null ? Math.round(diff * 10) / 10 : null,
      courseRating: course?.rating ?? null,
      courseSlope: course?.slope ?? null,
      courseDescription: course?.ai_summary ?? null,
      holes: scored.map((h: any) => ({
        hole: h.hole,
        par: h.par,
        yards: h.yards,
        si: h.stroke_index,
        score: Number(h.score),
        scoreToPar: Number(h.score) - h.par,
        club: h.club || null,
        driveAcc: h.tee_accuracy || null,
        apprClub: h.appr_distance || null,
        apprAcc: h.appr_accuracy || null,
        putts: Number(h.putts) || null,
        chips: h.chips !== "" && h.chips != null ? Number(h.chips) : null,
        gir: h.gir,
        water: (Number(h.water_penalty) || 0) + (Number(h.drop_or_out) || 0),
        trees: Number(h.tree_haz) || 0,
        fwyBunker: Number(h.fairway_bunker) || 0,
        gsBunker: Number(h.greenside_bunker) || 0,
        firstPutt: h.first_putt_distance || null,
      })),
    };
  });

  const systemPrompt = `You are a golf performance analyst AI embedded in a golf strategy app. You have access to the player's complete round history below.

Your job is to answer questions about their game, find patterns and correlations in their data, and give specific, data-driven insights. Be conversational but precise. Use numbers from the data to back up your points. When you spot interesting patterns, call them out proactively.

Here are the AI course descriptions for courses the player has played:
${(courses ?? []).filter(c => c.ai_summary).map(c => `${c.name} (${c.tee_box} tees): ${c.ai_summary}`).join("\n\n")}

Here is the player's complete round data (${rounds.length} rounds, most recent first):

${JSON.stringify(roundSummaries, null, 2)}

Guidelines:
- Reference specific rounds, dates, and courses when relevant
- Calculate averages and percentages when helpful
- Look for correlations (e.g. "when you hit Driver you score X, vs 3W you score Y")
- Be honest about limitations (small sample sizes, missing data)
- Keep answers focused and actionable
- If asked about something not in the data, say so clearly`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });
    const data = await response.json();
    const reply = data.content?.map((b: any) => b.text || "").join("") || "Sorry, I couldn't generate a response.";
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 });
  }
}
