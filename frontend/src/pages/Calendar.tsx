import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, CalendarDayFilter, CalendarMonthFilter, CalendarMediaType, CalendarMonthSummary, CalendarYearFilter } from "../api/client";
import CalendarDayPanel, { CalendarDayLabelContext } from "../components/CalendarDayPanel";
import CalendarDayLabelPanel from "../components/CalendarDayLabelPanel";
import CalendarMonthPhotosPanel from "../components/CalendarMonthPhotosPanel";
import CalendarThreeMonthView from "../components/CalendarThreeMonthView";
import CalendarYearLabels from "../components/CalendarYearLabels";
import CalendarYearPhotosPanel from "../components/CalendarYearPhotosPanel";
import { calendarQueryOptions } from "../utils/calendarQueryOptions";
import {
  monthFilterToDayFilter,
  monthPhotosSearchParams,
  parseMonthFilterFromSearchParams,
  parseYearFilterFromSearchParams,
  yearFilterToDayFilter,
  yearFilterToSearchParams,
} from "../utils/calendarFilter";
import { invalidateCalendarQueries } from "../utils/invalidateCalendarQueries";
import { useScanBlockers } from "../utils/useScanBlockers";

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

function calendarPath(year: number, month: number, day?: number, search?: string) {
  const pathname = day ? `/calendar/${year}/${month}/${day}` : `/calendar/${year}/${month}`;
  return search ? { pathname, search: `?${search}` } : { pathname };
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const params = useParams();
  const now = new Date();
  const urlYear = params.year ? Number(params.year) : now.getFullYear();
  const urlMonth = params.month ? Number(params.month) : now.getMonth() + 1;
  const dayParam = params.day;
  const searchString = searchParams.toString();

  const [location, setLocation] = useState("archive");
  const [mediaType, setMediaType] = useState<CalendarMediaType>("all");
  const [calendarLabelFilter, setCalendarLabelFilter] = useState<"all" | "unlabeled">("all");
  const [selectedYear, setSelectedYear] = useState<number | "all" | null>(null);
  const [windowStartIndex, setWindowStartIndex] = useState(0);
  const [monthFilter, setMonthFilter] = useState<CalendarMonthFilter | null>(null);
  const [labelContext, setLabelContext] = useState<CalendarDayLabelContext | null>(null);

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
    refetchInterval: (q) => {
      const phase = q.state.data?.phase;
      return phase && phase !== "idle" ? 2000 : false;
    },
  });

  const { blurRunning, blockedReason } = useScanBlockers();

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

  const availableYears = useMemo(
    () => [...new Set(activeMonths.map((m) => m.year))].sort((a, b) => b - a),
    [activeMonths],
  );

  const effectiveYear = selectedYear ?? availableYears[0] ?? "all";

  const filteredMonths = useMemo(
    () =>
      effectiveYear === "all"
        ? activeMonths
        : activeMonths.filter((m) => m.year === effectiveYear),
    [activeMonths, effectiveYear],
  );

  const monthPhotosMode = searchParams.get("view") === "month";

  const monthLabelFilter = useMemo((): CalendarMonthFilter | null => {
    if (!monthPhotosMode) return null;
    return parseMonthFilterFromSearchParams(searchParams, urlYear, urlMonth);
  }, [searchParams, urlYear, urlMonth, monthPhotosMode]);

  const { data: monthLabelsData } = useQuery({
    ...calendarQueryOptions({
      queryKey: ["calendar-labels", urlYear, urlMonth, location, mediaType],
      queryFn: () => api.calendarLabels(urlYear, urlMonth, location, mediaType),
    }),
    enabled: monthPhotosMode && !dayParam,
  });

  const yearLabelFilter = useMemo((): CalendarYearFilter | null => {
    if (effectiveYear === "all" || monthPhotosMode) return null;
    return parseYearFilterFromSearchParams(searchParams, effectiveYear);
  }, [searchParams, effectiveYear, monthPhotosMode]);

  const { data: yearLabelsData } = useQuery({
    ...calendarQueryOptions({
      queryKey: ["calendar-year-labels", effectiveYear, location, mediaType],
      queryFn: () => api.calendarYearLabels(effectiveYear as number, location, mediaType),
    }),
    enabled: effectiveYear !== "all",
  });

  useEffect(() => {
    if (dayParam) {
      setSelectedYear(urlYear);
    }
  }, [dayParam, urlYear]);

  useEffect(() => {
    if (filteredMonths.length === 0) return;
    let idx = findMonthIndex(filteredMonths, urlYear, urlMonth);
    if (idx < 0) {
      idx = nearestMonthIndex(filteredMonths);
      const m = filteredMonths[idx];
      navigate(calendarPath(m.year, m.month, undefined, searchString || undefined), { replace: true });
      return;
    }
    if (dayParam) {
      setWindowStartIndex(alignWindowStart(idx, filteredMonths.length));
    }
  }, [filteredMonths, urlYear, urlMonth, dayParam, navigate, searchString]);

  const selectedDay = useMemo(() => {
    if (!dayParam) return null;
    return { year: urlYear, month: urlMonth, day: Number(dayParam) };
  }, [urlYear, urlMonth, dayParam]);

  const selectedDayStr = selectedDay
    ? `${selectedDay.year}-${String(selectedDay.month).padStart(2, "0")}-${String(selectedDay.day).padStart(2, "0")}`
    : undefined;

  const browseView = !selectedDayStr && monthPhotosMode
    ? "monthPhotos"
    : !selectedDayStr && yearLabelFilter
      ? "yearPhotos"
      : "months";

  const visibleMonths = useMemo(() => {
    if (selectedDayStr) {
      return filteredMonths.slice(windowStartIndex, windowStartIndex + 3);
    }
    return filteredMonths;
  }, [filteredMonths, windowStartIndex, selectedDayStr]);

  const dayPanelFilter = useMemo((): CalendarDayFilter | undefined => {
    if (globalUnlabeled) return { unlabeled: true };
    const monthDay = monthFilterToDayFilter(monthFilter, urlYear, urlMonth);
    if (monthDay) return monthDay;
    if (effectiveYear !== "all") {
      return yearFilterToDayFilter(yearLabelFilter, urlYear);
    }
    return undefined;
  }, [globalUnlabeled, monthFilter, yearLabelFilter, urlYear, urlMonth, effectiveYear]);

  const clearYearFilterSearch = () => {
    navigate(calendarPath(urlYear, urlMonth));
  };

  const resetFilters = () => {
    setMonthFilter(null);
    setCalendarLabelFilter("all");
    setSelectedYear(null);
    clearYearFilterSearch();
  };

  const handleYearChange = (value: string) => {
    const next: number | "all" = value === "all" ? "all" : Number(value);
    setSelectedYear(next);
    setMonthFilter(null);
    setWindowStartIndex(0);

    if (dayParam && next !== "all" && next !== urlYear) {
      const months = activeMonths.filter((m) => m.year === next);
      const first = months[0];
      if (first) {
        setLabelContext(null);
        navigate(calendarPath(first.year, first.month));
      }
      return;
    }

    if (!dayParam) {
      const months = next === "all" ? activeMonths : activeMonths.filter((m) => m.year === next);
      const first = months[0];
      if (first) {
        navigate(calendarPath(first.year, first.month), { replace: true });
      }
    }
  };

  const handleSelectDay = (year: number, month: number, day: number) => {
    if (monthFilter && (monthFilter.year !== year || monthFilter.month !== month)) {
      setMonthFilter(null);
    }
    navigate(calendarPath(year, month, day, searchString || undefined));
  };

  const handleSelectMonth = (year: number, month: number) => {
    setCalendarLabelFilter("all");
    setMonthFilter(null);
    navigate(calendarPath(year, month, undefined, "view=month"));
  };

  const handleSelectMonthFilter = (filter: CalendarMonthFilter | null) => {
    if (filter !== null) {
      setCalendarLabelFilter("all");
    }
    const search = monthPhotosSearchParams(filter);
    navigate(calendarPath(urlYear, urlMonth, undefined, search));
  };

  const handleBackToMonthGrid = () => {
    navigate(calendarPath(urlYear, urlMonth));
  };

  const handleSelectFilter = (_year: number, _month: number, filter: CalendarMonthFilter | null) => {
    if (filter !== null) {
      setCalendarLabelFilter("all");
      clearYearFilterSearch();
    }
    setMonthFilter(filter);
  };

  const handleSelectYearFilter = (filter: CalendarYearFilter | null) => {
    if (filter !== null) {
      setCalendarLabelFilter("all");
      setMonthFilter(null);
    }
    const search = yearFilterToSearchParams(filter);
    navigate(calendarPath(urlYear, urlMonth, undefined, search || undefined));
  };

  const handleClearDay = () => {
    setLabelContext(null);
    navigate(calendarPath(urlYear, urlMonth, undefined, searchString || undefined));
  };

  const handlePrev = () => {
    if (!selectedDayStr) return;
    setWindowStartIndex((prev) => Math.max(0, prev - 3));
    setMonthFilter(null);
  };

  const handleNext = () => {
    if (!selectedDayStr) return;
    setWindowStartIndex((prev) => {
      const next = Math.min(filteredMonths.length - 1, prev + 3);
      return next === prev ? prev : next;
    });
    setMonthFilter(null);
  };

  const showYearLabelBar =
    effectiveYear !== "all" && yearLabelsData && !selectedDayStr && browseView === "months";

  return (
    <div>
      <div className="page-header">
        <h2>Calendar</h2>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          {blockedReason && !scanStatus?.running && (
            <span className="scan-status">{blockedReason}</span>
          )}
          {scanArchive.isError && (
            <span className="scan-status" style={{ color: "#f87171" }}>
              {scanArchive.error instanceof Error ? scanArchive.error.message : "Scan failed"}
            </span>
          )}
          <button
            className="btn btn-secondary"
            onClick={() => scanArchive.mutate()}
            disabled={scanArchive.isPending || scanStatus?.running || blurRunning}
          >
            Scan archive
          </button>
        </div>
      </div>

      <div className="calendar-filters">
        <select
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            resetFilters();
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
            resetFilters();
          }}
        >
          <option value="all">All media</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
        {availableYears.length > 0 && (
          <select
            value={effectiveYear === "all" ? "all" : String(effectiveYear)}
            onChange={(e) => handleYearChange(e.target.value)}
          >
            <option value="all">All years</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
        <div className="photo-alerts-filter">
          <button
            type="button"
            className={`btn btn-secondary${calendarLabelFilter === "all" ? " active" : ""}`}
            onClick={() => {
              setCalendarLabelFilter("all");
              setMonthFilter(null);
              clearYearFilterSearch();
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
              clearYearFilterSearch();
            }}
          >
            Untagged
          </button>
        </div>
      </div>

      <div className={`calendar-page-layout ${selectedDayStr ? "has-day" : ""}`}>
        {activeMonths.length === 0 ? (
          <div className="empty-state">No photos in archive. Scan inbox or archive to browse by date.</div>
        ) : selectedDayStr ? (
          <div className="calendar-left-column">
            <div className="calendar-left-stack">
              <CalendarThreeMonthView
                visibleMonths={visibleMonths}
                windowStartIndex={windowStartIndex}
                totalMonths={filteredMonths.length}
                yearLabel={effectiveYear}
                location={location}
                mediaType={mediaType}
                globalUnlabeled={globalUnlabeled}
                selectedDay={selectedDay}
                monthFilter={monthFilter}
                yearLabelFilter={yearLabelFilter}
                filterYear={effectiveYear}
                mode="focus"
                showWindowNav
                onPrev={handlePrev}
                onNext={handleNext}
                onSelectDay={handleSelectDay}
                onSelectFilter={handleSelectFilter}
                onSelectMonth={handleSelectMonth}
              />
              <CalendarDayLabelPanel context={labelContext} />
            </div>
          </div>
        ) : (
          <div className="calendar-browse-column">
            {showYearLabelBar && (
              <>
                {browseView === "months" && (
                  <p className="calendar-browse-summary">{filteredMonths.length} months in {effectiveYear}</p>
                )}
                <CalendarYearLabels
                  labels={yearLabelsData}
                  activeFilter={yearLabelFilter}
                  globalUnlabeled={globalUnlabeled}
                  onSelectFilter={handleSelectYearFilter}
                />
              </>
            )}
            {browseView === "monthPhotos" && monthLabelsData ? (
              <CalendarMonthPhotosPanel
                year={urlYear}
                month={urlMonth}
                filter={monthLabelFilter}
                location={location}
                mediaType={mediaType}
                labels={monthLabelsData}
                onBack={handleBackToMonthGrid}
                onSelectFilter={handleSelectMonthFilter}
              />
            ) : browseView === "yearPhotos" && yearLabelFilter && yearLabelsData ? (
              <CalendarYearPhotosPanel
                year={effectiveYear as number}
                filter={yearLabelFilter}
                location={location}
                mediaType={mediaType}
                labels={yearLabelsData}
              />
            ) : (
              <CalendarThreeMonthView
                visibleMonths={visibleMonths}
                windowStartIndex={windowStartIndex}
                totalMonths={filteredMonths.length}
                yearLabel={effectiveYear}
                location={location}
                mediaType={mediaType}
                globalUnlabeled={globalUnlabeled}
                selectedDay={selectedDay}
                monthFilter={monthFilter}
                yearLabelFilter={yearLabelFilter}
                filterYear={effectiveYear}
                mode="browse"
                showWindowNav={false}
                onPrev={handlePrev}
                onNext={handleNext}
                onSelectDay={handleSelectDay}
                onSelectFilter={handleSelectFilter}
                onSelectMonth={handleSelectMonth}
              />
            )}
          </div>
        )}
        {selectedDayStr && (
          <CalendarDayPanel
            date={selectedDayStr}
            location={location}
            mediaType={mediaType}
            filter={dayPanelFilter}
            onClose={handleClearDay}
            onLabelContextChange={setLabelContext}
          />
        )}
      </div>
    </div>
  );
}
