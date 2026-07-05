interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function LabelSearchInput({
  value,
  onChange,
  placeholder = "Search tags…",
}: Props) {
  return (
    <input
      type="search"
      className="label-search-input"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={placeholder}
    />
  );
}
