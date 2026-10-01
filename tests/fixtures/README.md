# Test fixtures

`os_ostn15_osgm15_osgb_to_etrs.csv`: the 40 official test points of the Ordnance Survey OSTN15/OSGM15
Developer Pack (`OSTN15_OSGM15_TestInput_OSGBtoETRS.txt` joined with the `RESULT` rows of
`OSTN15_OSGM15_TestOutput_OSGBtoETRS.txt`), from
https://www.ordnancesurvey.co.uk/documents/resources/OSTN15-OSGM15-DevelopersPack.zip
(OS Developer Pack, geodetic test data, (c) Crown copyright, published for implementation testing).
Columns: OSGB36 easting/northing, ODN (orthometric) height, expected ETRS89 lat/lon and ellipsoidal height.
`datum_flag` is the OS "OSGB datum flag": 1 = Great Britain mainland (ODN), other values are islands or outside
the model (separate local vertical datums, not covered by `uk_os_OSGM15_GB.tif`). Only flag 1 is tested.
