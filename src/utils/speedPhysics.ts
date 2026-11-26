export type SpeedUnit = 'kmh' | 'mph';

export type DangerLevelId = 'safe' | 'caution' | 'high' | 'severe' | 'lethal';

export interface DangerZone {
  id: DangerLevelId;
  label: string;
  shortWarning: string;
  minKmh: number;
  maxKmh: number | null;
  fatalityNote: string;
  accentHex: string;
  glowRgba: string;
  surfaceTintClass: string;
  textColorClass: string;
  borderTintClass: string;
}

export const DANGER_ZONES: DangerZone[] = [
  {
    id: 'safe',
    label: 'Urban Crawl',
    shortWarning: 'Low kinetic risk · Survivable impact zone',
    minKmh: 0,
    maxKmh: 30,
    fatalityNote: 'Most impacts at ≤30 km/h are survivable with protective gear.',
    accentHex: '#10B981',
    glowRgba: 'rgba(16, 185, 129, 0.20)',
    surfaceTintClass: 'bg-emerald-500/10',
    textColorClass: 'text-emerald-400',
    borderTintClass: 'border-emerald-500/30',
  },
  {
    id: 'caution',
    label: 'City Pace',
    shortWarning: 'Moderate risk · Serious injury on impact',
    minKmh: 31,
    maxKmh: 55,
    fatalityNote: '50 km/h impact equals falling ~10m (3 stories). Fatality risk rises steeply.',
    accentHex: '#F59E0B',
    glowRgba: 'rgba(245, 158, 11, 0.24)',
    surfaceTintClass: 'bg-amber-500/10',
    textColorClass: 'text-amber-400',
    borderTintClass: 'border-amber-500/35',
  },
  {
    id: 'high',
    label: 'Open Road Risk',
    shortWarning: 'High danger · Unprotected rider fatality likely',
    minKmh: 56,
    maxKmh: 85,
    fatalityNote: 'At 80 km/h kinetic energy is 7× higher than 30 km/h; barrier impacts are often fatal.',
    accentHex: '#F97316',
    glowRgba: 'rgba(249, 115, 22, 0.30)',
    surfaceTintClass: 'bg-orange-500/12',
    textColorClass: 'text-orange-400',
    borderTintClass: 'border-orange-500/40',
  },
  {
    id: 'severe',
    label: 'Severe Danger',
    shortWarning: 'Critical kinetic energy · Speed kills',
    minKmh: 86,
    maxKmh: 115,
    fatalityNote: '100 km/h impact equals a 39m (13-story) fall. Stopping requires ~85m+.',
    accentHex: '#EF4444',
    glowRgba: 'rgba(239, 68, 68, 0.38)',
    surfaceTintClass: 'bg-red-500/15',
    textColorClass: 'text-red-400',
    borderTintClass: 'border-red-500/45',
  },
  {
    id: 'lethal',
    label: 'Lethal Velocity',
    shortWarning: 'Extreme fatality zone · Catastrophic impact force',
    minKmh: 116,
    maxKmh: null,
    fatalityNote: 'Above 116 km/h, survival probability in a fixed-object collision approaches zero.',
    accentHex: '#FF1E42',
    glowRgba: 'rgba(255, 30, 66, 0.48)',
    surfaceTintClass: 'bg-rose-600/20',
    textColorClass: 'text-rose-400',
    borderTintClass: 'border-rose-500/60',
  },
];

export function msToUnit(speedMs: number, unit: SpeedUnit): number {
  const safeMs = Math.max(0, speedMs);
  return unit === 'kmh' ? safeMs * 3.6 : safeMs * 2.236936;
}

export function unitLabel(unit: SpeedUnit): string {
  return unit === 'kmh' ? 'km/h' : 'mph';
}

export function formatSpeedRange(zone: DangerZone, unit: SpeedUnit): string {
  const factor = unit === 'kmh' ? 1 : 0.621371;
  const minVal = Math.round(zone.minKmh * factor);
  if (zone.maxKmh === null) {
    return `${minVal}+ ${unitLabel(unit)}`;
  }
  const maxVal = Math.round(zone.maxKmh * factor);
  return `${minVal}–${maxVal} ${unitLabel(unit)}`;
}

export function getDangerZone(speedMs: number): DangerZone {
  const kmh = Math.max(0, speedMs * 3.6);
  for (let i = DANGER_ZONES.length - 1; i >= 0; i--) {
    if (kmh >= DANGER_ZONES[i].minKmh) {
      return DANGER_ZONES[i];
    }
  }
  return DANGER_ZONES[0];
}

/**
 * Total stopping distance on dry asphalt for a motorcycle:
 * 1.0s rider reaction time + braking at 0.7g (6.867 m/s^2).
 */
export function calculateStoppingDistanceMeters(speedMs: number): number {
  const v = Math.max(0, speedMs);
  if (v < 0.3) return 0;
  const reactionDist = v * 1.0;
  const brakingDist = (v * v) / (2 * 6.867);
  return reactionDist + brakingDist;
}

/**
 * Equivalent free-fall height h = v^2 / (2g) representing kinetic impact energy.
 */
export function calculateEquivalentDropMeters(speedMs: number): number {
  const v = Math.max(0, speedMs);
  if (v < 0.3) return 0;
  return (v * v) / (2 * 9.80665);
}

export function formatDistanceMeters(meters: number, unit: SpeedUnit): string {
  if (unit === 'mph') {
    const feet = Math.round(meters * 3.28084);
    return `${feet} ft`;
  }
  return `${Math.round(meters)} m`;
}

export function formatTripDistance(meters: number, unit: SpeedUnit): string {
  if (unit === 'mph') {
    const miles = meters * 0.000621371;
    return `${miles.toFixed(2)} mi`;
  }
  const km = meters / 1000;
  return `${km.toFixed(2)} km`;
}

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatHeading(deg: number | null): string {
  if (deg === null || Number.isNaN(deg)) return '—';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const normalized = ((deg % 360) + 360) % 360;
  const idx = Math.round(normalized / 45) % 8;
  return `${dirs[idx]} ${Math.round(normalized)}°`;
}
