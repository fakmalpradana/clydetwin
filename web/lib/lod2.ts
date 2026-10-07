// SPDX-License-Identifier: AGPL-3.0-or-later
// LoD2 pilot (George Square / Merchant City). Where it is shown, the LoD1 features with the same building_id are hidden.
const R2 = "https://pub-7ceb47f944ac4ddb9bac87b602eb42af.r2.dev";
export const LOD2_URL = process.env.NEXT_PUBLIC_LOD2_URL ?? `${R2}/lod2/v4/tileset.json`;
export const LOD2_IDS_URL = process.env.NEXT_PUBLIC_LOD2_IDS_URL ?? `${R2}/lod2/v4/pilot_ids.json`;

export async function loadPilotIds(url = LOD2_IDS_URL): Promise<Set<string>> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`pilot ids: HTTP ${r.status}`);
  return new Set((await r.json()) as string[]);
}

/** Cesium style `show` expression: false for pilot buildings. ids are UUIDs (hex and hyphens), so no regex escaping. */
export function hideExpression(ids: Iterable<string>): string {
  const list = [...ids];
  return list.length ? `!regExp('^(${list.join("|")})$').test(\${building_id})` : "true";
}

/** Triangle index without the triangles whose feature id is hidden (for the three.js viewer). */
export function filterIndex(index: ArrayLike<number>, featureIds: ArrayLike<number>, hidden: ReadonlySet<number>): Uint32Array {
  const out: number[] = [];
  for (let i = 0; i + 2 < index.length; i += 3) {
    if (!hidden.has(featureIds[index[i]])) out.push(index[i], index[i + 1], index[i + 2]);
  }
  return Uint32Array.from(out);
}
