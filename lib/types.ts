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
  preferred_club?: string;
  preferred_landing?: "L" | "LF" | "CF" | "RF" | null;
  hole_notes?: string | null;
visual_analysis?: {
    fairway_width: string;
    fairway_width_yards: number;
    tree_coverage_left: string;
    tree_coverage_right: string;
    tree_coverage_notes: string;
    total_bunker_count: number;
    fairway_bunker_count: number;
    greenside_bunker_count: number;
    bunker_notes: string;
    water_present: boolean;
    water_type: string;
    water_position: string;
    water_threat_level: string;
    water_notes: string | null;
    green_size: string;
    green_shape: string;
    green_width_yards: number;
    green_notes: string;
    landing_zones: Array<{
      zone_number: number;
      distance_from_tee_yards: number;
      width_yards: number;
      description: string;
    }>;
    total_hazard_count: number;
    visual_difficulty: string;
    visual_difficulty_score: number;
    primary_miss_side: string;
    strategic_notes: string;
  };
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
  hero_image_url?: string | null;
  hero_image_position?: string | null;
};
