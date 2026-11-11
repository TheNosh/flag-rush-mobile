# Flag Rush Mobile

Flag football (IFAF 5-tegen-5) in 3D voor je telefoon, gebouwd met [Three.js](https://threejs.org) en [Vite](https://vite.dev).
Dit is de mobiele variant van Flag Rush 3D: dezelfde spelregels en dezelfde 3D-spelers (Mixamo), met touchbesturing en een lichtere weergave.

Spelen: https://thenosh.github.io/flag-rush-mobile/ (zet je telefoon liggend).

## Besturing op de telefoon

- **Linkerduim:** stuur. De stick verschijnt waar je het scherm in de linkerhelft aanraakt. In de menu's gebruik je hem om te kiezen.
- **Rechterduim:** de knoppen, met dezelfde indeling als de PlayStation-controller.

| Knop | Actie |
|---|---|
| âœ• | Snap, bevestigen, gooien naar ontvanger X |
| â—¯ | Spin, terug, gooien naar ontvanger â—¯ |
| â–¡ | Juke, gooien naar ontvanger â–¡ |
| â–³ | Hesitation, audible, gooien naar ontvanger â–³ |
| R2 (rechts naast ✕) | Sprinten zolang je de knop vasthoudt (kost stamina) |
| R1 | QB: bal weggooien |
| L1 | Verdediging: wissel naar de speler bij de bal |
| II | Pauze / volgende play (Options) |
| CAM | Camera wisselen (achter offense / achter defense / boven) |

Een Bluetooth-controller (PlayStation, Xbox) werkt ook, net als het toetsenbord op een computer.

### Als app op je beginscherm

- **Android (Chrome):** menu, *App installeren*.
- **iPhone (Safari):** delen, *Zet op beginscherm*. Daarna start het spel in volledig scherm, zonder adresbalk.

## Wat is anders dan de desktopversie

- Touchbesturing (`src/input/touch.js`): zwevende stick, schermknoppen, meerdere vingers tegelijk, trillen bij een druk.
- Lichtere weergave op telefoons: geen MSAA, lagere resolutie (pixelratio maximaal 1,5), schaduwkaart van 1024 en twee lichtmasten in plaats van vier. De dynamische resolutie verlaagt de 3D-resolutie verder als de framerate zakt (zie de fps-teller rechtsonder).
- Staand scherm toont een melding om de telefoon te draaien.
- Play Maker (eigen plays tekenen) is voor de muis gemaakt en werkt op de telefoon niet handig; de 18 vaste plays wel.

## Lokaal starten

Vereist [Node.js](https://nodejs.org) 20.19 of nieuwer (LTS).

```bash
npm install
npm run dev
```

Open het adres dat Vite toont. Voeg `?touch` toe aan het adres om de schermbesturing ook op een computer te zien
(bijvoorbeeld http://localhost:5173/?touch). Een productiebuild maak je met `npm run build` (map `dist/`).
Op je eigen telefoon testen kan met `npm run dev -- --host`; open dan het netwerkadres dat Vite toont.

## Projectstructuur

```
src/
  config.js            veldmaten en bewegingsconstanten
  data/                teams, plays, dekkingen
  game/                spellogica, GEEN rendering
  input/
    input.js           controller, toetsenbord en touch samengevoegd tot Ã©Ã©n invoerlaag
    touch.js           virtuele stick en schermknoppen
  render/              alles wat getekend wordt (scene, veld, stadion, spelers, bal, camera, 2D-overlay)
  main.js              koppelt alles aan elkaar
public/                textures, teamlogo's, spelermodel (Mixamo), app-manifest en iconen
tools/mixamo-to-glb.mjs  bouwt public/models/player.glb uit Mixamo-FBX-bestanden
```

## Assets en licenties

| Asset | Bron | Licentie |
|---|---|---|
| Gras-texturen `leafy_grass` (diffuse, normal, roughness, 1k) | [Poly Haven](https://polyhaven.com/a/leafy_grass) | CC0 |
| Three.js | https://threejs.org | MIT |
| Vite | https://vite.dev | MIT |
| Lettertypen Saira Condensed en Barlow (via Google Fonts) | Google Fonts | SIL OFL 1.1 |
| Spelermodel (X Bot) en animaties `public/models/player.glb` | [Mixamo](https://www.mixamo.com) (Adobe) | Mixamo-voorwaarden: gratis te gebruiken in projecten, ook commercieel; de ruwe FBX-bestanden staan niet in de repository en mogen niet los worden doorgegeven |
| Teamlogo's (`public/logos`) | aangeleverd door de eigenaar (afkomstig van tournifyapp.com) | rechten bij de teams / eigenaar |

## Publiceren op GitHub Pages

De workflow `.github/workflows/deploy.yml` bouwt en publiceert bij elke push naar `main`. Zet in de repository onder
*Settings, Pages* de bron op *GitHub Actions*. De site draait op `https://<gebruiker>.github.io/<repo>/` (`base: './'` in `vite.config.js`).

