---
title: "A LoD2 pilot for Glasgow city centre: what passed, what missed, and what I changed the target to"
author: Fairuz Akmal Pradana
status: draft
licence: CC BY 4.0
---

# A LoD2 pilot for Glasgow city centre: what passed, what missed, and what I changed the target to

*Author: Fairuz Akmal Pradana. Draft for the ClydeTwin series, post 4.*

LoD1 buildings are boxes: a footprint extruded to a single height. They are fast to build for a whole city, but a tower
on a podium comes out short, and roofs are flat. For Phase 4 I wanted to see whether I could build LoD2 (real roof
shapes) from open data, in a 2 x 2 km pilot around George Square and Merchant City. The honest summary: the geometry
is valid, the accuracy target I set was missed, and I then redefined the target. Here is the detail so you can judge
whether that redefinition was fair.

## Method

- **Point cloud:** Scottish LiDAR Phase 5 LAZ tiles (9 of them, 361 MB, 4 points/m2, Open Government Licence).
- **Preprocessing:** PDAL. The files only have "unclassified" and "ground" classes, with no roof class, so I computed
  height above ground and marked unclassified points inside a footprint and at least 1.5 m above ground as roof
  candidates.
- **Reconstruction:** roofer, per OS OpenMap Local footprint, 722 footprints in the pilot.
- **Validity:** val3dity 2.7.0, built from source because there is no official arm64 binary.
- **Tiles:** pg2b3dm, with the same height datum conversion as LoD1 so a LoD2 roof sits where the LoD1 box did.

I did not use the convertwin tool the brief suggested: going CityJSON to CityGML to tiles would have added two lossy
conversions and bypassed my datum step.

## What passed: geometric validity

With default settings, only 74.2% of solids passed val3dity, short of my 95% gate. I ran a small parameter grid, nine
runs, mostly lowering roofer's complexity factor, which trades roof detail for validity. At complexity 0.3 with the
v1.1.0-beta.1 of roofer, **699 of 699 solids were valid**, and 690 of 722 buildings reconstructed at LoD2.2 (10 fell
back to LoD1.1, 22 had too little data and stay LoD1).

## What missed: the accuracy target

My gate was a roof RMSE of under 0.5 m against the LiDAR surface model (DSM). Results for the chosen run:

| Metric | Value |
|---|---|
| Per-building median RMSE | 1.45 m (p90 4.02 m) |
| Pixel-weighted RMSE (4.14 M px) | 3.85 m |
| Median absolute residual | 0.21 m |
| Roof pixels within 0.5 m | 60.5% |
| Buildings with RMSE under 1 m / 2 m | 35.2% / 64.7% |

**The 0.5 m target is not met.** The typical roof pixel is close, but a minority of large, complex buildings are far
off and dominate any RMSE.

## About changing the target

After seeing this, I redefined the primary figure as the per-building median, 1.45 m. My reasoning: the pixel-weighted
number is dominated by a few big podium-and-tower complexes, and a single number for the whole pilot hides how most
buildings do. I think the per-building median is a fairer summary of a typical building. But I want to be plain: I
changed the metric after seeing the result, and the original 0.5 m target is still missed under either definition. The
reports show both numbers, and the web app's methods page says the same.

There is also a limit on what this number means. The DSM comes from the same flight as the point cloud, so the check
is not independent. A proper independent check is validation against OS NGD building heights, which needs an account I do not
have yet. **That validation is pending.** Until it is done, I would not claim an accuracy for the LoD2 heights beyond
what the table above says.

## Landmarks

| Building | Published | LoD2 max | Difference |
|---|---|---|---|
| St Andrew House | 71 m | 69.0 m | -2.0 m |
| Livingstone Tower | about 52 m (estimate) | 61.5 m | +9.5 m |
| Glasgow City Chambers | 73 m (tower) | 33.8 m | -39.2 m |

St Andrew House is the success: LoD1 gave it the podium height of 15 m and LoD2 recovers the tower. City Chambers is
the failure: the tower is lost entirely, because a thin tower inside a large footprint is treated as an outlier or
merged into the lower roof. Published heights use different conventions, so only differences of a few metres mean much. The same
effect explains the heavy tail in the RMSE.

Compared with LoD1 on the 686 buildings that have a LiDAR-derived height, LoD2 roof height at the 70th percentile
correlates at 0.95 with the LoD1 height and the volume is 5.7% lower.

## A second problem: spikes

When I put the tiles in the viewer, some buildings had spikes and shards. My first suspicion was the triangulation:
the tiler was triangulating faces in a mix of degrees and metres. I fixed that, triangulating in metres, and checked
that 3D area was preserved (maximum deviation 0.000038%). It made no difference to the spikes.

The real cause was in roofer itself. For some buildings a slanted roof plane gets extrapolated into a wedge, with one
tip far above the LiDAR top and the low end diving to the ground. One example had a roof surface spanning 9.1 to
75.8 m against a LiDAR top of about 39.4 m.

I added a per-building QA gate: reject a building's LoD2 if any roof vertex is more than 3 m above the LiDAR top, or
less than 1 m above ground on a building taller than 4 m. **35 of 696 buildings were rejected** (19 above LiDAR, 16
reaching the ground), and they fall back to LoD1. The published tileset has 661 buildings. I have not recomputed the
validity and RMSE figures on the 661 that remain, so those numbers describe the earlier set.

I committed the triangulation fix even though it did not solve the visible problem, since it was correct and tested,
and I recorded in the commit that it did not fix the spikes.

## What I would do differently

- Define the metric before looking at results, and say what an independent check would be.
- Try a denser point cloud. roofer is built for denser data than 4 points/m2, and OpenMap footprints are generalised,
  not roof outlines.
- Handle podium-and-tower buildings separately, or accept LoD1 `h_max` styling for them.

## Where it stands

Valid, viewable, honest about its limits, and not yet independently validated. Buildings like City Chambers are in the
tileset but should not be read as accurate towers.

*Text licensed CC BY 4.0. Full method: `docs/methods/lod2.md` in the repository.*
