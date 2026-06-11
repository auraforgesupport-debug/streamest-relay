# WebRTC Privacy

Streamest now uses TURN-only WebRTC:

```js
iceTransportPolicy: "relay"
```

That means video connections must go through a TURN server instead of connecting directly peer-to-peer.

## Required App Fields

In Streamest, fill in:

```text
TURN URL
TURN username
TURN password
```

Example TURN URL formats:

```text
turn:turn.example.com:3478
turns:turn.example.com:5349
```

You can enter multiple TURN URLs separated by commas.

## Important

Supabase handles live profiles and signaling. TURN handles WebRTC media privacy. Without valid TURN settings, streaming and watching are blocked on purpose.
