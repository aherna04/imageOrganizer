import { MediaFile } from "../api/client";
import CaptureDateEditor from "./CaptureDateEditor";
import CollapsibleSection from "./CollapsibleSection";
import EventPicker from "./EventPicker";
import FileTagPicker from "./FileTagPicker";
import PersonPicker from "./PersonPicker";

interface Props {
  file: MediaFile;
  onChange: () => void;
  showTagSearch?: boolean;
}

export default function SingleFileLabelEditors({ file, onChange, showTagSearch = false }: Props) {
  const eventCount = file.events?.length ?? 0;
  const peopleCount = file.people?.length ?? 0;

  return (
    <div className="single-file-label-editors">
      <CaptureDateEditor files={[file]} onChange={onChange} compact />
      <CollapsibleSection title="Events" count={eventCount || undefined} defaultOpen={false}>
        <EventPicker fileId={file.id} fileEvents={file.events ?? []} onChange={onChange} hideLabel />
      </CollapsibleSection>
      <CollapsibleSection title="People" count={peopleCount || undefined} defaultOpen={false}>
        <PersonPicker fileId={file.id} filePeople={file.people ?? []} onChange={onChange} hideLabel />
      </CollapsibleSection>
      <FileTagPicker
        fileId={file.id}
        fileTags={file.tags ?? []}
        onChange={onChange}
        showTagSearch={showTagSearch}
      />
    </div>
  );
}
