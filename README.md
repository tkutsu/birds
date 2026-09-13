# Bird Migration Radar

Animated map of nocturnal bird migration over Europe, built from weather-radar
bird density profiles.

Radars watching for rain also pick up the birds flying through the beam. About
two hundred European radars publish what they see to
[Aloft](https://aloftdata.eu) (ENRAM) under CC0, and nothing renders it as a
map, so this does.

## Running it

```sh
pnpm install
pnpm build:data   # fetches Aloft, writes public/data/nights.json
pnpm dev
```

`pnpm build` runs `build:data` and then `next build` into `out/`. No server, no
database.

| Variable | Default | Effect |
|---|---|---|
| `NIGHT_COUNT` | `1` | how many recent nights to bake |
| `NIGHT_DATES` | | specific evenings instead, e.g. `2023-10-16` |
| `MIN_SEPARATION_KM` | `150` | minimum spacing between selected radars |
| `MAX_RADARS` | `60` | cap on radars, and so on download size |

## How it works

`scripts/build-data.ts` picks the most recent night that enough radars covered
end to end, thins the network to stations at least 150 km apart, then
integrates height away. A 25-bin vertical profile every 5 to 15 minutes becomes
four numbers per radar per timestamp: column density (VID, birds per sq km)
sets how many birds are drawn, mean velocity sets where they fly.

Raw VPTS is about 1.5 MB per radar per day. Integrating collapses a
continent-wide night into 140 KB of JSON, so the browser never sees a profile.

The client interpolates those points into a continuous field (inverse-distance,
220 km influence) and draws birds over Leaflet in proportion to it. Past 220 km
from any radar the coverage weight reaches zero and the birds thin out to none,
so a hole in the network looks like a hole rather than like an empty sky.

## Caveats

Radar bird density is a retrieval, not a count. Insects, rain and ground
clutter contaminate it. Coverage is far denser in the Low Countries and Germany
than in Iberia or the Balkans, and a few radars report density with no usable
velocity, so their birds flap in place.

Some radars report almost nothing every night, even when their neighbours are
busy. Several German stations read under 1 bird per sq km on nights when Den
Helder saw 55. A quiet Germany on the map is more likely the feed than the sky.

Birds drawn scale linearly with birds aloft, up to 150 per sq km, and the scale
is not stretched to each night, so a quiet night looks quiet.

## Data

[aloftdata.eu](https://aloftdata.eu), CC0. Radar positions from the OPERA radar
database. Base map: Esri World Gray Canvas.
