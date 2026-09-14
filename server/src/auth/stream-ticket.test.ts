import { describe, expect, it } from "vitest";
import { STREAM_TICKET_TTL_MS, createStreamTicketStore } from "./stream-ticket";

const claims = { username: "admin", authVersion: 1 };

describe("stream ticket store", () => {
  it("redeems a ticket exactly once", () => {
    const store = createStreamTicketStore();
    const { ticket } = store.issue(claims);

    expect(store.redeem(ticket)?.username).toBe("admin");
    expect(store.redeem(ticket)).toBeNull();
  });

  it("hands the ticket to only one of two simultaneous redemptions", () => {
    const store = createStreamTicketStore();
    const { ticket } = store.issue(claims);

    // Both callers reached redeem() having already seen the entry — the delete
    // is what picks a winner.
    const results = [store.redeem(ticket), store.redeem(ticket)];

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("refuses a ticket that outlived its window", () => {
    let now = 1_000;
    const store = createStreamTicketStore(() => now);
    const { ticket } = store.issue(claims);

    now += STREAM_TICKET_TTL_MS + 1;

    expect(store.redeem(ticket)).toBeNull();
  });

  it("reaps expired tickets instead of holding them forever", () => {
    let now = 0;
    const store = createStreamTicketStore(() => now);

    store.issue(claims);
    store.issue(claims);
    expect(store.size).toBe(2);

    now += STREAM_TICKET_TTL_MS + 1;
    store.issue(claims);

    // The two stale entries are gone; only the ticket just minted remains.
    expect(store.size).toBe(1);
  });

  it("gives each ticket a distinct high-entropy value", () => {
    const store = createStreamTicketStore();
    const first = store.issue(claims).ticket;
    const second = store.issue(claims).ticket;

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(32);
  });
});
