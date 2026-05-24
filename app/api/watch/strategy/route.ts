import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { courseId?: string; hole?: number; approachDistance?: number };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { courseId, hole, approachDistance } = body;
  if (!courseId || !hole)
    return NextResponse.json({ error: "Missing courseId and hole" }, { status: 400 });

  // Internal call to the full strategy route, bypassing middleware auth
  const base = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const stratRes = await fetch(`${base}/api/strategy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": process.env.INTERNAL_KEY!,
    },
    body: JSON.stringify({ courseId, hole, approachDistance }),
  });

  if (!stratRes.ok) {
    const text = await stratRes.text().catch(() => "strategy fetch failed");
    return NextResponse.json({ error: text }, { status: stratRes.status });
  }

  const full = await stratRes.json();

  // Normalize holeHistory: convert "" scores to null, trim to 5 most recent
  const holeHistory = ((full.holeHistory ?? []) as any[]).slice(0, 5).map(h => ({
    date: h.date ?? null,
    score: typeof h.score === "number" ? h.score : null,
    par: h.par ?? null,
  }));

  const dataSummary = {
    similarHoles: (full.enrichedHoles ?? []).length,
    exactHistory: (full.holeHistory ?? []).length,
  };

  // Return lean response — strip enrichedHoles and factorWeights (too large for Watch)
  return NextResponse.json({
    hole: full.hole,
    strategy: full.strategy,
    course: full.course,
    defaultApproachDist: full.defaultApproachDist ?? null,
    holeHistory,
    dataSummary,
  });
}
