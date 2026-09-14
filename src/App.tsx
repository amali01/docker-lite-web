import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { ShutdownProvider } from "@/components/ShutdownProvider";
import { useAuthSession } from "@/hooks/use-auth";
import Dashboard from "@/pages/Dashboard";
import Containers from "@/pages/Containers";
import ContainerDetails from "@/pages/ContainerDetails";
import Images from "@/pages/Images";
import Volumes from "@/pages/Volumes";
import Networks from "@/pages/Networks";
import DockerSettings from "@/pages/DockerSettings";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

function ReconnectingBanner() {
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center font-mono text-xs text-amber-600 dark:text-amber-400">
      Reconnecting to the server…
    </div>
  );
}

function ProtectedRoutes() {
  const authSession = useAuthSession();

  if (authSession.isLoading) {
    return <div className="flex min-h-screen items-center justify-center font-mono text-sm text-muted-foreground">Checking session…</div>;
  }

  const session = authSession.data;

  // A failed session fetch (network drop, server restart) is not the same as
  // a real "not authenticated" response — the server always answers that with
  // a normal 200 body, never a thrown/rejected request. Treating a transient
  // error as a sign-out would bounce an authenticated user to /login and
  // discard whatever they were doing, so only navigate away on an actual
  // authenticated: false response.
  if (authSession.isError) {
    if (session?.authenticated) {
      // Stale-but-authenticated: keep showing the last known-good UI instead
      // of silently pretending the user signed out.
      return (
        <>
          <ReconnectingBanner />
          <Outlet />
        </>
      );
    }

    if (!session) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 font-mono text-sm text-muted-foreground">
          <p>Can&apos;t reach the server. Retrying…</p>
          <button
            type="button"
            onClick={() => authSession.refetch()}
            className="rounded-md border border-input px-3 py-1 text-xs hover:bg-accent"
          >
            Retry now
          </button>
        </div>
      );
    }
  }

  if (!session?.authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

const App = () => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ShutdownProvider>
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoutes />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/containers" element={<Containers />} />
                  <Route path="/containers/:containerId" element={<ContainerDetails />} />
                  <Route path="/images" element={<Images />} />
                  <Route path="/volumes" element={<Volumes />} />
                  <Route path="/networks" element={<Networks />} />
                  <Route path="/settings" element={<DockerSettings />} />
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </ShutdownProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
