import { mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { FasthookConfig } from "./types.js";

export const DEFAULT_TUNNEL_URL = "https://tunnel.fasthook.io/connect";

export function getConfigPath(): string {
  return process.env.FASTHOOK_CONFIG?.trim() || join(homedir(), ".fasthook", "config.json");
}

export async function loadConfig(): Promise<FasthookConfig> {
  try {
    const raw = await readFile(getConfigPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const record = parsed as Record<string, unknown>;
    return {
      apiKey: typeof record.apiKey === "string" ? record.apiKey : undefined,
      tunnelUrl: typeof record.tunnelUrl === "string" ? record.tunnelUrl : undefined,
      defaultLocalUrl: typeof record.defaultLocalUrl === "string" ? record.defaultLocalUrl : undefined
    };
  } catch {
    return {};
  }
}

export async function saveConfig(next: FasthookConfig): Promise<void> {
  const path = getConfigPath();
  await mkdir(dirname(path), { recursive: true });
  const clean: FasthookConfig = {};
  if (next.apiKey) clean.apiKey = next.apiKey;
  if (next.tunnelUrl) clean.tunnelUrl = next.tunnelUrl;
  if (next.defaultLocalUrl) clean.defaultLocalUrl = next.defaultLocalUrl;
  await writeFile(path, `${JSON.stringify(clean, null, 2)}\n`, "utf8");
  try {
    await chmod(path, 0o600);
  } catch {
    // Windows may ignore POSIX permissions; the file is still written in the user profile.
  }
}

export async function deleteConfig(): Promise<void> {
  await rm(getConfigPath(), { force: true });
}

export function maskSecret(value: string | undefined): string {
  if (!value) return "(not set)";
  if (value.length <= 10) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}${"*".repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}
