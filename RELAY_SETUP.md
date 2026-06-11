# Streamest Relay Setup

Streamest can hide the streamer's IP from the app UI by using a hosted relay server and stream codes.

## Run a Relay Server

On a cloud server or hosting platform that supports Node.js:

```powershell
npm install
npm run relay
```

The relay listens on `PORT` when that environment variable is set, otherwise it uses `3789`.

## Host on Render

1. Put this project on GitHub.
2. Go to `https://dashboard.render.com`.
3. Click `New` > `Web Service`.
4. Connect the GitHub repo.
5. Use these settings:

```text
Build Command: npm install
Start Command: npm run relay
Health Check Path: /health
```

The included `render.yaml` has the same settings for Render Blueprint deploys.

After deploy, Render gives you a URL like:

```text
https://streamest-relay.onrender.com
```

Paste that URL into the Streamest app's `Relay server` field.

## JSON Storage

The relay stores prototype data in:

```text
data/streamest-state.json
```

You can choose another file path with:

```powershell
$env:STREAMEST_DATA_FILE="C:\streamest\streamest-state.json"
npm run relay
```

This JSON file stores profiles and the current live directory. WebSocket connections and video peer connections still stay in memory because they cannot be stored in JSON.

## Use It in the App

1. Open Streamest.
2. Enter the hosted relay URL in `Relay server`, for example `https://relay.yourdomain.com`.
3. Click `Go live`.
4. Copy the stream code.
5. Viewers open Streamest, enter the same relay URL and stream code, then press the stream card.

## Important Privacy Note

The relay server hides your local network address from the Streamest UI and handles stream discovery by code. For full IP protection at the WebRTC media layer, add TURN relay credentials or an SFU/media server and force relayed media transport. Without TURN/SFU, direct WebRTC paths can still expose network candidates.
