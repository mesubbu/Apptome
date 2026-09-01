/**
 * Runtime tests inside workerd (REVIEW.md G7).
 *
 * Two Workers, two projects: the gateway (join door + HubDO) and the mapper.
 * Distortion tests stay a static scanner; these execute the doors.
 */
import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

const LOCAL = {
  ENVIRONMENT: "local",
  SURFACE_ORIGIN: "http://localhost:8790",
  ALLOWED_ORIGINS: "http://localhost:8787,http://localhost:8788,http://localhost:8789",
};

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./hub/gateway/wrangler.jsonc" },
            remoteBindings: false,
            miniflare: { bindings: LOCAL },
          }),
        ],
        test: {
          name: "gateway",
          include: ["hub/gateway/test/**/*.test.js"],
        },
      },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./hub/mapper/wrangler.test.jsonc" },
            remoteBindings: false,
            miniflare: { bindings: { SURFACE_ORIGIN: LOCAL.SURFACE_ORIGIN } },
          }),
        ],
        test: {
          name: "mapper",
          include: ["hub/mapper/test/**/*.test.js"],
        },
      },
    ],
  },
});
