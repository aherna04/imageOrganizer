import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { MediaFile, Person, Tag, api } from "../api/client";
import BulkEventAssignBar from "../components/BulkEventAssignBar";
import BulkLabelEditors from "../components/BulkLabelEditors";
import PhotoGridWithAlerts from "../components/PhotoGridWithAlerts";
import PhotoDetail from "../components/PhotoDetail";
import SingleFileLabelEditors from "../components/SingleFileLabelEditors";
import { invalidateAfterDateChange } from "../utils/invalidateAfterDateChange";
import { invalidateAfterLabelChange } from "../utils/invalidateAfterLabelChange";
import { personLabel } from "../utils/personLabel";
import { togglePhotoSelection } from "../utils/photoSelection";

function browseFilterPath(opts: {
  tagSlugs?: string[];
  personSlugs?: string[];
  cameraNames?: string[];
}) {
  const tags = opts.tagSlugs ?? [];
  const persons = opts.personSlugs ?? [];
  const cameras = opts.cameraNames ?? [];
  if (tags.length === 0 && persons.length === 0 && cameras.length === 0) return "/browse";
  const q = new URLSearchParams();
  for (const slug of tags) q.append("tag", slug);
  for (const slug of persons) q.append("person", slug);
  for (const name of cameras) q.append("camera", name);
  return `/browse/tags?${q.toString()}`;
}

export default function BrowsePage() {
  const { kind, slug } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [detailFile, setDetailFile] = useState<MediaFile | null>(null);
  const [labelMode, setLabelMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const selectionAnchorRef = useRef<number | null>(null);

  const isFilterRoute = location.pathname === "/browse/tags";

  useEffect(() => {
    if (kind === "tag" && slug) {
      navigate(browseFilterPath({ tagSlugs: [slug] }), { replace: true });
    } else if (kind === "person" && slug) {
      navigate(browseFilterPath({ personSlugs: [slug] }), { replace: true });
    } else if (kind === "camera" && slug) {
      navigate(browseFilterPath({ cameraNames: [decodeURIComponent(slug)] }), { replace: true });
    }
  }, [kind, slug, navigate]);

  const { data: people = [] } = useQuery({
    queryKey: ["people"],
    queryFn: api.listPeople,
  });

  const { data: tags = [] } = useQuery({
    queryKey: ["tags"],
    queryFn: api.listTags,
  });

  const { data: cameras = [] } = useQuery({
    queryKey: ["cameras"],
    queryFn: async () => (await api.listCameras()).cameras,
  });

  const selectedTagSlugs = useMemo(() => {
    if (!isFilterRoute) return [] as string[];
    return searchParams.getAll("tag").filter(Boolean);
  }, [isFilterRoute, searchParams]);

  const selectedPersonSlugs = useMemo(() => {
    if (!isFilterRoute) return [] as string[];
    return searchParams.getAll("person").filter(Boolean);
  }, [isFilterRoute, searchParams]);

  const selectedCameraNames = useMemo(() => {
    if (!isFilterRoute) return [] as string[];
    return searchParams.getAll("camera").filter(Boolean);
  }, [isFilterRoute, searchParams]);

  const selectedTags = useMemo((): Tag[] => {
    return selectedTagSlugs
      .map((s) => tags.find((t) => t.slug === s))
      .filter((t): t is Tag => t != null);
  }, [selectedTagSlugs, tags]);

  const selectedPeople = useMemo((): Person[] => {
    return selectedPersonSlugs
      .map((s) => people.find((p) => p.slug === s))
      .filter((p): p is Person => p != null);
  }, [selectedPersonSlugs, people]);

  const selectedTagIds = useMemo(() => selectedTags.map((t) => t.id), [selectedTags]);
  const selectedPersonIds = useMemo(() => selectedPeople.map((p) => p.id), [selectedPeople]);

  const hasSelection =
    selectedTagSlugs.length > 0 ||
    selectedPersonSlugs.length > 0 ||
    selectedCameraNames.length > 0;
  const filtersResolved =
    selectedTagIds.length === selectedTagSlugs.length &&
    selectedPersonIds.length === selectedPersonSlugs.length;

  const browseFilesKey = [
    "browse-files",
    selectedTagIds.join(","),
    selectedPersonIds.join(","),
    selectedCameraNames.join("\0"),
  ] as const;

  const { data: photos, refetch: refetchPhotos } = useQuery({
    queryKey: browseFilesKey,
    queryFn: () =>
      api.listFiles({
        tag_id: selectedTagIds.length ? selectedTagIds : undefined,
        person_id: selectedPersonIds.length ? selectedPersonIds : undefined,
        camera: selectedCameraNames.length ? selectedCameraNames : undefined,
        page_size: 200,
      }),
    enabled: hasSelection && filtersResolved,
  });

  const { data: cooccurringData } = useQuery({
    queryKey: [
      "browse-cooccurring",
      selectedTagIds.join(","),
      selectedPersonIds.join(","),
      selectedCameraNames.join("\0"),
    ],
    queryFn: () =>
      api.listBrowseCooccurring({
        tagIds: selectedTagIds,
        personIds: selectedPersonIds,
        cameraNames: selectedCameraNames,
      }),
    enabled: hasSelection && filtersResolved,
  });

  const cooccurringTags = cooccurringData?.tags ?? [];
  const cooccurringPeople = cooccurringData?.people ?? [];
  const cooccurringCameras = cooccurringData?.cameras ?? [];

  useEffect(() => {
    setSelectedIds([]);
    selectionAnchorRef.current = null;
  }, [selectedTagIds.join(","), selectedPersonIds.join(","), selectedCameraNames.join("\0")]);

  const catalogPeople = useMemo(() => {
    const q = search.toLowerCase();
    return people.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [people, search]);

  const filteredCoPeople = useMemo(() => {
    const q = search.toLowerCase();
    return cooccurringPeople.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [cooccurringPeople, search]);

  const catalogTags = useMemo(() => {
    const q = search.toLowerCase();
    return tags.filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [tags, search]);

  const filteredCoTags = useMemo(() => {
    const q = search.toLowerCase();
    return cooccurringTags.filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [cooccurringTags, search]);

  const catalogCameras = useMemo(() => {
    const q = search.toLowerCase();
    return cameras.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [cameras, search]);

  const filteredCoCameras = useMemo(() => {
    const q = search.toLowerCase();
    return cooccurringCameras.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [cooccurringCameras, search]);

  const selectionLabel = hasSelection
    ? [
        ...selectedPeople.map((p) => personLabel(p, people)),
        ...selectedTags.map((t) => t.name),
        ...selectedCameraNames,
      ].join(" · ") || null
    : null;

  const invalidateBrowseFiles = () => {
    qc.invalidateQueries({ queryKey: ["browse-files"] });
    qc.invalidateQueries({ queryKey: ["browse-cooccurring"] });
  };

  const toggleSelect = (id: number, event: React.MouseEvent) => {
    const files = photos?.items ?? [];
    const result = togglePhotoSelection(
      files,
      selectedIds,
      id,
      event.shiftKey,
      selectionAnchorRef.current,
    );
    selectionAnchorRef.current = result.anchorIndex;
    setSelectedIds(result.selectedIds);
  };

  const handleLabelsChange = (keepFileId?: number) => {
    const openId = keepFileId ?? detailFile?.id;
    invalidateBrowseFiles();
    invalidateAfterLabelChange(qc);
    if (openId) {
      refetchPhotos().then(({ data: browseData }) => {
        const still = browseData?.items.find((f) => f.id === openId);
        setDetailFile(still ?? null);
      });
    }
  };

  const exitLabelMode = () => {
    setLabelMode(false);
    setSelectedIds([]);
    selectionAnchorRef.current = null;
  };

  const addTagSlug = (nextSlug: string) => {
    if (selectedTagSlugs.includes(nextSlug)) return;
    navigate(
      browseFilterPath({
        tagSlugs: [...selectedTagSlugs, nextSlug],
        personSlugs: selectedPersonSlugs,
        cameraNames: selectedCameraNames,
      }),
    );
  };

  const addPersonSlug = (nextSlug: string) => {
    if (selectedPersonSlugs.includes(nextSlug)) return;
    navigate(
      browseFilterPath({
        tagSlugs: selectedTagSlugs,
        personSlugs: [...selectedPersonSlugs, nextSlug],
        cameraNames: selectedCameraNames,
      }),
    );
  };

  const addCameraName = (name: string) => {
    if (selectedCameraNames.includes(name)) return;
    navigate(
      browseFilterPath({
        tagSlugs: selectedTagSlugs,
        personSlugs: selectedPersonSlugs,
        cameraNames: [...selectedCameraNames, name],
      }),
    );
  };

  const removeTagSlug = (removeSlug: string) => {
    navigate(
      browseFilterPath({
        tagSlugs: selectedTagSlugs.filter((s) => s !== removeSlug),
        personSlugs: selectedPersonSlugs,
        cameraNames: selectedCameraNames,
      }),
    );
  };

  const removePersonSlug = (removeSlug: string) => {
    navigate(
      browseFilterPath({
        tagSlugs: selectedTagSlugs,
        personSlugs: selectedPersonSlugs.filter((s) => s !== removeSlug),
        cameraNames: selectedCameraNames,
      }),
    );
  };

  const removeCameraName = (name: string) => {
    navigate(
      browseFilterPath({
        tagSlugs: selectedTagSlugs,
        personSlugs: selectedPersonSlugs,
        cameraNames: selectedCameraNames.filter((c) => c !== name),
      }),
    );
  };

  const clearFilter = () => {
    navigate("/browse");
  };

  const selectedFiles = photos?.items.filter((f) => selectedIds.includes(f.id)) ?? [];
  const showResults = hasSelection && filtersResolved;
  const peopleList = hasSelection ? filteredCoPeople : catalogPeople;
  const camerasList = hasSelection ? filteredCoCameras : catalogCameras;
  const tagsListMode = hasSelection;

  return (
    <div>
      <div className="page-header">
        <h2>Browse</h2>
      </div>
      <p style={{ color: "#8891a0", marginBottom: "1rem" }}>
        Search photos by person, tag, or camera. Select multiple labels to narrow with AND intersection.
      </p>

      <div className="browse-layout">
        <aside className="browse-sidebar">
          <input
            type="search"
            placeholder="Filter list..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="browse-search"
          />

          <section className="browse-section">
            <h3 className="browse-section-title">People</h3>
            <ul className="browse-list">
              {hasSelection
                ? peopleList.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="browse-list-btn"
                        onClick={() => addPersonSlug(p.slug)}
                      >
                        <span>{personLabel(p, people)}</span>
                        <span className="browse-count">{p.photo_count}</span>
                      </button>
                    </li>
                  ))
                : catalogPeople.map((p) => (
                    <li key={p.id}>
                      <Link
                        to={browseFilterPath({ personSlugs: [p.slug] })}
                        className="browse-list-item"
                      >
                        <span>{personLabel(p, people)}</span>
                        <span className="browse-count">{p.photo_count}</span>
                      </Link>
                    </li>
                  ))}
              {peopleList.length === 0 && (
                <li className="browse-empty">
                  {hasSelection
                    ? "No other people in this selection."
                    : "No people yet. Tag people on photos from Inbox or Calendar."}
                </li>
              )}
            </ul>
          </section>

          <section className="browse-section">
            <h3 className="browse-section-title">
              {tagsListMode ? "Also tagged" : "Tags"}
            </h3>
            {tagsListMode ? (
              <ul className="browse-list">
                {filteredCoTags.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="browse-list-btn"
                      onClick={() => addTagSlug(t.slug)}
                    >
                      <span>{t.name}</span>
                      <span className="browse-count">{t.photo_count}</span>
                    </button>
                  </li>
                ))}
                {filteredCoTags.length === 0 && (
                  <li className="browse-empty">No other tags in this selection.</li>
                )}
              </ul>
            ) : (
              <ul className="browse-list">
                {catalogTags.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={browseFilterPath({ tagSlugs: [t.slug] })}
                      className="browse-list-item"
                    >
                      <span>{t.name}</span>
                      <span className="browse-count">{t.photo_count}</span>
                    </Link>
                  </li>
                ))}
                {catalogTags.length === 0 && (
                  <li className="browse-empty">No tags yet. Tag photos from Inbox or Calendar, or create tags on the Tags page.</li>
                )}
              </ul>
            )}
          </section>

          <section className="browse-section">
            <h3 className="browse-section-title">Cameras</h3>
            <ul className="browse-list">
              {hasSelection
                ? camerasList.map((c) => (
                    <li key={c.name}>
                      <button
                        type="button"
                        className="browse-list-btn"
                        onClick={() => addCameraName(c.name)}
                      >
                        <span>{c.name}</span>
                        <span className="browse-count">{c.photo_count}</span>
                      </button>
                    </li>
                  ))
                : catalogCameras.map((c) => (
                    <li key={c.name}>
                      <Link
                        to={browseFilterPath({ cameraNames: [c.name] })}
                        className="browse-list-item"
                      >
                        <span>{c.name}</span>
                        <span className="browse-count">{c.photo_count}</span>
                      </Link>
                    </li>
                  ))}
              {camerasList.length === 0 && (
                <li className="browse-empty">
                  {hasSelection
                    ? "No other cameras in this selection."
                    : "No cameras yet. Scan archive or inbox to read camera info from EXIF."}
                </li>
              )}
            </ul>
          </section>
        </aside>

        <div className="browse-results">
          {showResults ? (
            <>
              <div className={`browse-results-header${labelMode ? " browse-results-header-label-mode" : ""}`}>
                <h3>{selectionLabel}</h3>
                <div className="browse-results-header-actions">
                  <span className="badge browse-results-count">
                    {photos?.total ?? 0} photos
                  </span>
                  {labelMode ? (
                    <button type="button" className="btn btn-secondary" onClick={exitLabelMode}>
                      Done labeling
                    </button>
                  ) : (
                    <button type="button" className="btn btn-secondary" onClick={() => setLabelMode(true)}>
                      Label photos
                    </button>
                  )}
                </div>
              </div>

              <div className="browse-active-tags">
                {selectedPeople.map((p) => (
                  <button
                    key={`p-${p.id}`}
                    type="button"
                    className="browse-active-tag-chip person"
                    onClick={() => removePersonSlug(p.slug)}
                    title={`Remove ${p.name}`}
                  >
                    {personLabel(p, people)}
                    <span aria-hidden>×</span>
                  </button>
                ))}
                {selectedTags.map((t) => (
                  <button
                    key={`t-${t.id}`}
                    type="button"
                    className="browse-active-tag-chip"
                    onClick={() => removeTagSlug(t.slug)}
                    title={`Remove ${t.name}`}
                  >
                    {t.name}
                    <span aria-hidden>×</span>
                  </button>
                ))}
                {selectedCameraNames.map((name) => (
                  <button
                    key={`c-${name}`}
                    type="button"
                    className="browse-active-tag-chip"
                    onClick={() => removeCameraName(name)}
                    title={`Remove ${name}`}
                  >
                    {name}
                    <span aria-hidden>×</span>
                  </button>
                ))}
                <button type="button" className="link-btn" onClick={clearFilter}>
                  Clear
                </button>
              </div>

              {labelMode && (
                <>
                  <BulkEventAssignBar
                    selectedIds={selectedIds}
                    totalCount={photos?.total}
                    onSelectAll={() => setSelectedIds(photos?.items.map((f) => f.id) ?? [])}
                    onClear={() => {
                      setSelectedIds([]);
                      selectionAnchorRef.current = null;
                    }}
                  />

                  {selectedIds.length === 1 && selectedFiles[0] && (
                    <SingleFileLabelEditors
                      file={selectedFiles[0]}
                      onLabelsChange={handleLabelsChange}
                      onDateChange={() => {
                        invalidateAfterDateChange(qc);
                        invalidateBrowseFiles();
                      }}
                      showTagSearch
                    />
                  )}
                  {selectedIds.length >= 2 && (
                    <BulkLabelEditors
                      selectedFiles={selectedFiles}
                      onLabelsChange={handleLabelsChange}
                      onDateChange={() => {
                        invalidateAfterDateChange(qc);
                        invalidateBrowseFiles();
                      }}
                      showTagSearch
                    />
                  )}
                </>
              )}

              <PhotoGridWithAlerts
                files={photos?.items ?? []}
                activeDetailId={detailFile?.id}
                editableLabels
                onLabelsChange={handleLabelsChange}
                onAlertsChange={() => {
                  invalidateAfterDateChange(qc);
                  invalidateBrowseFiles();
                }}
                {...(labelMode
                  ? {
                      selectedIds,
                      onToggleSelect: toggleSelect,
                      onOpenDetail: setDetailFile,
                      multiSelectMode: true,
                    }
                  : {
                      onSelect: setDetailFile,
                    })}
              />
            </>
          ) : (
            <div className="empty-state">Select a person, tag, or camera to browse photos.</div>
          )}
        </div>
      </div>

      {detailFile && (
        <PhotoDetail
          file={detailFile}
          files={photos?.items ?? []}
          onChangeFile={setDetailFile}
          onDateChange={() => {
            invalidateAfterDateChange(qc);
            invalidateBrowseFiles();
          }}
          onLabelsChange={handleLabelsChange}
          onClose={() => setDetailFile(null)}
        />
      )}
    </div>
  );
}
