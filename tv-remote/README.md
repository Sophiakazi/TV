# TV Remote (LG webOS)

A phone remote for your LG TV: d-pad, volume, channels, apps (Netflix, Disney+, Prime Video, YouTube), TV settings, HDMI inputs, search and typing, power.

## Start it (on your Mac, same Wi-Fi as the TV and your phone)

    cd tv-remote
    node server.js

It prints an address like `http://192.168.1.50:8787`. Open that on your phone. Add it to your Home Screen for an app-like icon.

## First-time pairing

1. On the TV: Settings -> General -> Network -> your connection -> Advanced, and note the IP address.
2. On the phone screen, enter that IP and tap Connect.
3. Accept the request that appears on the TV. This is only needed once.

## Turning the TV on

Tap = off. Press and hold the power button = on. Needs Wake on LAN switched on in the TV settings
(Settings -> General -> Devices -> External Devices -> TV On With Mobile, or "Mobile TV On" on older models).
The remote learns the TV's MAC address after the first connection.

## Good to know

- Anyone on your Wi-Fi who opens the address can use the remote. Don't expose it to the internet.
- It can't change picture/sound settings directly (LG blocks that); the gear button opens the TV's own settings.
- "Search" opens the TV's web browser on a search page. Use "Type on TV" to fill in the search box inside an app.
- The Mac must be on and running the server while you use the remote. Run `./autostart.sh` once and it starts by itself whenever you log in (`./autostart.sh off` stops that).
