# Hatchling

A 3D browser game about the whole life of a female sea turtle, set on Casey Key in Nokomis, Florida. She hatches on a moonlit beach, survives the run to the sea, grows up across a vast ocean, joins a great gathering of turtles, finds a mate, and carries her eggs home to the exact beach where she was born. Her hatchlings run to the sea and the loop closes.

Everything is procedural: every turtle, fish, coral, human, gull, boat and wave is built from geometry and custom shaders, and every sound and note of music is synthesized live with the Web Audio API. No models, textures or audio files.

## Run it

Requires Node 18 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173, choose a species, name her, and click **Begin her life**. Headphones recommended. Desktop only (mouse and keyboard).

Production build:

```bash
npm run build
npm run preview
```

## Controls

| Input | On land | In the water |
| --- | --- | --- |
| Mouse | Look around | Steer |
| W A S D | Crawl | W swims, S brakes, A D turn |
| Shift | Scramble | Dash (with cooldown) |
| Space | Act (crack, dig, lay) | Rise |
| Ctrl or C | | Dive |
| Esc | Pause | Pause |

Swimming is momentum based: each flipper stroke surges forward and then glides. The body banks into turns and pitches into climbs and dives. Burst through the surface fast enough and she breaches.

## The eight chapters

1. **Hatching.** Crack the egg and wriggle out of the nest under the moon on Casey Key.
2. **The Run to the Sea.** Dodge diving gulls (watch for their shadows), sideways-scuttling ghost crabs and the huge feet of oblivious beachgoers. Porch lights on the dune houses pull hatchlings inland; follow the moon over the Gulf. Pick up fossil shark teeth and sea glass on the way.
3. **Breaking the Surf.** Dive under breaking waves, ride the pull between them and escape a riptide. The sun rises over the key behind you.
4. **Growing Up.** Four seamless zones: Casey Key Reef, the Sargassum Line (the lost years), the Open Gulf and the Florida Escarpment. Food in your diet sparkles and keeps turning up near you. The goal line tells you how many meals until your next stage, and a compass points to the next zone once you outgrow one. Along the way: a ghost net drifts in, bottlenose dolphins pass by, currents speed you up, and in the dark deep a shark circles above.
5. **The Gathering.** Sixty turtles of all five species flock around you (boids). Lead them until the harmony meter fills.
6. **Finding a Mate.** A short courtship dance, circling and rising together toward the light.
7. **The Journey Home.** Follow the magnetic shimmer and compass home as the sun sets over the Gulf. Dive under boat lanes (a red edge glow warns of an incoming hull), avoid gill nets, and free a young Kemp's Ridley trapped in a ghost net.
8. **Nesting.** Crawl up the same beach, dig, lay and cover the nest. Sixty nights later, a new wave of hatchlings races to the sea. The results screen shows how many of her siblings made it.

## Species

| Species | Character | Diet | IUCN status |
| --- | --- | --- | --- |
| Loggerhead | Biggest head, crushing bite. Casey Key's most common nester | Crabs, shrimp, conch | Vulnerable |
| Green turtle | Balanced | Anything when young, then seagrass and algae | Least Concern, recovering |
| Leatherback | Largest and fastest, deepest diver, slow to turn. Seven ridges on her back | Jellyfish only | Vulnerable |
| Hawksbill | Most agile, hooked beak, overlapping tortoiseshell scutes | Sponges and sea squirts | Critically Endangered |
| Kemp's Ridley | Smallest, quickest to react, round flat shell | Crabs and shrimp | Critically Endangered |

Food in your diet gives full growth, other food gives little or none. The HUD shows your current diet (it changes as a green turtle grows).

## Tech

- [Vite](https://vite.dev), [Three.js](https://threejs.org) and [postprocessing](https://github.com/pmndrs/postprocessing) (depth of field, bloom, ACES tone mapping, a per-zone color grade with an underwater wobble, grain and vignette).
- Instancing for coral, kelp, fish schools, food, the turtle crowd and school, eggs, particles and contact shadows.
- Custom shaders: caustics on the seabed and shells, species shell patterns (scute Voronoi, tortoiseshell flames, leatherback ridges), Snell's window water surface, glowing surf foam, god rays, marine snow, bioluminescence.
- Adaptive resolution keeps the frame rate near 60 fps.

## Code layout

```
src/
  main.js              game loop, shared systems, player events, results
  species.js           species looks, stats and diets; food types and icons
  core/                math and noise, shader helpers, input, postprocessing
  world/               terrain, water, sky, atmosphere (zones, fog, grading),
                       reef, kelp, beach props, particles, god rays, shells,
                       currents, vents, contact shadows
  player/              turtle model and rig, player controller, camera rig
  creatures/           fish, food, jellyfish, sharks, anglerfish, whale,
                       gulls, crabs and humans, boats and nets, turtle crowd
  chapters/            the eight chapters
  audio/               procedural ambience, music and sound effects
  ui/                  HUD, cards, menus and styles
```

## Debug

Append `?ch=N&nolock` to the URL to jump straight to a chapter (0 to 7) without pointer lock, for example `/?ch=3&nolock`. Add `&sp=leatherback` to pick a species.
