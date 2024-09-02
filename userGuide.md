# EDIS Dict-API

- stellt die Pegelonline Stationen in aufbereiteter Form zur Verfügung
- macht die Stationen mit verschiedenen Parametern durchsuchbar

## Suchparameter

Suche auf der Liste der Pegelonline Stationen. Bei Angabe mehrerer Parameter werden diese durch eine UND-Verknüpfung kombiniert.

### station

Suche per String matching nach Stationen mit dem angegebenen Namen
> http://localhost:3000/search?station=köln

### gewaesser

Suche per String matching nach Stationen an dem angegebenen Gewässer
> http://localhost:3000/search?gewaesser=rhein

### agency

Suche per String matching nach Stationen mit der angegebenen Agency
> http://localhost:3000/search?agency=dresden

### land

Suche per String matching nach Stationen im angegebenen Bundesland
> http://localhost:3000/search?land=hamburg

### country

Suche per String matching nach Stationen im angegebenen Nationalstaat
> http://localhost:3000/search?country=deutschland

### einzugsgebiet

Suche per String matching nach Stationen im angegebenen Einzugsgebiet
> http://localhost:3000/search?einzugsgebiet=ems

### kreis

Suche per String matching nach Stationen im angegebenen Landkreis
> http://localhost:3000/search?kreis=emsland

### parameter

Suche per String matching nach Stationen mit angegebenem Messparameter
> http://localhost:3000/search?parameter=wassertemperatur

### bbox

Suche per String matching nach Stationen in der durch Koordinaten angegebenen Bounding Box (`minLon, minLat, maxLon, maxLat`)
> http://localhost:3000/search?bbox=7,52,8,53

### q

Allgemeiner Suchparameter, durch den alle vorhergehenden Parameter per String matching durchsucht werden
> http://localhost:3000/search?q=köln
