#!/usr/bin/env node
import { parseCliArgs, getBooleanFlag, getStringFlag } from "./args.js";
import { DEFAULT_TUNNEL_URL, deleteConfig, getConfigPath, loadConfig, maskSecret, saveConfig } from "./config.js";
import { normalizeLocalTarget } from "./http.js";
import { runTunnel } from "./tunnel.js";
import type { FasthookConfig } from "./types.js";

const DEFAULT_LOCAL_TARGET = "8080";

function printHelp(): void {
  console.log(`fasthook CLI

Usage:
  fasthook login --api-key fhp_xxx [--destination des_xxx] [--tunnel-url https://tunnel.fasthook.io/connect]
  fasthook config --destination des_xxx
  fasthook tunnel
  fasthook tunnel 8080
  fasthook tunnel --destination des_xxx --to http://localhost:8080
  fasthook config
  fasthook logout

Options:
  -d, --destination   CLI destination id, for example des_xxx
  -t, --to            Local target port or URL, for example 8080 or http://localhost:8080. Defaults to 8080.
      --api-key       Project API key. Can also use FASTHOOK_API_KEY.
      --tunnel-url    Tunnel worker connect URL. Can also use FASTHOOK_TUNNEL_URL.
  -q, --quiet         Print only connect/disconnect and fatal errors.
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

function updateStoredOptions(flags: Record<string, string | boolean>, config: FasthookConfig): FasthookConfig {
  const destinationId = getStringFlag(flags, "destination");
  const tunnelUrl = getStringFlag(flags, "tunnel-url");

  return {
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(destinationId || config.destinationId ? { destinationId: destinationId ?? config.destinationId } : {}),
    ...(tunnelUrl || config.tunnelUrl ? { tunnelUrl: tunnelUrl ?? config.tunnelUrl } : {})
  };
}

function hasStoredOptionFlags(flags: Record<string, string | boolean>): boolean {
  return Boolean(getStringFlag(flags, "destination", "tunnel-url"));
}

function looksLikeLocalTarget(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) || /^https?:\/\//i.test(trimmed) || /^(localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?(?:\/|$)/i.test(trimmed);
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
      ...updateStoredOptions(parsed.flags, config),
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
    if (getStringFlag(parsed.flags, "to", "local-url")) {
      throw new Error("Local target is runtime-only. Use: fasthook tunnel or fasthook tunnel --to http://localhost:8080");
    }
    if (hasStoredOptionFlags(parsed.flags)) {
      await saveConfig(updateStoredOptions(parsed.flags, config));
      console.log(`Updated ${getConfigPath()}`);
      return;
    }

    console.log(`Config: ${getConfigPath()}`);
    console.log(`API key: ${maskSecret(config.apiKey)}`);
    console.log(`Destination: ${config.destinationId ?? "(not set)"}`);
    console.log(`Default local target: ${normalizeLocalTarget(DEFAULT_LOCAL_TARGET)} (runtime-only)`);
    console.log(`Tunnel URL: ${config.tunnelUrl ?? DEFAULT_TUNNEL_URL}`);
    return;
  }

  if (command === "tunnel") {
    const firstPositional = parsed.positionals[0]?.trim();
    const secondPositional = parsed.positionals[1]?.trim();
    const positionalLocalUrl = looksLikeLocalTarget(firstPositional) ? firstPositional : secondPositional;
    const positionalDestinationId = looksLikeLocalTarget(firstPositional) ? null : firstPositional;
    const apiKey =
      getStringFlag(parsed.flags, "api-key") ?? process.env.FASTHOOK_API_KEY?.trim() ?? config.apiKey ?? null;
    const destinationId =
      getStringFlag(parsed.flags, "destination") ??
      process.env.FASTHOOK_DESTINATION_ID?.trim() ??
      positionalDestinationId ??
      config.destinationId ??
      null;
    const localUrl =
      getStringFlag(parsed.flags, "to", "local-url") ??
      process.env.FASTHOOK_LOCAL_URL?.trim() ??
      positionalLocalUrl ??
      DEFAULT_LOCAL_TARGET;

    await runTunnel({
      apiKey: requireValue(apiKey, "API key is required. Run fasthook login --api-key fhp_xxx or pass --api-key."),
      destinationId: requireValue(destinationId, "Destination id is required. Use --destination des_xxx."),
      localUrl: normalizeLocalTarget(localUrl),
      tunnelUrl: pickTunnelUrl(parsed.flags, config),
      verbose: getBooleanFlag(parsed.flags, "verbose"),
      quiet: getBooleanFlag(parsed.flags, "quiet")
    });
    return;
  }

  throw new Error(`Unknown command: ${parsed.command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
