import { useEffect, useMemo, useRef, useState } from "react";
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
const MORPH_MS = 400;

type Shape = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotate: number;
  set: BrowseVennSet;
  color: string;
  stroke: string;
  opacity: number;
};

function colorForKey(key: string): { color: string; stroke: string } {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const i = h % FILL.length;
  return { color: FILL[i], stroke: STROKE[i] };
}

function withStableColors(shapes: Omit<Shape, "opacity">[]): Shape[] {
  return shapes.map((s) => {
    const { color, stroke } = colorForKey(s.set.key);
    return { ...s, color, stroke, opacity: 1 };
  });
}

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

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest-path angle lerp in degrees. */
function lerpAngle(a: number, b: number, t: number): number {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}

function layoutOne(sets: BrowseVennSet[]): Shape[] {
  const set = sets[0];
  const s = scaleForSize(set.size, Math.max(set.size, 1));
  const r = 140 * s;
  return withStableColors([
    {
      cx: VIEW_W / 2,
      cy: VIEW_H / 2,
      rx: r,
      ry: r,
      rotate: 0,
      set,
      color: FILL[0],
      stroke: STROKE[0],
    },
  ]);
}

function layoutTwo(sets: BrowseVennSet[]): Shape[] {
  const maxSize = Math.max(...sets.map((s) => s.size), 1);
  const midX = VIEW_W / 2;
  const midY = VIEW_H / 2;
  return withStableColors(
    sets.map((set, i) => {
      const s = scaleForSize(set.size, maxSize);
      const r = 110 * s;
      const gap =
        Math.min(
          110 * scaleForSize(sets[0].size, maxSize),
          110 * scaleForSize(sets[1].size, maxSize),
        ) * 0.58;
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
    }),
  );
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
  return withStableColors(
    sets.map((set, i) => ({
      cx: positions[i].cx,
      cy: positions[i].cy,
      rx: rs[i],
      ry: rs[i],
      rotate: 0,
      set,
      color: FILL[i],
      stroke: STROKE[i],
    })),
  );
}

function layoutFour(sets: BrowseVennSet[]): Shape[] {
  const midX = VIEW_W / 2;
  const midY = VIEW_H / 2;
  const bases = [
    { dx: -16, rotate: 38 },
    { dx: -5, rotate: 72 },
    { dx: 5, rotate: -72 },
    { dx: 16, rotate: -38 },
  ];
  const rx = 90;
  const ry = 228;
  return withStableColors(
    sets.map((set, i) => ({
      cx: midX + bases[i].dx,
      cy: midY,
      rx,
      ry,
      rotate: bases[i].rotate,
      set,
      color: FILL[i],
      stroke: STROKE[i],
    })),
  );
}

function layoutFive(sets: BrowseVennSet[]): Shape[] {
  const midX = VIEW_W / 2;
  const midY = VIEW_H / 2;
  const spread = 42;
  const rx = 78;
  const ry = 168;
  return withStableColors(
    sets.map((set, i) => {
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
    }),
  );
}

function computeLayout(sets: BrowseVennSet[]): Shape[] {
  const n = sets.length;
  if (n === 1) return layoutOne(sets);
  if (n === 2) return layoutTwo(sets);
  if (n === 3) return layoutThree(sets);
  if (n === 4) return layoutFour(sets);
  if (n === 5) return layoutFive(sets);
  return [];
}

const FOUR_REGION_POS: Record<number, { x: number; y: number }> = {
  1: { x: 300, y: 175 },
  2: { x: 385, y: 145 },
  4: { x: 515, y: 145 },
  8: { x: 600, y: 175 },
  3: { x: 355, y: 220 },
  6: { x: 450, y: 165 },
  12: { x: 545, y: 220 },
  5: { x: 380, y: 300 },
  10: { x: 520, y: 300 },
  9: { x: 450, y: 390 },
  7: { x: 395, y: 255 },
  14: { x: 505, y: 255 },
  11: { x: 410, y: 335 },
  13: { x: 490, y: 335 },
  15: { x: 450, y: 280 },
};

function fiveRegionPos(mask: number, shapes: Shape[]): { x: number; y: number } {
  const n = shapes.length;
  const midX = VIEW_W / 2;
  const midY = VIEW_H / 2;
  const bits: number[] = [];
  for (let i = 0; i < n; i++) {
    if (mask & (1 << i)) bits.push(i);
  }
  if (bits.length === n) return { x: midX, y: midY };
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
    if (inSet.length === 1) return { x: inSet[0].cx, y: inSet[0].cy };
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
  const active = all.filter((s) => s.opacity > 0.05);
  let dx = 0;
  let dy = 0;
  for (const o of active) {
    if (o.set.key === c.set.key) continue;
    dx += c.cx - o.cx;
    dy += c.cy - o.cy;
  }

  if (active.length <= 1 || (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3)) {
    // Single circle (or coincident): label above
    return {
      x: clamp(c.cx, LABEL_PAD, VIEW_W - LABEL_PAD),
      y: clamp(c.cy - c.ry - 28, LABEL_PAD + 8, VIEW_H - LABEL_PAD),
    };
  }

  if (Math.abs(c.rotate) > 5 || c.ry > c.rx * 1.2) {
    const rad = (c.rotate * Math.PI) / 180;
    let ox = Math.cos(rad);
    let oy = Math.sin(rad);
    const toCenterX = VIEW_W / 2 - c.cx;
    const toCenterY = VIEW_H / 2 - c.cy;
    if (ox * toCenterX + oy * toCenterY > 0) {
      ox = -ox;
      oy = -oy;
    }
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

function layoutSignature(sets: BrowseVennSet[]): string {
  // Keys only — size/count updates must not cancel an in-flight morph.
  return sets.map((s) => s.key).join(",");
}

type Props = {
  data: BrowseVenn;
  onOpenIntersectionPhotos?: () => void;
};

export default function BrowseVennDiagram({ data, onOpenIntersectionPhotos }: Props) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const n = data.sets.length;
  const dense = n >= 4;

  const targetShapes = useMemo(() => computeLayout(data.sets), [data.sets]);

  const [displayedShapes, setDisplayedShapes] = useState<Shape[]>(targetShapes);
  const displayedRef = useRef<Shape[]>(targetShapes);
  const animRef = useRef<number | null>(null);
  const sigRef = useRef<string | null>(null);

  const fullIntersection = useMemo(() => {
    const key = regionKey(data.sets.map((s) => s.key));
    return data.regions.find((r) => regionKey(r.members) === key) ?? null;
  }, [data.regions, data.sets]);

  const fullIntersectionKey = useMemo(
    () => regionKey(data.sets.map((s) => s.key)),
    [data.sets],
  );

  useEffect(() => {
    const nextSig = layoutSignature(data.sets);
    const from = displayedRef.current;
    const toMap = new Map(targetShapes.map((s) => [s.set.key, s]));
    const fromMap = new Map(from.map((s) => [s.set.key, s]));
    const allKeys = new Set([...fromMap.keys(), ...toMap.keys()]);

    const startPose = new Map<string, Shape>();
    const endPose = new Map<string, Shape>();

    for (const key of allKeys) {
      const tgt = toMap.get(key);
      const prev = fromMap.get(key);
      if (tgt && prev) {
        startPose.set(key, { ...prev, opacity: 1 });
        endPose.set(key, { ...tgt, opacity: 1 });
      } else if (tgt && !prev) {
        const enter: Shape = {
          ...tgt,
          cx: VIEW_W / 2,
          cy: VIEW_H / 2,
          rx: 0,
          ry: 0,
          opacity: 0,
        };
        startPose.set(key, enter);
        endPose.set(key, { ...tgt, opacity: 1 });
      } else if (!tgt && prev) {
        startPose.set(key, { ...prev, opacity: prev.opacity });
        endPose.set(key, {
          ...prev,
          cx: VIEW_W / 2,
          cy: VIEW_H / 2,
          rx: 0,
          ry: 0,
          opacity: 0,
        });
      }
    }

    // First paint: snap without animating
    if (sigRef.current === null) {
      displayedRef.current = targetShapes;
      setDisplayedShapes(targetShapes);
      sigRef.current = nextSig;
      return;
    }

    // Same set keys: refresh metadata/geometry targets in place without restarting morph
    if (nextSig === sigRef.current) {
      if (animRef.current == null) {
        displayedRef.current = targetShapes;
        setDisplayedShapes(targetShapes);
      } else {
        // Update end poses' set metadata via displayedRef on next tick end; soft-update labels
        displayedRef.current = displayedRef.current.map((s) => {
          const tgt = toMap.get(s.set.key);
          return tgt ? { ...s, set: tgt.set, color: tgt.color, stroke: tgt.stroke } : s;
        });
        setDisplayedShapes(displayedRef.current);
      }
      return;
    }

    sigRef.current = nextSig;
    if (animRef.current != null) cancelAnimationFrame(animRef.current);

    const t0 = performance.now();
    const tick = (now: number) => {
      const raw = Math.min(1, (now - t0) / MORPH_MS);
      const t = easeOutCubic(raw);
      const next: Shape[] = [];
      for (const key of allKeys) {
        const a = startPose.get(key)!;
        const b = endPose.get(key)!;
        next.push({
          set: toMap.has(key) ? toMap.get(key)!.set : a.set,
          color: b.color,
          stroke: b.stroke,
          cx: lerp(a.cx, b.cx, t),
          cy: lerp(a.cy, b.cy, t),
          rx: lerp(a.rx, b.rx, t),
          ry: lerp(a.ry, b.ry, t),
          rotate: lerpAngle(a.rotate, b.rotate, t),
          opacity: lerp(a.opacity, b.opacity, t),
        });
      }
      displayedRef.current = next;
      setDisplayedShapes(next);

      if (raw < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        displayedRef.current = targetShapes;
        setDisplayedShapes(targetShapes);
        animRef.current = null;
      }
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
    };
  }, [targetShapes, data.sets]);

  const hovered = data.regions.find((r) => regionKey(r.members) === hoverKey);

  const nonZeroRegions = useMemo(
    () =>
      data.regions
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count || b.members.length - a.members.length),
    [data.regions],
  );

  // Use target shapes for center position (stable), displayed for drawing
  const layoutShapes = displayedShapes.filter((s) => s.opacity > 0.02);
  if (targetShapes.length < 1 && layoutShapes.length < 1) return null;

  const resolvePos = (region: BrowseVennRegion): { x: number; y: number } => {
    const mask = membersToMask(region.members, data.sets);
    // Prefer settled target layout for n=4/5 anchors; fall back to displayed for 1–3
    const forGeom = targetShapes.length > 0 ? targetShapes : layoutShapes;
    if (n === 4 && FOUR_REGION_POS[mask]) return FOUR_REGION_POS[mask];
    if (n === 5) return fiveRegionPos(mask, forGeom);
    if (n === 1 && forGeom[0]) return { x: forGeom[0].cx, y: forGeom[0].cy };
    return regionLabelPosCircles(forGeom, region.members);
  };

  const centerPos = fullIntersection
    ? resolvePos(fullIntersection)
    : { x: VIEW_W / 2, y: VIEW_H / 2 };

  // During morph, lerp center toward average of visible shapes for 2–3
  const liveCenter =
    n <= 3 && layoutShapes.length > 0
      ? {
          x: lerp(
            centerPos.x,
            layoutShapes.reduce((s, c) => s + c.cx, 0) / layoutShapes.length,
            n === 1 ? 1 : 0.35,
          ),
          y: lerp(
            centerPos.y,
            layoutShapes.reduce((s, c) => s + c.cy, 0) / layoutShapes.length,
            n === 1 ? 1 : 0.35,
          ),
        }
      : centerPos;

  const activeForLabels = layoutShapes;

  return (
    <div className="browse-venn">
      <svg
        className="browse-venn-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label="Venn diagram of selected labels"
      >
        {layoutShapes.map((c) => (
          <ellipse
            key={c.set.key}
            cx={c.cx}
            cy={c.cy}
            rx={Math.max(c.rx, 0.01)}
            ry={Math.max(c.ry, 0.01)}
            transform={`rotate(${c.rotate} ${c.cx} ${c.cy})`}
            fill={c.color}
            stroke={c.stroke}
            strokeWidth={2}
            opacity={c.opacity}
          />
        ))}

        {activeForLabels.map((c) => {
          if (c.opacity < 0.15) return null;
          const p = setNamePos(c, activeForLabels);
          return (
            <text
              key={`name-${c.set.key}`}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="browse-venn-set-label"
              opacity={c.opacity}
            >
              {c.set.name}
              <tspan className="browse-venn-set-size"> ({c.set.size})</tspan>
            </text>
          );
        })}

        {fullIntersection && (
          <g
            className={`browse-venn-region${hoverKey === fullIntersectionKey ? " is-hover" : ""}${
              fullIntersection.count > 0 && onOpenIntersectionPhotos ? " is-clickable" : ""
            }`}
            onMouseEnter={() => setHoverKey(fullIntersectionKey)}
            onMouseLeave={() => setHoverKey(null)}
            onClick={
              fullIntersection.count > 0 && onOpenIntersectionPhotos
                ? onOpenIntersectionPhotos
                : undefined
            }
            role={
              fullIntersection.count > 0 && onOpenIntersectionPhotos ? "button" : undefined
            }
            tabIndex={
              fullIntersection.count > 0 && onOpenIntersectionPhotos ? 0 : undefined
            }
            onKeyDown={
              fullIntersection.count > 0 && onOpenIntersectionPhotos
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
              cx={n === 1 ? liveCenter.x : centerPos.x}
              cy={n === 1 ? liveCenter.y : centerPos.y}
              r={fullIntersection.count > 0 ? 22 : 16}
              className="browse-venn-region-hit"
              fill="transparent"
            />
            <text
              x={n === 1 ? liveCenter.x : centerPos.x}
              y={n === 1 ? liveCenter.y : centerPos.y}
              textAnchor="middle"
              dominantBaseline="central"
              className={`browse-venn-region-count${fullIntersection.count === 0 ? " is-zero" : ""}`}
            >
              {fullIntersection.count}
            </text>
          </g>
        )}
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
          <span>
            {n === 1
              ? "Circle shows this label’s photos."
              : "Center count is the full intersection. Shape colors mark each label."}
          </span>
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
