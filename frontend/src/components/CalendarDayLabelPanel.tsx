import BulkLabelEditors from "./BulkLabelEditors";
import SingleFileLabelEditors from "./SingleFileLabelEditors";
import { CalendarDayLabelContext } from "./CalendarDayPanel";

interface Props {
  context: CalendarDayLabelContext | null;
}

export default function CalendarDayLabelPanel({ context }: Props) {
  if (!context || context.selectedFiles.length === 0) {
    return null;
  }

  const { selectedFiles, onLabelsChange, onDateChange } = context;

  return (
    <div className="calendar-tagging-panel">
      {selectedFiles.length === 1 ? (
        <SingleFileLabelEditors
          file={selectedFiles[0]}
          onLabelsChange={onLabelsChange}
          onDateChange={onDateChange}
          showTagSearch
        />
      ) : (
        <BulkLabelEditors
          selectedFiles={selectedFiles}
          onLabelsChange={onLabelsChange}
          onDateChange={onDateChange}
          showTagSearch
        />
      )}
    </div>
  );
}
