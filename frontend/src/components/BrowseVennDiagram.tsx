import { useMemo, useState } from "react";
import type { BrowseVenn, BrowseVennRegion, BrowseVennSet } from "../api/client";

const FILL = [
  "rgba(88, 44, 131, 0.45)",
  "rgba(99, 102, 241, 0.40)",
  "rgba(45, 212, 191, 0.36)",
  "rgba(245, 158, 11, 0.38)",
  "rgba(244, 114, 182, 0.36)",
];
const STROKE = ["#9b6fd4", "#818cf8", "#5eead4", "#fbbf24", "#f9a8d4"];

const VIEW_W = 900;
const VIEW_H = 560;
const LABEL_PAD = 28;

type Shape = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotate: number;
  set: BrowseVennSet;
  color: string;
  stroke: string;
};

function scaleForSize(size: number, maxSize: number): number {
  if (maxSize <= 0) return 0.85;
  const t = Math.sqrt(Math.max(size, 1) / maxSize);
  return 0.72 + t * 0.38;
}

function regionKey(members: string[]): string {
  return [...members].sort().join("|");
}

function membersToMask(members: string[], sets: BrowseVennSet[]): number {
  let mask = 0;
  for (const m of members) {
    const i = sets.findIndex((s) => s.key === m);
    if (i >= 0) mask |= 1 << i;
  }
  return mask;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function layoutTwo(sets: BrowseVennSet[]): Shape[] {
  const maxSize = Math.max(...sets.map((s) => s.size), 1);
  const midX = VIEW_W / 2;
  const midY = VIEW_H / 2;
  return sets.map((set, i) => {
    const s = scaleForSize(set.size, maxSize);
    const r = 110 * s;
    const gap = Math.min(110 * scaleForSize(sets[0].size, maxSize), 110 * scaleForSize(sets[1].size, maxSize)) * 0.58;
    return {
      cx: midX + (i === 0 ? -gap : gap),
      cy: midY,
      rx: r,
      ry: r,
      rotate: 0,
      set,
      color: FILL[i],
      stroke: STROKE[i],
    };
  });
}

function layoutThree(sets: BrowseVennSet[]): Shape[] {
  const maxSize = Math.max(...sets.map((s) => s.size), 1);
  const scales = sets.map((s) => scaleForSize(s.size, maxSize));
  const rs = scales.map((s) => 115 * s);
  const midX = VIEW_W / 2;
  const midY = LABEL_PAD + rs[0] + 40 + Math.min(...rs) * 0.5;
  const spread = Math.min(...rs) * 0.78;
  const positions = [
    { cx: midX, cy: midY - spread * 0.95 },
    { cx: midX - spread * 1.05, cy: midY + spread * 0.55 },
    { cx: midX + spread * 1.05, cy: midY + spread * 0.55 },
  ];
  return sets.map((set, i) => ({
    cx: positions[i].cx,
    cy: positions[i].cy,
    rx: rs[i],
    ry: rs[i],
    rotate: 0,
    set,
    color: FILL[i],
    stroke: STROKE[i],
  }));
}

/** Classic four elongated ellipses (candy-diagram style): equal size, shared core. */
function layoutFour(sets: BrowseVennSet[]): Shape[] {
  const midX = VIEW_W / 2;
  const midY = VIEW_H / 2;
  // Identical ellipses; small horizontal offsets + mirrored angles so pockets form.
  // Outer pair ~±38° from vertical; inner pair ~±72° (steeper), like the candy reference.
  const bases = [
    { dx: -16, rotate: 38 },
    { dx: -5, rotate: 72 },
    { dx: 5, rotate: -72 },
    { dx: 16, rotate: -38 },
  ];
  const rx = 90;
  const ry = 228;
  return sets.map((set, i) => ({
    cx: midX + bases[i].dx,
    cy: midY,
    rx,
    ry,
    rotate: bases[i].rotate,
    set,
    color: FILL[i],
    stroke: STROKE[i],
  }));
}

/** Five radial petal ellipses: equal size, tight shared core. */
function layoutFive(sets: BrowseVennSet[]): Shape[] {
  const midX = VIEW_W / 2;
  const midY = VIEW_H / 2;
  const spread = 42;
  const rx = 78;
  const ry = 168;
  return sets.map((set, i) => {
    const deg = -90 + i * 72;
    const rad = (deg * Math.PI) / 180;
    return {
      cx: midX + Math.cos(rad) * spread,
      cy: midY + Math.sin(rad) * spread,
      rx,
      ry,
      rotate: deg,
      set,
      color: FILL[i],
      stroke: STROKE[i],
    };
  });
}

/** Region anchors for the candy-style 4-ellipse template (bitmask → x,y). */
const FOUR_REGION_POS: Record<number, { x: number; y: number }> = {
  1: { x: 300, y: 175 }, // A only (outer left lobe)
  2: { x: 385, y: 145 }, // B only (inner left tip)
  4: { x: 515, y: 145 }, // C only (inner right tip)
  8: { x: 600, y: 175 }, // D only (outer right lobe)
  3: { x: 355, y: 220 }, // AB
  6: { x: 450, y: 165 }, // BC
  12: { x: 545, y: 220 }, // CD
  5: { x: 380, y: 300 }, // AC
  10: { x: 520, y: 300 }, // BD
  9: { x: 450, y: 390 }, // AD
  7: { x: 395, y: 255 }, // ABC
  14: { x: 505, y: 255 }, // BCD
  11: { x: 410, y: 335 }, // ABD
  13: { x: 490, y: 335 }, // ACD
  15: { x: 450, y: 280 }, // ABCD
};

/** Region anchors for 5-petal template (common pockets). */
function fiveRegionPos(mask: number, shapes: Shape[]): { x: number; y: number } {
  const n = shapes.length;
  const midX = VIEW_W / 2;
  const midY = VIEW_H / 2;
  const bits: number[] = [];
  for (let i = 0; i < n; i++) {
    if (mask & (1 << i)) bits.push(i);
  }
  if (bits.length === n) {
    return { x: midX, y: midY };
  }
  if (bits.length === 1) {
    const s = shapes[bits[0]];
    const rad = (s.rotate * Math.PI) / 180;
    return {
      x: s.cx + Math.cos(rad) * (s.ry * 0.62),
      y: s.cy + Math.sin(rad) * (s.ry * 0.62),
    };
  }
  let x = bits.reduce((sum, i) => sum + shapes[i].cx, 0) / bits.length;
  let y = bits.reduce((sum, i) => sum + shapes[i].cy, 0) / bits.length;
  if (bits.length === 2) {
    const dx = x - midX;
    const dy = y - midY;
    const len = Math.hypot(dx, dy) || 1;
    x += (dx / len) * 14;
    y += (dy / len) * 14;
  } else if (bits.length >= 3) {
    // Pull higher-order intersections toward the shared core
    x = midX + (x - midX) * 0.55;
    y = midY + (y - midY) * 0.55;
  }
  return { x, y };
}

function regionLabelPosCircles(shapes: Shape[], members: string[]): { x: number; y: number } {
  const keys = new Set(members);
  const inSet = shapes.filter((c) => keys.has(c.set.key));
  const outSet = shapes.filter((c) => !keys.has(c.set.key));

  if (inSet.length === shapes.length) {
    // For 3 circles of unequal radius, the visual triple-overlap is not the
    // centroid of centers — use pairwise intersection points inside the third.
    if (inSet.length === 3) return threeCircleIntersectionCenter(inSet);
    return {
      x: inSet.reduce((s, c) => s + c.cx, 0) / inSet.length,
      y: inSet.reduce((s, c) => s + c.cy, 0) / inSet.length,
    };
  }

  if (inSet.length === 1 && outSet.length >= 1) {
    const a = inSet[0];
    let dx = 0;
    let dy = 0;
    for (const o of outSet) {
      dx += a.cx - o.cx;
      dy += a.cy - o.cy;
    }
    const len = Math.hypot(dx, dy) || 1;
    const push = a.rx * 0.45;
    return { x: a.cx + (dx / len) * push, y: a.cy + (dy / len) * push };
  }

  const a = inSet[0];
  const b = inSet[1];
  let x = (a.cx + b.cx) / 2;
  let y = (a.cy + b.cy) / 2;
  if (outSet[0]) {
    const ox = outSet[0].cx;
    const oy = outSet[0].cy;
    let dx = x - ox;
    let dy = y - oy;
    const len = Math.hypot(dx, dy) || 1;
    x += (dx / len) * 28;
    y += (dy / len) * 28;
  }
  return { x, y };
}

/** Two intersection points of circles (ax,ay,ar) and (bx,by,br), or null. */
function circlePairIntersections(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): [{ x: number; y: number }, { x: number; y: number }] | null {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6 || d > ar + br || d < Math.abs(ar - br)) return null;
  const a = (ar * ar - br * br + d * d) / (2 * d);
  const h2 = ar * ar - a * a;
  if (h2 < 0) return null;
  const h = Math.sqrt(h2);
  const xm = ax + (a * dx) / d;
  const ym = ay + (a * dy) / d;
  const rx = (-dy * h) / d;
  const ry = (dx * h) / d;
  return [
    { x: xm + rx, y: ym + ry },
    { x: xm - rx, y: ym - ry },
  ];
}

/** Visual center of the region inside all three circles. */
function threeCircleIntersectionCenter(circles: Shape[]): { x: number; y: number } {
  const [a, b, c] = circles;
  const pairs: [Shape, Shape, Shape][] = [
    [a, b, c],
    [b, c, a],
    [c, a, b],
  ];
  const pts: { x: number; y: number }[] = [];
  for (const [p, q, other] of pairs) {
    const inter = circlePairIntersections(p.cx, p.cy, p.rx, q.cx, q.cy, q.rx);
    if (!inter) continue;
    const inside = inter.find(
      (pt) => Math.hypot(pt.x - other.cx, pt.y - other.cy) <= other.rx + 0.75,
    );
    if (inside) pts.push(inside);
  }
  if (pts.length === 0) {
    return {
      x: circles.reduce((s, sh) => s + sh.cx, 0) / circles.length,
      y: circles.reduce((s, sh) => s + sh.cy, 0) / circles.length,
    };
  }
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

function setNamePos(c: Shape, all: Shape[]): { x: number; y: number } {
  let dx = 0;
  let dy = 0;
  for (const o of all) {
    if (o === c) continue;
    dx += c.cx - o.cx;
    dy += c.cy - o.cy;
  }
  // Prefer ellipse major-axis outward for tall ellipses
  if (Math.abs(c.rotate) > 5 || c.ry > c.rx * 1.2) {
    const rad = (c.rotate * Math.PI) / 180;
    // Outward along petal/ellipse long axis, flipped if that points inward
    let ox = Math.cos(rad);
    let oy = Math.sin(rad);
    const toCenterX = VIEW_W / 2 - c.cx;
    const toCenterY = VIEW_H / 2 - c.cy;
    if (ox * toCenterX + oy * toCenterY > 0) {
      ox = -ox;
      oy = -oy;
    }
    // Also blend with away-from-others vector
    const len = Math.hypot(dx, dy) || 1;
    ox = ox * 0.65 + (dx / len) * 0.35;
    oy = oy * 0.65 + (dy / len) * 0.35;
    const olen = Math.hypot(ox, oy) || 1;
    dx = ox / olen;
    dy = oy / olen;
  } else {
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
  }

  let offset = Math.max(c.rx, c.ry) * 0.72 + 18;
  let x = c.cx + dx * offset;
  let y = c.cy + dy * offset;

  const minX = LABEL_PAD;
  const maxX = VIEW_W - LABEL_PAD;
  const minY = LABEL_PAD + 8;
  const maxY = VIEW_H - LABEL_PAD;

  if (x < minX || x > maxX || y < minY || y > maxY) {
    for (let step = 0; step < 12; step++) {
      offset *= 0.85;
      x = c.cx + dx * offset;
      y = c.cy + dy * offset;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) break;
    }
  }

  return {
    x: clamp(x, minX, maxX),
    y: clamp(y, minY, maxY),
  };
}

function regionTitle(region: BrowseVennRegion, sets: BrowseVennSet[]): string {
  const byKey = new Map(sets.map((s) => [s.key, s.name]));
  if (region.members.length === sets.length) {
    return sets.map((s) => s.name).join(" ∩ ");
  }
  if (region.members.length === 1) {
    return `Only ${byKey.get(region.members[0]) ?? region.members[0]}`;
  }
  return region.members.map((k) => byKey.get(k) ?? k).join(" ∩ ");
}

type Props = {
  data: BrowseVenn;
  onOpenIntersectionPhotos?: () => void;
};

export default function BrowseVennDiagram({ data, onOpenIntersectionPhotos }: Props) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const n = data.sets.length;
  const dense = n >= 4;

  const shapes = useMemo(() => {
    if (n === 2) return layoutTwo(data.sets);
    if (n === 3) return layoutThree(data.sets);
    if (n === 4) return layoutFour(data.sets);
    if (n === 5) return layoutFive(data.sets);
    return [];
  }, [data.sets, n]);

  const fullIntersectionKey = useMemo(
    () => regionKey(data.sets.map((s) => s.key)),
    [data.sets],
  );

  const hovered = data.regions.find((r) => regionKey(r.members) === hoverKey);

  const nonZeroRegions = useMemo(
    () =>
      data.regions
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count || b.members.length - a.members.length),
    [data.regions],
  );

  if (shapes.length < 2) return null;

  const resolvePos = (region: BrowseVennRegion): { x: number; y: number } => {
    const mask = membersToMask(region.members, data.sets);
    if (n === 4 && FOUR_REGION_POS[mask]) return FOUR_REGION_POS[mask];
    if (n === 5) return fiveRegionPos(mask, shapes);
    return regionLabelPosCircles(shapes, region.members);
  };

  return (
    <div className="browse-venn">
      <svg
        className="browse-venn-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label="Venn diagram of selected labels"
      >
        {shapes.map((c) => (
          <ellipse
            key={c.set.key}
            cx={c.cx}
            cy={c.cy}
            rx={c.rx}
            ry={c.ry}
            transform={`rotate(${c.rotate} ${c.cx} ${c.cy})`}
            fill={c.color}
            stroke={c.stroke}
            strokeWidth={2}
          />
        ))}

        {shapes.map((c) => {
          const p = setNamePos(c, shapes);
          return (
            <text
              key={`name-${c.set.key}`}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="browse-venn-set-label"
            >
              {c.set.name}
              <tspan className="browse-venn-set-size"> ({c.set.size})</tspan>
            </text>
          );
        })}

        {data.regions.map((region) => {
          const key = regionKey(region.members);
          if (key !== fullIntersectionKey) return null;
          const pos = resolvePos(region);
          const isHover = hoverKey === key;
          const clickable = Boolean(region.count > 0 && onOpenIntersectionPhotos);
          return (
            <g
              key={key}
              className={`browse-venn-region${isHover ? " is-hover" : ""}${clickable ? " is-clickable" : ""}`}
              onMouseEnter={() => setHoverKey(key)}
              onMouseLeave={() => setHoverKey(null)}
              onClick={clickable ? onOpenIntersectionPhotos : undefined}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenIntersectionPhotos?.();
                      }
                    }
                  : undefined
              }
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={region.count > 0 || isHover ? 22 : 16}
                className="browse-venn-region-hit"
                fill="transparent"
              />
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                className={`browse-venn-region-count${region.count === 0 ? " is-zero" : ""}`}
              >
                {region.count}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="browse-venn-legend" aria-live="polite">
        {hovered ? (
          <span>
            {regionTitle(hovered, data.sets)}
            <strong> · {hovered.count}</strong>
            {regionKey(hovered.members) === fullIntersectionKey && hovered.count > 0
              ? " — click to view photos"
              : ""}
          </span>
        ) : (
          <span>Center count is the full intersection. Shape colors mark each label.</span>
        )}
      </div>

      {dense && nonZeroRegions.length > 0 && (
        <ul className="browse-venn-region-list">
          {nonZeroRegions.map((region) => {
            const key = regionKey(region.members);
            const isFull = key === fullIntersectionKey;
            return (
              <li key={key}>
                <button
                  type="button"
                  className={`browse-venn-region-chip${hoverKey === key ? " is-hover" : ""}${isFull ? " is-full" : ""}`}
                  onMouseEnter={() => setHoverKey(key)}
                  onMouseLeave={() => setHoverKey(null)}
                  onClick={
                    isFull && region.count > 0 && onOpenIntersectionPhotos
                      ? onOpenIntersectionPhotos
                      : undefined
                  }
                >
                  <span className="browse-venn-region-chip-label">
                    {regionTitle(region, data.sets)}
                  </span>
                  <span className="browse-venn-region-chip-count">{region.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
