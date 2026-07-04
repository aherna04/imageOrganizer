import { DayPicker } from "react-day-picker";
import { CalendarDaySummary } from "../api/client";
import { api } from "../api/client";
import "react-day-picker/style.css";

interface Props {
  year: number;
  month: number;
  days: CalendarDaySummary[];
  selected?: Date;
  onSelect: (date: Date | undefined) => void;
  compact?: boolean;
}

export default function CalendarMonth({
  year,
  month,
  days,
  selected,
  onSelect,
  compact = false,
}: Props) {
  const dayMap = new Map(days.map((d) => [d.date, d]));
  const monthDate = new Date(year, month - 1, 1);

  return (
    <DayPicker
      mode="single"
      selected={selected}
      onSelect={onSelect}
      month={monthDate}
      onMonthChange={() => {}}
      hideNavigation
      className={compact ? "rdp-compact" : undefined}
      modifiers={{
        hasMedia: days.map((d) => new Date(d.date + "T12:00:00")),
      }}
      modifiersClassNames={{
        hasMedia: "day-with-media",
      }}
      components={{
        MonthCaption: () => <span className="rdp-month_caption_hidden" aria-hidden />,
        DayButton: (props) => {
          const dateStr = props.day.date.toISOString().slice(0, 10);
          const summary = dayMap.get(dateStr);
          return (
            <button
              {...props}
              className={`${props.className ?? ""} ${summary ? "day-with-media" : ""}`}
              disabled={!summary}
            >
              {props.day.date.getDate()}
              {summary && (
                <>
                  <span className="day-count">{summary.count}</span>
                  {summary.cover_file_id && !compact && (
                    <img
                      src={api.thumbUrl(summary.cover_file_id)}
                      alt=""
                      className="day-cover-thumb"
                    />
                  )}
                </>
              )}
            </button>
          );
        },
      }}
    />
  );
}
