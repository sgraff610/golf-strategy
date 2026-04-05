export type DoglegDirection =
  | "severe_left" | "moderate_left" | "slight_left" | "straight"
  | "slight_right" | "moderate_right" | "severe_right" | null;

export type HoleData = {
  hole: number;
  par: 3 | 4 | 5;
  yards: number;
  stroke_index: number;
  dogleg_direction: DoglegDirection;
  // Tee hazards
  tee_tree_hazard_left: boolean;
  tee_tree_hazard_right: boolean;
  tee_tree_hazard_across: boolean;
  tee_bunkers_left: boolean;
  tee_bunkers_right: boolean;
  tee_water_out_left: boolean;
  tee_water_out_right: boolean;
  tee_water_out_across: boolean;
  // Approach hazards
  approach_tree_hazard_left: boolean;
  approach_tree_hazard_right: boolean;
  approach_tree_hazard_long: boolean;
  approach_tree_hazard_across: boolean;
  approach_bunkers_left: boolean;
  approach_bunkers_right: boolean;
  approach_water_out_left: boolean;
  approach_water_out_right: boolean;
  approach_water_out_short: boolean;
  approach_water_out_long: boolean;
  // Approach bunker positions
  approach_bunker_short_middle: boolean;
  approach_bunker_short_left: boolean;
  approach_bunker_middle_left: boolean;
  approach_bunker_long_left: boolean;
  approach_bunker_long_middle: boolean;
  approach_bunker_long_right: boolean;
  approach_bunker_middle_right: boolean;
  approach_bunker_short_right: boolean;
  // Approach green positions
  approach_green_short_middle: boolean;
  approach_green_short_left: boolean;
  approach_green_middle_left: boolean;
  approach_green_long_left: boolean;
  approach_green_long_middle: boolean;
  approach_green_long_right: boolean;
  approach_green_middle_right: boolean;
  approach_green_short_right: boolean;
  approach_green_depth: number;
};

export type CourseRecord = {
  id: string;
  name: string;
  tee_box: string;
  city: string;
  state: string;
  rating: number | null;
  slope: number | null;
  holes: HoleData[];
  ai_summary?: string | null;
};
