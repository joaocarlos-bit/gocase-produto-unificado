interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: string;
  showDots?: boolean;
}

/** Tiny inline SVG sparkline — no chart lib dependency for small inline charts. */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  color = 'var(--teal)',
  fill = 'rgba(40,89,165,0.12)',
  showDots = false,
}: Props) {
  if (!values.length) {
    return <svg width={width} height={height} aria-hidden />;
  }
  if (values.length === 1) {
    return (
      <svg width={width} height={height}>
        <circle cx={width / 2} cy={height / 2} r={3} fill={color} />
      </svg>
    );
  }

  const min = Math.min(0, ...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (width - 4) / (values.length - 1);

  const points = values.map((v, i) => {
    const x = 2 + i * stepX;
    const y = height - 2 - ((v - min) / span) * (height - 4);
    return [x, y];
  });

  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const areaPath = `${path} L ${(width - 2).toFixed(1)} ${(height - 2).toFixed(1)} L 2 ${(height - 2).toFixed(1)} Z`;

  return (
    <svg width={width} height={height} aria-label="sparkline">
      <path d={areaPath} fill={fill} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {showDots && points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.5} fill={color} />
      ))}
      {/* Final point highlight */}
      {points.length > 0 && (
        <circle
          cx={points[points.length - 1][0]}
          cy={points[points.length - 1][1]}
          r={2.5}
          fill={color}
        />
      )}
    </svg>
  );
}
