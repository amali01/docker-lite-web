import { describe, expect, it } from "vitest";
import { buildResourceRowEntries, inferComposeProjectFromName } from "./resource-groups";

// The heuristic itself now lives in ./compose-project (moved for M24 —
// shared with the server, see ./compose-project.test.ts). This re-export
// smoke test guards the public API this module's existing consumers rely on.
it("re-exports inferComposeProjectFromName for existing consumers", () => {
  expect(inferComposeProjectFromName("myapp-db")).toBe("myapp");
});

interface Item {
  id: string;
  name: string;
}

const project = (item: Item) => inferComposeProjectFromName(item.name);

describe("buildResourceRowEntries", () => {
  it("keeps a lone project member as a flat item row", () => {
    const entries = buildResourceRowEntries([{ id: "1", name: "myapp-db" }], project);
    expect(entries).toEqual([{ type: "item", item: { id: "1", name: "myapp-db" } }]);
  });

  it("collapses two members of one project into a single group row", () => {
    const items: Item[] = [
      { id: "1", name: "myapp-db-1" },
      { id: "2", name: "myapp-web-1" },
    ];
    const entries = buildResourceRowEntries(items, project);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: "group", project: "myapp", items });
  });

  it("places the group at the position of its first member and preserves order", () => {
    const items: Item[] = [
      { id: "solo", name: "redis" },
      { id: "1", name: "myapp-db-1" },
      { id: "2", name: "myapp-web-1" },
    ];
    const entries = buildResourceRowEntries(items, project);
    expect(entries.map((e) => (e.type === "group" ? `group:${e.project}` : `item:${e.item.id}`))).toEqual([
      "item:solo",
      "group:myapp",
    ]);
  });

  it("never groups items the project resolver rejects (e.g. <none> / default networks)", () => {
    const items: Item[] = [
      { id: "a", name: "bridge" },
      { id: "b", name: "bridge" },
    ];
    // resolver treats "bridge" as ungroupable
    const entries = buildResourceRowEntries(items, (item) => (item.name === "bridge" ? null : project(item)));
    expect(entries.every((e) => e.type === "item")).toBe(true);
  });
});
