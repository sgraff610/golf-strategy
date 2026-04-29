import { supabase } from "./supabase";
import { CourseRecord } from "./types";
import type { ClubDistances, PlayerForm } from "./planTypes";
import { DEFAULT_CLUB_DISTANCES } from "./planTypes";

export async function getClubDistances(): Promise<ClubDistances> {
  const { data } = await supabase
    .from("player_data")
    .select("club_distances")
    .eq("id", "singleton")
    .single();
  return (data?.club_distances as ClubDistances | null) ?? DEFAULT_CLUB_DISTANCES;
}

export async function saveClubDistances(distances: ClubDistances): Promise<void> {
  await supabase.from("player_data").upsert({
    id: "singleton",
    club_distances: distances,
    updated_at: new Date().toISOString(),
  });
}

export async function getClubForm(): Promise<PlayerForm | null> {
  const { data } = await supabase
    .from("player_data")
    .select("club_form")
    .eq("id", "singleton")
    .single();
  return (data?.club_form as PlayerForm | null) ?? null;
}

export async function saveClubForm(form: PlayerForm): Promise<void> {
  await supabase.from("player_data").upsert({
    id: "singleton",
    club_form: form,
    updated_at: new Date().toISOString(),
  });
}

export async function loadCourses(): Promise<CourseRecord[]> {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .order("name");
  if (error) { console.error("loadCourses error:", error); return []; }
  return data.map((row: any) => ({
    id: row.id,
    name: row.name,
    tee_box: row.tee_box ?? "",
    city: row.city,
    state: row.state,
    rating: row.rating ?? null,
    slope: row.slope ?? null,
    holes: row.holes,
    ai_summary: row.ai_summary ?? null,
    hero_image_url: row.hero_image_url ?? null,
    hero_image_position: row.hero_image_position ?? null,
  }));
}

export async function saveCourse(course: CourseRecord): Promise<void> {
  const { error } = await supabase
    .from("courses")
    .upsert({
      id: course.id,
      name: course.name,
      tee_box: course.tee_box ?? "",
      city: course.city,
      state: course.state,
      rating: course.rating ?? null,
      slope: course.slope ?? null,
      hole_count: course.holes.length,
      holes: course.holes,
      ai_summary: course.ai_summary ?? null,
      hero_image_url: course.hero_image_url ?? null,
      hero_image_position: course.hero_image_position ?? null,
    });
  if (error) console.error("saveCourse error:", error);
}

export async function getCourse(id: string): Promise<CourseRecord | null> {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) {
    console.error("getCourse error:", error, "id searched:", id);
    return null;
  }
  return {
    id: data.id,
    name: data.name,
    tee_box: data.tee_box ?? "",
    city: data.city,
    state: data.state,
    rating: data.rating ?? null,
    slope: data.slope ?? null,
    holes: data.holes,
    ai_summary: data.ai_summary ?? null,
    hero_image_url: data.hero_image_url ?? null,
    hero_image_position: data.hero_image_position ?? null,
  };
}