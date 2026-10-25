export type Particle = {
  id: number;
  lat: number;
  lon: number;
  altitudeM: number;
  diameterUm: number;
  massKg: number;
  ageHours: number;
  alive: boolean;
};

export type Settings = {
  windSpeedMs: number;
  windDirectionDeg: number;
  turbulence: number;
  emissionRateKgS: number;
  particleCount: number;
  particleDiameterUm: number;
};

export type City = { name: string; lat: number; lon: number };

export const VOLCANO = { lat: 63.633, lon: -19.62 };
export const CITIES: City[] = [
  { name: 'London', lat: 51.5072, lon: -0.1276 },
  { name: 'Paris', lat: 48.8566, lon: 2.3522 },
  { name: 'Frankfurt', lat: 50.1109, lon: 8.6821 },
  { name: 'Oslo', lat: 59.9139, lon: 10.7522 },
  { name: 'Stockholm', lat: 59.3293, lon: 18.0686 },
];

export const DEFAULT_SETTINGS: Settings = {
  windSpeedMs: 18,
  windDirectionDeg: 105,
  turbulence: 0.35,
  emissionRateKgS: 120000,
  particleCount: 1200,
  particleDiameterUm: 45,
};

const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;

function normalizeLon(lon: number): number {
  return ((lon + 540) % 360) - 180;
}

function destination(lat: number, lon: number, eastM: number, northM: number) {
  const dLat = northM / EARTH_RADIUS_M / DEG;
  const cosLat = Math.max(0.05, Math.cos(lat * DEG));
  const dLon = eastM / (EARTH_RADIUS_M * cosLat) / DEG;
  return { lat: Math.max(-89.95, Math.min(89.95, lat + dLat)), lon: normalizeLon(lon + dLon) };
}

// Approximate still-air settling speed. This is a visual model, not a validated
// volcanic-ash microphysics solver.
function settlingSpeedMs(diameterUm: number): number {
  const diameterM = diameterUm * 1e-6;
  const rhoParticle = 2300;
  const rhoAir = 1.0;
  const viscosity = 1.8e-5;
  return Math.max(0.015, Math.min(2.5, ((rhoParticle - rhoAir) * 9.81 * diameterM * diameterM) / (18 * viscosity)));
}

export function seedParticles(settings: Settings): Particle[] {
  const count = Math.round(settings.particleCount);
  const massPerParticle = (settings.emissionRateKgS * 1800) / count;
  return Array.from({ length: count }, (_, i) => {
    // Deterministic spread around the vent; seed avoids nondeterministic reset.
    const angle = i * 2.399963229728653;
    const radius = Math.sqrt(i / Math.max(1, count)) * 0.045;
    return {
      id: i,
      lat: VOLCANO.lat + Math.sin(angle) * radius,
      lon: VOLCANO.lon + Math.cos(angle) * radius,
      altitudeM: 3500 + ((i * 37) % 2800),
      diameterUm: settings.particleDiameterUm * (0.55 + ((i * 17) % 100) / 110),
      massKg: massPerParticle,
      ageHours: 0,
      alive: true,
    };
  });
}

export function advanceParticles(particles: Particle[], settings: Settings, dtSeconds: number, elapsedSeconds: number): Particle[] {
  const dt = Math.min(dtSeconds, 1800);
  // Wind direction is meteorological: direction FROM which wind blows.
  const flowTo = (settings.windDirectionDeg + 180) * DEG;
  const baseEast = Math.sin(flowTo) * settings.windSpeedMs;
  const baseNorth = Math.cos(flowTo) * settings.windSpeedMs;
  return particles.map((p) => {
    if (!p.alive) return p;
    // A broad, smooth directional variation approximates a spatially varying wind.
    const phase = elapsedSeconds / 7200 + p.id * 0.037;
    const east = baseEast + Math.sin(phase) * settings.turbulence * 5;
    const north = baseNorth + Math.cos(phase * 0.73) * settings.turbulence * 4;
    const moved = destination(p.lat, p.lon, east * dt, north * dt);
    const settling = settlingSpeedMs(p.diameterUm);
    const uplift = 0.12 * Math.sin(phase * 0.4); // explicit toy vertical-motion term
    const altitudeM = p.altitudeM + (uplift - settling) * dt;
    const alive = altitudeM > 0 && p.ageHours < 120;
    return { ...p, ...moved, altitudeM: Math.max(0, altitudeM), ageHours: p.ageHours + dt / 3600, alive };
  });
}

export function greatCircleKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(x))) / 1000;
}

export function getStats(particles: Particle[], elapsedSeconds: number) {
  const active = particles.filter((p) => p.alive);
  const totalMass = particles.reduce((sum, p) => sum + (p.alive ? p.massKg : 0), 0);
  const weightedAltitude = active.length
    ? active.reduce((sum, p) => sum + p.altitudeM * p.massKg, 0) / Math.max(1e-12, active.reduce((sum, p) => sum + p.massKg, 0))
    : 0;
  const maxDistanceKm = particles.reduce((max, p) => Math.max(max, greatCircleKm(VOLCANO, p)), 0);
  return {
    elapsedSeconds,
    elapsedLabel: `${Math.floor(elapsedSeconds / 3600)}h ${Math.floor((elapsedSeconds % 3600) / 60)}m`,
    activeCount: active.length,
    airborneMassKg: totalMass,
    meanAltitudeM: weightedAltitude,
    maxAltitudeM: particles.reduce((max, p) => Math.max(max, p.altitudeM), 0),
    maxDistanceKm,
    depositionFraction: particles.length ? 1 - active.length / particles.length : 0,
  };
}

export function cityIndicators(particles: Particle[]) {
  return CITIES.map((city) => {
    // Screen-oriented concentration proxy. Not a measured or regulatory concentration.
    const proxy = particles.reduce((sum, p) => {
      if (!p.alive) return sum;
      const d = greatCircleKm(city, p);
      if (d > 450) return sum;
      return sum + Math.exp(-d / 85) * (p.massKg / 1000) * Math.exp(-p.altitudeM / 9000);
    }, 0);
    const level = proxy >= 10 ? '매우 높음' : proxy >= 5 ? '높음' : proxy >= 2 ? '보통' : proxy >= 0.2 ? '낮음' : '매우 낮음';
    return { ...city, proxy, level };
  });
}

export function particlesToGeoJSON(particles: Particle[]) {
  return {
    type: 'FeatureCollection',
    features: particles.filter((p) => p.alive).map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { id: p.id, altitudeM: Math.round(p.altitudeM), diameterUm: Math.round(p.diameterUm) },
    })),
  } as GeoJSON.FeatureCollection<GeoJSON.Point>;
}

export function exportCSV(particles: Particle[], elapsedSeconds: number): string {
  const header = 'id,latitude,longitude,altitude_m,diameter_um,mass_kg,age_hours,alive';
  const rows = particles.map((p) => [p.id, p.lat.toFixed(5), p.lon.toFixed(5), p.altitudeM.toFixed(1), p.diameterUm.toFixed(1), p.massKg.toFixed(3), p.ageHours.toFixed(3), p.alive].join(','));
  return `# ASHFLOW illustrative model output; not operational forecast\n# elapsed_seconds=${elapsedSeconds}\n${header}\n${rows.join('\n')}`;
}
