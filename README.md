# Drivefolio — Dawn Edition

A full-screen, ground-level driving résumé inspired by the user's FF 91 VR
reference. The miniature map and procedural toy car have been replaced by a
prebuilt **Ferrari 458 Italia**, glossy Rosso red paint, physical environment
reflections, CC0 asphalt PBR textures, and a photographic dawn environment.
Six tall, scattered chapter posts and octagonal STOP signs reveal résumé
sections when you drive close.

The marker layout is now 2.4 times wider, with a rescaled minimap. The
navigation area is a soft boundary only: you can drive anywhere without
being clamped or slowed. A non-blocking message indicates that you are outside
the résumé area, and the textured ground continues beneath you.
The imported car is rotated 180° to align its
nose with the driving direction; both guided driving and W/up-arrow now move
forward. Guided travel uses real metres per second, keeping wheel rotation
consistent with vehicle motion.

The paint remains glossy, with softened clearcoat and controlled reflections
instead of the previous mirror-like amplification. Front-wheel
steering uses separate pivots from wheel rotation, including while parked.
Headlights have emissive projectors, clear lamp covers, subtle glow, and two
forward light beams; black carbon/plastic/rubber materials remain dark rather
than inheriting the converted asset's light-gray colors.
Rear LED arrays stay red without HDR/tone-mapping color shifts, and their
covers are separated from window tint. Brake discs use brushed-steel materials;
red caliper details stay fixed to the steering knuckles instead of spinning.

## Open on your PC

Download **drivefolio-refined.html** and double-click it. Use Chrome, Edge,
or Firefox with **WebGL 2 / graphics acceleration enabled**. No installation,
internet connection, CDN, local server, account, or API key is needed.

The entire production document is self-contained, including the car, ground
color/normal/roughness maps, HDR panorama, and Draco worker/WebAssembly decoder.
If WebGL 2 is unavailable, the page explicitly says so and offers the résumé
reading view. It does **not** substitute the previous cartoon scene or pretend
that realistic 3D rendered successfully.

## Add your résumé

Edit **`src/resume.ts`**. Replace the labeled sample copy with your information,
add optional HTTPS/mailto links, and set `profile.isTemplate` to `false`.
No personal résumé information was supplied, so existing entries are placeholders.

## Develop

Requires Node.js 20.19 or later:

```sh
npm install
npm run dev
```

```sh
npm run build
npm run preview
```

The output is one file: `dist/index.html`. Bun is only required for
`npm test`, the included physics and safe-link unit tests.

## Controls

- **WASD / arrows**: accelerate, reverse, steer.
- **Space**: brake. **R**: reset car and camera.
- **Drag the scene**: orbit around the real car. **Wheel / pinch**: zoom.
- **Camera button / C**: switch follow and orbit modes.
- **V**: return to the default rear three-quarter camera.
- **Fullscreen button**: enter/leave fullscreen when supported.
- Drive near a tall sign: open that résumé chapter.
- **Escape / close**: dismiss a chapter. It will not reopen until you leave.
- **Guided drive**: follows an invisible route through all six markers.
- Navigation and minimap markers jump directly to sections.
- Touch driving controls appear on narrow screens.
- Outside-area warnings do not brake, turn, or restrict your car.
- Headlights are on automatically.
- **View résumé**: complete accessible reading view, no driving required.

## Credits

See **`ASSET_CREDITS.md`** and the in-page credits dialog. The Ferrari model
is by vicent091036, CC BY 4.0, supplied by the official Three.js project.
Asphalt 02 and Kiara 1 Dawn are CC0 assets from Poly Haven. No Faraday Future
code, model, or branding was copied.

## Verification limitation

The sandbox's headed and headless managed browsers cannot create a WebGL 2
context. Asset decoding, offline file loading, UI, navigation, and physics
can be tested here; the photorealistic GPU render must be checked on a
WebGL-capable PC. The page reports this condition explicitly rather than
claiming a successful 3D render.
