// app/api/scan-hole/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const PROMPT = `You are an expert golf course analyst studying hole images for a LEFT-HANDED golfer.

PLAYER PROFILE (critical — factor this into all corridor and risk evaluations):
- Left-handed golfer
- Primary miss: FADE — ball starts on line or slightly pushed LEFT, then curves further LEFT. 
  On a 240-yard drive, a bad fade can end up 20+ yards left of the target line.
  The longer the hole, the more the fade accumulates — so left-side danger is MORE critical on longer holes.
- Secondary miss: PULL — ball starts RIGHT of target. May straighten if there is room, 
  but often continues right. Pull is less predictable than the fade.
- Strategy preference: be as close to the hole as possible. Laying up far short is rarely worth it.
  Only recommend a layup when the risk of going for it clearly outweighs being close.

════════════════════════════════════════
IMAGE READING GUIDE — READ THIS CAREFULLY
════════════════════════════════════════

TYPE 1 — DARK BACKGROUND APP DIAGRAMS (e.g. Golfshot, Golf GPS apps with dark UI):
- Background is BLACK or very dark grey
- Fairway = BRIGHT GREEN or LIGHT GREEN elongated shape running tee to green
- Green (putting surface) = LIGHTER GREEN shape at far end, near flag/pin marker
- BUNKERS = WHITE or LIGHT GREY oval/irregular shapes — they stand out brightly against the dark background
  !! A WHITE shape IN or TOUCHING the fairway = FAIRWAY BUNKER — count it as fairway_bunker_count
  !! A WHITE shape NEAR the green = GREENSIDE BUNKER
  !! Do NOT confuse white bunker shapes with the green or flag marker
- Trees/rough = BLACK or VERY DARK irregular shapes along the sides of the fairway
  !! Dark shapes are ALWAYS trees/rough, NEVER bunkers
  !! Dark shapes near the green are TREES, not bunkers
- Water = BLUE shapes
- Tee box = small circle or dot at the near end (bottom of image usually)
- Flag/pin = small flag icon or circle at the far end (top of image usually)

CRITICAL BUNKER RULE: In dark-background diagrams, ONLY count WHITE or LIGHT shapes as bunkers.
BLACK or DARK shapes near the green = TREES, not bunkers. Never call a dark shape a bunker.

TYPE 2 — LIGHT BACKGROUND YARDAGE BOOK / PRINTED DIAGRAMS:
- Background is WHITE or LIGHT
- Fairway = green or light green elongated shape
- Green = lighter green near flag symbol
- Bunkers = white/sand/yellow oval shapes with a visible outline
- Trees = dark green, brown, or stippled shapes along the sides
- Water = blue shapes

TYPE 3 — SATELLITE/AERIAL PHOTOS:
- Fairway = bright manicured green grass strip
- Rough = darker/longer grass on sides
- Bunkers = white/tan/beige sand patches — look for irregular pale shapes
- Trees = dark green rounded canopy clusters
- Water = blue/dark reflective areas
- Green = slightly different shade of bright green near the flag

════════════════════════════════════════
ZONE DEFINITIONS
════════════════════════════════════════
- TEE ZONE: Area around the tee box and the flight corridor

- LANDING ZONE: Where the tee shot should land — follow this logic exactly:
  * Start at 230 yards as the default target
  * Check if there is any trouble (bunker, water, trees encroaching on fairway) within 15 yards of the 230-yard mark
  * If YES trouble at 230: step back in 10-yard increments — check 220, then 210, then 200, then 190, then 180
  * Use the FIRST distance that has no trouble within 15 yards
  * MINIMUM distance is 180 yards — never go shorter than 180
  * If no clean spot exists even at 180, use 180 and note the trouble in the notes field
  * Par 3s: no separate landing zone — the tee shot IS the approach shot
  * Par 5s: evaluate TWO landing zones — tee shot landing (using above logic) AND a second layup landing zone

- PRE-LANDING ZONE (smart layup spot near green):
  * Evaluate the area between 25 and 50 yards short of the center of the green
  * Scan that entire 25-yard range for trouble — bunkers, water, trees, rough patches
  * Pick the SPECIFIC distance in that range (25-50 yds) with the LEAST trouble
  * Report that distance as distance_yards in the pre_landing_zone
  * If the whole range is clean, pick 30 yards (comfortable chip distance)
  * If trouble exists throughout, pick the least-bad spot and note it clearly

- APPROACH ZONE: The area around and leading to the green
- LAYUP ZONE: 50 yards short of center green — only relevant when 170+ yards from green

════════════════════════════════════════
REQUIRED PRE-ANALYSIS - DO THIS BEFORE WRITING JSON
========================================
Before writing the JSON, work through these steps:

STEP 1 - LIST EVERY WHITE OR LIGHT-COLORED SHAPE YOU SEE:
Scan the entire image carefully from tee to green.
White/light shapes can be small. A small white oval INSIDE the green fairway corridor is a FAIRWAY BUNKER.
Note: where is each white shape located? (tee area / mid-fairway / near green)

STEP 2 - CLASSIFY EACH WHITE/LIGHT SHAPE:
- Inside the fairway corridor, between tee and green = FAIRWAY BUNKER (set fairway_bunker_count >= 1)
- Within ~30 yards of the green = GREENSIDE BUNKER
- The flag/pin icon at the green = NOT a bunker, ignore it
- The green surface itself = NOT a bunker

STEP 3 - DARK/BLACK SHAPES:
Dark shapes are ALWAYS trees or rough. NEVER classify a dark shape as a bunker.
Dark shapes near the green = trees framing the green, not bunkers.

STEP 4 - Fill in the JSON using what you found.

CRITICAL: A white oval shape sitting inside or alongside the fairway strip = FAIRWAY BUNKER.
Even if it is small. Even if it overlaps the fairway edge. Count it.
Do NOT skip white shapes in the mid-fairway area.

Return ONLY a valid JSON object - no markdown, no backticks, no explanation.

{
  "par": <3|4|5>,
  "yards": <estimated center yardage as integer>,
  "dogleg_direction": <"severe_left"|"moderate_left"|"slight_left"|"straight"|"slight_right"|"moderate_right"|"severe_right"|null>,

  "tee_tree_hazard_left": <true|false>,
  "tee_tree_hazard_right": <true|false>,
  "tee_bunkers_left": <true|false>,
  "tee_bunkers_right": <true|false>,
  "tee_water_out_left": <true|false>,
  "tee_water_out_right": <true|false>,
  "tee_water_out_across": <true|false>,

  "approach_tree_hazard_left": <true|false>,
  "approach_tree_hazard_right": <true|false>,
  "approach_tree_hazard_long": <true|false>,
  "approach_bunkers_left": <true|false>,
  "approach_bunkers_right": <true|false>,
  "approach_water_out_left": <true|false>,
  "approach_water_out_right": <true|false>,
  "approach_water_out_short": <true|false>,
  "approach_water_out_long": <true|false>,

  "approach_bunker_short_middle": <true|false>,
  "approach_bunker_short_left": <true|false>,
  "approach_bunker_middle_left": <true|false>,
  "approach_bunker_long_left": <true|false>,
  "approach_bunker_long_middle": <true|false>,
  "approach_bunker_long_right": <true|false>,
  "approach_bunker_middle_right": <true|false>,
  "approach_bunker_short_right": <true|false>,

  "approach_green_short_middle": <true|false>,
  "approach_green_short_left": <true|false>,
  "approach_green_middle_left": <true|false>,
  "approach_green_long_left": <true|false>,
  "approach_green_long_middle": <true|false>,
  "approach_green_long_right": <true|false>,
  "approach_green_middle_right": <true|false>,
  "approach_green_short_right": <true|false>,
  "approach_green_depth": <estimated green depth in yards as integer, typically 20-40>,

  "visual_analysis": {

    "fairway_width": <"very_narrow"|"narrow"|"medium"|"wide"|"very_wide">,
    "fairway_width_yards": <estimated average fairway width in yards>,

    "tee_zone": {
      "opening_description": "<describe the visual corridor from the tee — how wide it looks, what frames it on each side>",
      "left_buffer_yards": <estimated yards of safe space LEFT of ideal line before trees/hazard — fade territory for this lefty>,
      "left_buffer_rating": <"very_tight"|"tight"|"moderate"|"generous"|"open">,
      "left_hazard_type": <"none"|"trees"|"bunker"|"water"|"rough"|"OB">,
      "left_hazard_severity": <"none"|"low"|"moderate"|"high"|"severe">,
      "left_notes": "<one sentence: what happens if the fade goes left>",
      "right_buffer_yards": <estimated yards of safe space RIGHT of ideal line before trees/hazard — pull territory>,
      "right_buffer_rating": <"very_tight"|"tight"|"moderate"|"generous"|"open">,
      "right_hazard_type": <"none"|"trees"|"bunker"|"water"|"rough"|"OB">,
      "right_hazard_severity": <"none"|"low"|"moderate"|"high"|"severe">,
      "right_notes": "<one sentence: what happens if the pull goes right>",
      "tree_density_left": <"none"|"sparse"|"moderate"|"heavy"|"wall">,
      "tree_density_right": <"none"|"sparse"|"moderate"|"heavy"|"wall">,
      "recommended_aim": <"left_of_center"|"center"|"right_of_center">,
      "recommended_aim_reason": "<one sentence explaining aim given this player's fade and pull tendencies>"
    },

    "landing_zone": {
      "estimated_distance_yards": <integer>,
      "width_yards": <estimated width of safe landing area>,
      "depth_yards": <estimated front-to-back depth of safe landing area>,
      "trees_left": <"none"|"sparse"|"moderate"|"heavy"|"wall">,
      "trees_right": <"none"|"sparse"|"moderate"|"heavy"|"wall">,
      "bunkers_present": <true|false — are there WHITE shapes in or near the landing zone?>,
      "bunker_positions": "<describe fairway bunker positions relative to landing zone, or null>",
      "water_present": <true|false>,
      "water_description": "<describe water near landing zone, or null>",
      "remaining_distance_to_green": <estimated yards remaining after a good tee shot>,
      "overall_danger": <"safe"|"mild"|"moderate"|"dangerous"|"very_dangerous">,
      "notes": "<one sentence summarizing the landing zone>"
    },

    "pre_landing_zone": {
      "distance_yards": <the specific distance from tee (in yards) to the chosen layup spot — this spot is 25-50 yards short of the green, chosen for minimum trouble>,
      "width_yards": <estimated width of safe area at this distance>,
      "description": "<what does the area 50 yards short of the landing zone look like overall>",
      "trees_left": <"none"|"sparse"|"moderate"|"heavy"|"wall">,
      "trees_right": <"none"|"sparse"|"moderate"|"heavy"|"wall">,
      "bunkers_present": <true|false — are there any WHITE bunker shapes in this zone?>,
      "bunker_description": "<describe any bunkers in this zone — position, how many, which side, or null if none>",
      "water_present": <true|false>,
      "water_description": "<describe any water in this zone — position and threat, or null if none>",
      "other_obstacles": "<describe any other obstacles like trees encroaching on the fairway, rough patches, or null if none>",
      "room_to_recover": <"plenty"|"some"|"tight"|"none">,
      "room_to_recover_notes": "<one sentence: if you land here, what shot do you have next? Is the fairway open enough for a clean 2nd shot?>",
      "overall_danger": <"safe"|"mild"|"moderate"|"dangerous"|"very_dangerous">,
      "safer_than_landing_zone": <true|false>,
      "recommendation": "<one sentence: is being short here better or worse than reaching the landing zone, and why?>"
    },

    "par5_second_landing_zone": <null if not par 5, otherwise {
      "estimated_distance_yards": <distance from tee to ideal layup, targeting as close to green as possible>,
      "remaining_distance_to_green": <yards left after layup>,
      "shot_type_remaining": <"chip"|"pitch"|"short_iron"|"mid_iron">,
      "trees_left": <"none"|"sparse"|"moderate"|"heavy"|"wall">,
      "trees_right": <"none"|"sparse"|"moderate"|"heavy"|"wall">,
      "bunkers_present": <true|false>,
      "water_present": <true|false>,
      "overall_danger": <"safe"|"mild"|"moderate"|"dangerous"|"very_dangerous">,
      "notes": "<one sentence summarizing the layup zone>"
    }>,

    "approach_zone": {
      "distance_to_green_center": <estimated yards from ideal landing zone to center of green>,
      "trees_left": <"none"|"sparse"|"moderate"|"heavy"|"wall">,
      "trees_right": <"none"|"sparse"|"moderate"|"heavy"|"wall">,
      "trees_long": <"none"|"sparse"|"moderate"|"heavy"|"wall">,
      "bunkers_description": "<describe ONLY white/light bunker shapes near green — do NOT describe dark tree shapes as bunkers>",
      "water_description": "<describe any water near green, or null>",
      "green_size": <"very_small"|"small"|"medium"|"large"|"very_large">,
      "green_shape": <"round"|"oval"|"elongated"|"kidney"|"irregular"|"multi_tier">,
      "green_width_yards": <integer>,
      "green_depth_yards": <integer>,
      "green_notes": "<one sentence describing the green>",
      "overall_danger": <"safe"|"mild"|"moderate"|"dangerous"|"very_dangerous">,
      "notes": "<one sentence summarizing the approach>"
    },

    "layup_zone": <null if approach distance under 170 yards, otherwise {
      "distance_yards_from_tee": <yards from tee to layup spot>,
      "distance_to_green": 50,
      "description": "<what is at the 50-yards-short-of-green spot>",
      "trees_left": <"none"|"sparse"|"moderate"|"heavy"|"wall">,
      "trees_right": <"none"|"sparse"|"moderate"|"heavy"|"wall">,
      "bunkers_present": <true|false>,
      "water_present": <true|false>,
      "overall_danger": <"safe"|"mild"|"moderate"|"dangerous"|"very_dangerous">,
      "go_for_green_rating": <integer 1-5, where 1=definitely layup, 5=definitely go for it>,
      "layup_rating": <integer 1-5, where 1=layup is terrible idea, 5=layup is very safe>,
      "recommendation": <"go_for_green"|"layup">,
      "recommendation_reason": "<2 sentences comparing risk of going for green vs layup. Bias toward going for it.>"
    }>,

    "total_bunker_count": <integer — count of ALL white/light bunker shapes visible>,
    "fairway_bunker_count": <integer — white shapes in the fairway corridor>,
    "greenside_bunker_count": <integer — white shapes within ~30 yards of the green>,
    "water_present": <true|false>,
    "water_type": <"none"|"pond"|"lake"|"stream"|"creek"|"ocean"|"marsh">,
    "water_threat_level": <"none"|"low"|"moderate"|"high"|"severe">,
    "total_hazard_count": <integer>,
    "visual_difficulty": <"easy"|"moderate"|"challenging"|"very_challenging"|"extreme">,
    "visual_difficulty_score": <integer 1-10>,
    "primary_miss_side": <"left"|"right"|"both"|"long"|"short"|"none">,
    "strategic_notes": "<3-4 sentences written for this left-handed golfer with fade/pull tendencies, giving concrete aim and club advice>"
  },

  "confidence_notes": "<one sentence on image quality and any fields you are uncertain about>"
}`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('images') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No images provided' }, { status: 400 });
    }

    const imageContents = await Promise.all(
      files.slice(0, 2).map(async (file) => {
        const bytes = await file.arrayBuffer();
        const base64 = Buffer.from(bytes).toString('base64');
        return {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: base64,
          },
        };
      })
    );

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: [
            ...imageContents,
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });

    const raw = response.content
      .map((c) => (c.type === 'text' ? c.text : ''))
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON found in response');
    const cleaned = raw.slice(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(cleaned);
    return NextResponse.json({ result: parsed });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('scan-hole error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
