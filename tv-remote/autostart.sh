#!/bin/bash
# Keeps the TV remote server running on this Mac: it starts when you log in, and restarts if it stops.
#
#   ./autostart.sh           turn it on (run it again if you move this folder or reinstall Node)
#   ./autostart.sh off       turn it off
#   ./autostart.sh restart   restart the server, e.g. after editing backgrounds.json
#   ./autostart.sh status    show whether it's running
#
# The server's messages go to ~/Library/Logs/tv-remote.log (you can open it in the Console app).
set -euo pipefail

LABEL="com.sophia.tv-remote"
DIR="$(cd "$(dirname "$0")" && pwd -P)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/tv-remote.log"
DOMAIN="gui/$(id -u)"
PORT="${PORT:-8787}"

esc() { local s=${1//&/&amp;}; s=${s//</&lt;}; s=${s//>/&gt;}; printf '%s' "$s"; }
loaded() { launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; }
unload() {
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  for _ in $(seq 1 40); do loaded || return 0; sleep 0.25; done
}

case "${1:-on}" in
  on)
    NODE="$(command -v node || true)"
    [ -n "$NODE" ] || { echo "Can't find node. Install Node.js first (brew install node)."; exit 1; }
    if ! loaded && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "Something is already using port $PORT, probably the server started by hand."
      echo "Stop that one first (Ctrl+C in its window), then run this again."
      exit 1
    fi
    mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
    unload
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(esc "$NODE")</string>
    <string>$(esc "$DIR/server.js")</string>
  </array>
  <key>WorkingDirectory</key><string>$(esc "$DIR")</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(esc "$(dirname "$NODE")"):/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$(esc "$LOG")</string>
  <key>StandardErrorPath</key><string>$(esc "$LOG")</string>
</dict>
</plist>
EOF
    plutil -lint -s "$PLIST"
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "On. The remote server now starts by itself when you log in."
    echo "Its messages go to $LOG"
    ;;
  off)
    unload
    rm -f "$PLIST"
    echo "Off. To run the server by hand: node server.js"
    ;;
  restart)
    loaded || { echo "It isn't on. Run ./autostart.sh to turn it on."; exit 1; }
    launchctl kickstart -k "$DOMAIN/$LABEL"
    echo "Restarted."
    ;;
  status)
    if loaded; then launchctl print "$DOMAIN/$LABEL" | grep -E "^\s(state|pid|last exit code) =" || true
    else echo "Off."; fi
    ;;
  *)
    echo "Use: ./autostart.sh [on|off|restart|status]"; exit 1 ;;
esac
