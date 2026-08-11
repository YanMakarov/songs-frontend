export default function SegmentedControl({ options, value, onChange, name }) {
  return (
    <div className="segmented" role="tablist" aria-label={name}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={opt.value === value ? 'active' : ''}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
