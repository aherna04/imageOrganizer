import { MediaFile } from "../api/client";
import CaptureDateEditor from "./CaptureDateEditor";
import CollapsibleSection from "./CollapsibleSection";
import EventPicker from "./EventPicker";
import FileTagPicker from "./FileTagPicker";
import PersonPicker from "./PersonPicker";

interface Props {
  file: MediaFile;
  /** Tag / person / event assignment changed. */
  onLabelsChange: () => void;
  /** Capture date changed (calendar path invalidation). */
  onDateChange: () => void;
  showTagSearch?: boolean;
}

export default function SingleFileLabelEditors({
  file,
  onLabelsChange,
  onDateChange,
  showTagSearch = false,
}: Props) {
  const eventCount = file.events?.length ?? 0;
  const peopleCount = file.people?.length ?? 0;

  return (
    <div className="single-file-label-editors">
      <CaptureDateEditor files={[file]} onChange={onDateChange} compact />
      <div className="label-editor-columns">
        <CollapsibleSection
          title="Events"
          count={eventCount || undefined}
          defaultOpen={false}
          persistKey="imageOrganizer.collapsible.inbox.events"
        >
          <EventPicker fileId={file.id} fileEvents={file.events ?? []} onChange={onLabelsChange} hideLabel />
        </CollapsibleSection>
        <CollapsibleSection
          title="People"
          count={peopleCount || undefined}
          defaultOpen={false}
          persistKey="imageOrganizer.collapsible.inbox.people"
        >
          <PersonPicker fileId={file.id} filePeople={file.people ?? []} onChange={onLabelsChange} hideLabel />
        </CollapsibleSection>
        <div className="label-editor-tags">
          <FileTagPicker
            fileId={file.id}
            fileTags={file.tags ?? []}
            onChange={onLabelsChange}
            showTagSearch={showTagSearch}
          />
        </div>
      </div>
    </div>
  );
}
