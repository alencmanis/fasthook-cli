import { readFile } from "node:fs/promises";

export type ApiRequestOptions = {
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  apiKey: string;
  teamId?: string | null;
};

const BASE_URL = "https://api.fasthook.io/v1";

function buildUrl(path: string, query?: Record<string, string>): URL {
  const normalizedPath = path.startsWith("http://") || path.startsWith("https://")
    ? path
    : `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const url = new URL(normalizedPath);
  if (query) {
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(name, String(value));
      }
    }
  }
  return url;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildHeaders(apiKey: string, teamId?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`
  };
  if (teamId) headers["x-team-id"] = teamId;
  return headers;
}

export async function apiRequest(options: ApiRequestOptions): Promise<unknown> {
  const url = buildUrl(options.path, options.query);
  const headers = buildHeaders(options.apiKey, options.teamId);
  const requestInit: RequestInit = {
    method: options.method,
    headers,
    body: undefined
  };

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, requestInit);
  const text = await response.text();
  const data = parseJson(text);

  if (!response.ok) {
    const message = typeof data === "object" && data !== null && "message" in data ? (data as Record<string, unknown>).message : text;
    const error = new Error(`API request failed (${response.status}): ${String(message)}`);
    throw error;
  }

  return data;
}

export async function loadJsonFromFile(path: string): Promise<unknown> {
  const content = await readFile(path, "utf8");
  return JSON.parse(content);
}
