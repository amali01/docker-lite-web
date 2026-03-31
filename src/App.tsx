import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Containers from "@/pages/Containers";
import ContainerDetails from "@/pages/ContainerDetails";
import Images from "@/pages/Images";
import Volumes from "@/pages/Volumes";
import Networks from "@/pages/Networks";
import DockerSettings from "@/pages/DockerSettings";
import NotFound from "@/pages/NotFound";

const routerFutureFlags = {
  v7_relativeSplatPath: true,
  v7_startTransition: true,
} as const;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter future={routerFutureFlags}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/containers" element={<Containers />} />
            <Route path="/containers/:containerId" element={<ContainerDetails />} />
            <Route path="/images" element={<Images />} />
            <Route path="/volumes" element={<Volumes />} />
            <Route path="/networks" element={<Networks />} />
            <Route path="/settings" element={<DockerSettings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
