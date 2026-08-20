# Data notes

## Sources

**Population.** Primary Census Abstract, Census of India 2011, district level.
The official copy is per-state XLSX files under table A-10 Appendix on
censusindia.gov.in, behind a JS-rendered catalogue. The build instead pulls a
consolidated district CSV carrying the same figures in one file. It is
third-party, so it is not trusted on its say-so — `npm run validate` checks it
against published Census figures.

**Boundaries.** [DataMeet](https://github.com/datameet/maps),
`Districts/Census_2011/2011_Dist.shp`, CC-BY 4.0. 641 polygons carrying a
`censuscode` field.

## The join

640 census rows, 641 polygons, **640 matched, 0 unmatched.**

The 641st polygon is `censuscode 0`, DataMeet's `"Data Not Available"` area of
Jammu & Kashmir — the parts the 2011 census could not enumerate. It is kept
deliberately and styled as no-data, distinct from a genuine zero.

The join is on the numeric `censuscode`, never on names: transliteration differs
between sources and names are not unique across states — there are several
Aurangabads, Bilaspurs, Hamirpurs and Pratapgarhs.

## Vintage

India had 640 districts in 2011 and has 780+ now. Both halves here are 2011:

- **Telangana does not exist** — its districts are inside Andhra Pradesh. The
  validator asserts this; a Telangana row means the table isn't a 2011 snapshot.
- **Jammu & Kashmir is undivided** — the 2019 reorganisation into J&K and Ladakh
  hadn't happened.

These are not errors to fix. The map is a 2011 snapshot.

## Zero versus no data

Nagaland, Lakshadweep and the Andaman & Nicobar Islands record **exactly zero**
Scheduled Castes. Mizoram records 0.11%. Arunachal Pradesh is near zero. This is
a substantive finding — the subordinate stratum in those places is classified
Scheduled Tribe instead — so rendering it as missing data would hide it. Zero
and no-data get separate colours and separate legend rows, and the validator
asserts the zeros are exactly zero.

## What is deliberately not mapped

The source CSV has 118 columns. 35 are kept. The rest are household-size,
married-couples and income-bracket breakdowns whose measured correlation with
caste composition is around zero:

| | r with SC share |
|---|---|
| literacy rate | +0.04 |
| households with internet | +0.01 |
| electric lighting | −0.01 |
| car / jeep / van | −0.01 |
| income below Rs 45,000 | −0.07 |

Those near-zero numbers are the most important thing in this file. They do not
mean caste has no bearing on literacy or income. They mean **this table measures
districts, and caste disadvantage lives inside districts.** The Primary Census
Abstract does not break its figures out by caste, so no map built from it can
show how SC people fare — only where they are.

The fix is the PCA-SC and PCA-ST tables, which compute the same abstract for the
SC and ST populations alone. Getting those is the top item on the roadmap.

## Correlations quoted in the app

Pearson r across the 640 districts, computed from the shipped table.

| Indicator | r with SC share |
|---|---|
| ST share | **−0.61** |
| Christian share | −0.45 |
| Hindu share | +0.44 |
| Sikh share | +0.37 |
| handpump / borewell water | +0.27 |
| agricultural labourers | +0.23 |
| dilapidated housing | +0.20 |
| male−female literacy gap | +0.19 |
| Buddhist share (national) | −0.19 |
| Buddhist share (within Maharashtra) | **+0.60** |
| Muslim share | −0.20 |
| cultivators | −0.17 |

Every one of these is between **districts**, not between **people**. A district
with many agricultural labourers and many SC residents is not by itself evidence
that those are the same people — though other sources establish that they
largely are. Treating a between-place correlation as a between-person one is the
ecological fallacy, and this dataset invites it constantly.
