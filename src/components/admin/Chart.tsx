"use client";

/**
 * Gráficos mínimos en SVG, sin dependencias. Legibles y con foco en la lectura:
 * ejes discretos, valores al pasar el mouse (title), colores de los tokens.
 */
import { useId } from "react";

export interface BarPoint {
  label: string;
  value: number;
  /** valor secundario opcional (barra apilada tenue) */
  value2?: number;
}

export function BarChart({
  data,
  height = 160,
  format = (n) => String(n),
  caption,
}: {
  data: BarPoint[];
  height?: number;
  format?: (n: number) => string;
  caption?: string;
}) {
  const id = useId();
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.value2 ?? 0)));
  const w = Math.max(data.length * 32, 240);
  const pad = 24;
  const barW = (w - pad * 2) / data.length - 6;

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${w} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label={caption ?? "Gráfico de barras"}
        >
          <line
            x1={pad}
            y1={height - pad}
            x2={w - pad}
            y2={height - pad}
            stroke="rgb(var(--border))"
            strokeWidth="2"
          />
          {data.map((d, i) => {
            const x = pad + i * ((w - pad * 2) / data.length) + 3;
            const h = ((height - pad * 2) * d.value) / max;
            const h2 = d.value2 ? ((height - pad * 2) * d.value2) / max : 0;
            return (
              <g key={`${id}-${i}`}>
                {h2 > 0 && (
                  <rect
                    x={x}
                    y={height - pad - h2}
                    width={barW}
                    height={h2}
                    fill="rgb(var(--warm) / 0.35)"
                  />
                )}
                <rect
                  x={x}
                  y={height - pad - h}
                  width={barW}
                  height={Math.max(h, d.value > 0 ? 2 : 0)}
                  fill="rgb(var(--accent))"
                >
                  <title>
                    {d.label}: {format(d.value)}
                    {d.value2 != null ? ` · ${format(d.value2)}` : ""}
                  </title>
                </rect>
                <text
                  x={x + barW / 2}
                  y={height - pad + 12}
                  textAnchor="middle"
                  fontSize="9"
                  fill="rgb(var(--faint))"
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {caption ? <figcaption className="mt-1 text-xs text-muted">{caption}</figcaption> : null}
    </figure>
  );
}
