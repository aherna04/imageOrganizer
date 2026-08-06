import { useCallback, useRef, type PointerEvent } from "react";
import { LetterFrame, api } from "../api/client";

const DEFAULT_FRAME: LetterFrame = { pan_x: 0, pan_y: 0, zoom: 1 };

type Props = {
  glyphs: string[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  frames: LetterFrame[];
  onChangeFrame: (index: number, frame: LetterFrame) => void;
  /** Photo file id for the selected glyph (for thumb). */
  photoFileId: number | null;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function defaultLetterFrame(): LetterFrame {
  return { ...DEFAULT_FRAME };
}

export default function LetterFrameEditor({
  glyphs,
  selectedIndex,
  onSelectIndex,
  frames,
  onChangeFrame,
  photoFileId,
}: Props) {
  const frame = frames[selectedIndex] ?? DEFAULT_FRAME;
  const dragRef = useRef<{ x: number; y: number; pan_x: number; pan_y: number } | null>(null);

  const update = useCallback(
    (partial: Partial<LetterFrame>) => {
      onChangeFrame(selectedIndex, {
        pan_x: clamp(partial.pan_x ?? frame.pan_x, -1, 1),
        pan_y: clamp(partial.pan_y ?? frame.pan_y, -1, 1),
        zoom: clamp(partial.zoom ?? frame.zoom, 1, 3),
      });
    },
    [frame, onChangeFrame, selectedIndex],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, pan_x: frame.pan_x, pan_y: frame.pan_y };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    // ~120px drag = full pan range
    update({
      pan_x: start.pan_x + dx / 120,
      pan_y: start.pan_y + dy / 120,
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  if (glyphs.length === 0) return null;

  const glyph = glyphs[selectedIndex] ?? glyphs[0];
  const posX = 50 + frame.pan_x * 50;
  const posY = 50 + frame.pan_y * 50;

  return (
    <div className="letter-frame-editor">
      <p className="word-silhouette-hint">
        Select a letter, then drag the photo to reframe. Zoom tightens the crop.
      </p>
      <div className="letter-frame-chips">
        {glyphs.map((ch, i) => (
          <button
            key={`${ch}-${i}`}
            type="button"
            className={`letter-frame-chip${i === selectedIndex ? " active" : ""}`}
            onClick={() => onSelectIndex(i)}
          >
            {ch}
          </button>
        ))}
      </div>

      <div className="letter-frame-pan-row">
        <div
          className="letter-frame-pan-surface"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {photoFileId != null ? (
            <img
              src={api.thumbUrl(photoFileId)}
              alt=""
              draggable={false}
              style={{
                objectPosition: `${posX}% ${posY}%`,
                transform: `scale(${frame.zoom})`,
              }}
            />
          ) : (
            <div className="letter-frame-pan-empty">Pick photos first</div>
          )}
          <span className="letter-frame-pan-glyph" aria-hidden>
            {glyph}
          </span>
        </div>

        <div className="letter-frame-pan-controls">
          <label className="word-silhouette-field">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={frame.zoom}
              onChange={(e) => update({ zoom: Number(e.target.value) })}
            />
            <span>{frame.zoom.toFixed(2)}×</span>
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onChangeFrame(selectedIndex, defaultLetterFrame())}
          >
            Reset letter
          </button>
        </div>
      </div>
    </div>
  );
}
