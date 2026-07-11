import { QueryFunction, QueryKey } from "@tanstack/react-query";

/** Treat calendar grid data as fresh for the SPA session; invalidate on scan/apply/label changes. */
export const CALENDAR_STALE_TIME = Infinity;
export const CALENDAR_GC_TIME = 1000 * 60 * 60 * 8;

export function calendarQueryOptions<
  TQueryFnData = unknown,
  TQueryKey extends QueryKey = QueryKey,
>(options: {
  queryKey: TQueryKey;
  queryFn: QueryFunction<TQueryFnData, TQueryKey>;
}) {
  return {
    ...options,
    staleTime: CALENDAR_STALE_TIME,
    gcTime: CALENDAR_GC_TIME,
  };
}
