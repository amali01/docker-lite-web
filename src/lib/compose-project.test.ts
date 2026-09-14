import { describe, expect, it } from "vitest";
import { inferComposeProjectFromName } from "./compose-project";

describe("inferComposeProjectFromName", () => {
  it("returns null for a single-segment name", () => {
    expect(inferComposeProjectFromName("postgres")).toBeNull();
  });

  it("drops the service segment for a two-segment name", () => {
    expect(inferComposeProjectFromName("myapp-db")).toBe("myapp");
  });

  it("drops the numeric replica suffix and the service segment", () => {
    expect(inferComposeProjectFromName("myapp-web-1")).toBe("myapp");
  });

  it("normalizes underscores to hyphens before splitting", () => {
    expect(inferComposeProjectFromName("myapp_web_2")).toBe("myapp");
  });

  it("keeps multi-segment project names intact", () => {
    expect(inferComposeProjectFromName("acme-shop-api")).toBe("acme-shop");
  });

  it("infers an unrelated standalone container into a compose project's name (H3 trap)", () => {
    // This is exactly the false-positive CODE-AUDIT.md's H3 warns about: a
    // standalone container named `redis-cache` infers project `redis`, so it
    // must never be used to gate a destructive action (see
    // `server/src/docker/client.ts`'s `isContainerLabeledForProject`).
    expect(inferComposeProjectFromName("redis-cache")).toBe("redis");
  });
});
