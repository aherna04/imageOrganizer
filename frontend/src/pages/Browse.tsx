import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MediaFile, api } from "../api/client";
import { personLabel } from "../utils/personLabel";
import PhotoGridWithAlerts from "../components/PhotoGridWithAlerts";
import PhotoDetail from "../components/PhotoDetail";
import { invalidateAfterDateChange } from "../utils/invalidateAfterDateChange";

export default function BrowsePage() {
  const { kind, slug } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [detailFile, setDetailFile] = useState<MediaFile | null>(null);

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

  const selectedPerson = kind === "person" && slug ? people.find((p) => p.slug === slug) : null;
  const selectedTag = kind === "tag" && slug ? tags.find((t) => t.slug === slug) : null;
  const selectedCameraName = kind === "camera" && slug ? decodeURIComponent(slug) : null;

  const browseFilesKey = ["browse-files", kind, selectedPerson?.id, selectedTag?.id, selectedCameraName] as const;

  const { data: photos } = useQuery({
    queryKey: browseFilesKey,
    queryFn: () => {
      if (selectedPerson) {
        return api.listFiles({ person_id: selectedPerson.id, page_size: 200 });
      }
      if (selectedTag) {
        return api.listFiles({ tag_id: selectedTag.id, page_size: 200 });
      }
      if (selectedCameraName) {
        return api.listFiles({ camera: selectedCameraName, page_size: 200 });
      }
      return Promise.resolve({ items: [], total: 0, page: 1, page_size: 200 });
    },
    enabled: !!(selectedPerson || selectedTag || selectedCameraName),
  });

  const filteredPeople = useMemo(() => {
    const q = search.toLowerCase();
    return people.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [people, search]);

  const filteredTags = useMemo(() => {
    const q = search.toLowerCase();
    return tags.filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [tags, search]);

  const filteredCameras = useMemo(() => {
    const q = search.toLowerCase();
    return cameras.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [cameras, search]);

  const selectionLabel = selectedPerson?.name ?? selectedTag?.name ?? selectedCameraName;

  const invalidateBrowseFiles = () => {
    qc.invalidateQueries({ queryKey: browseFilesKey });
  };

  return (
    <div>
      <div className="page-header">
        <h2>Browse</h2>
      </div>
      <p style={{ color: "#8891a0", marginBottom: "1rem" }}>
        Search photos by person, tag, or camera.
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
              {filteredPeople.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/browse/person/${p.slug}`}
                    className={`browse-list-item ${selectedPerson?.id === p.id ? "active" : ""}`}
                  >
                    <span>{personLabel(p, people)}</span>
                    <span className="browse-count">{p.photo_count}</span>
                  </Link>
                </li>
              ))}
              {filteredPeople.length === 0 && (
                <li className="browse-empty">No people yet. Tag people on photos from Inbox or Calendar.</li>
              )}
            </ul>
          </section>

          <section className="browse-section">
            <h3 className="browse-section-title">Tags</h3>
            <ul className="browse-list">
              {filteredTags.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/browse/tag/${t.slug}`}
                    className={`browse-list-item ${selectedTag?.id === t.id ? "active" : ""}`}
                  >
                    <span>{t.name}</span>
                    <span className="browse-count">{t.photo_count}</span>
                  </Link>
                </li>
              ))}
              {filteredTags.length === 0 && (
                <li className="browse-empty">No tags yet. Tag photos from Inbox or Calendar, or create tags on the Tags page.</li>
              )}
            </ul>
          </section>

          <section className="browse-section">
            <h3 className="browse-section-title">Cameras</h3>
            <ul className="browse-list">
              {filteredCameras.map((c) => (
                <li key={c.name}>
                  <Link
                    to={`/browse/camera/${encodeURIComponent(c.name)}`}
                    className={`browse-list-item ${selectedCameraName === c.name ? "active" : ""}`}
                  >
                    <span>{c.name}</span>
                    <span className="browse-count">{c.photo_count}</span>
                  </Link>
                </li>
              ))}
              {filteredCameras.length === 0 && (
                <li className="browse-empty">
                  No cameras yet. Scan archive or inbox to read camera info from EXIF.
                </li>
              )}
            </ul>
          </section>
        </aside>

        <div className="browse-results">
          {selectionLabel ? (
            <>
              <div className="browse-results-header">
                <h3>{selectionLabel}</h3>
                <span className="badge" style={{ background: "#6366f1", color: "#fff" }}>
                  {photos?.total ?? 0} photos
                </span>
              </div>
              <PhotoGridWithAlerts
                files={photos?.items ?? []}
                activeDetailId={detailFile?.id}
                onSelect={setDetailFile}
                editableLabels
                onLabelsChange={invalidateBrowseFiles}
                onAlertsChange={() => {
                  invalidateAfterDateChange(qc);
                  invalidateBrowseFiles();
                }}
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
          onClose={() => {
            setDetailFile(null);
            navigate(`/browse/${kind}/${slug}`, { replace: true });
          }}
        />
      )}
    </div>
  );
}
