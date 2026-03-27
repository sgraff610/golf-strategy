import { supabase } from "./supabase";
import { CourseRecord } from "./types";

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
    holes: data.holes,
  };
}