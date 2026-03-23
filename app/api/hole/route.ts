import { NextRequest, NextResponse } from "next/server";
import { getHole } from "@/lib/courseData";

export async function POST(req: NextRequest) {
  let body: { course?: string; hole?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { course, hole } = body;
  if (!course || !hole) {
    return NextResponse.json(
      { error: "Missing required fields: course and hole" },
      { status: 422 }
    );
  }

  const holeData = getHole(course, hole);
  if (!holeData) {
    return NextResponse.json(
      { error: "Hole not found for the given course and hole number" },
      { status: 404 }
    );
  }

  return NextResponse.json({ hole: holeData }, { status: 200 });
}
