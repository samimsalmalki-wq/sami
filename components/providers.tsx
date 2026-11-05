"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { DemoProvider } from "./demo-provider";
import { LiveProvider } from "./live-provider";

export function Providers({ simulatorEnabled, children }: { simulatorEnabled: boolean; children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 3_000, retry: 1, refetchOnWindowFocus: true } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <LiveProvider>
        <DemoProvider enabled={simulatorEnabled}>
          {children}
          <Toaster />
        </DemoProvider>
      </LiveProvider>
    </QueryClientProvider>
  );
}
