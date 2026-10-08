export type WeekParity = 'odd' | 'even';

export interface ClassItem {
  id?: string;
  user_id?: string;
  day: number; // 1 = Пн, 7 = Вс
  start: string; // "HH:MM"
  end?: string; // "HH:MM"
  title: string;
  kind?: string;
  place: string;
  parity?: WeekParity;
  online?: boolean;
  durationUnknown?: boolean;
  duration_unknown?: boolean;
  destination?: 'university' | 'sports';
  position?: number;
  // Dynamic fields after applying exception:
  isCancelled?: boolean;
  isMoved?: boolean;
  exceptionId?: string;
  exceptionNote?: string | null;
}

export type DestinationType = 'university' | 'sports';
export type CommuteLegMode = 'fixed_route' | 'any_trolleybus';
export type EstimateSource = 'live' | 'schedule' | 'rough';

export interface VehiclePosition {
  id: string;
  label: string;
  route_id: number;
  trip_id?: string;
  latitude: number;
  longitude: number;
  speed?: number;
  timestamp: string;
  vehicle_type?: number; // 11 = Trolleybus, 3 = Bus
}

export interface TransitStop {
  stop_id: number;
  stop_name: string;
  stop_desc?: string;
  stop_lat: number;
  stop_lon: number;
}

export interface TripStopTime {
  trip_id: string;
  stop_id: number;
  stop_sequence: number;
  arrival_time: string; // "HH:MM:SS" or "HH:MM"
  departure_time?: string;
}

export interface CommuteLeg {
  mode: CommuteLegMode;
  route_id?: number | null;
  route_short_name?: string | null;
  board_stop_id?: number | null;
  board_stop_name: string;
  alight_stop_id?: number | null;
  alight_stop_name: string;
}

export interface CommuteOption {
  id: string;
  user_id?: string;
  destination: DestinationType;
  name: string;
  position: number;
  enabled: boolean;
  is_configured: boolean;
  walk_before_minutes: number;
  walk_after_minutes: number;
  legs: CommuteLeg[];
}

export interface CommuteLegResult {
  legIndex: number;
  mode: CommuteLegMode;
  chosenRouteName: string;
  boardStopName: string;
  alightStopName: string;
  waitingMinutes: number;
  travelMinutes: number;
  firstVehicleEtaMinutes?: number;
  vehicleLabel?: string;
  closestVehicleDistanceMeters?: number;
  vehiclesOnLineCount: number;
  nearbyVehiclesCount: number;
  source: EstimateSource;
}

export interface CommuteOptionResult {
  id: string;
  name: string;
  destination: DestinationType;
  isConfigured: boolean;
  totalDurationMinutes: number;
  walkBeforeMinutes: number;
  walkAfterMinutes: number;
  totalWaitMinutes: number;
  totalRideMinutes: number;
  leaveInMinutes: number;
  arrivalEstimated: string; // "HH:MM"
  source: EstimateSource;
  sourceLabel: string; // "по GPS" | "по расписанию" | "примерно"
  summaryNote?: string;
  legs: CommuteLegResult[];
  isRecommended?: boolean;
  vehiclesOnLineCount?: number;
  nearbyVehiclesCount?: number;
  closestVehicleDistanceMeters?: number;
  closestVehicleEtaMinutes?: number;
  closestVehicleLabel?: string;
}

export interface TrackedTrolleySummary {
  route_short_name: string;
  destination: DestinationType;
  label: string;
  vehiclesOnLineCount: number;
  nearbyVehiclesCount: number;
  closestDistanceMeters?: number;
  closestEtaMinutes?: number;
  closestVehicleLabel?: string;
  boardStopName?: string;
}

export interface LiveTrackedVehicle {
  id: string;
  label: string;
  route_id: number;
  route_short_name: string;
  latitude: number;
  longitude: number;
  speed: number;
  timestamp: string;
}

export interface ScheduleException {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  class_id: string;
  type: 'cancel' | 'move';
  new_start?: string | null;
  new_end?: string | null;
  new_place?: string | null;
  note?: string | null;
  created_at?: string;
}

export interface RoutineSettings {
  sleep_hours: number;
  sleep_latency: number;
  wash_minutes: number;
  hair_dry_minutes?: number;
  breakfast_minutes: number;
  get_ready_minutes: number;
  travel_buffer: number;
  travel_minutes: number;
  english_duration?: number | null;
  target_bedtime?: string | null;
}

export interface RoutineResult {
  first: ClassItem;
  firstCampus: boolean;
  wake: string;
  bed: string;
  wash: string;
  washEnd?: string;
  hairDry?: string;
  hairDryEnd?: string;
  breakfast: string;
  breakfastEnd?: string;
  getready: string;
  getreadyEnd?: string;
  readyAt: string;
  leave: string | null;
  arrive: string | null;
  freeMinutes: number;
  freeTimeFormatted: string;
  commuteUncertain: boolean;
  warning?: string;
  onlineFirst: boolean;
  wakeMin: number;
  bedMin: number;
  leaveMin: number | null;
}

export type TrafficLevel = 'free' | 'dense' | 'jam' | 'no_data';

export interface TrafficInfo {
  level: TrafficLevel;
  label: string;
  ratio?: number;
  durationSeconds?: number;
  staticDurationSeconds?: number | null;
}

export interface TripPlanRequest {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
}

export interface TripTransitStep {
  travelMode: 'TRANSIT';
  lineShortName: string;
  vehicleType: string;
  departureStopName: string;
  arrivalStopName: string;
  departureTime?: string;
  arrivalTime?: string;
  tranzyRouteId?: number;
  nextVehicleEtaMinutes?: number;
  nextVehicleDistanceMeters?: number;
  nextVehicleSource?: 'polyline' | 'approximate';
}

export interface TripWalkStep {
  travelMode: 'WALK';
  durationSeconds: number;
  distanceMeters?: number;
}

export type TripStep = TripTransitStep | TripWalkStep;

export interface TripRouteOption {
  id: string;
  totalDurationSeconds: number;
  totalDurationFormatted: string;
  arrivalTimeFormatted: string;
  encodedPolyline?: string;
  steps: TripStep[];
  traffic: TrafficInfo;
}

export interface TripPlanResult {
  from: { lat: number; lon: number; nearestStop?: TransitStop | null };
  to: { lat: number; lon: number; nearestStop?: TransitStop | null };
  routes: TripRouteOption[];
  source: 'google_and_tranzy' | 'tranzy_only' | 'error';
  notice?: string;
}

