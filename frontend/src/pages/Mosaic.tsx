import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MediaFile, MosaicResult, api } from "../api/client";
import { personLabel } from "../utils/personLabel";

type FilterType = "all" | "tag" | "person" | "event";
type LocationFilter = "archive" | "all";

function parseSourceId(raw: string | null): number | null {
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export default function MosaicPage() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const sourceId = parseSourceId(searchParams.get("source"));

  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterId, setFilterId] = useState<number | null>(null);
  const [location, setLocation] = useState<LocationFilter>("archive");
  const [columns, setColumns] = useState(60);
  const [result, setResult] = useState<MosaicResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: api.listTags });
  const { data: people = [] } = useQuery({ queryKey: ["people"], queryFn: api.listPeople });
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: api.listEvents });

  const {
    data: sourceFile,
    isLoading: sourceLoading,
    isError: sourceError,
  } = useQuery({
    queryKey: ["file", sourceId],
    queryFn: () => api.getFile(sourceId!),
    enabled: sourceId != null,
  });

  const mosaicRequest = useMemo(() => {
    if (!sourceFile || sourceFile.media_type !== "image") return null;
    return {
      source_file_id: sourceFile.id,
      filter_type: filterType,
      filter_id: filterType === "all" ? undefined : filterId ?? undefined,
      location,
      columns,
    };
  }, [sourceFile, filterType, filterId, location, columns]);

  const { data: preview } = useQuery({
    queryKey: ["mosaic-preview", mosaicRequest],
    queryFn: () => api.mosaicPreview(mosaicRequest!),
    enabled: mosaicRequest != null && (filterType === "all" || filterId != null),
  });

  const generate = useMutation({
    mutationFn: () => api.mosaicGenerate(mosaicRequest!),
    onSuccess: (data) => {
      setResult(data);
      setError(null);
      qc.invalidateQueries({ queryKey: ["files"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
    onError: (err: Error) => {
      setError(err.message || "Mosaic generation failed");
    },
  });

  const canGenerate =
    sourceFile?.media_type === "image" &&
    (filterType === "all" || filterId != null) &&
    (preview?.tile_count ?? 0) >= 5 &&
    !generate.isPending;

  const filterOptions =
    filterType === "tag" ? tags : filterType === "person" ? people : filterType === "event" ? events : [];

  const applyFilter = (type: FilterType, id: number | null) => {
    setFilterType(type);
    setFilterId(id);
    setResult(null);
    setError(null);
  };

  const clearSource = () => {
    setSearchParams({});
    setResult(null);
    setError(null);
  };

  const suggestions = useMemo(() => {
    if (!sourceFile) return [];
    const chips: { key: string; label: string; type: FilterType; id: number | null }[] = [
      { key: "all", label: "All archive", type: "all", id: null },
    ];
    for (const tag of sourceFile.tags ?? []) {
      chips.push({ key: `tag-${tag.id}`, label: `Tag: ${tag.name}`, type: "tag", id: tag.id });
    }
    for (const person of sourceFile.people ?? []) {
      chips.push({
        key: `person-${person.id}`,
        label: `Person: ${personLabel(person, people)}`,
        type: "person",
        id: person.id,
      });
    }
    for (const event of sourceFile.events ?? []) {
      chips.push({ key: `event-${event.id}`, label: `Event: ${event.name}`, type: "event", id: event.id });
    }
    return chips;
  }, [sourceFile, people]);

  const isSuggestionActive = (type: FilterType, id: number | null) =>
    filterType === type && (type === "all" ? filterId == null : filterId === id);

  return (
    <div className="mosaic-page">
      <div className="page-header">
        <h2>Mosaic</h2>
      </div>

      {!sourceId ? (
        <section className="mosaic-empty-state">
          <p className="mosaic-intro">
            Open a photo and choose <strong>Create mosaic</strong>, or pick a source from your library.
          </p>
          <p className="mosaic-hint">
            <Link to="/calendar">Calendar</Link>
            {" · "}
            <Link to="/inbox">Inbox</Link>
          </p>
        </section>
      ) : sourceLoading ? (
        <p className="mosaic-hint">Loading source photo…</p>
      ) : sourceError || !sourceFile ? (
        <p className="mosaic-error">Source photo not found.</p>
      ) : sourceFile.media_type !== "image" ? (
        <p className="mosaic-error">Mosaic source must be an image, not a video.</p>
      ) : (
        <>
          <section className="mosaic-source-section">
            <div className="mosaic-source-header">
              <h3 className="settings-section-title">Source photo</h3>
              <button type="button" className="link-btn" onClick={clearSource}>
                Change source
              </button>
            </div>
            <SourcePreview file={sourceFile} />
          </section>

          <section className="mosaic-controls settings-section">
            <h3 className="settings-section-title">Tile pool</h3>
            {suggestions.length > 1 && (
              <div className="mosaic-tile-suggestions">
                {suggestions.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    className={`mosaic-suggestion-chip${isSuggestionActive(chip.type, chip.id) ? " active" : ""}`}
                    onClick={() => applyFilter(chip.type, chip.id)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}
            <div className="mosaic-control-row">
              <select
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value as LocationFilter);
                  setResult(null);
                  setError(null);
                }}
              >
                <option value="archive">Archive only</option>
                <option value="all">Archive + inbox</option>
              </select>
              <select
                value={filterType}
                onChange={(e) => {
                  setFilterType(e.target.value as FilterType);
                  setFilterId(null);
                  setResult(null);
                  setError(null);
                }}
              >
                <option value="all">All photos</option>
                <option value="tag">Tag</option>
                <option value="person">Person</option>
                <option value="event">Event</option>
              </select>
              {filterType !== "all" && (
                <select
                  value={filterId ?? ""}
                  onChange={(e) => {
                    setFilterId(e.target.value ? Number(e.target.value) : null);
                    setResult(null);
                    setError(null);
                  }}
                >
                  <option value="">Select {filterType}…</option>
                  {filterOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              )}
              <label className="mosaic-columns-label">
                Detail
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={columns}
                  onChange={(e) => {
                    setColumns(Number(e.target.value));
                    setResult(null);
                    setError(null);
                  }}
                />
                <span>{columns} cols</span>
              </label>
            </div>

            {filterType !== "all" && !filterId ? (
              <p className="mosaic-hint">Select a {filterType} to preview tile count.</p>
            ) : preview ? (
              <p className="mosaic-preview-stats">
                {preview.tile_count.toLocaleString()} tile photos · {preview.columns}×{preview.rows} grid ·{" "}
                {preview.output_width}×{preview.output_height} px
                {preview.tile_count < 5 && " · need at least 5 tile photos"}
              </p>
            ) : null}
          </section>

          <div className="mosaic-actions">
            <button
              type="button"
              className="btn"
              disabled={!canGenerate}
              onClick={() => generate.mutate()}
            >
              {generate.isPending ? "Generating…" : "Generate mosaic"}
            </button>
            {error && <p className="mosaic-error">{error}</p>}
          </div>

          {result && (
            <section className="mosaic-result-section">
              <h3 className="settings-section-title">Result</h3>
              <p className="mosaic-result-meta">
                {result.width}×{result.height} px · {result.tile_count} tiles · {result.columns}×{result.rows}{" "}
                grid
              </p>
              <p className="mosaic-hint">
                Saved to library · tagged{" "}
                <Link to="/browse/tags?tag=mosaic">mosaic</Link>
              </p>
              <div className="mosaic-result-actions">
                <a className="btn btn-secondary" href={result.url} download={result.filename}>
                  Download
                </a>
                <a className="btn btn-secondary" href={result.url} target="_blank" rel="noreferrer">
                  Open full size
                </a>
              </div>
              <img className="mosaic-result-image" src={result.url} alt="Generated mosaic" />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SourcePreview({ file }: { file: MediaFile }) {
  return (
    <div className="mosaic-source-fixed">
      <img src={api.thumbUrl(file.id)} alt={file.filename} />
      <div className="mosaic-source-fixed-meta">
        <span className="mosaic-source-fixed-filename">{file.filename}</span>
        {file.capture_date && (
          <span className="mosaic-source-fixed-date">{file.capture_date}</span>
        )}
      </div>
    </div>
  );
}
