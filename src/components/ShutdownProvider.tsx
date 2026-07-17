import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { PowerOff } from "lucide-react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import { shutdownServer } from "@/lib/api/resources";

interface ShutdownContextValue {
  shuttingDown: boolean;
  quit: () => void;
}

const ShutdownContext = createContext<ShutdownContextValue>({
  shuttingDown: false,
  quit: () => {},
});

export function useShutdown() {
  return useContext(ShutdownContext);
}

export function ShutdownProvider({ children }: { children: ReactNode }) {
  const [shuttingDown, setShuttingDown] = useState(false);

  const quit = useCallback(() => {
    // Show the terminal screen immediately for responsive feedback.
    setShuttingDown(true);
    void shutdownServer().catch((error: unknown) => {
      // An HTTP error means the server answered and is still running (e.g. an
      // expired token → 401), so the terminal screen is wrong: revert and tell
      // the user. A network error means no response arrived — the server almost
      // certainly stopped mid-response — so keep the terminal screen as correct.
      //
      // The coarse ApiClientError check is sufficient because the two never
      // overlap here: a non-2xx comes only from requireAuth rejecting BEFORE the
      // route runs (server stays alive, body completes normally), while the
      // server only exits AFTER a fully-flushed 202 (shutdown fires on
      // response "finish"). So no path pairs an HTTP error with server death.
      if (error instanceof ApiClientError) {
        setShuttingDown(false);
        toast.error("Couldn't shut down DockLite — it's still running. Please try again.");
      }
    });
  }, []);

  const value = useMemo(() => ({ shuttingDown, quit }), [shuttingDown, quit]);

  return (
    <ShutdownContext.Provider value={value}>
      {children}
      {shuttingDown ? <ShutdownScreen /> : null}
    </ShutdownContext.Provider>
  );
}

function ShutdownScreen() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background px-6 animate-in fade-in duration-300 motion-reduce:animate-none"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="shutdown-title"
    >
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <PowerOff className="h-6 w-6" />
        </div>
        <h1 id="shutdown-title" className="mt-6 text-2xl font-semibold tracking-tight">
          DockLite has shut down
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The local server has stopped. Your containers keep running under the Docker engine — this
          only closed the DockLite interface.
        </p>
        <p className="mt-5 text-sm text-muted-foreground">
          Close this tab, or start it again from the DockLite icon or your terminal:
        </p>
        <code className="mt-3 inline-flex items-center rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-sm text-primary">
          docklite
          <span
            aria-hidden="true"
            className="ml-1 inline-block h-4 w-[7px] translate-y-px bg-primary animate-pulse motion-reduce:animate-none"
          />
        </code>
      </div>
    </div>
  );
}
