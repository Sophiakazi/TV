# TV

An Apple-style home screen for an LG webOS TV, and a phone remote that runs on a Mac.

- **`tv-home/`** is the TV app (a packaged webOS web app). It has:
  - a Liquid Glass clock with the date and Hijri date, weather, and an app shelf (Netflix, Disney+, Prime Video, YouTube, ITVX, BBC iPlayer, Fire Stick, PlayStation, Switch, Content Store, Settings)
  - a second page with Continue watching, Top picks, Because you watched, Recommended this week and the Netflix Top 10, with trailer previews
  - a third page for the HDMI inputs, plus a photo screensaver and a No Signal screen
- **`tv-remote/`** is a small Node server and the phone remote page. The remote covers:
  - the d-pad, volume, apps, inputs, typing and a trackpad
  - the TV's background, clock style and app icon style
  - the Continue watching list
  The server also gathers the show data the TV displays.

## Run the remote (on the Mac)

```bash
cd tv-remote
npm install
node server.js
```

Open the address it prints on your phone (same Wi-Fi). The first time, accept the pairing request on the TV.

The show rows need a free TMDB key. Put your TMDB "API Read Access Token" in `tv-remote/.tmdb-key`. That file is never committed.

## Install on the TV

1. Install LG's **Developer Mode** app on the TV and switch Dev Mode on.
2. Package the app:

   ```bash
   npx -y -p @webos-tools/cli ares-package tv-home -o tv-home-install
   ```

3. Install the `.ipk` with `ares-install` (from the same tools).

The TV page talks to the remote server at the address in `REMOTE_URL` in `tv-home/index.html`. You can also open the page with `?remote=http://YOUR_MAC_IP:8787`.

## Not in this repo

- Keys and personal data: `.tmdb-key`, `.tv-key` (TV pairing), `config.json` and `watching.json`.
- Apple's Tahoe wallpaper, which belongs to Apple. To use it, add your own copies as `tv-home/assets/bg/tahoe-dawn.jpg`, `tahoe-day.jpg`, `tahoe-dusk.jpg` and `tahoe-night.jpg`.

## Credits

- Background photos are from Wikimedia Commons, under CC BY-SA 2.0 to 4.0, CC BY 4.0 and CC0. They have been resized and cropped to 3840×2160.
  - Each photographer is credited in `BG_IMAGES` in `tv-home/index.html`, and the credit shows on screen.
  - Source links for the newer photos are in [CREDITS.md](CREDITS.md).
- Fonts are licensed under the SIL Open Font License 1.1:
  - Barlow Condensed, © 2017 The Barlow Project Authors
  - Nunito, © 2014 The Nunito Project Authors
  - Oswald, © 2016 The Oswald Project Authors
- Show data comes from TMDB, TVMaze and Netflix's Top 10 lists. This product uses the TMDB API but is not endorsed or certified by TMDB.
- Weather comes from Open-Meteo.
- App names and logos belong to their owners. This is a personal project and is not affiliated with LG, Apple, Netflix, Disney, Amazon, Google, the BBC, ITV, Sony or Nintendo.
