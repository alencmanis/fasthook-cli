import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { forwardDeliveryToLocalhost } from "../dist/http.js";

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
