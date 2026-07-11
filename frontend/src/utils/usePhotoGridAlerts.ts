import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MediaFile, api } from "../api/client";
import {
  AlertFilter,
  buildDateAlertMap,
  buildDuplicateIndex,
  filterFilesByAlerts,
} from "./photoAlerts";

export function usePhotoGridAlerts(files: MediaFile[]) {
  const [alertFilter, setAlertFilter] = useState<AlertFilter>("all");

  const { data: duplicateGroups = [] } = useQuery({
    queryKey: ["duplicates"],
    queryFn: api.duplicates,
  });

  const duplicateIndex = useMemo(() => buildDuplicateIndex(duplicateGroups), [duplicateGroups]);
  const dateAlerts = useMemo(() => buildDateAlertMap(files), [files]);
  const visibleFiles = useMemo(
    () => filterFilesByAlerts(files, alertFilter, dateAlerts, duplicateIndex),
    [files, alertFilter, dateAlerts, duplicateIndex],
  );

  return {
    alertFilter,
    setAlertFilter,
    duplicateGroups,
    duplicateIndex,
    dateAlerts,
    visibleFiles,
  };
}
