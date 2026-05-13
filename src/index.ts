#!/usr/bin/env node
import { parseCliArgs, getBooleanFlag, getStringFlag } from "./args.js";
import { DEFAULT_TUNNEL_URL, deleteConfig, getConfigPath, loadConfig, maskSecret, saveConfig } from "./config.js";
import { runTunnel } from "./tunnel.js";
import type { FasthookConfig } from "./types.js";

function printHelp(): void {
  console.log(`fasthook CLI

Usage:
  fasthook login --api-key fhp_xxx [--tunnel-url https://tunnel.fasthook.io/connect]
  fasthook tunnel --destination des_xxx --to http://localhost:3000
  fasthook config
  fasthook logout

Options:
  -d, --destination   CLI destination id, for example des_xxx
  -t, --to            Local target URL, for example http://localhost:3000
      --api-key       Project API key. Can also use FASTHOOK_API_KEY.
      --tunnel-url    Tunnel worker connect URL. Can also use FASTHOOK_TUNNEL_URL.
  -v, --verbose       Print per-delivery logs.
  -h, --help          Show help.
`);
}

function requireValue(value: string | null, message: string): string {
  if (!value) throw new Error(message);
  return value;
}

function pickTunnelUrl(flags: Record<string, string | boolean>, config: FasthookConfig): string {
  return (
    getStringFlag(flags, "tunnel-url") ??
    process.env.FASTHOOK_TUNNEL_URL?.trim() ??
    config.tunnelUrl ??
    DEFAULT_TUNNEL_URL
  );
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (!parsed.command || getBooleanFlag(parsed.flags, "help")) {
    printHelp();
    return;
  }

  const config = await loadConfig();
  const command = parsed.command.toLowerCase();

  if (command === "login") {
    const apiKey = getStringFlag(parsed.flags, "api-key") ?? parsed.positionals[0]?.trim() ?? null;
    const nextConfig: FasthookConfig = {
      ...config,
      apiKey: requireValue(apiKey, "API key is required. Use: fasthook login --api-key fhp_xxx"),
      tunnelUrl: pickTunnelUrl(parsed.flags, config)
    };
    await saveConfig(nextConfig);
    console.log(`Saved credentials to ${getConfigPath()}`);
    return;
  }

  if (command === "logout") {
    await deleteConfig();
    console.log(`Removed ${getConfigPath()}`);
    return;
  }

  if (command === "config") {
    console.log(`Config: ${getConfigPath()}`);
    console.log(`API key: ${maskSecret(config.apiKey)}`);
    console.log(`Tunnel URL: ${config.tunnelUrl ?? DEFAULT_TUNNEL_URL}`);
    if (config.defaultLocalUrl) console.log(`Default local URL: ${config.defaultLocalUrl}`);
    return;
  }

  if (command === "tunnel") {
    const apiKey =
      getStringFlag(parsed.flags, "api-key") ?? process.env.FASTHOOK_API_KEY?.trim() ?? config.apiKey ?? null;
    const destinationId =
      getStringFlag(parsed.flags, "destination") ?? process.env.FASTHOOK_DESTINATION_ID?.trim() ?? parsed.positionals[0]?.trim() ?? null;
    const localUrl =
      getStringFlag(parsed.flags, "to", "local-url") ??
      process.env.FASTHOOK_LOCAL_URL?.trim() ??
      parsed.positionals[1]?.trim() ??
      config.defaultLocalUrl ??
      null;

    if (!localUrl) {
      console.warn("No local URL passed. Deliveries will use destination config.local_url if it is set.");
    }

    await runTunnel({
      apiKey: requireValue(apiKey, "API key is required. Run fasthook login --api-key fhp_xxx or pass --api-key."),
      destinationId: requireValue(destinationId, "Destination id is required. Use --destination des_xxx."),
      localUrl,
      tunnelUrl: pickTunnelUrl(parsed.flags, config),
      verbose: getBooleanFlag(parsed.flags, "verbose")
    });
    return;
  }

  throw new Error(`Unknown command: ${parsed.command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
