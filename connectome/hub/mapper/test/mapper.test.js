/**
 * Mapper Worker, running inside workerd.
 *
 * Ports the t1-check values-leak assertion and exercises the /map door
 * without a live mesh (REVIEW.md G7).
 */
import { exports } from "cloudflare:workers";
import { describe, it, expect } from "vitest";

const SURFACE = "http://localhost:8790";

function map(body, { origin } = {}) {
  const headers = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return exports.default.fetch("https://map.example/map", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("mapper /map", () => {
  it("rejects a request that carries a value", async () => {
    const res = await map({
      source: { fields: [{ path: "name", type: "string", value: "x" }] },
    });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).not.toContain('"mapping"');
  });

  it("refuses a non-surface Origin", async () => {
    const res = await map(
      { source: { fields: [{ path: "name", type: "string" }] } },
      { origin: "http://evil.example" }
    );
    expect(res.status).toBe(403);
  });

  it("returns a static mapping for the surface Origin", async () => {
    const res = await map(
      {
        source: {
          origin: "http://localhost:8787",
          fields: [
            { path: "name", type: "string" },
            { path: "amount", type: "number" },
          ],
        },
        target: {
          origin: "http://localhost:8788",
          schema: {
            properties: { name: { type: "string" }, total: { type: "number" } },
          },
          required: ["name"],
        },
      },
      { origin: SURFACE }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mapping.name.from).toBe("name");
    expect(body.mapping.total.from).toBe("amount");
    expect(body.mapper).toBe("static");
  });

  it("GET /health does not require the surface Origin", async () => {
    const res = await exports.default.fetch("https://map.example/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("connectome-mapper");
  });
});
