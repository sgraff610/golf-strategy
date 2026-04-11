// app/api/refresh-summary/route.ts
// Takes current verified hole field values and rewrites only the text/narrative fields.
// Does NOT re-analyze any images — uses field values as ground truth.

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { result } = await req.json();
    if (!result) return NextResponse.json({ error: 'No result provided' }, { status: 400 });

    const va = result.visual_analysis;
    const tz = va.tee_zone;
    const lz = va.landing_zone;
    const plz = va.pre_landing_zone;
    const az = va.approach_zone;
    const layz = va.layup_zone;

    const prompt = `You are a golf course analyst writing strategic summaries for a LEFT-HANDED golfer who has a fade (curves left) and a pull (starts right).

Based on the following hole data that the user has verified and corrected, rewrite ONLY the text/narrative fields listed below. Do not reassess any images. Use the field values as ground truth.

HOLE DATA:
- Par: ${result.par}, Yards: ${result.yards}, Dogleg: ${result.dogleg_direction ?? 'straight'}
- Fairway width: ${va.fairway_width} (~${va.fairway_width_yards} yds)
- Visual difficulty: ${va.visual_difficulty_score}/10

TEE ZONE:
- Left buffer: ${tz.left_buffer_yards} yds (${tz.left_buffer_rating}), hazard: ${tz.left_hazard_type} severity ${tz.left_hazard_severity}
- Right buffer: ${tz.right_buffer_yards} yds (${tz.right_buffer_rating}), hazard: ${tz.right_hazard_type} severity ${tz.right_hazard_severity}
- Tree density left: ${tz.tree_density_left}, right: ${tz.tree_density_right}
- Recommended aim: ${tz.recommended_aim}

LANDING ZONE:
- Distance: ${lz.estimated_distance_yards} yds, Width: ${lz.width_yards} yds, Depth: ${lz.depth_yards} yds
- Trees left: ${lz.trees_left}, right: ${lz.trees_right}
- Bunkers present: ${lz.bunkers_present}${lz.bunkers_present ? ', positions: ' + lz.bunker_positions : ''}
- Water present: ${lz.water_present}${lz.water_present ? ', description: ' + lz.water_description : ''}
- Remaining to green: ${lz.remaining_distance_to_green} yds, Overall danger: ${lz.overall_danger}

PRE-LANDING ZONE (${plz.distance_yards} yds from tee):
- Width: ${plz.width_yards ?? 'unknown'} yds
- Trees left: ${plz.trees_left}, right: ${plz.trees_right}
- Bunkers present: ${plz.bunkers_present}${plz.bunkers_present ? ', detail: ' + plz.bunker_description : ''}
- Water present: ${plz.water_present}${plz.water_present ? ', detail: ' + plz.water_description : ''}
- Other obstacles: ${plz.other_obstacles ?? 'none'}
- Room to recover: ${plz.room_to_recover ?? 'unknown'}
- Safer than landing zone: ${plz.safer_than_landing_zone}
- Overall danger: ${plz.overall_danger}

APPROACH ZONE:
- Distance to green: ${az.distance_to_green_center} yds
- Trees left: ${az.trees_left}, right: ${az.trees_right}, long: ${az.trees_long}
- Green: ${az.green_size}, ${az.green_shape}, ${az.green_width_yards} yds wide, ${az.green_depth_yards} yds deep
- Overall danger: ${az.overall_danger}
- Total bunkers: ${va.total_bunker_count} (${va.fairway_bunker_count} fairway, ${va.greenside_bunker_count} greenside)
- Bunker positions around green: short_left=${result.approach_bunker_short_left}, short_middle=${result.approach_bunker_short_middle}, short_right=${result.approach_bunker_short_right}, middle_left=${result.approach_bunker_middle_left}, middle_right=${result.approach_bunker_middle_right}, long_left=${result.approach_bunker_long_left}, long_middle=${result.approach_bunker_long_middle}, long_right=${result.approach_bunker_long_right}
- Water: ${va.water_present}${va.water_present ? ', type: ' + va.water_type + ', threat: ' + va.water_threat_level : ''}

${va.pre_green_zone ? `PRE-GREEN ZONE (${va.pre_green_zone.distance_from_green_yards} yds short of green):
- Trees left: ${va.pre_green_zone.trees_left}, right: ${va.pre_green_zone.trees_right}, long: ${va.pre_green_zone.trees_long}
- Bunkers: ${va.pre_green_zone.bunkers_present}, Water: ${va.pre_green_zone.water_present}
- Go for green rating: ${va.pre_green_zone.go_for_green_rating}/5, Layup rating: ${va.pre_green_zone.layup_rating}/5
- Recommendation: ${va.pre_green_zone.recommendation}` : ''}

${layz ? `LAYUP ZONE (50 yds short of green):
- Bunkers: ${layz.bunkers_present}, Water: ${layz.water_present}
- Go for green rating: ${layz.go_for_green_rating}/5, Layup rating: ${layz.layup_rating}/5
- Recommendation: ${layz.recommendation}` : 'LAYUP ZONE: Not applicable'}

Return ONLY a valid JSON object — no markdown, no backticks, no explanation:
{
  "strategic_notes": "<3-4 sentences for this lefty with fade/pull tendencies, concrete aim and club advice based on the data>",
  "tee_opening_description": "<describe the tee corridor based on buffer yards and hazard types above>",
  "tee_left_notes": "<one sentence: what happens if the fade goes left given left buffer and hazard data>",
  "tee_right_notes": "<one sentence: what happens if the pull goes right given right buffer and hazard data>",
  "tee_aim_reason": "<one sentence explaining the recommended aim for this lefty given fade and pull tendencies>",
  "landing_notes": "<one sentence summarizing the landing zone situation>",
  "pre_landing_description": "<describe the pre-landing zone based on the data above>",
  "pre_landing_bunker_description": ${plz.bunkers_present ? '"<describe bunkers in pre-landing zone>"' : 'null'},
  "pre_landing_water_description": ${plz.water_present ? '"<describe water in pre-landing zone>"' : 'null'},
  "pre_landing_other_obstacles": "<describe other obstacles or null>",
  "pre_landing_room_notes": "<one sentence: what shot do you have from the pre-landing zone if you land short?>",
  "pre_landing_recommendation": "<one sentence: is being short here better or worse than the landing zone and why?>",
  "approach_bunkers_description": "<describe greenside bunker positions based on the boolean fields — be specific about positions. Say none if no greenside bunkers>",
  "approach_water_description": ${va.water_present ? '"<describe water near the green>"' : 'null'},
  "approach_green_notes": "<one sentence describing the green challenge based on size, shape, and surrounding hazards>",
  "approach_notes": "<one sentence summarizing the overall approach>",
  "pre_green_zone_description": "<describe what is at the pre-green layup spot based on the data>",
  "pre_green_zone_reason": "<2 sentences: compare going for green vs laying up short. Follow the distance thresholds: 125-145 yds always go for green, 146-174 only layup if very dangerous, 175+ full evaluation. Bias toward going for green.>"${layz ? `,
  "layup_description": "<describe what is at the 50-yard layup spot based on the data>",
  "layup_recommendation_reason": "<2 sentences comparing going for it vs laying up — bias toward going for the green unless approach is clearly very dangerous>"` : ''}
}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content
      .map(c => c.type === 'text' ? c.text : '')
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    const parsed = JSON.parse(raw);
    return NextResponse.json({ refreshed: parsed });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('refresh-summary error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
