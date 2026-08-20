# vibe-maps

Interactive district-level choropleths of demographic data, built to be read on
a phone. The first dataset is **caste, religion and land in the 2011 Census of
India** — all 640 districts.

Live: https://rolyntrotter.github.io/vibe-maps/

## Why this exists

The map that circulates for Scheduled Caste population share in India is a
*state-level* one. The census publishes these figures down to the village, so
the granularity gap is in what has been rendered, not in what exists. This
renders the district version, and then keeps going: Scheduled Tribe share, the
difference between the two, religion, agricultural landlessness, and the
living-conditions measures that actually correlate with any of it.

## Glossary

The census uses legal categories whose names are not self-explanatory. The full
glossary is in the app; the ones you need to read this file:

| | |
|---|---|
| **SC** | **Scheduled Caste** — a legal category listed under the Constitution (Scheduled Castes) Order, 1950. Communities historically subjected to untouchability. ~16.6% of India's population in 2011. |
| **ST** | **Scheduled Tribe** — the parallel category for indigenous/"tribal" peoples, ~8.6%. Largely *beside* the caste order rather than at the bottom of it. |
| **Dalit** | The self-chosen term for people of formerly-untouchable descent. Not identical to SC: Dalit is descent, SC is legal status. Dalit Christians and Muslims are Dalit but not SC. |
| **PCA** | **Primary Census Abstract** — the census table all these numbers come from. |
| **pp** | **percentage points**, the unit for a difference between two percentages. |

## What the maps show, and what they don't

This dataset records **where SC people live, not how they fare.** The Primary
Census Abstract publishes literacy, work and housing as district totals covering
everyone, not broken out by caste. District literacy correlates **+0.04** with
SC share and household income below Rs 45,000 correlates **−0.07** — reading
those as "caste doesn't affect literacy or income" would be an ecological
fallacy. The gaps are *inside* districts, where this table cannot see.

Every correlation quoted in the app is between districts, not between people.

## Findings the app is built around

Computed from the 640 districts, not asserted:

- **SC and ST substitute for each other regionally.** They correlate **−0.61**
  across districts — the strongest relationship in the dataset. Punjab, Haryana
  and Delhi have almost no ST, so the whole subordinate stratum is SC.
- **Legal eligibility is visible in the data.** Christian share correlates
  **−0.45** with SC share and Muslim share **−0.20** — the two religions
  excluded from SC status. Hindu **+0.44** and Sikh **+0.37** — the included
  ones.
- **Landlessness tracks it, weakly but with the right sign.** Agricultural
  labourers **+0.23**, owner-cultivators **−0.17**.
- **Punjab is not uniform.** Districts run 21.7% to 42.5%. The Doaba is high as
  expected (Shahid Bhagat Singh Nagar 42.5%, Jalandhar 39.0%) but shares the top
  with the southwest Malwa cotton belt (Muktsar 42.3%, Firozpur 42.2%).
- **The Kaveri delta behaves as the wet-rice-labour argument predicts.** Tamil
  Nadu's highest districts are Thiruvarur 34.1%, Nagapattinam 31.5%, Perambalur
  31.0% — carrying 39–55% agricultural labourers.
- **Buddhist share flips sign.** Nationally **−0.19** with SC; within
  Maharashtra alone **+0.60**. The national figure is swamped by Himalayan and
  Northeastern Buddhists (Tawang is 69.9% Buddhist and 0.0% SC) while the
  Maharashtra signal is Ambedkarite conversion. Trust the map, not the
  coefficient.

## Running it

```bash
npm install          # build tools only; the app itself has no dependencies
npm start            # http://localhost:8099
```

`npm start` is a real server rather than `python3 -m http.server`, because the
map is delivered as HTTP range requests into a single `.pmtiles` archive and
Python's does not serve byte ranges. Under it you get a blank map.

```bash
npm test             # unit + manifest integrity
npm run validate     # check the data against published Census figures
npm run build:india  # regenerate the tiles and table from source (needs tippecanoe)
```

## How it is put together

No build step and no framework. `index.html` loads ES modules directly, the data
artifacts are committed, and the repo root *is* the deployed site.

```
index.html            shell
js/dataset.js         manifest loading + variable formulas
js/classify.js        breakpoints -> colours -> legend
js/map.js             MapLibre + PMTiles
js/app.js             wiring
data/datasets/*.json  dataset manifests  <- the pluggable part
data/*.json           attribute tables
data/*.pmtiles        vector tiles
tools/                build pipeline, validation, dev server
```

**Adding a variable is a JSON entry, not a patch.** A manifest declares its
variables as small formulas over named columns:

```json
{ "id": "muslim_share", "label": "Muslim share of population",
  "group": "religion", "unit": "%",
  "formula": { "type": "ratio", "num": "Muslims", "den": "Population" },
  "bins": [2, 5, 10, 20, 40, 70], "palette": "seq-orange" }
```

Three formula types cover everything so far: `ratio`, `sum_ratio` (add
numerators, then divide) and `diff` (subtract two rates, report points).
Deliberately not an expression language — no `eval`, no parser, no way for a
manifest to do anything but arithmetic on named columns.

**Adding a whole dataset** is a new manifest plus a table and a `.pmtiles` file.
Nothing in `js/` knows about India.

### Colour

Sequential ramps are one hue, light→dark, from a validated palette; the
diverging ramp is two hues with a neutral grey midpoint. Dark mode has its own
selected steps rather than an automatic flip, because a ramp that ends near
`#0d366b` sinks into a dark surface. Every ramp passes a colourblind-safety and
step-separation check — see `docs/design.md`.

Class breaks are fixed in the manifest, never quantiles computed at runtime.
Quantiles would guarantee an evenly-filled legend and destroy the comparison:
every map would look equally dramatic, and a flat distribution could not look
flat.

### Two things the data forces

**Zero is a real value.** Nagaland, Mizoram, Lakshadweep and the Andamans list
no Scheduled Castes at all. Rendering that as "no data" would hide the
substitution finding, so zero and no-data are styled and labelled separately.

**Boundaries are 2011 vintage.** India had 640 districts in 2011 and has 780+
now. Almost every district file online uses *current* boundaries; joined to 2011
figures they produce a plausible-looking map that is quietly wrong. The join is
on the numeric `censuscode`, never on names — there are several Aurangabads,
Bilaspurs, Hamirpurs and Pratapgarhs.

## Is the map right?

`npm run validate` aggregates the districts back to state level and compares
against published Census figures the build never saw:

```
✓ SC share of India            16.63   expected 16.6
✓ Punjab                       31.94   expected 31.9
✓ Himachal Pradesh             25.19   expected 25.2
✓ West Bengal                  23.51   expected 23.5
✓ Tamil Nadu                   20.01   expected 20.0
✓ Kerala                        9.10   expected 9.1
✓ highest-SC state is Punjab
✓ Telangana absent (2014 split)
```

All 640 districts join with zero unmatched. If Punjab is not the maximum or the
national figure is not ~16.6%, the join is broken regardless of how good the map
looks.

## Sources

- Population: Primary Census Abstract, Census of India 2011
- Boundaries: [DataMeet](https://github.com/datameet/maps) Census 2011 district
  boundaries, CC-BY 4.0

## Roadmap

- **PCA-SC / PCA-ST** — the same abstract computed for the SC and ST populations
  alone, which would turn these from headcount maps into caste-*gap* maps. The
  single biggest upgrade available.
- Sub-district (tehsil/taluk) resolution — the reason the tile pipeline exists.
- A second dataset that is not India, to prove the manifest abstraction.
