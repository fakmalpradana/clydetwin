# LinkedIn drafts (author: Fairuz Akmal Pradana)

Plain text, no hashtags beyond three at the end. Adjust links once the releases are tagged.

---

## Post 1: Streaming data into the twin (Phase 2)

I added live weather, air quality and river data to my open-source Glasgow 3D city (ClydeTwin).

It runs on one small VM: collectors, TimescaleDB, a FastAPI service. The site itself stays on a CDN, so if the VM goes
down the 3D city still works and the live pages show a "stale" badge instead of fake freshness.

What is not done: SEPA has not granted API access yet, so river data shows as unavailable. The 72 hour ingest test is
still running.

Write-up: [link]

#geospatial #opendata #digitaltwin

---

## Post 2: The moving city (Phase 3)

Phase 3 of ClydeTwin: aircraft over Glasgow Airport are live (from adsb.lol), the Subway trains are a timetable
simulation. Every moving thing in the viewer carries a "live", "scheduled" or "simulated" badge.

A moving dot on a 3D map looks authoritative whether or not it is. Labelling it is cheap.

A bug worth sharing: taxiing aircraft have no heading in the feed, which crashed the viewer. My sample data always had
one. Test against the real service early.

Buses, trains and traffic wait for access I do not have yet.

Write-up: [link]

#geospatial #3D #opensource

---

## Post 3: LoD2, honestly (Phase 4)

I built LoD2 roof models for 722 buildings in Glasgow city centre from open LiDAR.

Passed: every solid is geometrically valid (699 of 699 in the final run).
Missed: my roof accuracy target of 0.5 m. The per-building median error is 1.45 m. I redefined the headline metric to
that median after seeing the result, and I say so in the report.
Not done: independent validation against OS NGD heights, pending an account.

Also: Glasgow City Chambers' tower is lost in the model (33.8 m vs about 73 m published).

Write-up with the tables: [link]

#LiDAR #LoD2 #geospatial

---

## Post 4: Immersive Glasgow (Phase 5)

ClydeTwin's immersive view now follows the data: clouds from cloud cover, rain from precipitation, the Clyde's water
level from the nearest gauge, and lit windows at night following the real sun.

Most interesting bugs: a dashed line on the horizon (the edge of my own terrain data), and hidden buildings caused by
reading an interleaved glTF buffer the wrong way.

Honest status: I have not yet measured the 50 fps target on a real GPU and there is no demo clip yet.

Live: clydetwin.vercel.app. Code AGPL, data CC BY-SA.

#threejs #digitaltwin #geospatial
