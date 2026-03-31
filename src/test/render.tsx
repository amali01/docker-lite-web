import type { PropsWithChildren, ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const routerFutureFlags = {
  v7_relativeSplatPath: true,
  v7_startTransition: true,
} as const;

function Providers({ children, route = "/" }: PropsWithChildren<{ route?: string }>) {
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

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={routerFutureFlags} initialEntries={[route]}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

export function renderWithProviders(ui: ReactElement, route?: string) {
  return render(ui, {
    wrapper: ({ children }) => <Providers route={route}>{children}</Providers>,
  });
}
