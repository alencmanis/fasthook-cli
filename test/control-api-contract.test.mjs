import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ProjectApiKeysClient } from "../dist/generated/control-api-client.js";
import { checkControlApiContracts } from "../scripts/check-control-api-contracts.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("CLI compiles the checksum-locked partial Control API client", async () => {
  assert.deepEqual(await checkControlApiContracts({ root: repositoryRoot }), {
    ok: true,
    consumer: "cli",
    artifacts: 3,
    backendCompared: false,
  });
  const openapi = JSON.parse(await readFile(resolve(
    repositoryRoot, "contracts/control-api.openapi.json",
  ), "utf8"));
  assert.equal(openapi["x-fasthook-contract-coverage"].status, "partial");
  assert.deepEqual(openapi["x-fasthook-contract-coverage"].surfaces,
    ["project-api-keys", "filter-crud", "filter-test", "transformation-crud", "transformation-execution-history", "transformation-test", "transformation-capabilities", "workflow-crud", "workflow-run-history", "workflow-step-retry", "action-crud", "connection-crud", "connection-latest-input", "source-crud", "destination-crud", "provider-accounts"]);
  assert.equal(Object.keys(openapi.components.schemas).length, 129);
});

test("CLI generated client preserves the owner-session authentication boundary", async () => {
  const calls = [];
  const client = new ProjectApiKeysClient({
    baseUrl: "https://api.example.test",
    auth: {
      mode: "bearer",
      token: "session-cli-test",
      trustedServerOrigin: "https://api.example.test",
    },
    teamId: "tm_cli_contract",
    async fetch(input, init) {
      calls.push({ url: String(input), init });
      return Response.json({ data: [] });
    },
  });
  assert.deepEqual(await client.listProjectApiKeys(), { data: [] });
  assert.equal(calls[0].url, "https://api.example.test/v1/project-api-keys");
  assert.equal(calls[0].init.credentials, "omit");
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get("authorization"), "Bearer session-cli-test");
  assert.equal(headers.get("x-team-id"), "tm_cli_contract");
});
