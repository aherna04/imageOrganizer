import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { LetterFrame, api } from "../api/client";

const DEFAULT_FRAME: LetterFrame = { pan_x: 0, pan_y: 0, zoom: 1 };
const SURFACE = 220;

type Props = {
  glyphs: string[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  frames: LetterFrame[];
  onChangeFrame: (index: number, frame: LetterFrame) => void;
  photoFileId: number | null;
  designId: number | null;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Mirror backend `_cover_crop` including 2D pan slack bump. */
export function coverCropParams(
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  panX: number,
  panY: number,
  zoom: number,
): { nw: number; nh: number; left: number; top: number } {
  const tw = Math.max(1, targetW);
  const th = Math.max(1, targetH);
  const px = clamp(panX, -1, 1);
  const py = clamp(panY, -1, 1);
  const z = clamp(zoom, 1, 3);
  const cover = Math.max(tw / srcW, th / srcH);
  let scale = cover * z;
  const scaleCap = cover * 3;
  const minSlackX = Math.max(2, Math.floor(0.02 * tw));
  const minSlackY = Math.max(2, Math.floor(0.02 * th));

  for (let i = 0; i < 40; i++) {
    const nw = Math.max(1, Math.round(srcW * scale));
    const nh = Math.max(1, Math.round(srcH * scale));
    if (nw - tw >= minSlackX && nh - th >= minSlackY) break;
    if (scale >= scaleCap - 1e-9) break;
    scale = Math.min(scaleCap, scale * 1.05);
  }

  let nw = Math.max(1, Math.round(srcW * scale));
  let nh = Math.max(1, Math.round(srcH * scale));
  const needW = tw + minSlackX;
  const needH = th + minSlackY;
  if (nw < needW || nh < needH) {
    const bump = Math.max(needW / nw, needH / nh);
    nw = Math.max(1, Math.round(nw * bump));
    nh = Math.max(1, Math.round(nh * bump));
  }

  const maxLeft = Math.max(0, nw - tw);
  const maxTop = Math.max(0, nh - th);
  const left = clamp(Math.round((maxLeft / 2) * (1 + px)), 0, maxLeft);
  const top = clamp(Math.round((maxTop / 2) * (1 + py)), 0, maxTop);
  return { nw, nh, left, top };
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
  designId,
}: Props) {
  const frame = frames[selectedIndex] ?? DEFAULT_FRAME;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; pan_x: number; pan_y: number } | null>(null);
  const photoRef = useRef<HTMLImageElement | null>(null);
  const [fontFamily, setFontFamily] = useState<string | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  const [photoReady, setPhotoReady] = useState(0);

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

  // Load design font for accurate glyph mask
  useEffect(() => {
    if (designId == null) {
      setFontFamily(null);
      return;
    }
    let cancelled = false;
    const family = `ws-design-${designId}`;
    const url = `/api/word-silhouette/designs/${designId}/font`;
    const face = new FontFace(family, `url(${url})`);
    face
      .load()
      .then((loaded) => {
        if (cancelled) return;
        document.fonts.add(loaded);
        setFontFamily(family);
        setFontError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setFontFamily(null);
          setFontError("Could not load design font");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [designId]);

  // Load photo
  useEffect(() => {
    photoRef.current = null;
    if (photoFileId == null) return;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      photoRef.current = img;
      setPhotoReady((n) => n + 1);
    };
    img.onerror = () => {
      photoRef.current = null;
      setPhotoReady((n) => n + 1);
    };
    img.src = api.thumbUrl(photoFileId);
  }, [photoFileId]);

  // Draw canvas WYSIWYG
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = SURFACE * dpr;
    canvas.height = SURFACE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SURFACE, SURFACE);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, SURFACE, SURFACE);

    const glyph = glyphs[selectedIndex] ?? "";
    if (!glyph) return;

    const family = fontFamily ?? "serif";
    const pad = 16;
    let fontSize = SURFACE - pad * 2;
    ctx.font = `700 ${fontSize}px "${family}", serif`;
    let metrics = ctx.measureText(glyph);
    let gw = Math.max(1, metrics.width);
    let ascent = metrics.actualBoundingBoxAscent ?? fontSize * 0.8;
    let descent = metrics.actualBoundingBoxDescent ?? fontSize * 0.2;
    let gh = Math.max(1, ascent + descent);
    const fit = Math.min((SURFACE - pad * 2) / gw, (SURFACE - pad * 2) / gh);
    fontSize = Math.max(12, Math.floor(fontSize * fit));
    ctx.font = `700 ${fontSize}px "${family}", serif`;
    metrics = ctx.measureText(glyph);
    gw = Math.max(1, Math.ceil(metrics.width));
    ascent = metrics.actualBoundingBoxAscent ?? fontSize * 0.8;
    descent = metrics.actualBoundingBoxDescent ?? fontSize * 0.2;
    gh = Math.max(1, Math.ceil(ascent + descent));

    const leftBearing = metrics.actualBoundingBoxLeft ?? 0;
    const originX = (SURFACE - gw) / 2 - leftBearing;
    const originY = (SURFACE - gh) / 2 + ascent;
    const boxX = (SURFACE - gw) / 2;
    const boxY = (SURFACE - gh) / 2;

    const photo = photoRef.current;
    const layer = document.createElement("canvas");
    layer.width = SURFACE;
    layer.height = SURFACE;
    const lctx = layer.getContext("2d");
    if (!lctx) return;

    if (photo && photo.naturalWidth > 0) {
      const crop = coverCropParams(
        photo.naturalWidth,
        photo.naturalHeight,
        gw,
        gh,
        frame.pan_x,
        frame.pan_y,
        frame.zoom,
      );
      const scaled = document.createElement("canvas");
      scaled.width = crop.nw;
      scaled.height = crop.nh;
      const sctx = scaled.getContext("2d");
      if (!sctx) return;
      sctx.drawImage(photo, 0, 0, crop.nw, crop.nh);
      lctx.drawImage(scaled, crop.left, crop.top, gw, gh, boxX, boxY, gw, gh);
    } else {
      lctx.fillStyle = "#8891a0";
      lctx.font = `700 ${fontSize}px "${family}", serif`;
      lctx.textBaseline = "alphabetic";
      lctx.fillText(glyph, originX, originY);
    }

    // Clip photo layer to letter shape
    lctx.globalCompositeOperation = "destination-in";
    lctx.font = `700 ${fontSize}px "${family}", serif`;
    lctx.textBaseline = "alphabetic";
    lctx.fillStyle = "#000";
    lctx.fillText(glyph, originX, originY);
    lctx.globalCompositeOperation = "source-over";

    ctx.drawImage(layer, 0, 0);
  }, [glyphs, selectedIndex, frame, fontFamily, photoReady, photoFileId]);

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, pan_x: frame.pan_x, pan_y: frame.pan_y };
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const start = dragRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    // Full surface drag ≈ full pan range; invert so the photo follows the cursor
    update({
      pan_x: start.pan_x - (dx / SURFACE) * 2,
      pan_y: start.pan_y - (dy / SURFACE) * 2,
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  if (glyphs.length === 0) return null;

  return (
    <div className="letter-frame-editor">
      <p className="word-silhouette-hint">
        Select a letter, then drag the photo freely (up/down/left/right) to reframe. Zoom tightens the
        crop.
      </p>
      {fontError && <p className="word-silhouette-error">{fontError}</p>}
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
        <canvas
          ref={canvasRef}
          className="letter-frame-pan-canvas"
          width={SURFACE}
          height={SURFACE}
          style={{ width: SURFACE, height: SURFACE }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />

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
