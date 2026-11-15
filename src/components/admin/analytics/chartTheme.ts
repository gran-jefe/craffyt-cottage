/**
 * Chart colour roles for the admin dashboard. The admin is light-only, and charts sit on white cards.
 *
 * Series colours are brand-derived and validated with the dataviz palette checks on #FFFFFF
 * (lightness band, chroma floor, CVD ΔE 10.1 protan, normal-vision ΔE 19.7, both ≥ 3:1).
 * Colour follows the entity: online is always forest, offline always gold, whatever the filter.
 * Text never uses series colours; all text roles below are ≥ 4.5:1 on white and on linen.
 */
export const CHART = {
  /** Categorical slot 1: online sales, and the single-series bar colour. */
  online: '#3F7A2B',
  /** Categorical slot 2: offline sales. */
  offline: '#C08A1E',
  /** De-emphasis for folded "Other" rows (3.05:1 on white). */
  other: '#9A9384',
  surface: '#FFFFFF',
  gridline: '#EEE8DC',
  baseline: '#CFC6B2',
  /** Text roles */
  ink: '#17210E',
  inkSecondary: '#4A5240',
  axisText: '#5E6654',
  deltaUp: '#146C43',
  deltaDown: '#B42318',
} as const

export const SERIES_META = {
  online: { label: 'Online', color: CHART.online },
  offline: { label: 'Offline', color: CHART.offline },
} as const

export type SeriesKey = keyof typeof SERIES_META
