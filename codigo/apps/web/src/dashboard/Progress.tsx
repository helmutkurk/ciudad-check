/** Small segmented progress: one segment per needed pass (capped at 10), filled by passes. */
export function Progress(props: { passed: number; needed: number }) {
  const cap = 10;
  const n = Math.max(1, Math.min(props.needed, cap));
  const filled =
    props.needed <= cap ? props.passed : Math.round((props.passed / props.needed) * cap);
  return (
    <span className="prog">
      <span className="prog-bar" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <i key={i} className={i < filled ? "on" : ""} />
        ))}
      </span>
      <span className="prog-text">
        {props.passed}/{props.needed}
      </span>
    </span>
  );
}
