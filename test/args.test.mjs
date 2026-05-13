import assert from "node:assert/strict";
import test from "node:test";
import { parseCliArgs, getBooleanFlag, getStringFlag } from "../dist/args.js";
import { buildConnectUrl } from "../dist/tunnel.js";

test("parses tunnel flags and aliases", () => {
  const parsed = parseCliArgs(["tunnel", "-d", "des_123", "-t", "http://localhost:3000", "--verbose"]);
  assert.equal(parsed.command, "tunnel");
  assert.equal(getStringFlag(parsed.flags, "destination"), "des_123");
  assert.equal(getStringFlag(parsed.flags, "to"), "http://localhost:3000");
  assert.equal(getBooleanFlag(parsed.flags, "verbose"), true);
});

test("builds websocket connect url", () => {
  const url = buildConnectUrl("https://tunnel.fasthook.io/connect", "des_123", "http://localhost:3000");
  assert.equal(url, "wss://tunnel.fasthook.io/connect?destination_id=des_123&local_url=http%3A%2F%2Flocalhost%3A3000");
});
