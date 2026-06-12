# Streamest Friends Mode

This build is meant for a small trusted group.

## What It Does

- Uses Supabase Realtime for live profiles and signaling.
- Shows no IP address in the app UI.
- Uses free STUN servers for WebRTC.
- Does not require a TURN server.

## Privacy Tradeoff

The app does not display IP addresses, but WebRTC can still create direct peer-to-peer connections under the hood. For a small trusted group, this is simpler and usually fine for testing.

For stronger privacy later, switch back to TURN-only WebRTC or use an SFU/media server.
