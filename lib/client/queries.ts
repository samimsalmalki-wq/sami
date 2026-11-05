"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AlertItem,
  AlertsResponse,
  GatesResponse,
  MovementsResponse,
  ProductDetailResponse,
  ProductsResponse,
  SummaryResponse,
} from "@/lib/api-types";
import type { AlertStatus } from "@/lib/inventory/alerts";
import { usePollInterval } from "@/components/live-provider";
import { getJson, sendJson } from "@/lib/client/api";

/** مفاتيح الاستعلام: الجزء الأول هو اللي يُبطله البث اللحظي */
export function useSummary() {
  return useQuery({
    queryKey: ["summary"],
    queryFn: () => getJson<SummaryResponse>("/api/dashboard/summary"),
    refetchInterval: usePollInterval(),
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: () => getJson<AlertsResponse>("/api/alerts"),
    refetchInterval: usePollInterval(),
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: () => getJson<ProductsResponse>("/api/products"),
    refetchInterval: usePollInterval(),
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ["product", id],
    queryFn: () => getJson<ProductDetailResponse>(`/api/products/${id}`),
    refetchInterval: usePollInterval(),
  });
}

export function useMovements(gate: string | null, limit = 60) {
  return useQuery({
    queryKey: ["movements", gate ?? "all", limit],
    queryFn: () => getJson<MovementsResponse>(`/api/movements?limit=${limit}${gate ? `&gate=${gate}` : ""}`),
    refetchInterval: usePollInterval(),
    placeholderData: keepPreviousData,
  });
}

export function useGates() {
  return useQuery({
    queryKey: ["gates"],
    queryFn: () => getJson<GatesResponse>("/api/gates"),
    refetchInterval: usePollInterval(),
  });
}

export function useUpdateAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AlertStatus }) =>
      sendJson<AlertItem>(`/api/alerts/${id}`, "PATCH", { status }),
    onSuccess: () => {
      for (const key of ["alerts", "summary", "gates"]) void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
}
