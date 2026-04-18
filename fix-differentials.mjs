import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// Read env vars from .env.local
const envFile = fs.readFileSync(process.env.HOME + '/golf-strategy/.env.local', 'utf8');
const env = Object.fromEntries(envFile.split('\n').filter(l => l.includes('=')).map(l => l.split('=')));
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_KEY = env.SUPABASE_ANON_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function handicapStrokesOnHole(courseHandicap, strokeIndex) {
  const base = Math.floor(courseHandicap / 18);
  const extra = courseHandicap % 18;
  return base + (strokeIndex <= extra ? 1 : 0);
}

function computeAdjustedGrossScore(holes, courseHandicap) {
  return holes.reduce((sum, h) => {
    const strokes = handicapStrokesOnHole(courseHandicap, h.stroke_index);
    const ndb = h.par + 2 + strokes;
    const score = Number(h.score) || 0;
    return sum + (score > 0 ? Math.min(score, ndb) : 0);
  }, 0);
}

function computeScoreDifferential(ags, rating, slope) {
  return Math.round(((ags - rating) * (113 / slope)) * 10) / 10;
}

function computeCourseHandicap(handicapIndex, slope, rating, par, holesPlayed) {
  if (holesPlayed <= 9) {
    const halfHI = Math.round(handicapIndex / 2 * 10) / 10;
    return Math.round(halfHI * (slope / 113) + (rating - par));
  }
  return Math.round(handicapIndex * (slope / 113) + (rating - par));
}

async function main() {
  // Load all rounds sorted by date
  const { data: rounds } = await supabase.from('rounds').select('*').order('date', { ascending: true });
  const { data: courses } = await supabase.from('courses').select('*');
  const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

  let updated = 0;
  const updatedRounds = [];

  for (const round of rounds) {
    const course = courseMap[round.course_id];
    if (!course?.rating || !course?.slope) continue;

    const holes = round.holes ?? [];
    const scoredHoles = holes.filter(h => h.score !== '' && h.score != null && Number(h.score) > 0);
    if (scoredHoles.length === 0) continue;

    const totalPar = scoredHoles.reduce((s, h) => s + (h.par || 0), 0);
    const holesPlayed = round.holes_played ?? scoredHoles.length;

    // Use HI=14 as placeholder since we're bootstrapping
    // We'll do a second pass once differentials are stored
    const hi = 14;
    const ch = computeCourseHandicap(hi, course.slope, course.rating, totalPar, holesPlayed);
    let ags = computeAdjustedGrossScore(scoredHoles, ch);

    // Adjust rating for 9-hole rounds
    let rating = course.rating;
    if (holesPlayed <= 9) rating = rating / 2;

    let sd = computeScoreDifferential(ags, rating, course.slope);

    updatedRounds.push({ id: round.id, date: round.date, sd });
  }

  // Now do a second pass using actual computed differentials for HI
  const diffByRound = {};
  for (const r of updatedRounds) diffByRound[r.id] = r.sd;

  // Sort rounds chronologically and compute proper HI for each
  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    const course = courseMap[round.course_id];
    if (!course?.rating || !course?.slope) continue;

    const holes = round.holes ?? [];
    const scoredHoles = holes.filter(h => h.score !== '' && h.score != null && Number(h.score) > 0);
    if (scoredHoles.length === 0) continue;

    const totalPar = scoredHoles.reduce((s, h) => s + (h.par || 0), 0);
    const holesPlayed = round.holes_played ?? scoredHoles.length;

    // Get prior rounds' differentials
    const priorDiffs = rounds.slice(0, i)
      .filter(r => diffByRound[r.id] != null)
      .map(r => diffByRound[r.id]);
    
    while (priorDiffs.length < 20) priorDiffs.unshift(14.0);
    const last20 = priorDiffs.slice(-20);
    const sorted = [...last20].sort((a, b) => a - b);
    const count = last20.length <= 6 ? 1 : last20.length <= 8 ? 2 : last20.length <= 11 ? 3
      : last20.length <= 14 ? 4 : last20.length <= 16 ? 5 : last20.length <= 18 ? 6
      : last20.length === 19 ? 7 : 8;
    const hi = Math.floor(sorted.slice(0, count).reduce((s, d) => s + d, 0) / count * 10) / 10;

    const ch = computeCourseHandicap(hi, course.slope, course.rating, totalPar, holesPlayed);
    const ags = computeAdjustedGrossScore(scoredHoles, ch);

    const sd = computeScoreDifferential(ags, course.rating, course.slope);
    diffByRound[round.id] = sd;

    const { error } = await supabase.from('rounds').update({ score_differential: sd }).eq('id', round.id);
    if (!error) {
      updated++;
      console.log(`Updated ${round.date}: sd=${sd}`);
    } else {
      console.error(`Error updating ${round.id}:`, error.message);
    }
  }

  console.log(`\nDone! Updated ${updated} rounds.`);
}

main().catch(console.error);
