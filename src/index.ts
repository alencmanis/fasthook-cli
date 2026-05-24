#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseCliArgs, getBooleanFlag, getStringFlag } from "./args.js";
import { DEFAULT_TUNNEL_URL, deleteConfig, getConfigPath, loadConfig, maskSecret, saveConfig } from "./config.js";
import { normalizeLocalTarget } from "./http.js";
import { runTunnel } from "./tunnel.js";
import { apiRequest, loadJsonFromFile } from "./api.js";
import type { FasthookConfig } from "./types.js";

const DEFAULT_LOCAL_TARGET = "8080";

function printHelp(): void {
  console.log(`fasthook CLI

Usage:
  fasthook login --api-key fhp_xxx [--team tm_xxx]
  fasthook logout
  fasthook config [--team tm_xxx] [--destination des_xxx]
  fasthook tunnel [--destination des_xxx] [--to 8080]

Resource commands:
  fasthook sources <list|get|create|update|delete|enable|disable|upsert> ...
  fasthook destinations <list|get|create|update|delete|enable|disable|upsert> ...
  fasthook connections <list|get|create|update|delete|pause|unpause|enable|disable|latest-input> ...
  fasthook transformations <list|get|create|update|delete|upsert|run|executions|execution> ...
  fasthook requests <list|count|get|retry|events|ignored-events|bulk-operations> ...
  fasthook events <list|count|get|retry|bulk-operations> ...
  fasthook attempts <list|get> ...
  fasthook metrics <requests|events> ...
  fasthook project-secrets <get|update|rotate>
  fasthook auth <me|logout>
  fasthook api <method> <path> [--json '{...}' | --json-file file.json]

Options:
  -d, --destination   CLI destination id, for example des_xxx
  -t, --to            Local target port or URL, for example 8080 or http://localhost:8080.
      --api-key       Project API key. Can also use FASTHOOK_API_KEY.
      --team          Team id to scope API requests. Can also use FASTHOOK_TEAM_ID.
      --json          JSON string for POST/PUT/PATCH bodies.
      --json-file     JSON file path for POST/PUT/PATCH bodies.
  -q, --quiet         Print only connect/disconnect and fatal errors.
  -v, --verbose       Print per-delivery logs.
  -h, --help          Show help.
`);
}

function requireValue(value: string | null, message: string): string {
  if (!value) throw new Error(message);
  return value;
}

function updateStoredOptions(flags: Record<string, string | boolean>, config: FasthookConfig): FasthookConfig {
  const destinationId = getStringFlag(flags, "destination");
  const teamId = getStringFlag(flags, "team");

  return {
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(destinationId || config.destinationId ? { destinationId: destinationId ?? config.destinationId } : {}),
    ...(teamId || config.teamId ? { teamId: teamId ?? config.teamId } : {})
  };
}

function hasStoredOptionFlags(flags: Record<string, string | boolean>): boolean {
  return Boolean(getStringFlag(flags, "destination") || getStringFlag(flags, "team"));
}

function looksLikeLocalTarget(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) || /^https?:\/\//i.test(trimmed) || /^(localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?(?:\/|$)/i.test(trimmed);
}

async function parseRequestBody(flags: Record<string, string | boolean>): Promise<unknown> {
  const jsonText = getStringFlag(flags, "json");
  if (jsonText) {
    return JSON.parse(jsonText);
  }

  const jsonFile = getStringFlag(flags, "json-file");
  if (jsonFile) {
    return await loadJsonFromFile(jsonFile);
  }

  return undefined;
}

function extractQueryFlags(flags: Record<string, string | boolean>): Record<string, string> {
  const reserved = new Set(["api-key", "team", "json", "json-file", "help", "quiet", "verbose"]);
  const query: Record<string, string> = {};

  for (const [key, value] of Object.entries(flags)) {
    if (reserved.has(key)) continue;
    if (typeof value === "string") {
      query[key] = value;
    } else if (value === true) {
      query[key] = "true";
    }
  }

  return query;
}

function formatPath(path: string, values: Record<string, string | undefined>): string {
  return path.replace(/:(id|executionId)/g, (_, key) => {
    const value = values[key];
    if (!value) throw new Error(`Missing required value for :${key}`);
    return value;
  });
}

const RESOURCE_COMMANDS = {
  sources: {
    list: { method: "GET", path: "/sources" },
    get: { method: "GET", path: "/sources/:id", requireId: true },
    create: { method: "POST", path: "/sources" },
    upsert: { method: "PUT", path: "/sources" },
    update: { method: "PUT", path: "/sources/:id", requireId: true },
    delete: { method: "DELETE", path: "/sources/:id", requireId: true },
    disable: { method: "POST", path: "/sources/:id/disable", requireId: true },
    enable: { method: "POST", path: "/sources/:id/enable", requireId: true }
  },
  destinations: {
    list: { method: "GET", path: "/destinations" },
    get: { method: "GET", path: "/destinations/:id", requireId: true },
    create: { method: "POST", path: "/destinations" },
    upsert: { method: "PUT", path: "/destinations" },
    update: { method: "PUT", path: "/destinations/:id", requireId: true },
    delete: { method: "DELETE", path: "/destinations/:id", requireId: true },
    disable: { method: "POST", path: "/destinations/:id/disable", requireId: true },
    enable: { method: "POST", path: "/destinations/:id/enable", requireId: true }
  },
  connections: {
    list: { method: "GET", path: "/connections" },
    get: { method: "GET", path: "/connections/:id", requireId: true },
    create: { method: "POST", path: "/connections" },
    upsert: { method: "PUT", path: "/connections" },
    update: { method: "PUT", path: "/connections/:id", requireId: true },
    delete: { method: "DELETE", path: "/connections/:id", requireId: true },
    pause: { method: "PUT", path: "/connections/:id/pause", requireId: true },
    unpause: { method: "PUT", path: "/connections/:id/unpause", requireId: true },
    disable: { method: "POST", path: "/connections/:id/disable", requireId: true },
    enable: { method: "POST", path: "/connections/:id/enable", requireId: true },
    "latest-input": { method: "GET", path: "/connections/:id/latest-input", requireId: true }
  },
  transformations: {
    list: { method: "GET", path: "/transformations" },
    get: { method: "GET", path: "/transformations/:id", requireId: true },
    create: { method: "POST", path: "/transformations" },
    upsert: { method: "PUT", path: "/transformations" },
    update: { method: "PUT", path: "/transformations/:id", requireId: true },
    delete: { method: "DELETE", path: "/transformations/:id", requireId: true },
    run: { method: "PUT", path: "/transformations/run" },
    executions: { method: "GET", path: "/transformations/:id/executions", requireId: true },
    execution: { method: "GET", path: "/transformations/:id/executions/:executionId", requireId: true }
  },
  requests: {
    list: { method: "GET", path: "/requests" },
    count: { method: "GET", path: "/requests/count" },
    get: { method: "GET", path: "/requests/:id", requireId: true },
    retry: { method: "POST", path: "/requests/:id/retry", requireId: true },
    events: { method: "GET", path: "/requests/:id/events", requireId: true },
    "ignored-events": { method: "GET", path: "/requests/:id/ignored_events", requireId: true },
    "bulk-operations-list": { method: "GET", path: "/requests/bulk_operations" },
    "bulk-operations-create": { method: "POST", path: "/requests/bulk_operations" },
    "bulk-operations-cancel": { method: "POST", path: "/requests/bulk_operations/:id/cancel", requireId: true }
  },
  events: {
    list: { method: "GET", path: "/events" },
    count: { method: "GET", path: "/events/count" },
    get: { method: "GET", path: "/events/:id", requireId: true },
    retry: { method: "POST", path: "/events/:id/retry", requireId: true },
    "bulk-operations-list": { method: "GET", path: "/events/bulk_operations" },
    "bulk-operations-create": { method: "POST", path: "/events/bulk_operations" },
    "bulk-operations-cancel": { method: "POST", path: "/events/bulk_operations/:id/cancel", requireId: true }
  },
  attempts: {
    list: { method: "GET", path: "/attempts" },
    get: { method: "GET", path: "/attempts/:id", requireId: true }
  },
  metrics: {
    requests: { method: "GET", path: "/metrics/requests" },
    events: { method: "GET", path: "/metrics/events" }
  },
  "project-secrets": {
    get: { method: "GET", path: "/project-secrets" },
    update: { method: "PUT", path: "/project-secrets" },
    rotate: { method: "POST", path: "/project-secrets/rotate" }
  },
  auth: {
    me: { method: "GET", path: "/auth/me" },
    logout: { method: "POST", path: "/auth/logout" }
  }
} as const;

function resolveResourceCommand(resource: string, action: string, subAction: string | null) {
  const resourceCommands = (RESOURCE_COMMANDS as Record<string, Record<string, unknown>>)[resource];
  if (!resourceCommands) return null;

  let actionKey = action;
  if (action === "bulk-operations" && subAction) {
    actionKey = `${action}-${subAction}`;
  }

  const command = resourceCommands[actionKey as string] as { method: string; path: string; requireId?: boolean } | undefined;
  return command ?? null;
}

async function executeResourceCommand(
  resource: string,
  parsed: ReturnType<typeof parseCliArgs>,
  config: FasthookConfig
): Promise<void> {
  const action = parsed.positionals[0]?.toLowerCase() ?? "list";
  const subAction = parsed.positionals[1]?.toLowerCase() ?? null;
  const actionKey = action || "list";
  const command = resolveResourceCommand(resource, actionKey, subAction);
  if (!command) {
    throw new Error(`Unknown resource action: ${resource} ${action}${subAction ? ` ${subAction}` : ""}`);
  }

  const apiKey = getStringFlag(parsed.flags, "api-key") ?? process.env.FASTHOOK_API_KEY?.trim() ?? config.apiKey ?? null;
  const teamId = getStringFlag(parsed.flags, "team") ?? process.env.FASTHOOK_TEAM_ID?.trim() ?? config.teamId ?? null;
  const body = await parseRequestBody(parsed.flags);
  const query = extractQueryFlags(parsed.flags);

  let id: string | undefined;
  let executionId: string | undefined;

  if (actionKey === "execution") {
    id = parsed.positionals[1]?.trim();
    executionId = parsed.positionals[2]?.trim();
  } else if (action === "bulk-operations" && subAction === "cancel") {
    id = parsed.positionals[2]?.trim();
  } else if (command.requireId) {
    id = parsed.positionals[1]?.trim();
  }

  const path = formatPath(command.path, { id, executionId });
  const result = await apiRequest({
    apiKey: requireValue(apiKey, "API key is required. Run fasthook login --api-key fhp_xxx or pass --api-key."),
    teamId,
    method: command.method,
    path,
    query,
    body
  });

  console.log(JSON.stringify(result, null, 2));
}

async function executeApiFallback(parsed: ReturnType<typeof parseCliArgs>, config: FasthookConfig): Promise<void> {
  const method = parsed.positionals[0]?.toUpperCase() ?? null;
  const path = parsed.positionals[1]?.trim() ?? null;
  if (!method || !path) {
    throw new Error("Usage: fasthook api <method> <path> [--json '{...}' | --json-file file.json]");
  }

  const apiKey = getStringFlag(parsed.flags, "api-key") ?? process.env.FASTHOOK_API_KEY?.trim() ?? config.apiKey ?? null;
  const teamId = getStringFlag(parsed.flags, "team") ?? process.env.FASTHOOK_TEAM_ID?.trim() ?? config.teamId ?? null;
  const body = await parseRequestBody(parsed.flags);
  const query = extractQueryFlags(parsed.flags);

  const result = await apiRequest({
    apiKey: requireValue(apiKey, "API key is required. Run fasthook login --api-key fhp_xxx or pass --api-key."),
    teamId,
    method,
    path,
    query,
    body
  });

  console.log(JSON.stringify(result, null, 2));
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
      apiKey: requireValue(apiKey, "API key is required. Use: fasthook login --api-key fhp_xxx")
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
    console.log(`Team id: ${config.teamId ?? "(not set)"}`);
    console.log(`Default local target: ${normalizeLocalTarget(DEFAULT_LOCAL_TARGET)} (runtime-only)`);
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
      tunnelUrl: DEFAULT_TUNNEL_URL,
      verbose: getBooleanFlag(parsed.flags, "verbose"),
      quiet: getBooleanFlag(parsed.flags, "quiet")
    });
    return;
  }

  if (command === "api") {
    await executeApiFallback(parsed, config);
    return;
  }

  await executeResourceCommand(command, parsed, config);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
