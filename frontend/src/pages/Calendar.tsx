import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, CalendarMonthSummary } from "../api/client";
import CalendarDayPanel from "../components/CalendarDayPanel";
import CalendarThreeMonthView from "../components/CalendarThreeMonthView";

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
  const params = useParams();
  const now = new Date();
  const urlYear = params.year ? Number(params.year) : now.getFullYear();
  const urlMonth = params.month ? Number(params.month) : now.getMonth() + 1;
  const dayParam = params.day;

  const [location, setLocation] = useState("archive");
  const [windowStartIndex, setWindowStartIndex] = useState(0);
  const [monthEventFilter, setMonthEventFilter] = useState<{
    year: number;
    month: number;
    eventId: number;
  } | null>(null);

  const { data: monthsData } = useQuery({
    queryKey: ["calendar-months", location],
    queryFn: () => api.calendarMonths(location),
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
    setWindowStartIndex(alignWindowStart(idx, activeMonths.length));
  }, [activeMonths, urlYear, urlMonth, navigate]);

  const visibleMonths = useMemo(
    () => activeMonths.slice(windowStartIndex, windowStartIndex + 3),
    [activeMonths, windowStartIndex]
  );

  const selectedDay = useMemo(() => {
    if (!dayParam) return null;
    return { year: urlYear, month: urlMonth, day: Number(dayParam) };
  }, [urlYear, urlMonth, dayParam]);

  const selectedDayStr = selectedDay
    ? `${selectedDay.year}-${String(selectedDay.month).padStart(2, "0")}-${String(selectedDay.day).padStart(2, "0")}`
    : undefined;

  const dayPanelEventId =
    monthEventFilter &&
    monthEventFilter.year === urlYear &&
    monthEventFilter.month === urlMonth
      ? monthEventFilter.eventId
      : undefined;

  const handleSelectDay = (year: number, month: number, day: number) => {
    if (monthEventFilter && (monthEventFilter.year !== year || monthEventFilter.month !== month)) {
      setMonthEventFilter(null);
    }
    navigate(`/calendar/${year}/${month}/${day}`);
  };

  const handleSelectEvent = (year: number, month: number, eventId: number | undefined) => {
    if (eventId === undefined) {
      if (monthEventFilter?.year === year && monthEventFilter?.month === month) {
        setMonthEventFilter(null);
      }
      return;
    }
    setMonthEventFilter({ year, month, eventId });
  };

  const handlePrev = () => {
    const next = Math.max(0, windowStartIndex - 3);
    setWindowStartIndex(next);
    setMonthEventFilter(null);
    const m = activeMonths[next];
    if (m) navigate(`/calendar/${m.year}/${m.month}`);
  };

  const handleNext = () => {
    const next = Math.min(activeMonths.length - 1, windowStartIndex + 3);
    if (next === windowStartIndex) return;
    setWindowStartIndex(next);
    setMonthEventFilter(null);
    const m = activeMonths[next];
    if (m) navigate(`/calendar/${m.year}/${m.month}`);
  };

  return (
    <div>
      <div className="page-header">
        <h2>Calendar</h2>
        <button className="btn btn-secondary" onClick={() => api.scanArchive().then(() => {})}>
          Scan archive
        </button>
      </div>

      <div className="calendar-filters">
        <select
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            setMonthEventFilter(null);
          }}
        >
          <option value="archive">Archive only</option>
          <option value="all">Include inbox</option>
          <option value="inbox">Inbox only</option>
        </select>
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
            selectedDay={selectedDay}
            monthEventFilter={monthEventFilter}
            onPrev={handlePrev}
            onNext={handleNext}
            onSelectDay={handleSelectDay}
            onSelectEvent={handleSelectEvent}
          />
        )}
        {selectedDayStr && (
          <CalendarDayPanel date={selectedDayStr} location={location} eventId={dayPanelEventId} />
        )}
      </div>
    </div>
  );
}
