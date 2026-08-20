export type GeoJSONPosition = [number, number] | [number, number, number];
export type GeoJSONGeometry =
  | { type: 'Point'; coordinates: GeoJSONPosition }
  | { type: 'LineString'; coordinates: GeoJSONPosition[] }
  | { type: 'Polygon'; coordinates: GeoJSONPosition[][] }
  | { type: 'MultiLineString'; coordinates: GeoJSONPosition[][] }
  | { type: 'MultiPolygon'; coordinates: GeoJSONPosition[][][] };

export type CourseGeometry = {
  courseId: string;
  geometryVersion: string;
  boundary?: GeoJSONGeometry;
  center?: GeoJSONPosition;
  bounds?: [[number, number], [number, number]];
  holes: Array<{ holeNumber: number; geometry: GeoJSONGeometry }>;
  tees: Array<{ holeNumber: number; name: string; geometry: GeoJSONGeometry }>;
  greens: Array<{ holeNumber: number; geometry: GeoJSONGeometry }>;
  hazards: Array<{ name: string; geometry: GeoJSONGeometry }>;
  cartPaths: GeoJSONGeometry[];
  stickLinks: Array<{ id: string; label: string; geometry: GeoJSONGeometry }>;
};

export type ImageryMetadata = {
  providerName: string;
  imageryUrl?: string;
  tileSource?: string;
  captureTimestamp?: string;
  resolution?: string;
  cloudCover?: number;
  license?: string;
  coverageBounds?: [[number, number], [number, number]];
  processingStatus: 'available' | 'pending' | 'unavailable';
};

export type ImagerySource = { id: string; courseId: string; metadata: ImageryMetadata };
export type MapLayer = { id: string; kind: string; label: string; geometry?: GeoJSONGeometry; source?: string; visible?: boolean };

export interface MapProvider {
  readonly name: string;
  loadCourse(courseId: string): Promise<CourseGeometry | null>;
  loadImagery(courseId: string): Promise<ImagerySource | null>;
  render(container: HTMLElement, geometry: CourseGeometry, layers?: MapLayer[]): void;
}

export function imageryLabel(metadata?: ImageryMetadata | null): string {
  if (!metadata || metadata.processingStatus === 'unavailable') return 'Imagery unavailable — course diagram shown';
  if (!metadata.captureTimestamp) return `${metadata.providerName} · capture date not supplied`;
  return `${metadata.providerName} · imagery captured on ${metadata.captureTimestamp.slice(0, 10)}`;
}

export function validateGeometry(value: unknown, maxBytes = 250_000): value is GeoJSONGeometry {
  let serialized = '';
  try { serialized = JSON.stringify(value ?? null); } catch { return false; }
  if (serialized.length > maxBytes || !value || typeof value !== 'object') return false;
  const item = value as { type?: unknown; coordinates?: unknown };
  const allowed = new Set(['Point', 'LineString', 'Polygon', 'MultiLineString', 'MultiPolygon']);
  if (typeof item.type !== 'string' || !allowed.has(item.type) || !Array.isArray(item.coordinates)) return false;
  const walk = (node: unknown, depth: number): boolean => {
    if (depth === 0) return Array.isArray(node) && node.length >= 2 && node.slice(0, 2).every((part) => typeof part === 'number' && Number.isFinite(part));
    return Array.isArray(node) && node.length > 0 && node.every((child) => walk(child, depth - 1));
  };
  const depth = item.type === 'Point' ? 0 : item.type === 'LineString' ? 1 : item.type === 'Polygon' || item.type === 'MultiLineString' ? 2 : 3;
  return walk(item.coordinates, depth);
}

export const fallbackMapProvider: MapProvider = {
  name: 'State of Stick course diagram',
  async loadCourse() { return null; },
  async loadImagery() { return null; },
  render(container, geometry) {
    container.replaceChildren();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 800 420'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Course diagram');
    const boundary = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    boundary.setAttribute('x', '8'); boundary.setAttribute('y', '8'); boundary.setAttribute('width', '784'); boundary.setAttribute('height', '404'); boundary.setAttribute('rx', '24'); boundary.setAttribute('fill', '#dfe8c0');
    svg.append(boundary);
    geometry.holes.forEach((hole, index) => { const x = 70 + (index % 6) * 125; const y = index < 6 ? 105 : index < 12 ? 220 : 335; const fairway = document.createElementNS('http://www.w3.org/2000/svg', 'path'); fairway.setAttribute('d', `M ${x} ${y} C ${x + 36} ${y - 22}, ${x + 75} ${y + 22}, ${x + 100} ${y}`); fairway.setAttribute('fill', 'none'); fairway.setAttribute('stroke', '#7e9d5d'); fairway.setAttribute('stroke-width', '25'); fairway.setAttribute('stroke-linecap', 'round'); svg.append(fairway); const label = document.createElementNS('http://www.w3.org/2000/svg', 'text'); label.setAttribute('x', String(x)); label.setAttribute('y', String(y - 28)); label.setAttribute('fill', '#172019'); label.setAttribute('font-size', '14'); label.textContent = String(hole.holeNumber).padStart(2, '0'); svg.append(label); });
    container.append(svg);
  },
};
