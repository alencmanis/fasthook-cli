# fasthook-cli

Local tunnel CLI for Fasthook CLI destinations.

## Run locally

```bash
npm install
npm run build
npx . --help
```

This package exposes a `fasthook` bin, so `npx .` runs the local CLI from this repo.

## Login

```bash
npx . login --api-key fhp_xxx
```

You can store the default CLI destination in the same config file:

```bash
npx . config --destination des_xxx
```

This stores credentials in `~/.fasthook/config.json`.

## Start a tunnel

```bash
npx . tunnel --destination des_xxx --to 8080
```

If `destination` is saved in config, run the tunnel without arguments. It defaults to `http://localhost:8080`, matching `fasthook-log`:

```bash
npx . tunnel
```

You can also pass the default target explicitly:

```bash
npx . tunnel 8080
```

The local target is runtime-only. Fasthook stores the CLI destination path in the cloud destination config and appends it to this target. For example, a destination path of `/webhooks/orders` with the default tunnel forwards to `http://localhost:8080/webhooks/orders`.

The tunnel prints connection state, immediate failed delivery lines, and periodic aggregate stats. For every delivery, add `--verbose`; for only connection-level logs, add `--quiet`.

During development, if the tunnel worker is not yet routed to `https://tunnel.fasthook.io/connect`, pass it explicitly:

```bash
npx . tunnel --destination des_xxx --to http://localhost:8080 --tunnel-url https://your-tunnel-worker.workers.dev/connect
```

Environment variables are also supported:

```bash
FASTHOOK_API_KEY=fhp_xxx
FASTHOOK_DESTINATION_ID=des_xxx
FASTHOOK_LOCAL_URL=http://localhost:8080
FASTHOOK_TUNNEL_URL=https://tunnel.fasthook.io/connect
```

## Commands

```bash
npx . config
npx . logout
npx . --help
```
