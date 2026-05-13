# fasthook-cli

Local tunnel CLI for Fasthook CLI destinations.

## Install

```bash
npm install
npm run build
```

For local development you can expose the `fasthook` command:

```bash
npm link
fasthook --help
```

## Login

```bash
node dist/index.js login --api-key fhp_xxx
```

With `npm link`:

```bash
fasthook login --api-key fhp_xxx
```

This stores credentials in `~/.fasthook/config.json`.

## Start a tunnel

```bash
node dist/index.js tunnel --destination des_xxx --to http://localhost:3000
```

With `npm link`:

```bash
fasthook tunnel --destination des_xxx --to http://localhost:3000
```

The tunnel prints connection state, immediate failed delivery lines, and periodic aggregate stats. For every delivery, add `--verbose`; for only connection-level logs, add `--quiet`.

During development, if the tunnel worker is not yet routed to `https://tunnel.fasthook.io/connect`, pass it explicitly:

```bash
node dist/index.js tunnel \
  --destination des_xxx \
  --to http://localhost:3000 \
  --tunnel-url https://your-tunnel-worker.workers.dev/connect
```

Environment variables are also supported:

```bash
FASTHOOK_API_KEY=fhp_xxx
FASTHOOK_DESTINATION_ID=des_xxx
FASTHOOK_LOCAL_URL=http://localhost:3000
FASTHOOK_TUNNEL_URL=https://tunnel.fasthook.io/connect
```

## Commands

```bash
node dist/index.js config
node dist/index.js logout
node dist/index.js --help
```
