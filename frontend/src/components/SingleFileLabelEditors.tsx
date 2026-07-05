import { MediaFile } from "../api/client";
import CaptureDateEditor from "./CaptureDateEditor";
import EventPicker from "./EventPicker";
import FileTagPicker from "./FileTagPicker";
import PersonPicker from "./PersonPicker";

interface Props {
  file: MediaFile;
  onChange: () => void;
}

export default function SingleFileLabelEditors({ file, onChange }: Props) {
  return (
    <div className="single-file-label-editors">
      <CaptureDateEditor files={[file]} onChange={onChange} />
      <EventPicker fileId={file.id} fileEvents={file.events ?? []} onChange={onChange} />
      <div style={{ marginTop: "0.75rem" }}>
        <PersonPicker fileId={file.id} filePeople={file.people ?? []} onChange={onChange} />
      </div>
      <div style={{ marginTop: "0.75rem" }}>
        <FileTagPicker fileId={file.id} fileTags={file.tags ?? []} onChange={onChange} />
      </div>
    </div>
  );
}
