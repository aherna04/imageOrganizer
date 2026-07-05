import { QueryClient } from "@tanstack/react-query";

export function invalidateAfterDateChange(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["files"] });
  qc.invalidateQueries({ queryKey: ["calendar-day"] });
  qc.invalidateQueries({ queryKey: ["calendar-summary"] });
  qc.invalidateQueries({ queryKey: ["calendar-labels"] });
  qc.invalidateQueries({ queryKey: ["calendar-months"] });
  qc.invalidateQueries({ queryKey: ["events"] });
}
