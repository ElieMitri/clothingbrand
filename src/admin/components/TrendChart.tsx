import { useId, useMemo, useRef, useState, type PointerEvent } from "react";

export interface TrendPoint {
  label: string;
  value: number;
}

interface TrendChartProps {
  points: TrendPoint[];
  ariaLabel: string;
  valueFormatter?: (value: number) => string;
  emptyText?: string;
}

const defaultFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function TrendChart({
  points,
  ariaLabel,
  valueFormatter = (value) => defaultFormatter.format(value),
  emptyText = "No trend data available.",
}: TrendChartProps) {
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (points.length === 0) return null;

    const width = 760;
    const height = 300;
    const margin = { top: 18, right: 16, bottom: 42, left: 54 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    const values = points.map((point) => Math.max(0, Number(point.value || 0)));
    const maxValue = Math.max(...values, 1);
    const xStep = points.length > 1 ? plotWidth / (points.length - 1) : 0;

    const toX = (index: number) => margin.left + index * xStep;
    const toY = (value: number) => margin.top + plotHeight - (value / maxValue) * plotHeight;

    const pointCoords = points.map((point, index) => ({
      ...point,
      value: Math.max(0, Number(point.value || 0)),
      x: toX(index),
      y: toY(Math.max(0, Number(point.value || 0))),
    }));

    const linePath = pointCoords
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
      .join(" ");

    const firstPoint = pointCoords[0];
    const lastPoint = pointCoords[pointCoords.length - 1];
    const areaPath = `${linePath} L ${lastPoint.x} ${margin.top + plotHeight} L ${firstPoint.x} ${
      margin.top + plotHeight
    } Z`;

    const ticks = Array.from({ length: 5 }).map((_, index) => {
      const ratio = index / 4;
      const value = Math.round(maxValue * (1 - ratio));
      const y = margin.top + plotHeight * ratio;
      return { value, y };
    });

    const xLabelInterval = Math.max(1, Math.floor(points.length / 6));

    return {
      width,
      height,
      margin,
      plotHeight,
      plotWidth,
      xStep,
      linePath,
      areaPath,
      pointCoords,
      ticks,
      xLabelInterval,
    };
  }, [points]);

  if (!chart) {
    return <p className="adm-muted">{emptyText}</p>;
  }

  const hoveredPoint =
    hoveredIndex !== null ? chart.pointCoords[clamp(hoveredIndex, 0, chart.pointCoords.length - 1)] : null;

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    if (chart.pointCoords.length <= 1) {
      setHoveredIndex(0);
      return;
    }

    const rect = svgRef.current.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) * chart.width;
    const rawIndex = Math.round((relativeX - chart.margin.left) / chart.xStep);
    const nextIndex = clamp(rawIndex, 0, chart.pointCoords.length - 1);
    setHoveredIndex(nextIndex);
  };

  return (
    <figure className="adm-trend-chart" aria-label={ariaLabel}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        role="img"
        aria-hidden="true"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {chart.ticks.map((tick) => (
          <g key={`tick-${tick.y}`}>
            <line x1={chart.margin.left} y1={tick.y} x2={chart.width - chart.margin.right} y2={tick.y} />
            <text x={chart.margin.left - 8} y={tick.y + 4} textAnchor="end">
              {valueFormatter(tick.value)}
            </text>
          </g>
        ))}

        <path d={chart.areaPath} className="adm-trend-chart__area" style={{ fill: `url(#${gradientId})` }} />
        <path d={chart.linePath} className="adm-trend-chart__line" />

        {hoveredPoint ? (
          <line
            className="adm-trend-chart__crosshair"
            x1={hoveredPoint.x}
            y1={chart.margin.top}
            x2={hoveredPoint.x}
            y2={chart.margin.top + chart.plotHeight}
          />
        ) : null}

        {chart.pointCoords.map((point, index) => (
          <g key={`point-${point.label}-${index}`}>
            <circle
              className="adm-trend-chart__point"
              cx={point.x}
              cy={point.y}
              r={hoveredIndex === index ? "5.5" : "3.5"}
            >
              <title>{`${point.label}: ${valueFormatter(point.value)}`}</title>
            </circle>
            {index % chart.xLabelInterval === 0 || index === chart.pointCoords.length - 1 ? (
              <text x={point.x} y={chart.margin.top + chart.plotHeight + 20} textAnchor="middle">
                {point.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>

      {hoveredPoint ? (
        <figcaption className="adm-trend-chart__tooltip" role="status">
          <strong>{hoveredPoint.label}</strong>
          <span>{valueFormatter(hoveredPoint.value)}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}
