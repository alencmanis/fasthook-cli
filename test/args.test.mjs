import assert from "node:assert/strict";
import test from "node:test";
import { parseCliArgs, getBooleanFlag, getStringFlag } from "../dist/args.js";
import { normalizeLocalTarget } from "../dist/http.js";
import { buildConnectUrl } from "../dist/tunnel.js";

test("parses tunnel flags and aliases", () => {
  const parsed = parseCliArgs(["tunnel", "-d", "des_123", "-t", "http://localhost:8080", "--verbose"]);
  assert.equal(parsed.command, "tunnel");
  assert.equal(getStringFlag(parsed.flags, "destination"), "des_123");
  assert.equal(getStringFlag(parsed.flags, "to"), "http://localhost:8080");
  assert.equal(getBooleanFlag(parsed.flags, "verbose"), true);
});

test("builds websocket connect url", () => {
  const url = buildConnectUrl("https://tunnel.fasthook.io/connect", "des_123", "http://localhost:8080");
  assert.equal(url, "wss://tunnel.fasthook.io/connect?destination_id=des_123&local_url=http%3A%2F%2Flocalhost%3A8080");
});

test("normalizes bare port local target", () => {
  assert.equal(normalizeLocalTarget("8080"), "http://localhost:8080");
  assert.equal(normalizeLocalTarget("localhost:8080/webhooks"), "http://localhost:8080/webhooks");
  assert.equal(normalizeLocalTarget("http://localhost:8080"), "http://localhost:8080");
});
