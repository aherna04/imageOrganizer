import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, CalendarMonthFilter, CalendarMediaType, CalendarMonthSummary } from "../api/client";
import CalendarDayPanel from "../components/CalendarDayPanel";
import CalendarThreeMonthView from "../components/CalendarThreeMonthView";
import { calendarQueryOptions } from "../utils/calendarQueryOptions";
import { monthFilterToDayFilter } from "../utils/calendarFilter";
import { invalidateCalendarQueries } from "../utils/invalidateCalendarQueries";

function findMonthIndex(months: CalendarMonthSummary[], year: number, month: number): number {
  return months.findIndex((m) => m.year === year && m.month === month);
}

function alignWindowStart(index: number, total: number): number {
  if (total === 0) return 0;
  const aligned = Math.floor(index / 3) * 3;
  return Math.min(aligned, Math.max(0, total - 1));
}

function nearestMonthIndex(months: CalendarMonthSummary[]): number {
  if (months.length === 0) return 0;
  const today = new Date();
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  let best = 0;
  for (let i = 0; i < months.length; i++) {
    const m = months[i];
    if (m.year < ty || (m.year === ty && m.month <= tm)) {
      best = i;
    }
  }
  return best;
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const params = useParams();
  const now = new Date();
  const urlYear = params.year ? Number(params.year) : now.getFullYear();
  const urlMonth = params.month ? Number(params.month) : now.getMonth() + 1;
  const dayParam = params.day;

  const [location, setLocation] = useState("archive");
  const [mediaType, setMediaType] = useState<CalendarMediaType>("all");
  const [calendarLabelFilter, setCalendarLabelFilter] = useState<"all" | "unlabeled">("all");
  const [windowStartIndex, setWindowStartIndex] = useState(0);
  const [monthFilter, setMonthFilter] = useState<CalendarMonthFilter | null>(null);

  const globalUnlabeled = calendarLabelFilter === "unlabeled";

  const { data: monthsData } = useQuery(
    calendarQueryOptions({
      queryKey: ["calendar-months", location, mediaType],
      queryFn: () => api.calendarMonths(location, mediaType),
    }),
  );

  const { data: scanStatus } = useQuery({
    queryKey: ["scan-status"],
    queryFn: api.scanStatus,
    refetchInterval: (q) => (q.state.data?.running ? 2000 : false),
  });

  const wasScanning = useRef(false);
  useEffect(() => {
    if (wasScanning.current && scanStatus && !scanStatus.running && scanStatus.scope === "archive") {
      invalidateCalendarQueries(qc);
    }
    wasScanning.current = scanStatus?.running ?? false;
  }, [scanStatus?.running, scanStatus?.scope, qc]);

  const scanArchive = useMutation({
    mutationFn: api.scanArchive,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scan-status"] });
    },
  });

  const activeMonths = monthsData?.months ?? [];

  useEffect(() => {
    if (activeMonths.length === 0) return;
    let idx = findMonthIndex(activeMonths, urlYear, urlMonth);
    if (idx < 0) {
      idx = nearestMonthIndex(activeMonths);
      const m = activeMonths[idx];
      navigate(`/calendar/${m.year}/${m.month}`, { replace: true });
      return;
    }
    if (dayParam) {
      setWindowStartIndex(alignWindowStart(idx, activeMonths.length));
    }
  }, [activeMonths, urlYear, urlMonth, dayParam, navigate]);

  const selectedDay = useMemo(() => {
    if (!dayParam) return null;
    return { year: urlYear, month: urlMonth, day: Number(dayParam) };
  }, [urlYear, urlMonth, dayParam]);

  const selectedDayStr = selectedDay
    ? `${selectedDay.year}-${String(selectedDay.month).padStart(2, "0")}-${String(selectedDay.day).padStart(2, "0")}`
    : undefined;

  const visibleMonths = useMemo(() => {
    if (selectedDayStr) {
      return activeMonths.slice(windowStartIndex, windowStartIndex + 3);
    }
    return activeMonths;
  }, [activeMonths, windowStartIndex, selectedDayStr]);

  const dayPanelFilter = globalUnlabeled
    ? { unlabeled: true as const }
    : monthFilterToDayFilter(monthFilter, urlYear, urlMonth);

  const handleSelectDay = (year: number, month: number, day: number) => {
    if (monthFilter && (monthFilter.year !== year || monthFilter.month !== month)) {
      setMonthFilter(null);
    }
    navigate(`/calendar/${year}/${month}/${day}`);
  };

  const handleSelectFilter = (_year: number, _month: number, filter: CalendarMonthFilter | null) => {
    if (filter !== null) {
      setCalendarLabelFilter("all");
    }
    setMonthFilter(filter);
  };

  const handleClearDay = () => {
    navigate(`/calendar/${urlYear}/${urlMonth}`);
  };

  const handlePrev = () => {
    if (!selectedDayStr) return;
    setWindowStartIndex((prev) => Math.max(0, prev - 3));
    setMonthFilter(null);
  };

  const handleNext = () => {
    if (!selectedDayStr) return;
    setWindowStartIndex((prev) => {
      const next = Math.min(activeMonths.length - 1, prev + 3);
      return next === prev ? prev : next;
    });
    setMonthFilter(null);
  };

  return (
    <div>
      <div className="page-header">
        <h2>Calendar</h2>
        <button
          className="btn btn-secondary"
          onClick={() => scanArchive.mutate()}
          disabled={scanArchive.isPending || scanStatus?.running}
        >
          Scan archive
        </button>
      </div>

      <div className="calendar-filters">
        <select
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            setMonthFilter(null);
            setCalendarLabelFilter("all");
          }}
        >
          <option value="archive">Archive only</option>
          <option value="all">Include inbox</option>
          <option value="inbox">Inbox only</option>
        </select>
        <select
          value={mediaType}
          onChange={(e) => {
            setMediaType(e.target.value as CalendarMediaType);
            setMonthFilter(null);
            setCalendarLabelFilter("all");
          }}
        >
          <option value="all">All media</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
        <div className="photo-alerts-filter">
          <button
            type="button"
            className={`btn btn-secondary${calendarLabelFilter === "all" ? " active" : ""}`}
            onClick={() => {
              setCalendarLabelFilter("all");
              setMonthFilter(null);
            }}
          >
            All
          </button>
          <button
            type="button"
            className={`btn btn-secondary${calendarLabelFilter === "unlabeled" ? " active" : ""}`}
            onClick={() => {
              setCalendarLabelFilter("unlabeled");
              setMonthFilter(null);
            }}
          >
            Untagged
          </button>
        </div>
      </div>

      <div className={`calendar-page-layout ${selectedDayStr ? "has-day" : ""}`}>
        {activeMonths.length === 0 ? (
          <div className="empty-state">No photos in archive. Scan inbox or archive to browse by date.</div>
        ) : (
          <CalendarThreeMonthView
            visibleMonths={visibleMonths}
            windowStartIndex={windowStartIndex}
            totalMonths={activeMonths.length}
            location={location}
            mediaType={mediaType}
            globalUnlabeled={globalUnlabeled}
            selectedDay={selectedDay}
            monthFilter={monthFilter}
            mode={selectedDayStr ? "focus" : "browse"}
            showWindowNav={!!selectedDayStr}
            onPrev={handlePrev}
            onNext={handleNext}
            onSelectDay={handleSelectDay}
            onSelectFilter={handleSelectFilter}
          />
        )}
        {selectedDayStr && (
          <CalendarDayPanel
            date={selectedDayStr}
            location={location}
            mediaType={mediaType}
            filter={dayPanelFilter}
            onClose={handleClearDay}
          />
        )}
      </div>
    </div>
  );
}
