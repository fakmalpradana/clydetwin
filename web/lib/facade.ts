// SPDX-License-Identifier: AGPL-3.0-or-later
// Procedural façade parameters from the per-building tile attributes (sentinels: text 'none', numbers -1).

export interface FacadeProps {
  height?: number;
  storeys_est?: number;
  lb_category?: string;
  conservation_area?: number;
}

/** Storey height the pipeline's `storeys_est` assumes (height / 3.0 m). */
export const STOREY_M = 3;

/**
 * storeys: tile estimate, else height / 3 m (at least 1).
 * sandstone: 1 for a listed building (HES category A, B or C), 0.6 inside a conservation area, else 0 (neutral).
 * There is no building-age attribute, so listing and conservation status stand in for "older".
 */
export function facadeParams(p: FacadeProps): { storeys: number; sandstone: number } {
  const storeys = p.storeys_est != null && p.storeys_est > 0 ? p.storeys_est : Math.max(1, Math.round((p.height ?? 0) / STOREY_M));
  const listed = p.lb_category != null && /^[ABC]$/i.test(p.lb_category);
  return { storeys, sandstone: listed ? 1 : p.conservation_area === 1 ? 0.6 : 0 };
}

/** 0 by day, 1 at night: ramps over the sun elevation range +2 to -6 degrees (end of civil twilight). */
export const nightFactor = (elevationDeg: number) => Math.min(1, Math.max(0, (2 - elevationDeg) / 8));
