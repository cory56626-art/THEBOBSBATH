# Wildlight Realism Ultra

A high-quality **Minecraft Bedrock Vibrant Visuals** resource pack for Cory's high-end Windows PC. The art direction is natural and cinematic: neutral daylight, restrained sunsets, realistic material response, and intentionally dark nights and caves.

**Target:** stable Bedrock **26.50** (internal version **1.26.50**, based on Mojang's stable sample release dated September 15, 2026). This pack uses the `pbr` capability, not Java shader code or a modified RenderDragon client.

## Install

The finished **Wildlight-Realism-Ultra.mcpack** is delivered directly in the ChatGPT conversation. You do not need to build the source to use that file.

1. Open the `.mcpack` with Minecraft and wait for the import to complete.
2. Edit your world → **Resource Packs → My Packs → Wildlight Realism Ultra → Activate**.
3. Put it above other packs that change lighting or block textures.
4. Select **Settings → Video → Graphics Mode → Vibrant Visuals** and favor visual quality.
5. Reload the world. Bring torches: dark caves are intentional.

## Included

- **248 original 512 × 512 material surfaces**, each with an albedo, normal map and RGBA metalness/emission/roughness/subsurface map.
- Stone and deepslate, masonry, earth and sand, wood grain and end grain, alpha-cutout leaves, metals and oxidation, ores, gemstones, snow, ice, concrete, terracotta and woven wool.
- **89 explicit stable biome bindings**, preserving biome sound and other unrelated client settings.
- Natural sun/moon lighting curves and a very low ambient-light floor; night skylight is deliberately reduced.
- ACES tone mapping, soft shadows, neutral white balance and restrained saturation.
- Six water profiles with 28-octave waves and consistent animated caustics; clear, ocean, tropical, cold, river and swamp water differ in depth, motion and suspended particles.
- Atmospheric scattering, height-based haze, colored local lights, and separate cave, Nether and End lighting.

The material maps are procedurally authored from original recipes. They are **not photographs or scanned materials**. The pack overhauls common terrain and building surfaces; blocks outside this collection, mobs, items and the UI retain their vanilla appearance. It is not a replacement for every Minecraft texture.

## What has been verified

`validate.py` checks the actual generated resources: manifest/version/capability, UUID uniqueness, JSON syntax and duplicate keys, supported configuration fields and numeric ranges, all biome bindings, vanilla texture names, complete texture references, PNG channels and dimensions, normal-vector integrity, metalness/subsurface conflicts and cross-biome blending constraints. Packaging also runs a ZIP CRC check.

**Minecraft itself is not installed in the build environment. Import behavior, the final in-game appearance and FPS have not been tested in Bedrock.** The first PC test should check daylight, sunset, midnight, an unlit cave with one torch, water seen from above and below, a biome boundary, transparent leaves, Nether lighting and the End. Turn on the Creator Content Log GUI to capture exact errors if the game reports any.

Vibrant Visuals' screen-space reflection limitations still apply, including missing reflections for off-screen objects. Normal maps add shading detail, not geometric displacement. This pack cannot increase the engine's shadow resolution, add unsupported post-processing or guarantee a frame rate. The source freezes frame indices for the few overridden animated block surfaces so they do not sample outside a static texture; vanilla water/lava/fire animations remain intact.

## Rebuild offline

Python 3.12 or newer is recommended. Once the dependencies are installed, the build makes no network requests.

```sh
cd minecraft/wildlight-realism
python -m pip install -r requirements.txt
python build.py --size 512 --jobs 4
```

Outputs go into `dist/`:

- `Wildlight-Realism-Ultra.mcpack` — importable pack with `manifest.json` at archive root.
- `INSTALL.txt` — installation, limitations and troubleshooting.
- `validation.json` and `build-report.json` — validation and coverage records.
- `SHA256SUMS.txt` — checksum for the delivered file.

The build is seeded by texture name and uses fixed pack UUIDs and archive timestamps. `--size 256` can rebuild smaller maps, but the delivered Ultra build is 512. Increment both manifest versions in `build.py` when publishing an update. Keep the UUIDs so Minecraft can recognize updates.

## Source layout

| File | Purpose |
| --- | --- |
| `materials.py` | Periodic procedural material recipes and PBR map export |
| `catalog.py` | Exact vanilla texture paths and material palettes |
| `rendering.py` | Lighting, sky, color grading, water, fog and biome assignments |
| `build.py` | Manifest, registry, icon, full build and `.mcpack` packaging |
| `validate.py` | Checks on the generated pack |
| `source/` | Stable vanilla metadata used to preserve compatibility |

## Primary technical references

- [Vibrant Visuals resource packs](https://learn.microsoft.com/en-us/minecraft/creator/documents/vibrantvisuals/vvresourcepacks)
- [Light sources and local lighting](https://learn.microsoft.com/en-us/minecraft/creator/documents/vibrantvisuals/lightingcustomization)
- [Biome overrides](https://learn.microsoft.com/en-us/minecraft/creator/documents/vibrantvisuals/biomecustomization)
- [Water customization](https://learn.microsoft.com/en-us/minecraft/creator/documents/vibrantvisuals/watercustomization)
- [Color grading and tone mapping](https://learn.microsoft.com/en-us/minecraft/creator/documents/vibrantvisuals/colorgradingtonemappingcustomization)
- [Texture sets](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/texturesetsreference/texturesetsconcepts/texturesetsintroduction)
- [Mojang stable Bedrock samples](https://github.com/Mojang/bedrock-samples)

See `THIRD_PARTY.md` for metadata provenance. This is an unofficial fan resource pack, not an official Minecraft product.
