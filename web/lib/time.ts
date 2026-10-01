// SPDX-License-Identifier: AGPL-3.0-or-later
/** Scene time for sun lighting: real "now" unless `?t=<ISO 8601>` overrides it (handy for demos and tests). */
export function sceneDate(params: URLSearchParams): Date {
  const t = params.get("t");
  const d = t ? new Date(t) : null;
  return d && !Number.isNaN(d.getTime()) ? d : new Date();
}
