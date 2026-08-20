# Design notes

## Colour

Every ramp is checked with a colourblind-safety and step-separation validator
rather than chosen by eye. The checks are: lightness monotonicity, a minimum
adjacent lightness gap (ΔL ≥ 0.06 in OKLab), single-hue consistency, and
contrast against the surface the ramp is drawn on.

| Ramp | Light | Dark |
|---|---|---|
| `seq-blue` (SC and related) | `#cde2fb → #0d366b` | `#44658f → #c3e1ff` |
| `seq-orange` (ST and related) | `#ffd4c4 → #6d0800` | `#874b35 → #ffd8c6` |
| `div-orange-blue` (SC − ST) | orange ← `#f0efec` → blue | orange ← `#383835` → blue |

Three decisions worth recording:

**Seven classes, not eight.** The source blue ramp's documented steps sit 0.047
apart in OKLab lightness. Eight classes spanning it would put adjacent steps
below the 0.06 separation floor — visibly indistinguishable on a small polygon
on a phone. Seven classes land at exactly 0.095 apart. The census-style bins
were merged accordingly (`0–1` and `1–5` became `under 5`), which costs nothing
because true zero is styled separately anyway.

**Dark mode is selected, not flipped.** A sequential ramp ending at `#0d366b`
sinks into a `#1a1a19` surface: the highest-value districts would be the least
visible. The dark ramps therefore run dark→bright, so "more" still reads as
"more", with the low end held at ≥2.5:1 against the surface.

**The orange ramp is lightness-matched to the blue one**, step for step, so the
SC map and the ST map are directly comparable — a district that looks "one step
darker" on one is genuinely one step along on the other.

The light end of each sequential ramp falls below the 2:1 contrast floor that
applies to *ordinal* ramps. That is deliberate and documented: for a choropleth
the lightest step means "near zero" and is allowed to recede toward the surface.

## Classification

Fixed breakpoints from the manifest, never quantiles computed at runtime.
Quantiles guarantee an evenly-filled legend and destroy the comparison: every
map would look equally dramatic, Punjab at 31.9% would occupy the same visual
class as a state at 6% for being top of its own distribution, and a genuinely
flat distribution could not look flat.

Breakpoints are **internal only** — not the bottom of the scale, not the top. N
breakpoints describe N+1 classes and want N+1 colours. A leading `0` is the easy
mistake: it adds an unreachable "under 0" class and shifts every district one
step too dark. It renders perfectly, which is what makes it nasty, so
`test/manifest.test.mjs` asserts against it directly.

## Cartography

**No basemap.** A choropleth is a figure, not a location. Roads and terrain
underneath would compete with the very colour differences the map exists to
show — and it keeps the app free of an external tile dependency and an API key.

**State outlines are dissolved from the same district geometry** that carries
the data, so the two can never disagree. Without them a 640-polygon choropleth
is very hard to navigate: you cannot find Punjab.

**District hairlines fade in with zoom.** At national zoom, drawing all 640
outlines at full weight turns the Gangetic plain into a grey smear.

**Web Mercator, not an equal-area projection.** A static print map of India
should use something like EPSG:7755 — raw lat/lon visibly inflates the Himalayan
districts. An interactive slippy map effectively cannot: pan and zoom, tiles and
hit-testing all assume Mercator. Between 8°N and 37°N the area distortion across
India is roughly 1.5×, which is worth knowing when comparing Ladakh's apparent
size to Kerala's, and is the cost of the interaction.

**Rotation is disabled.** It is all cost and no benefit on a choropleth, and on
a phone a stray two-finger twist during a pinch-zoom leaves the map crooked with
no obvious way back.

## Layout

Phone first: the map owns the screen and the controls live in a sheet that
slides up over it.

Two things that took measurement rather than guessing:

**`maxBounds` was over-constraining the fit.** Held tight, MapLibre raises the
minimum zoom on a tall narrow viewport to keep the latitude span inside the
leash — which clipped India left and right on phones — and it re-clamps the
centre after `fitBounds`, quietly undoing the fit's padding. It is now wide
enough never to bind at any zoom the app allows.

**The sheet lifts the map instead of covering it.** Opening the sheet eases the
camera's bottom padding by the sheet's height, so the country is centred when
the sheet is down and pushed above it when it is up. Permanently biasing the fit
upward was the alternative, and it left the closed state — the state you
actually read the map in — sitting high with a band of dead space beneath it.
