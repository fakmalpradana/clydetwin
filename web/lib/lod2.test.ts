import { describe, expect, it } from "vitest";
import { featureIds, filterIndex, hideExpression } from "./lod2";

describe("pilot hiding", () => {
  it("builds a Cesium show expression that is false only for pilot ids", () => {
    const e = hideExpression(["AAAA-1", "BBBB-2"]);
    expect(e).toBe("!regExp('^(AAAA-1|BBBB-2)$').test(${building_id})");
    // same semantics in plain JS
    const re = new RegExp(e.match(/regExp\('(.*)'\)/)![1]);
    expect(re.test("AAAA-1")).toBe(true);
    expect(re.test("AAAA-12")).toBe(false);
    expect(re.test("XAAAA-1")).toBe(false);
  });
  it("shows everything when there are no pilot ids", () => {
    expect(hideExpression([])).toBe("true");
  });
  it("drops the triangles of hidden features and keeps the rest", () => {
    // two triangles: vertices 0-2 belong to feature 0, vertices 3-5 to feature 1
    const index = [0, 1, 2, 3, 4, 5];
    const fid = [0, 0, 0, 1, 1, 1];
    expect([...filterIndex(index, fid, new Set([0]))]).toEqual([3, 4, 5]);
    expect([...filterIndex(index, fid, new Set([1]))]).toEqual([0, 1, 2]);
    expect([...filterIndex(index, fid, new Set())]).toEqual(index);
    expect(filterIndex(index, fid, new Set([0, 1])).length).toBe(0);
  });
});

describe("interleaved feature ids", () => {
  // vertex = [x, y, z, nx, ny, nz, id] in one buffer (stride 7), as in the LoD1 v4 tiles
  const buf = new Float32Array([175.8, 3139.9, 133.2, -0.16, -0.98, 0.06, 0, 174.2, 3140.1, 133.2, 0.1, 0.1, 0.9, 0, 10, 20, 30, 0, 0, 1, 1, 11, 21, 31, 0, 0, 1, 1]);
  const attr = { count: 4, getX: (i: number) => buf[i * 7 + 6] };
  it("reads one id per vertex, not the raw buffer", () => {
    expect([...featureIds(attr)]).toEqual([0, 0, 1, 1]);
  });
  it("hides only the triangles of the hidden building (the buggy raw-buffer read hid unrelated ones)", () => {
    const ids = featureIds(attr);
    const index = [0, 1, 1, 2, 3, 3]; // tri A (building 0) and tri B (building 1)
    expect([...filterIndex(index, ids, new Set([0]))]).toEqual([2, 3, 3]);
    expect([...filterIndex(index, ids, new Set([1]))]).toEqual([0, 1, 1]);
    expect([...filterIndex(index, ids, new Set())]).toEqual(index);
  });
});
