import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { buildLocalTargetUrl, forwardDeliveryToLocalhost } from "../dist/http.js";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

test("forwards delivery to localhost and returns response", async () => {
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ method: request.method, body, tunnel: request.headers["x-fasthook-tunnel"] }));
    });
  });
  const address = await listen(server);
  assert(address && typeof address === "object");

  try {
    const result = await forwardDeliveryToLocalhost(
      {
        method: "POST",
        headers: { "content-type": "application/json", host: "example.com" },
        body: "{\"ok\":true}"
      },
      `http://127.0.0.1:${address.port}`
    );
    assert.equal(result.status, 200);
    assert.match(result.body ?? "", /"method":"POST"/);
    assert.match(result.body ?? "", /"tunnel":"cli"/);
    assert.match(result.body ?? "", /"body":"{\\\"ok\\\":true}"/);
  } finally {
    server.close();
  }
});

test("explicit tunnel local url overrides delivery payload local url", async () => {
  const server = http.createServer((_request, response) => {
    response.end("fallback-ok");
  });
  const address = await listen(server);
  assert(address && typeof address === "object");

  try {
    const result = await forwardDeliveryToLocalhost(
      {
        method: "POST",
        localUrl: "https://localhost:8080/",
        body: ""
      },
      `http://127.0.0.1:${address.port}`
    );
    assert.equal(result.status, 200);
    assert.equal(result.body, "fallback-ok");
  } finally {
    server.close();
  }
});

test("delivery path is appended to the active local target", async () => {
  const server = http.createServer((request, response) => {
    response.end(request.url);
  });
  const address = await listen(server);
  assert(address && typeof address === "object");

  try {
    const result = await forwardDeliveryToLocalhost(
      {
        method: "POST",
        path: "/webhooks/orders",
        body: ""
      },
      `http://127.0.0.1:${address.port}`
    );
    assert.equal(result.status, 200);
    assert.equal(result.body, "/webhooks/orders");
  } finally {
    server.close();
  }
});

test("buildLocalTargetUrl appends paths without losing a base path", () => {
  assert.equal(buildLocalTargetUrl("8080", "/webhooks"), "http://localhost:8080/webhooks");
  assert.equal(buildLocalTargetUrl("http://localhost:8080/base/", "/webhooks"), "http://localhost:8080/base/webhooks");
  assert.equal(buildLocalTargetUrl("http://localhost:8080/base", "/"), "http://localhost:8080/base");
});
