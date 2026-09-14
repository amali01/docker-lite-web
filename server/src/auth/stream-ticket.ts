import { randomBytes } from "node:crypto";

// Long enough to cover a ticket fetch plus the stream handshake, short enough
// that a ticket sitting in an access log is worthless by the time anyone reads
// it — and it is single-use, so it is usually already spent as well.
export const STREAM_TICKET_TTL_MS = 30_000;

export interface StreamTicketClaims {
  username: string;
  authVersion: number;
}

export interface RedeemedStreamTicket extends StreamTicketClaims {
  expiresAt: string;
}

interface StoredStreamTicket extends StreamTicketClaims {
  expiresAt: number;
}

/**
 * Single-use, short-lived credentials for the two transports that cannot send
 * an Authorization header (EventSource and WebSocket). The client mints one
 * over an ordinary authenticated request and spends it opening the stream, so
 * the long-lived bearer token never appears in a URL — and therefore never in
 * an access log, a proxy log, or browser history.
 *
 * ponytail: in-memory Map, single process only. Tickets are not shared between
 * instances and are all forgotten on restart (a client simply mints another).
 * Move to a shared store (Redis/SQLite) if DockLite ever runs more than one
 * instance behind a load balancer.
 */
export function createStreamTicketStore(now: () => number = Date.now) {
  const tickets = new Map<string, StoredStreamTicket>();

  return {
    issue(claims: StreamTicketClaims) {
      // Sweep on issue: the map only grows here, and it holds at most one entry
      // per in-flight stream open, so a full scan beats owning a timer.
      for (const [candidate, stored] of tickets) {
        if (stored.expiresAt <= now()) {
          tickets.delete(candidate);
        }
      }

      const ticket = randomBytes(32).toString("base64url");
      const expiresAt = now() + STREAM_TICKET_TTL_MS;

      tickets.set(ticket, { ...claims, expiresAt });

      return { ticket, expiresAt: new Date(expiresAt).toISOString() };
    },

    redeem(ticket: string): RedeemedStreamTicket | null {
      const stored = tickets.get(ticket);

      // `delete` is the claim, not the lookup. Redemption happens after an
      // `await` (the auth config read), so two near-simultaneous stream opens
      // can both find the entry here — but only one of them gets `true` back
      // from `delete`, and that one owns the ticket.
      if (!stored || !tickets.delete(ticket)) {
        return null;
      }

      if (stored.expiresAt <= now()) {
        return null;
      }

      return {
        username: stored.username,
        authVersion: stored.authVersion,
        expiresAt: new Date(stored.expiresAt).toISOString(),
      };
    },

    // Test seam: proves expired tickets are reaped rather than accumulating.
    get size() {
      return tickets.size;
    },
  };
}

export type StreamTicketStore = ReturnType<typeof createStreamTicketStore>;
