import { QueryClient } from "@tanstack/react-query";
import { invalidateCalendarQueries } from "./invalidateCalendarQueries";

export function invalidateAfterDateChange(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["files"] });
  invalidateCalendarQueries(qc);
  qc.invalidateQueries({ queryKey: ["events"] });
}
