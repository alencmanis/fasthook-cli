import WebSocket from "ws";
import { forwardDeliveryToLocalhost } from "./http.js";
import type { DeliveryMessage, DeliveryResult, TunnelOptions } from "./types.js";

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 10_000;
const STATS_INTERVAL_MS = 5_000;

type TunnelStats = {
  received: number;
  delivered: number;
  failed: number;
  inFlight: number;
  lastPrintedTotal: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonMessage(data: WebSocket.RawData): Record<string, unknown> | null {
  const text = typeof data === "string" ? data : data.toString("utf8");
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isDeliveryMessage(message: Record<string, unknown>): message is DeliveryMessage {
  return (
    message.type === "delivery" &&
    typeof message.jobId === "string" &&
    !!message.request &&
    typeof message.request === "object" &&
    !Array.isArray(message.request)
  );
}

function safeStatus(value: number): number {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : 502;
}

function truncate(value: string | undefined, maxLength = 180): string {
  if (!value) return "";
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function deliveryLabel(message: DeliveryMessage, fallbackLocalUrl: string | null): string {
  const request = message.request;
  const method = request.method?.trim().toUpperCase() || "POST";
  const target = request.localUrl?.trim() || fallbackLocalUrl?.trim() || "(missing local url)";
  const ref = request.requestId || request.eventId || request.connectionId || message.jobId;
  return `${method} ${target} ref=${ref}`;
}

function printStats(stats: TunnelStats, force = false): void {
  const total = stats.delivered + stats.failed;
  if (total === 0 && stats.inFlight === 0) return;
  if (!force && total === stats.lastPrintedTotal) return;
  stats.lastPrintedTotal = total;
  console.log(`Stats: received=${stats.received} delivered=${stats.delivered} failed=${stats.failed} in_flight=${stats.inFlight}`);
}

function sendDeliveryResult(socket: WebSocket, jobId: string, result: DeliveryResult): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(
    JSON.stringify({
      type: "delivery_result",
      jobId,
      status: safeStatus(result.status),
      statusText: result.statusText || "CLI Response",
      headers: result.headers ?? {},
      body: result.body ?? ""
    })
  );
}

export function buildConnectUrl(tunnelUrl: string, destinationId: string, localUrl: string | null): string {
  const url = new URL(tunnelUrl);
  if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol === "http:") url.protocol = "ws:";
  else if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("tunnel url must use http, https, ws, or wss");
  }
  if (!url.pathname || url.pathname === "/") url.pathname = "/connect";
  url.searchParams.set("destination_id", destinationId);
  if (localUrl?.trim()) url.searchParams.set("local_url", localUrl.trim());
  return url.toString();
}

async function connectOnce(options: TunnelOptions, signal: AbortSignal): Promise<void> {
  const connectUrl = buildConnectUrl(options.tunnelUrl, options.destinationId, options.localUrl);
  const socket = new WebSocket(connectUrl, {
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "x-api-key": options.apiKey
    }
  });

  let opened = false;
  let settled = false;
  let heartbeat: NodeJS.Timeout | null = null;
  let statsTimer: NodeJS.Timeout | null = null;
  const stats: TunnelStats = {
    received: 0,
    delivered: 0,
    failed: 0,
    inFlight: 0,
    lastPrintedTotal: 0
  };
  const closeForAbort = () => {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1000, "client_stop");
    }
  };

  return await new Promise<void>((resolve, reject) => {
    const settleResolve = () => {
      if (settled) return;
      settled = true;
      if (heartbeat) clearInterval(heartbeat);
      if (statsTimer) clearInterval(statsTimer);
      if (!options.quiet) printStats(stats, true);
      signal.removeEventListener("abort", closeForAbort);
      resolve();
    };
    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      if (heartbeat) clearInterval(heartbeat);
      if (statsTimer) clearInterval(statsTimer);
      signal.removeEventListener("abort", closeForAbort);
      reject(error);
    };

    signal.addEventListener("abort", closeForAbort, { once: true });
    if (signal.aborted) closeForAbort();

    socket.once("open", () => {
      opened = true;
      console.log(`Connected: destination ${options.destinationId}${options.localUrl ? ` -> ${options.localUrl}` : ""}`);
      heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.ping();
      }, 30_000);
      if (!options.quiet) {
        statsTimer = setInterval(() => printStats(stats), STATS_INTERVAL_MS);
      }
    });

    socket.on("message", (data) => {
      const message = parseJsonMessage(data);
      if (!message) return;

      if (message.type === "hello") {
        if (options.verbose && !options.quiet) console.log("Tunnel handshake received");
        return;
      }

      if (!isDeliveryMessage(message)) return;
      void (async () => {
        stats.received += 1;
        stats.inFlight += 1;
        const request = message.request;
        const startedAt = Date.now();
        if (options.verbose && !options.quiet) {
          console.log(`Delivery ${message.jobId}: ${request.method ?? "POST"} ${request.localUrl ?? options.localUrl ?? "(missing)"}`);
        }
        const result = await forwardDeliveryToLocalhost(request, options.localUrl);
        const durationMs = Date.now() - startedAt;
        if (safeStatus(result.status) >= 400) {
          stats.failed += 1;
          if (!options.quiet) {
            const detail = truncate(result.body);
            console.error(
              `Failed: ${deliveryLabel(message, options.localUrl)} -> ${result.status} ${result.statusText} ${durationMs}ms${detail ? `: ${detail}` : ""}`
            );
          }
        } else {
          stats.delivered += 1;
        }
        stats.inFlight = Math.max(0, stats.inFlight - 1);
        if (options.verbose && !options.quiet) {
          console.log(`Delivery ${message.jobId}: ${result.status} ${result.statusText} ${durationMs}ms`);
        }
        sendDeliveryResult(socket, message.jobId, result);
      })();
    });

    socket.once("unexpected-response", (_request, response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk.toString("utf8");
      });
      response.on("end", () => {
        settleReject(new Error(`tunnel rejected websocket: ${response.statusCode} ${body}`.trim()));
      });
    });

    socket.once("error", (error) => {
      if (!opened) settleReject(error instanceof Error ? error : new Error(String(error)));
      else if (options.verbose) console.error(`Tunnel socket error: ${error instanceof Error ? error.message : String(error)}`);
    });

    socket.once("close", (code, reason) => {
      const reasonText = reason.toString("utf8");
      if (!opened) {
        settleReject(new Error(`tunnel closed before connect: ${code}${reasonText ? ` ${reasonText}` : ""}`));
        return;
      }
      console.log(`Disconnected: ${code}${reasonText ? ` ${reasonText}` : ""}`);
      settleResolve();
    });
  });
}

export async function runTunnel(options: TunnelOptions): Promise<void> {
  let stopped = false;
  let currentAbort: AbortController | null = null;

  const stop = () => {
    stopped = true;
    currentAbort?.abort();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  let attempt = 0;
  while (!stopped) {
    currentAbort = new AbortController();
    try {
      await connectOnce(options, currentAbort.signal);
      attempt = 0;
    } catch (error) {
      if (!stopped) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Tunnel error: ${message}`);
      }
    } finally {
      currentAbort = null;
    }

    if (stopped) break;
    attempt += 1;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** Math.min(attempt, 5));
    console.log(`Reconnecting in ${Math.round(delay / 1000)}s...`);
    await sleep(delay);
  }
}
