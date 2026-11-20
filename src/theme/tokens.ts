/**
 * Design system tokens — task #34.
 *
 * Single source of truth for every visual primitive. Migrated to from the
 * scattered raw hex / magic numbers that `/tokens-audit` flagged across
 * tasks #8–#15. After this lands, the `reviewer` subagent's rule applies:
 * "no raw hex codes, no magic spacing/radius numbers outside tokens.ts."
 *
 * Six primitive scales:
 *   • COLOR    — semantic light + dark + OLED swatches (task #35).
 *   • SPACING  — 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.
 *   • RADIUS   — xs / sm / md / lg / xl / full.
 *   • TYPE     — 9 type tokens (display → caption) — task #36.
 *   • MOTION   — easing curves + duration scale — task #38.
 *   • ELEVATION — light-only shadow ladder; dark uses surface lifts.
 *
 * Principle (CLAUDE.md): "calm before clever, reverent not heavy, tabular
 * precision for sacred data, the app shouldn't shout, time-of-day awareness."
 */

// ─── Spacing ──────────────────────────────────────────────────────────────

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  xxxxl: 64,
} as const;
export type SpacingToken = keyof typeof SPACING;

// ─── Radius ───────────────────────────────────────────────────────────────

export const RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;
export type RadiusToken = keyof typeof RADIUS;

/**
 * Layout constants — so screens stop choosing (docs/design/redesign-plan.md
 * §2.2). One gutter, one card padding, one row padding, one gap between
 * cards. A screen that needs a different one is a design question.
 */
export const LAYOUT = {
  /** Screen edge to content, and a row's horizontal padding. */
  gutter: SPACING.lg,
  /** Inside a card. */
  cardPad: SPACING.lg,
  /** A row's vertical padding. */
  rowPad: SPACING.md,
  /** Between cards, groups and tiles on a page. */
  cardGap: SPACING.md,
  /** The corner of a card, a group, a sheet, the hero. */
  cardRadius: RADIUS.xl,
} as const;

// ─── Color tokens (raw values — NOT consumed directly) ───────────────────
// Components should reference SEMANTIC tokens via the theme palette
// (`useAppPalette`); this raw layer is the implementation detail behind
// each theme's mapping.

const RAW = {
  // Daylight (warm paper, deep emerald) — task #35.
  paperWarm: '#FAF7F2',
  paperLifted: '#FFFDF9',
  inkDeep: '#1A1814',
  inkSoft: '#2A2823',
  warmGray: '#6B6660',
  warmGrayMuted: '#9A958E',
  divDayLight: '#EDE8DF',
  emeraldDeep: '#01543F',
  emeraldHover: '#014634',
  emeraldTint: '#E0EAE8',

  // Night — task #35, warmed 2026-09-12.
  //
  // These were an ink-BLUE ladder (#0E1218 / #161B23 / #080A0E), cool by
  // 10 to 13 points of red-minus-blue, under ink that is warm by 10. The
  // names said blue and the theme looked it: ivory text on slate. Warmed
  // to meet the ink at the same lightness, and renamed, because a
  // constant called `inkBlue` that is not blue is a comment that lies.
  // See DARK_BASE in appPalette.ts for the full reasoning.
  inkNight: '#141210',
  inkNightLifted: '#1D1A17',
  inkNightSunken: '#0C0A08',
  bone: '#E8E5DE',
  boneMuted: '#95918A',
  divNight: '#2A2622',
  emeraldLifted: '#3A8E72',
  emeraldHoverDark: '#46A081',
  emeraldTintDark: '#152F25',

  // Accents — error has a per-theme variant because the deep rose used in
  // light fails WCAG AA against dark backgrounds (2.9:1 contrast). The dark
  // variant is brighter / more saturated so it stays legible.
  warningAmber: '#E5A02C',
  errorRose: '#B91C1C', // light theme
  errorRoseDark: '#F87171', // dark + OLED themes — passes 4.5:1 on ink-blue
  successGreen: '#3D9270',

  // Pure-black OLED variant.
  oledBlack: '#000000',
  oledLifted: '#141210',
} as const;

// ─── Semantic palette per theme ──────────────────────────────────────────

export type SemanticPalette = {
  bg: string;
  surface: string;
  surfaceElevated: string;
  surfaceSunken: string;
  content: string;
  contentSecondary: string;
  contentTertiary: string;
  accent: string;
  accentHover: string;
  accentTint: string;
  divider: string;
  warning: string;
  error: string;
  success: string;
  /** Translucent overlay for modal scrims. RGBA recommended. */
  overlay: string;
};

export const PALETTE_LIGHT: SemanticPalette = {
  bg: RAW.paperWarm,
  surface: RAW.paperLifted,
  surfaceElevated: RAW.paperLifted,
  surfaceSunken: RAW.paperWarm,
  content: RAW.inkDeep,
  contentSecondary: RAW.warmGray,
  contentTertiary: RAW.warmGrayMuted,
  accent: RAW.emeraldDeep,
  accentHover: RAW.emeraldHover,
  accentTint: RAW.emeraldTint,
  divider: RAW.divDayLight,
  warning: RAW.warningAmber,
  error: RAW.errorRose,
  success: RAW.successGreen,
  overlay: 'rgba(26, 24, 20, 0.45)', // ink-deep at 45%
};

export const PALETTE_DARK: SemanticPalette = {
  bg: RAW.inkNight,
  surface: RAW.inkNightLifted,
  surfaceElevated: RAW.inkNightLifted,
  surfaceSunken: RAW.inkNightSunken,
  content: RAW.bone,
  contentSecondary: RAW.boneMuted,
  contentTertiary: '#605E58',
  accent: RAW.emeraldLifted,
  accentHover: RAW.emeraldHoverDark,
  accentTint: RAW.emeraldTintDark,
  divider: RAW.divNight,
  warning: RAW.warningAmber,
  error: RAW.errorRoseDark,
  success: RAW.successGreen,
  overlay: 'rgba(0, 0, 0, 0.55)',
};

export const PALETTE_OLED: SemanticPalette = {
  ...PALETTE_DARK,
  bg: RAW.oledBlack,
  surface: RAW.oledLifted,
  surfaceElevated: RAW.oledLifted,
  surfaceSunken: RAW.oledBlack,
};

// ─── Elevation (shadow ladder, light theme only) ─────────────────────────

export const ELEVATION = {
  none: { shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  sm: { shadowOpacity: 0.05, shadowRadius: 2, elevation: 1, shadowOffset: { width: 0, height: 1 } },
  md: { shadowOpacity: 0.08, shadowRadius: 6, elevation: 2, shadowOffset: { width: 0, height: 2 } },
  lg: { shadowOpacity: 0.1, shadowRadius: 12, elevation: 4, shadowOffset: { width: 0, height: 4 } },
} as const;

export type ElevationToken = keyof typeof ELEVATION;

/**
 * App-wide card shadow (light theme, standard chrome only) — the soft
 * warm-ink lift every bordered card gets via `cardEdgeStyle`. Tuned to be
 * felt rather than seen: warm shadow color (never pure black on the warm
 * paper bg), low opacity, gentle spread. Dark themes use surface lifts
 * instead of shadows; flat/glass chrome brings its own material.
 */
export const CARD_SHADOW = {
  shadowColor: RAW.inkDeep,
  shadowOpacity: 0.07,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

// ─── Time-of-day period tints (principle 5) ───────────────────────────────
// Subtle hue identities for each stretch of the prayer day. Consumed by the
// HomeScreen hero (top rule + eyebrow label) — a quiet wash, never a theme
// swap. Each entry pairs a light-mode ink and a dark-mode lifted variant.

export type PeriodTintKey =
  | 'fajr'
  | 'sunrise'
  | 'midday'
  | 'asr'
  | 'maghrib'
  | 'isha'
  | 'night';

export const PERIOD_TINTS: Record<
  PeriodTintKey,
  { light: string; dark: string }
> = {
  /** Pre-dawn — cool indigo, the sky before Fajr's light. */
  fajr: { light: '#5B6B9E', dark: '#93A3D6' },
  /** Morning — warming amber, sun just up. */
  sunrise: { light: '#B08A3E', dark: '#DCB56A' },
  /** Midday — clear, slightly cool teal-sky. */
  midday: { light: '#3E7D8C', dark: '#7FB9C8' },
  /** Afternoon — golden Asr light. */
  asr: { light: '#A9752C', dark: '#D9A959' },
  /** Sunset — burnt amber-rose. */
  maghrib: { light: '#A65B3B', dark: '#DC9070' },
  /** Evening — deep violet dusk. */
  isha: { light: '#5D5390', dark: '#9C93CF' },
  /** Late night / pre-Fajr — deep slate-indigo. */
  night: { light: '#46517A', dark: '#7D89BE' },
} as const;

// ─── The Arch of Light (1.0.4) — حجر وزمرد (stone + emerald) ───────────
// The full redesign's identity: warm stone neutrals, the deep emerald of
// فجر هادئ (#01543F) carried forward, gold accents. Every colour the arch
// and the restyled screens use lives here — no raw colours in components.

/** The phases the arch shows (see sunArch.ts for how they are computed). */
export type ArchPhase = 'fajr' | 'sunrise' | 'day' | 'asr' | 'sunset' | 'night';

export const ARCH_GOLD = '#C9A227';
export const ARCH_GOLD_SOFT = '#E3C766';
export const ARCH_EMERALD = RAW.emeraldDeep;
export const ARCH_EMERALD_DEEP = '#013B2C';
/** The orb's radius on the arch, and the arc's stroke. */
export const ARCH_ORB_R = 13;
export const ARCH_ARC_STROKE = 2.5;

/**
 * The sky inside the arch, per phase: the gradient from the top of the
 * arc to the horizon, the orb's colour and its glow, the ink for text
 * drawn on the sky (the phase tag), and the arc's own line. Light and
 * dark follow the device's mode — the sky is a drawing, not a theme
 * swap, so the dark variant is the same sky at night, deeper.
 */
export type ArchSky = {
  top: string;
  mid: string;
  bottom: string;
  orb: string;
  glow: string;
  ink: string;
  arc: string;
};

export const ARCH_SKY: Record<ArchPhase, { light: ArchSky; dark: ArchSky }> = {
  fajr: {
    light: { top: '#232B47', mid: '#4A4E7A', bottom: '#C9A98F', orb: '#F2C879', glow: '#F2C879', ink: '#F5F0E6', arc: '#E3C766' },
    dark: { top: '#141A2E', mid: '#2E3454', bottom: '#6B5A4A', orb: '#E3C766', glow: '#E3C766', ink: '#EDE8DC', arc: '#C9A227' },
  },
  sunrise: {
    light: { top: '#7FB3C8', mid: '#F2C879', bottom: '#FBEED3', orb: '#E8A93C', glow: '#F2C879', ink: '#3A2E1A', arc: '#C9A227' },
    dark: { top: '#2E4A5C', mid: '#8A6A3A', bottom: '#5C4A2E', orb: '#E8A93C', glow: '#E8A93C', ink: '#F5EEDC', arc: '#E3C766' },
  },
  day: {
    light: { top: '#7FC4D6', mid: '#BFE3EA', bottom: '#F4F1E6', orb: '#F2B705', glow: '#F2D06B', ink: '#17352C', arc: '#C9A227' },
    dark: { top: '#1E3A4A', mid: '#2E5A6E', bottom: '#3A4A42', orb: '#F2B705', glow: '#F2B705', ink: '#E8F0E6', arc: '#E3C766' },
  },
  asr: {
    light: { top: '#8FB8C4', mid: '#E8C07A', bottom: '#F6E3C2', orb: '#E8963C', glow: '#E8C07A', ink: '#3A2A12', arc: '#C9A227' },
    dark: { top: '#2E4048', mid: '#7A5A2E', bottom: '#4A3A26', orb: '#E8963C', glow: '#E8963C', ink: '#F5EEDC', arc: '#E3C766' },
  },
  sunset: {
    light: { top: '#4A3A5C', mid: '#D96A4A', bottom: '#F2B25C', orb: '#E85C2B', glow: '#F2B25C', ink: '#FFF3E0', arc: '#E3C766' },
    dark: { top: '#241A30', mid: '#7A3A2E', bottom: '#8A5A2E', orb: '#E85C2B', glow: '#E85C2B', ink: '#FBEEDC', arc: '#E3C766' },
  },
  night: {
    light: { top: '#0E1424', mid: '#1E2A4A', bottom: '#2E3A5C', orb: '#E8E5DE', glow: '#E8E5DE', ink: '#E8E5DE', arc: '#C9A227' },
    dark: { top: '#080A12', mid: '#141A2E', bottom: '#1E2A44', orb: '#E8E5DE', glow: '#E8E5DE', ink: '#E8E5DE', arc: '#C9A227' },
  },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Returns the matching semantic palette for a theme key. */
export function paletteForTheme(
  theme: 'light' | 'dark' | 'oled',
): SemanticPalette {
  if (theme === 'oled') return PALETTE_OLED;
  if (theme === 'dark') return PALETTE_DARK;
  return PALETTE_LIGHT;
}
