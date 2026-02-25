export type Platform =
  | 'google_maps'
  | 'google_search'
  | 'google_ads'
  | 'linkedin'
  | 'facebook'
  | 'meta_ads'
  | 'instagram'
  | 'youtube'
  | 'twitter'
  | 'yellowpages'
  | 'justdial'
  | 'tiktok'
  | string;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface UniversalLocationRequest {
  /**
   * Raw token from user input, ex: "Austin, TX".
   */
  locationToken?: string;
  city?: string;
  state?: string;
  country?: string;
  /**
   * Optional radius filter in kilometers.
   */
  radiusKm?: number;
  /**
   * Optional center coordinate for radius filtering.
   */
  center?: LatLng;
}

export interface AdapterQuery {
  platform: Platform;
  query?: string;
  url?: string;
  params?: Record<string, string | number | boolean | undefined>;
  payload?: Record<string, unknown>;
}

export interface LeadLocationMetadata {
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  coordinates?: LatLng;
}

export interface Lead {
  id?: string;
  source?: string;
  name?: string;
  title?: string;
  location?: string;
  address?: string;
  metadata?: {
    location?: LeadLocationMetadata;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface GeocodeResult {
  city?: string;
  state?: string;
  country?: string;
  coordinates?: LatLng;
  formattedAddress?: string;
}

export type GeocodeFn = (input: { address?: string; token?: string }) => Promise<GeocodeResult | null>;

export interface LocationFilterLog {
  leadId: string;
  passed: boolean;
  decision: 'pass' | 'down_rank' | 'reject';
  scoreDelta: number;
  reasons: string[];
  derivedLocation: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    coordinates?: LatLng;
    distanceKm?: number;
  };
}

export interface LocationFilterResult {
  accepted: Lead[];
  downRanked: Lead[];
  rejected: Lead[];
  logs: LocationFilterLog[];
}

interface NormalizedLocation {
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  coordinates?: LatLng;
}

const PLATFORM_LOCATION_INJECTORS: Record<
  string,
  (query: AdapterQuery, token: string) => AdapterQuery
> = {
  google_maps: (q, token) => ({
    ...q,
    query: appendToFreeText(q.query, `in ${token}`),
    params: { ...q.params, location: token }
  }),
  google_search: (q, token) => ({
    ...q,
    query: appendToFreeText(q.query, `near ${token}`),
    params: { ...q.params, location: token }
  }),
  google_ads: (q, token) => ({
    ...q,
    query: appendToFreeText(q.query, `near ${token}`),
    params: { ...q.params, location: token }
  }),
  linkedin: (q, token) => ({
    ...q,
    query: q.query,
    params: { ...q.params, geoUrn: q.params?.geoUrn, location: token }
  }),
  facebook: (q, token) => ({
    ...q,
    params: { ...q.params, location: token },
    query: appendToFreeText(q.query, token)
  }),
  meta_ads: (q, token) => ({
    ...q,
    params: { ...q.params, ad_reached_countries: token }
  }),
  instagram: (q, token) => ({
    ...q,
    query: appendToFreeText(q.query, token),
    params: { ...q.params, location: token }
  }),
  youtube: (q, token) => ({
    ...q,
    query: appendToFreeText(q.query, token),
    params: { ...q.params, location: token }
  }),
  twitter: (q, token) => ({
    ...q,
    query: appendToFreeText(q.query, `near:${token}`)
  }),
  yellowpages: (q, token) => ({
    ...q,
    params: { ...q.params, geo_location_terms: token }
  }),
  justdial: (q, token) => ({
    ...q,
    params: { ...q.params, city: token }
  }),
  tiktok: (q, token) => ({
    ...q,
    query: appendToFreeText(q.query, token)
  })
};

/**
 * Query-time location injection per adapter/platform syntax.
 */
export function injectLocationTokenIntoQuery(
  query: AdapterQuery,
  request: UniversalLocationRequest
): AdapterQuery {
  const token = buildLocationToken(request);
  if (!token) return query;

  const injector = PLATFORM_LOCATION_INJECTORS[query.platform] ?? defaultInjector;
  return injector(query, token);
}

/**
 * Result-time location filtering with optional geocoding and radius checks.
 */
export async function filterLeadsByLocation(
  leads: Lead[],
  request: UniversalLocationRequest,
  geocode: GeocodeFn,
  logger: (entry: LocationFilterLog) => void = () => undefined
): Promise<LocationFilterResult> {
  const accepted: Lead[] = [];
  const downRanked: Lead[] = [];
  const rejected: Lead[] = [];
  const logs: LocationFilterLog[] = [];

  for (let i = 0; i < leads.length; i += 1) {
    const lead = leads[i];
    const leadId = String(lead.id ?? lead.name ?? lead.title ?? `lead_${i}`);
    const reasons: string[] = [];

    const normalized = await resolveLeadLocation(lead, geocode, reasons);
    const scoreDeltaAndDecision = evaluateAgainstConstraints(normalized, request, reasons);

    const entry: LocationFilterLog = {
      leadId,
      passed: scoreDeltaAndDecision.decision !== 'reject',
      decision: scoreDeltaAndDecision.decision,
      scoreDelta: scoreDeltaAndDecision.scoreDelta,
      reasons,
      derivedLocation: {
        ...normalized,
        distanceKm: scoreDeltaAndDecision.distanceKm
      }
    };

    logs.push(entry);
    logger(entry);

    if (entry.decision === 'reject') {
      rejected.push(attachLocationFilterMeta(lead, entry));
    } else if (entry.decision === 'down_rank') {
      downRanked.push(attachLocationFilterMeta(lead, entry));
    } else {
      accepted.push(attachLocationFilterMeta(lead, entry));
    }
  }

  return { accepted, downRanked, rejected, logs };
}

async function resolveLeadLocation(
  lead: Lead,
  geocode: GeocodeFn,
  reasons: string[]
): Promise<NormalizedLocation> {
  const metadata = extractLocationMetadata(lead);
  if (hasAnyLocationSignal(metadata)) {
    reasons.push('parsed location metadata from lead payload');
  }

  if (metadata.coordinates && metadata.city && metadata.state && metadata.country) {
    reasons.push('used structured location metadata (no geocode needed)');
    return metadata;
  }

  const geocodeInput = {
    address: metadata.address,
    token: [metadata.city, metadata.state, metadata.country].filter(Boolean).join(', ')
  };

  if (!geocodeInput.address && !geocodeInput.token) {
    reasons.push('missing location signal and geocode input');
    return metadata;
  }

  const geocoded = await geocode(geocodeInput);
  if (!geocoded) {
    reasons.push('geocode returned no result');
    return metadata;
  }

  reasons.push('enriched lead location via geocoding');
  return {
    address: geocoded.formattedAddress ?? metadata.address,
    city: geocoded.city ?? metadata.city,
    state: geocoded.state ?? metadata.state,
    country: geocoded.country ?? metadata.country,
    coordinates: geocoded.coordinates ?? metadata.coordinates
  };
}

function evaluateAgainstConstraints(
  location: NormalizedLocation,
  request: UniversalLocationRequest,
  reasons: string[]
): { decision: 'pass' | 'down_rank' | 'reject'; scoreDelta: number; distanceKm?: number } {
  let scoreDelta = 0;

  const cityMatches = matchesLoose(location.city, request.city);
  const stateMatches = matchesLoose(location.state, request.state);
  const countryMatches = matchesLoose(location.country, request.country);

  if (request.country) {
    if (countryMatches) {
      reasons.push('country matched');
      scoreDelta += 2;
    } else {
      reasons.push('country mismatch');
      return { decision: 'reject', scoreDelta: -10 };
    }
  }

  if (request.state) {
    if (stateMatches) {
      reasons.push('state matched');
      scoreDelta += 2;
    } else {
      reasons.push('state mismatch');
      scoreDelta -= 2;
    }
  }

  if (request.city) {
    if (cityMatches) {
      reasons.push('city matched');
      scoreDelta += 3;
    } else {
      reasons.push('city mismatch');
      scoreDelta -= 3;
    }
  }

  let distanceKm: number | undefined;
  if (typeof request.radiusKm === 'number') {
    if (!request.center) {
      reasons.push('radius requested but center is missing');
      return { decision: 'reject', scoreDelta: -10 };
    }
    if (!location.coordinates) {
      reasons.push('radius requested but lead has no coordinates');
      return { decision: 'down_rank', scoreDelta: scoreDelta - 4 };
    }

    distanceKm = haversineKm(request.center, location.coordinates);
    if (distanceKm <= request.radiusKm) {
      reasons.push(`within radius (${distanceKm.toFixed(2)}km <= ${request.radiusKm}km)`);
      scoreDelta += 4;
    } else {
      reasons.push(`outside radius (${distanceKm.toFixed(2)}km > ${request.radiusKm}km)`);
      return { decision: 'reject', scoreDelta: -10, distanceKm };
    }
  }

  if (scoreDelta >= 0) {
    reasons.push('lead passed location filter');
    return { decision: 'pass', scoreDelta, distanceKm };
  }

  reasons.push('lead retained with down-rank due to partial mismatch');
  return { decision: 'down_rank', scoreDelta, distanceKm };
}

function extractLocationMetadata(lead: Lead): NormalizedLocation {
  const nested = lead.metadata?.location;
  const rawAddress =
    firstString(nested?.address, lead.address, lead.location, asString((lead as Record<string, unknown>).formattedAddress)) ??
    undefined;

  const rawCity = firstString(nested?.city, asString((lead as Record<string, unknown>).city));
  const rawState = firstString(nested?.state, asString((lead as Record<string, unknown>).state));
  const rawCountry = firstString(nested?.country, asString((lead as Record<string, unknown>).country));

  const coordinates = nested?.coordinates ?? parseCoordinateFields(lead);

  return {
    address: normalizeString(rawAddress),
    city: normalizeString(rawCity),
    state: normalizeString(rawState),
    country: normalizeString(rawCountry),
    coordinates
  };
}

function attachLocationFilterMeta(lead: Lead, log: LocationFilterLog): Lead {
  return {
    ...lead,
    metadata: {
      ...(lead.metadata ?? {}),
      locationFilter: {
        decision: log.decision,
        scoreDelta: log.scoreDelta,
        reasons: log.reasons,
        derivedLocation: log.derivedLocation
      }
    }
  };
}

function buildLocationToken(request: UniversalLocationRequest): string {
  return [request.locationToken, request.city, request.state, request.country]
    .filter((part): part is string => !!normalizeString(part))
    .map((part) => normalizeString(part) as string)
    .join(', ');
}

function defaultInjector(query: AdapterQuery, token: string): AdapterQuery {
  return {
    ...query,
    query: appendToFreeText(query.query, token),
    params: { ...query.params, location: token }
  };
}

function appendToFreeText(base: string | undefined, suffix: string): string {
  const left = normalizeString(base);
  if (!left) return suffix;
  const lowerLeft = left.toLowerCase();
  const lowerSuffix = suffix.toLowerCase();
  if (lowerLeft.includes(lowerSuffix)) return left;
  return `${left} ${suffix}`.trim();
}

function normalizeString(value?: string | null): string | undefined {
  if (!value) return undefined;
  const out = value.trim();
  return out.length > 0 ? out : undefined;
}

function firstString(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => !!normalizeString(value));
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseCoordinateFields(lead: Lead): LatLng | undefined {
  const lat = asNumber((lead as Record<string, unknown>).lat) ?? asNumber((lead as Record<string, unknown>).latitude);
  const lng =
    asNumber((lead as Record<string, unknown>).lng) ??
    asNumber((lead as Record<string, unknown>).lon) ??
    asNumber((lead as Record<string, unknown>).longitude);

  if (lat === undefined || lng === undefined) return undefined;
  return { lat, lng };
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function matchesLoose(actual?: string, expected?: string): boolean {
  if (!expected) return true;
  if (!actual) return false;
  const a = actual.trim().toLowerCase();
  const e = expected.trim().toLowerCase();
  return a === e || a.includes(e) || e.includes(a);
}

function hasAnyLocationSignal(location: NormalizedLocation): boolean {
  return Boolean(location.address || location.city || location.state || location.country || location.coordinates);
}

function haversineKm(a: LatLng, b: LatLng): number {
  const earthRadiusKm = 6371;
  const dLat = degToRad(b.lat - a.lat);
  const dLng = degToRad(b.lng - a.lng);
  const lat1 = degToRad(a.lat);
  const lat2 = degToRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}
