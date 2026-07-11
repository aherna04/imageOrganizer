import { type ComponentProps } from "react";
import { usePhotoGridAlerts } from "../utils/usePhotoGridAlerts";
import PhotoAlertsBar from "./PhotoAlertsBar";
import PhotoGrid from "./PhotoGrid";

type PhotoGridProps = ComponentProps<typeof PhotoGrid>;

interface Props extends PhotoGridProps {
  onAlertsChange?: () => void;
}

export default function PhotoGridWithAlerts({ files, onAlertsChange, ...gridProps }: Props) {
  const {
    alertFilter,
    setAlertFilter,
    duplicateGroups,
    duplicateIndex,
    dateAlerts,
    visibleFiles,
  } = usePhotoGridAlerts(files);

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
