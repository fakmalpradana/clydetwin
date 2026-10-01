I built a 3D model of every building in Glasgow (81,131 of them) using only open data, and it runs in a browser.

Heights come from Scottish LiDAR (50 cm), footprints from OS OpenMap Local. Along the way:

- Cesium's default terrain sat about 14 m above the LiDAR ground in the city centre, so buildings looked sunk. I spent a while doubting my own pipeline before building terrain from the same LiDAR and geoid. Now it agrees within 0.4 m at the points I checked.
- The datum conversion matches all 29 official OS test vectors to 2 mm.
- Four of five landmark heights land within 2.3 m of published figures. One is off by 11 m and I can't fully explain it.

It also has limits. Towers on podiums are drawn too short until I do LoD2, and 94% of buildings sit within 2 m of the terrain, not all of them.

I am doing my MSc at the University of Glasgow, so next up is a live layer: weather, rivers and rain on the same city.

Demo: https://clydetwin.vercel.app
Write-up and code: https://github.com/fakmalpradana/clydetwin

#Geospatial #LiDAR #DigitalTwin #OpenData
