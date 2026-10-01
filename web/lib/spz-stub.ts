// SPDX-License-Identifier: AGPL-3.0-or-later
// ponytail: stand-in for @spz-loader/core (Gaussian-splat decoding, unused here). Its inlined wasm template string
// is mangled by Turbopack's production minifier ("Octal escape sequences are not allowed in template strings"),
// which breaks every Cesium page in `next build`. Remove when the upstream bundle is fixed.
export const loadSpz = async (): Promise<never> => {
  throw new Error("SPZ decoding is disabled in this build");
};
export const loadSpzFromUrl = loadSpz;
