/** RGBA image in plain arrays, so the engine runs in tests without a DOM. */
export interface Img {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Roi {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Photos captured per session. `closed` = relaxed face with eyes closed. */
export type Pose = 'rest' | 'closed' | 'frown' | 'raise' | 'squint';
export const POSES: Pose[] = ['rest', 'closed', 'frown', 'raise', 'squint'];

/** What the client can look at in the comparison. */
export type View = 'rest' | 'frown' | 'raise' | 'squint';
export type ExprView = Exclude<View, 'rest'>;
export const VIEWS: View[] = ['rest', 'frown', 'raise', 'squint'];
export const EXPR_VIEWS: ExprView[] = ['frown', 'raise', 'squint'];

/** 0 none · 1 light · 2 moderate · 3 full. Never units. */
export type Level = 0 | 1 | 2 | 3;
export const LEVEL_LABEL = ['None', 'Light', 'Moderate', 'Full'] as const;
/** Placeholder response strengths until calibrated against real outcomes. */
export const LEVEL_E = [0, 0.4, 0.7, 0.9] as const;

export interface Scenario {
  id: string;
  name: string;
  glabella: Level;
  forehead: Level;
  /** Treat the lateral forehead too. Off = central only (risk of "Spock brow"). */
  foreheadLateral: boolean;
  /** Keep forehead injections in the upper forehead (protects brow position). */
  foreheadUpperOnly: boolean;
  crowsFeet: Level;
}

export type Range = 'lower' | 'typical' | 'upper';
export const RANGE_MULT: Record<Range, number> = { lower: 0.75, typical: 1, upper: 1.1 };

export interface Findings {
  lidHooding: 'none' | 'mild' | 'marked';
  lowBrows: boolean;
  staticLines: 'none' | 'mild' | 'moderate' | 'deep';
  /** Provider override of forehead compensation, in mm. null = use measurement. */
  kappaOverrideMm: number | null;
  notes: string;
}

export const DEFAULT_FINDINGS: Findings = {
  lidHooding: 'none',
  lowBrows: false,
  staticLines: 'mild',
  kappaOverrideMm: null,
  notes: '',
};

/** Effective response per muscle group after range scaling (0..0.95). */
export interface Effect {
  eg: number; // glabella (corrugators, procerus)
  efc: number; // central frontalis
  efl: number; // lateral frontalis
  elc: number; // lateral orbicularis (crow's feet)
  upperOnly: boolean;
}

export function effectOf(s: Scenario, range: Range): Effect {
  const m = RANGE_MULT[range];
  const cap = (x: number) => Math.min(0.95, x * m);
  const ef = cap(LEVEL_E[s.forehead]);
  return {
    eg: cap(LEVEL_E[s.glabella]),
    efc: ef,
    efl: s.foreheadLateral ? ef : 0,
    elc: cap(LEVEL_E[s.crowsFeet]),
    upperOnly: s.foreheadUpperOnly,
  };
}

export function isEmptyEffect(e: Effect): boolean {
  return e.eg === 0 && e.efc === 0 && e.efl === 0 && e.elc === 0;
}

export function defaultScenarios(): Scenario[] {
  return [
    { id: 'A', name: 'Glabella only', glabella: 3, forehead: 0, foreheadLateral: true, foreheadUpperOnly: false, crowsFeet: 0 },
    { id: 'B', name: '+ Forehead', glabella: 3, forehead: 2, foreheadLateral: true, foreheadUpperOnly: false, crowsFeet: 0 },
    { id: 'C', name: "+ Forehead + crow's feet", glabella: 3, forehead: 2, foreheadLateral: true, foreheadUpperOnly: false, crowsFeet: 2 },
  ];
}
