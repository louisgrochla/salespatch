// ---------------------------------------------------------------------------
// Sales User
// ---------------------------------------------------------------------------

export interface SalesUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  area_postcode: string | null;
  commission_rate: number;
  active: boolean;
  device_type: 'web' | 'ios' | 'android' | null;
  last_active_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Lead Assignment
// ---------------------------------------------------------------------------

export type AssignmentStatus = 'new' | 'visited' | 'pitched' | 'sold' | 'rejected';

export interface LeadAssignment {
  assignment_id: string;
  status: AssignmentStatus;
  assigned_at: string;
  visited_at: string | null;
  pitched_at: string | null;
  sold_at: string | null;
  rejected_at: string | null;
  notes: string | null;
  commission_amount: number | null;
}

// ---------------------------------------------------------------------------
// Lead Card (dashboard list)
// ---------------------------------------------------------------------------

export interface LeadCard {
  // Assignment
  assignment_id: string;
  assignment_status: AssignmentStatus;
  assigned_at: string;

  // Business
  lead_id: string;
  business_name: string;
  business_type: string | null;
  address: string | null;
  postcode: string | null;
  phone: string | null;

  // Profile
  google_rating: number | null;
  google_review_count: number | null;
  has_website: boolean;
  website_quality_score: number | null;

  // Site
  has_demo_site: boolean;
  demo_site_domain: string | null;

  // Follow-up & contact (from lead_assignments columns)
  follow_up_at: string | null;
  follow_up_note: string | null;
  contact_name: string | null;
  contact_role: string | null;

  // Timestamps
  visited_at: string | null;
  pitched_at: string | null;
}

// ---------------------------------------------------------------------------
// Lead Detail (full page)
// ---------------------------------------------------------------------------

export interface LeadDetail extends LeadCard {
  // Contact
  email: string | null;
  website_url: string | null;

  // Profile enrichment
  description: string | null;
  services: string[];
  pain_points: string[];
  opening_hours: string[];
  best_reviews: ReviewItem[];

  // Brand
  brand_colours: Record<string, string> | null;
  logo_filename: string | null;
  gallery_filenames: string[];

  // Generated site
  demo_site_html: string | null;
  demo_site_qa_score: number | null;

  // Brief data (for talking points)
  trust_badges: string[];
  avoid_topics: string[];
  hero_headline: string | null;
  cta_text: string | null;

  // Sales-brief extensions (added for the door-to-door closer workflow).
  // Written by Claude Desktop into the lead JSON; rendered prominently on
  // both the web lead-detail page and the iOS lead view.
  hook: string | null;                          // single sharpest reason, ≤18 words
  opener: string | null;                        // exact first line at the door, ≤30 words
  demo_moments: string[];                       // 3 things to tap/point at during the demo
  specific_objections: ObjectionPair[];         // tailored objections + responses
  close_script: string | null;                  // the ask with price + next step
  next_visit_reason: string | null;             // why come back if today is a no
  pain_points_extended: string | null;          // optional longer-form pain context

  // Assignment
  notes: string | null;
  commission_amount: number | null;
  visited_at: string | null;
  pitched_at: string | null;
  sold_at: string | null;

  // Follow-up
  follow_up_at: string | null;
  follow_up_note: string | null;

  // Contact person
  contact_name: string | null;
  contact_role: string | null;
}

export interface ObjectionPair {
  objection: string;
  response: string;
}

export interface ReviewItem {
  author: string;
  rating: number;
  text: string;
}

// ---------------------------------------------------------------------------
// Talking Points (intelligence engine output)
// ---------------------------------------------------------------------------

export type TalkingPointType = 'strength' | 'opportunity' | 'warning' | 'info';

export interface TalkingPoint {
  icon: string;
  text: string;
  type: TalkingPointType;
  priority: number; // 1-5, higher = show first
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface SalesStats {
  total_assigned: number;
  new_count: number;
  visited_count: number;
  pitched_count: number;
  sold_count: number;
  rejected_count: number;
  visits_today: number;
  pitches_today: number;
  sales_today: number;
  total_commission: number;
}

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: string;
  code: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthPayload {
  user_id: string;
  name: string;
  exp: number; // unix timestamp
}

export interface LoginResponse {
  user: SalesUser;
  token: string;
}
