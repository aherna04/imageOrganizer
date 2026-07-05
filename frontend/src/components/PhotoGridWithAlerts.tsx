import { useMemo, useState, type ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import {
  AlertFilter,
  buildDateAlertMap,
  buildDuplicateIndex,
  filterFilesByAlerts,
} from "../utils/photoAlerts";
import PhotoAlertsBar from "./PhotoAlertsBar";
import PhotoGrid from "./PhotoGrid";

type PhotoGridProps = ComponentProps<typeof PhotoGrid>;

interface Props extends PhotoGridProps {
  onAlertsChange?: () => void;
}

export default function PhotoGridWithAlerts({ files, onAlertsChange, ...gridProps }: Props) {
  const [alertFilter, setAlertFilter] = useState<AlertFilter>("all");

  const { data: duplicateGroups = [] } = useQuery({
    queryKey: ["duplicates"],
    queryFn: api.duplicates,
  });

  const duplicateIndex = useMemo(() => buildDuplicateIndex(duplicateGroups), [duplicateGroups]);
  const dateAlerts = useMemo(() => buildDateAlertMap(files), [files]);
  const visibleFiles = useMemo(
    () => filterFilesByAlerts(files, alertFilter, dateAlerts, duplicateIndex),
    [files, alertFilter, dateAlerts, duplicateIndex]
  );

  return (
    <>
      <PhotoAlertsBar
        files={files}
        duplicateGroups={duplicateGroups}
        filter={alertFilter}
        onFilterChange={setAlertFilter}
        onFixDates={onAlertsChange}
      />
      <PhotoGrid
        {...gridProps}
        files={visibleFiles}
        duplicateIndex={duplicateIndex}
        dateAlerts={dateAlerts}
        alertFilter={alertFilter}
      />
    </>
  );
}
