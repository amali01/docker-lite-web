import { describe, expect, it } from "vitest";
import { createDockerBackendFromEnv, isContainerInProject, isContainerLabeledForProject } from "./client";
import { inferComposeProjectFromName } from "../../../src/lib/compose-project";

describe("createDockerBackendFromEnv", () => {
  it("creates the mock adapter when configured", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";

    const backend = await createDockerBackendFromEnv();
    const engine = await backend.getEngineInfo();

    expect(engine.connected).toBe(true);
    expect(engine.endpoint).toContain("/var/run/docker.sock");
  });

  it("returns deterministic container detail data in mock mode", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";

    const backend = await createDockerBackendFromEnv();
    const details = await backend.getContainerDetails("a1b2c3d4e5f6");
    const stats = await backend.getContainerStats("a1b2c3d4e5f6");

    expect(details.summary.id).toBe("a1b2c3d4e5f6");
    expect(details.mounts.length).toBeGreaterThan(0);
    expect(details.labels.some((entry) => entry.key === "com.docker.compose.project")).toBe(true);
    expect(details.inspect.raw).toEqual(expect.objectContaining({ Id: "a1b2c3d4e5f6" }));
    expect(stats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sampledAt: expect.any(String),
          cpuPercent: expect.any(Number),
          memoryUsageBytes: expect.any(Number),
        }),
      ]),
    );
  });
});

// H3 regression guard: an unrelated standalone container that merely shares
// a compose project's name prefix must never be treated as project member by
// a destructive action.
describe("compose project matching (H3, M24)", () => {
  const labeledProjectMember = { composeProject: "redis", name: "redis-1" };
  const unlabeledStandaloneContainer = { composeProject: null, name: "redis-cache" };

  it("infers the standalone container's name into the same project (the trap H3 warns about)", () => {
    expect(inferComposeProjectFromName(unlabeledStandaloneContainer.name)).toBe("redis");
  });

  it("label-only match (used by remove) excludes the unlabeled standalone container", () => {
    expect(isContainerLabeledForProject(labeledProjectMember, "redis")).toBe(true);
    expect(isContainerLabeledForProject(unlabeledStandaloneContainer, "redis")).toBe(false);
  });

  it("label-or-heuristic match (used by start/stop and display grouping) still includes it", () => {
    expect(isContainerInProject(labeledProjectMember, "redis")).toBe(true);
    expect(isContainerInProject(unlabeledStandaloneContainer, "redis")).toBe(true);
  });

  it("removeComposeProject only removes labeled members, never a name-alike standalone container", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const backend = await createDockerBackendFromEnv();

    // None of the built-in mock containers collide with "app-stack" by name
    // heuristic alone, so this exercises the real label-only removal path
    // against the shared mock fixture without needing to add a colliding one.
    const before = await backend.listContainers();
    const labeledForAppStack = before.filter((c) => c.composeProject === "app-stack");
    expect(labeledForAppStack.length).toBeGreaterThan(0);

    await backend.removeComposeProject("app-stack");

    const after = await backend.listContainers();
    expect(after.some((c) => c.composeProject === "app-stack")).toBe(false);
    // Every container that was NOT labeled for the project survives untouched.
    const survivingIds = new Set(after.map((c) => c.id));
    for (const container of before) {
      if (container.composeProject !== "app-stack") {
        expect(survivingIds.has(container.id)).toBe(true);
      }
    }
  });

  // The exact scenario H3 describes, end to end against the mock adapter:
  // the fixture's `nginx-proxy` carries NO compose label but its name infers
  // the project "nginx". Removing a stack called "nginx" must leave it alone.
  // Against the pre-fix code this test fails — `nginx-proxy` was force-removed.
  it("removing a stack does not touch an unlabeled container that only name-infers into it", async () => {
    process.env.DOCKLITE_ADAPTER = "mock";
    const backend = await createDockerBackendFromEnv();

    const before = await backend.listContainers();
    const decoy = before.find((container) => container.name === "nginx-proxy");

    // Guard the fixture itself: if this stops holding, the test below stops
    // testing anything and must be re-pointed at a real collision.
    expect(decoy).toBeDefined();
    expect(decoy?.composeProject).toBeNull();
    expect(inferComposeProjectFromName("nginx-proxy")).toBe("nginx");

    // Nothing carries the "nginx" label, so the stack genuinely does not exist
    // and the call reports that — rather than silently eating the name-alike.
    await expect(backend.removeComposeProject("nginx")).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });

    const after = await backend.listContainers();
    expect(after.some((container) => container.name === "nginx-proxy")).toBe(true);
    expect(after).toHaveLength(before.length);
  });

  it("both sides of the shared inference agree", () => {
    // The server's combined predicate and the client's display heuristic
    // must derive from the same function so grouping and (non-destructive)
    // actions never drift apart.
    expect(isContainerInProject(unlabeledStandaloneContainer, "redis")).toBe(
      inferComposeProjectFromName(unlabeledStandaloneContainer.name) === "redis",
    );
  });
});
