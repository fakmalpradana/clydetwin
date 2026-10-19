import { describe, expect, it } from "vitest";
import { filterIndex, hideExpression } from "./lod2";

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
