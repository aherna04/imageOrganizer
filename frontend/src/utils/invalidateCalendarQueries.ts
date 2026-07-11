import { QueryClient } from "@tanstack/react-query";

export function invalidateCalendarQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["calendar-months"] });
  qc.invalidateQueries({ queryKey: ["calendar-summary"] });
  qc.invalidateQueries({ queryKey: ["calendar-labels"] });
  qc.invalidateQueries({ queryKey: ["calendar-day"] });
}
