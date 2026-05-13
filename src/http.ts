import type { DeliveryRequest, DeliveryResult } from "./types.js";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

function isLocalHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

function normalizeRequestHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    const normalizedKey = key.toLowerCase();
    if (!key.trim() || HOP_BY_HOP_HEADERS.has(normalizedKey)) continue;
    out[key] = String(value);
  }
  out["x-fasthook-tunnel"] = "cli";
  return out;
}

function responseHeadersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) out[key] = value;
  });
  return out;
}

function normalizeMethod(method: string | undefined): string {
  const value = method?.trim().toUpperCase();
  return value || "POST";
}

export async function forwardDeliveryToLocalhost(
  request: DeliveryRequest,
  fallbackLocalUrl: string | null
): Promise<DeliveryResult> {
  const targetUrl = request.localUrl?.trim() || fallbackLocalUrl?.trim() || "";
  if (!targetUrl) {
    return { status: 502, statusText: "Local URL Missing", body: "local_url_missing" };
  }
  if (!isLocalHttpUrl(targetUrl)) {
    return { status: 502, statusText: "Invalid Local URL", body: "local_url_must_be_localhost_http_url" };
  }

  const method = normalizeMethod(request.method);
  const canHaveBody = method !== "GET" && method !== "HEAD";
  try {
    const response = await fetch(targetUrl, {
      method,
      headers: normalizeRequestHeaders(request.headers),
      body: canHaveBody ? request.body ?? "" : undefined
    });
    const body = await response.text();
    return {
      status: response.status,
      statusText: response.statusText || "Local Response",
      headers: responseHeadersToRecord(response.headers),
      body
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "local_fetch_failed";
    return { status: 502, statusText: "Local Fetch Failed", body: message };
  }
}
