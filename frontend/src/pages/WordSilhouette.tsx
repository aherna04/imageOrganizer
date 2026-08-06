import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  LetterFrame,
  MediaFile,
  WordSilhouetteFillMode,
  WordSilhouetteRequest,
  WordSilhouetteResult,
  api,
} from "../api/client";
import LetterFrameEditor, { defaultLetterFrame } from "../components/LetterFrameEditor";
import {
  loadWordSilhouettePrefs,
  saveWordSilhouettePrefs,
  type FilterType,
  type LocationFilter,
} from "../utils/wordSilhouettePrefs";

function parseId(raw: string | null): number | null {
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function visibleGlyphs(phrase: string): string[] {
  return [...phrase.trim().replace(/\s+/g, " ")].filter((ch) => !/\s/.test(ch));
}

function resizeFrames(prev: LetterFrame[], count: number): LetterFrame[] {
  if (count <= 0) return [];
  const next = prev.slice(0, count);
  while (next.length < count) next.push(defaultLetterFrame());
  return next;
}

function resizeLetterSlots(prev: (number | null)[], count: number): (number | null)[] {
  if (count <= 0) return [];
  const next = prev.slice(0, count);
  while (next.length < count) next.push(null);
  return next;
}

/** Build API letter_file_ids: fill nulls by cycling first assigned / fillFileId. */
function resolveLetterFileIds(
  slots: (number | null)[],
  fillFileId: number | null,
): number[] | undefined {
  const assigned = slots.filter((id): id is number => id != null && id > 0);
  if (assigned.length === 0 && fillFileId == null) return undefined;
  const fallback = assigned[0] ?? fillFileId!;
  return slots.map((id) => (id != null && id > 0 ? id : fallback));
}

export default function WordSilhouettePage() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const fillFromUrl = parseId(searchParams.get("fill"));
  const saved = useMemo(() => loadWordSilhouettePrefs(), []);

  const [text, setText] = useState(saved.text);
  const [designId, setDesignId] = useState<number | null>(saved.designId);
  const [fillMode, setFillMode] = useState<WordSilhouetteFillMode>(saved.fillMode);
  const [fillFileId, setFillFileId] = useState<number | null>(fillFromUrl ?? saved.fillFileId);
  const [letterIds, setLetterIds] = useState<(number | null)[]>(() =>
    resizeLetterSlots(saved.letterIds, visibleGlyphs(saved.text).length),
  );
  const [letterFrames, setLetterFrames] = useState<LetterFrame[]>(() =>
    resizeFrames(saved.letterFrames, visibleGlyphs(saved.text).length),
  );
  const [debouncedFrames, setDebouncedFrames] = useState<LetterFrame[]>(letterFrames);
  const [selectedGlyph, setSelectedGlyph] = useState(saved.selectedGlyph);
  const [filterType, setFilterType] = useState<FilterType>(saved.filterType);
  const [filterId, setFilterId] = useState<number | null>(
    saved.filterType === "all" ? null : saved.filterId,
  );
  const [location, setLocation] = useState<LocationFilter>(saved.location);
  const [columns, setColumns] = useState(saved.columns);
  const [canvasWidth, setCanvasWidth] = useState(saved.canvasWidth);
  const [background, setBackground] = useState(saved.background);
  const [result, setResult] = useState<WordSilhouetteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [showDesignManage, setShowDesignManage] = useState(false);

  useEffect(() => {
    if (fillFromUrl) setFillFileId(fillFromUrl);
  }, [fillFromUrl]);

  const glyphs = useMemo(() => visibleGlyphs(text), [text]);

  useEffect(() => {
    setLetterFrames((prev) => resizeFrames(prev, glyphs.length));
    setLetterIds((prev) => resizeLetterSlots(prev, glyphs.length));
    setSelectedGlyph((i) => (glyphs.length === 0 ? 0 : Math.min(i, glyphs.length - 1)));
  }, [glyphs.length]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedFrames(letterFrames), 250);
    return () => window.clearTimeout(t);
  }, [letterFrames]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      saveWordSilhouettePrefs({
        text,
        designId,
        fillMode,
        fillFileId,
        letterIds,
        letterFrames,
        selectedGlyph,
        filterType,
        filterId,
        location,
        columns,
        canvasWidth,
        background,
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [
    text,
    designId,
    fillMode,
    fillFileId,
    letterIds,
    letterFrames,
    selectedGlyph,
    filterType,
    filterId,
    location,
    columns,
    canvasWidth,
    background,
  ]);

  const { data: designs = [] } = useQuery({
    queryKey: ["word-silhouette-designs"],
    queryFn: api.listWordSilhouetteDesigns,
  });

  useEffect(() => {
    if (designs.length === 0) return;
    if (designId != null && designs.some((d) => d.id === designId)) return;
    setDesignId(designs[0].id);
  }, [designs, designId]);

  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: api.listTags });
  const { data: people = [] } = useQuery({ queryKey: ["people"], queryFn: api.listPeople });
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: api.listEvents });

  const pickFiltersReady = filterType === "all" || filterId != null;

  const pickListParams = useMemo(() => {
    const params: Record<string, string | number | boolean | (string | number)[] | undefined> = {
      media_type: "image",
      page: 1,
      page_size: 48,
    };
    if (location === "archive") {
      params.location = "archive";
    }
    // location === "all" → omit location (inbox + archive)
    if (filterType === "tag" && filterId != null) params.tag_id = filterId;
    if (filterType === "person" && filterId != null) params.person_id = filterId;
    if (filterType === "event" && filterId != null) params.event_id = filterId;
    return params;
  }, [location, filterType, filterId]);

  const { data: pickList } = useQuery({
    queryKey: ["word-silhouette-picks", pickListParams],
    queryFn: () => api.listFiles(pickListParams),
    enabled: pickFiltersReady,
  });

  const {
    data: fillFile,
    isLoading: fillLoading,
  } = useQuery({
    queryKey: ["file", fillFileId],
    queryFn: () => api.getFile(fillFileId!),
    enabled: fillFileId != null,
  });

  const requestBody: WordSilhouetteRequest | null = useMemo(() => {
    if (!text.trim() || designId == null) return null;
    if (fillMode === "single" && fillFileId == null) return null;
    if (fillMode === "mosaic") {
      if (fillFileId == null) return null;
      if (filterType !== "all" && filterId == null) return null;
    }
    const resolvedLetters =
      fillMode === "per_letter" ? resolveLetterFileIds(letterIds, fillFileId) : undefined;
    if (fillMode === "per_letter") {
      const hasLetters = resolvedLetters != null && resolvedLetters.length > 0;
      const hasFill = fillFileId != null;
      const hasPool = filterType === "all" || filterId != null;
      if (!hasLetters && !hasFill && !hasPool) return null;
      if (!hasLetters && !hasFill && filterType !== "all" && filterId == null) return null;
    }
    return {
      text: text.trim(),
      design_id: designId,
      fill_mode: fillMode,
      fill_file_id: fillFileId ?? undefined,
      guide_file_id: fillMode === "mosaic" ? fillFileId ?? undefined : undefined,
      letter_file_ids: resolvedLetters,
      letter_frames:
        fillMode === "per_letter" && glyphs.length > 0
          ? resizeFrames(debouncedFrames, glyphs.length)
          : undefined,
      filter_type: fillMode === "single" ? "all" : filterType,
      filter_id: filterType === "all" ? undefined : filterId ?? undefined,
      location,
      columns,
      canvas_width: canvasWidth,
      background,
    };
  }, [
    text,
    designId,
    fillMode,
    fillFileId,
    letterIds,
    debouncedFrames,
    glyphs.length,
    filterType,
    filterId,
    location,
    columns,
    canvasWidth,
    background,
  ]);

  const {
    data: preview,
    isFetching: previewLoading,
    error: previewError,
  } = useQuery({
    queryKey: ["word-silhouette-preview", requestBody],
    queryFn: () => api.wordSilhouettePreview(requestBody!),
    enabled: requestBody != null,
  });

  const generate = useMutation({
    mutationFn: () => api.wordSilhouetteGenerate(requestBody!),
    onSuccess: (data) => {
      setResult(data);
      setError(null);
      qc.invalidateQueries({ queryKey: ["files"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
    onError: (err: Error) => setError(err.message || "Generation failed"),
  });

  const createDesign = useMutation({
    mutationFn: ({ name, file }: { name: string; file: File }) =>
      api.createWordSilhouetteDesign(name, file),
    onSuccess: (design) => {
      qc.invalidateQueries({ queryKey: ["word-silhouette-designs"] });
      setDesignId(design.id);
      setUploadName("");
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteDesign = useMutation({
    mutationFn: (id: number) => api.deleteWordSilhouetteDesign(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["word-silhouette-designs"] });
      setDesignId(null);
    },
  });

  const filterOptions =
    filterType === "tag" ? tags : filterType === "person" ? people : filterType === "event" ? events : [];

  const canGenerate = requestBody != null && !generate.isPending && !previewLoading;

  const selectedLetterPhotoId = useMemo(() => {
    if (glyphs.length === 0) return null;
    const slot = letterIds[selectedGlyph];
    if (slot != null && slot > 0) return slot;
    if (fillFileId != null) return fillFileId;
    const items = pickList?.items ?? [];
    if (items.length === 0) return null;
    return items[selectedGlyph % items.length]?.id ?? null;
  }, [glyphs.length, letterIds, selectedGlyph, fillFileId, pickList?.items]);

  const assignedLetterCount = useMemo(
    () => letterIds.filter((id) => id != null && id > 0).length,
    [letterIds],
  );

  const selectFill = (file: MediaFile) => {
    setFillFileId(file.id);
    setSearchParams({ fill: String(file.id) });
    setResult(null);
    setError(null);
  };

  const assignLetterPhoto = (fileId: number) => {
    setLetterIds((prev) => {
      const next = resizeLetterSlots(prev, glyphs.length);
      if (selectedGlyph < 0 || selectedGlyph >= next.length) return next;
      next[selectedGlyph] = fileId;
      return [...next];
    });
    setResult(null);
    setError(null);
  };

  return (
    <div className="word-silhouette-page">
      <div className="page-header">
        <h2>Word Silhouette</h2>
      </div>

      <p className="word-silhouette-intro">
        Fill a word or phrase with photos using a saved font design. Outputs are saved to the library and
        tagged <Link to="/browse/tags?tag=word-silhouette">word-silhouette</Link>.
      </p>

      <section className="settings-section word-silhouette-controls">
        <h3 className="settings-section-title">Text &amp; design</h3>
        <div className="word-silhouette-control-row">
          <label className="word-silhouette-field">
            Phrase
            <input
              type="text"
              value={text}
              maxLength={80}
              onChange={(e) => {
                setText(e.target.value);
                setResult(null);
              }}
              placeholder="Your word or phrase"
            />
          </label>
          <label className="word-silhouette-field">
            Font design
            <select
              value={designId ?? ""}
              onChange={(e) => {
                setDesignId(e.target.value ? Number(e.target.value) : null);
                setResult(null);
              }}
            >
              {designs.length === 0 && <option value="">No designs yet</option>}
              {designs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="link-btn"
            onClick={() => setShowDesignManage((v) => !v)}
          >
            {showDesignManage ? "Hide fonts" : "Manage fonts"}
          </button>
        </div>

        {showDesignManage && (
          <div className="word-silhouette-design-manage">
            <div className="word-silhouette-control-row">
              <input
                type="text"
                placeholder="New design name"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
              />
              <input
                type="file"
                accept=".ttf,.otf,font/ttf,font/otf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file || !uploadName.trim()) {
                    setError("Enter a design name and choose a .ttf/.otf file");
                    return;
                  }
                  createDesign.mutate({ name: uploadName.trim(), file });
                  e.target.value = "";
                }}
              />
              {designId != null && designs.length > 1 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (window.confirm("Delete this font design?")) deleteDesign.mutate(designId);
                  }}
                >
                  Delete selected
                </button>
              )}
            </div>
            <p className="word-silhouette-hint">Upload OFL or other licensed .ttf / .otf fonts.</p>
          </div>
        )}

        <div className="word-silhouette-mode-tabs">
          {(
            [
              ["single", "Single image"],
              ["mosaic", "Mosaic fill"],
              ["per_letter", "Per letter"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`word-silhouette-mode-tab${fillMode === mode ? " active" : ""}`}
              onClick={() => {
                setFillMode(mode);
                setResult(null);
                setError(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="word-silhouette-control-row">
          <label className="word-silhouette-field">
            Width
            <input
              type="number"
              min={400}
              max={4000}
              step={100}
              value={canvasWidth}
              onChange={(e) => {
                setCanvasWidth(Number(e.target.value) || 1600);
                setResult(null);
              }}
            />
          </label>
          <label className="word-silhouette-field">
            Background
            <input
              type="color"
              value={background}
              onChange={(e) => {
                setBackground(e.target.value);
                setResult(null);
              }}
            />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">
          {fillMode === "single"
            ? "Fill photo"
            : fillMode === "mosaic"
              ? "Guide photo & tile pool"
              : "Letter photos"}
        </h3>

        {fillFileId && fillLoading ? (
          <p className="word-silhouette-hint">Loading photo…</p>
        ) : fillFile ? (
          <div className="word-silhouette-source-fixed">
            <img src={api.thumbUrl(fillFile.id)} alt={fillFile.filename} />
            <div className="word-silhouette-source-meta">
              <span>{fillFile.filename}</span>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setFillFileId(null);
                  setSearchParams({});
                }}
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <p className="word-silhouette-hint">
            Pick a photo below, or open a photo and choose <strong>Use in Word Silhouette</strong>.
          </p>
        )}

        <div className="word-silhouette-control-row" style={{ marginTop: "0.75rem" }}>
          <select
            value={location}
            onChange={(e) => {
              setLocation(e.target.value as LocationFilter);
              setResult(null);
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
          {fillMode === "mosaic" && (
            <label className="word-silhouette-columns-label">
              Detail
              <input
                type="range"
                min={20}
                max={100}
                value={columns}
                onChange={(e) => {
                  setColumns(Number(e.target.value));
                  setResult(null);
                }}
              />
              <span>{columns} cols</span>
            </label>
          )}
        </div>

        {!pickFiltersReady && (
          <p className="word-silhouette-hint">Select a {filterType} to browse photos.</p>
        )}

        {fillMode === "per_letter" && (
          <p className="word-silhouette-hint">
            Select a letter, then click a photo to assign it to that letter. Unassigned letters use the
            pool (or cycle assigned photos).
            {assignedLetterCount > 0 && (
              <>
                {" "}
                · {assignedLetterCount}/{glyphs.length} assigned{" "}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setLetterIds(resizeLetterSlots([], glyphs.length))}
                >
                  Clear letters
                </button>
              </>
            )}
          </p>
        )}

        {fillMode === "per_letter" && glyphs.length > 0 && (
          <LetterFrameEditor
            glyphs={glyphs}
            selectedIndex={selectedGlyph}
            onSelectIndex={setSelectedGlyph}
            frames={letterFrames}
            photoFileId={selectedLetterPhotoId}
            designId={designId}
            onChangeFrame={(index, frame) => {
              setLetterFrames((prev) => {
                const next = resizeFrames(prev, glyphs.length);
                next[index] = frame;
                return [...next];
              });
              setResult(null);
            }}
          />
        )}

        {pickFiltersReady && (
          <div className="word-silhouette-pick-grid">
            {(pickList?.items ?? []).map((file) => {
              const glyphSlots = letterIds
                .map((id, i) => (id === file.id ? i : -1))
                .filter((i) => i >= 0);
              const selected =
                fillMode === "per_letter"
                  ? letterIds[selectedGlyph] === file.id
                  : fillFileId === file.id;
              const badgeIndex = glyphSlots[0] ?? -1;
              return (
                <button
                  key={file.id}
                  type="button"
                  className={`word-silhouette-pick${selected ? " selected" : ""}`}
                  onClick={() =>
                    fillMode === "per_letter" ? assignLetterPhoto(file.id) : selectFill(file)
                  }
                  title={
                    fillMode === "per_letter" && glyphSlots.length > 0
                      ? `Letter(s) ${glyphSlots.map((i) => i + 1).join(", ")}`
                      : file.filename
                  }
                >
                  <img src={api.thumbUrl(file.id)} alt="" />
                  {badgeIndex >= 0 && (
                    <span className="word-silhouette-pick-badge">{badgeIndex + 1}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="word-silhouette-actions">
        <button
          type="button"
          className="btn"
          disabled={!canGenerate}
          onClick={() => generate.mutate()}
        >
          {generate.isPending ? "Generating…" : "Generate"}
        </button>
        {(error || previewError) && (
          <p className="word-silhouette-error">
            {error || (previewError as Error)?.message || "Preview failed"}
          </p>
        )}
      </div>

      {preview && (
        <section className="word-silhouette-preview-section">
          <h3 className="settings-section-title">Preview</h3>
          <p className="word-silhouette-hint">
            {preview.glyph_count} letters · {preview.width}×{preview.height} px
            {preview.tile_count > 0 && ` · ${preview.tile_count} pool photos`}
            {previewLoading && " · refreshing…"}
          </p>
          <img
            className="word-silhouette-preview-image"
            src={preview.preview_url}
            alt="Word silhouette preview"
          />
        </section>
      )}

      {result && (
        <section className="word-silhouette-result-section">
          <h3 className="settings-section-title">Result</h3>
          <p className="word-silhouette-hint">
            Saved to library · tagged{" "}
            <Link to="/browse/tags?tag=word-silhouette">word-silhouette</Link>
          </p>
          <div className="word-silhouette-result-actions">
            <a className="btn btn-secondary" href={result.url} download={result.filename}>
              Download
            </a>
            <a className="btn btn-secondary" href={result.url} target="_blank" rel="noreferrer">
              Open full size
            </a>
          </div>
          <img className="word-silhouette-result-image" src={result.url} alt="Generated word silhouette" />
        </section>
      )}
    </div>
  );
}
