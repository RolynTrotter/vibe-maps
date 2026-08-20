# Changelog

## 0.1.0 — first release

District-level choropleths of the 2011 Census of India, all 640 districts.

### Added
- MapLibre GL + PMTiles map, no basemap and no tile server: the whole site is
  static files served over HTTP range requests.
- 16 variables across caste, land & labour, religion and living conditions,
  declared as formulas in a dataset manifest rather than in code.
- Annotation layer — 8 pinned notes carrying findings computed from the data.
- Glossary of census terms, in-app and in the README.
- Explicit "what this data cannot tell you" section on the ecological fallacy
  the dataset invites.
- Build pipeline: DataMeet 2011 shapefile + Primary Census Abstract →
  simplified geometry, dissolved state outlines, vector tiles, columnar table.
- Validation suite checking the join against published Census figures.
- PWA shell with offline caching of everything but the tile archive.
- Dev server with HTTP range support, because `python3 -m http.server` has none
  and silently yields a blank map.

### Notes
- Boundaries are deliberately 2011 vintage: no Telangana, no Ladakh.
- Zero and no-data are styled separately throughout.
