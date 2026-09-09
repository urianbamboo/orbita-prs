import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { StateDto, PrScope } from "@orbita-prs/shared";

async function fetchState(scope: PrScope): Promise<StateDto> {
  const res = await fetch(`/api/state?scope=${scope}`, {
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res.json() as Promise<StateDto>;
}

async function postSync(): Promise<void> {
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "X-Orbita-Action": "sync" },
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
}

export function useOrbitState(scope: PrScope) {
  return useQuery({
    queryKey: ["orbit-state", scope],
    queryFn:  () => fetchState(scope),
    refetchInterval: 30_000,
    retry: 2,
    // Keep last good payload visible if a refetch fails (Tailscale blip, sync load, etc.)
    placeholderData: (previous) => previous,
  });
}

export function useForcSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: postSync,
    onSuccess: () => {
      // Refetch after a brief delay to let server sync finish
      setTimeout(() => qc.invalidateQueries({ queryKey: ["orbit-state"] }), 1_000);
    },
  });
}
