import React, { useEffect, useRef, useState } from 'react';
import { Camera, Move, X } from 'lucide-react';
import { DashCamState } from '../hooks/useDashCamSpeed';
import { LcdPolarity } from '../utils/sevenSegmentOcr';
import { SpeedUnit, msToUnit, unitLabel } from '../utils/speedPhysics';

interface DashCamModalProps {
  open: boolean;
  onClose: () => void;
  dashCam: DashCamState;
  unit: SpeedUnit;
  gpsSpeedMs: number;
}

type DragMode = 'move' | 'resize' | null;

export const DashCamModal: React.FC<DashCamModalProps> = ({
  open,
  onClose,
  dashCam,
  unit,
  gpsSpeedMs,
}) => {
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  useEffect(() => {
    if (!open || !dashCam.stream) return;
    const vid = previewVideoRef.current;
    if (!vid) return;
    vid.srcObject = dashCam.stream;
    const onMeta = () => {
      if (vid.videoWidth > 0 && vid.videoHeight > 0) {
        setVideoAspect(vid.videoWidth / vid.videoHeight);
      }
    };
    vid.addEventListener('loadedmetadata', onMeta);
    void vid.play().catch(() => {});
    return () => {
      vid.removeEventListener('loadedmetadata', onMeta);
      vid.srcObject = null;
    };
  }, [open, dashCam.stream]);

  if (!open) return null;

  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    mode: DragMode
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origX: dashCam.roi.x,
      origY: dashCam.roi.y,
      origW: dashCam.roi.w,
      origH: dashCam.roi.h,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const container = frameRef.current;
    if (!drag || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dx = (e.clientX - drag.startX) / rect.width;
    const dy = (e.clientY - drag.startY) / rect.height;

    if (drag.mode === 'move') {
      dashCam.setRoi({
        x: drag.origX + dx,
        y: drag.origY + dy,
        w: drag.origW,
        h: drag.origH,
      });
    } else if (drag.mode === 'resize') {
      dashCam.setRoi({
        x: drag.origX,
        y: drag.origY,
        w: drag.origW + dx,
        h: drag.origH + dy,
      });
    }
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const detectedUnitVal =
    dashCam.dashSpeedKmh !== null
      ? Math.round(msToUnit(dashCam.dashSpeedKmh / 3.6, unit))
      : null;
  const gpsUnitVal = Math.round(msToUnit(gpsSpeedMs, unit));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Dash camera speed calibration"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[92dvh] bg-[#111319] border border-zinc-800 rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/80">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-zinc-100">
              Dash Camera Speed Fusion
            </h2>
            <p className="text-xs text-zinc-400">
              Drag box over the speed number on your motorbike screen
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors cursor-pointer"
            aria-label="Close camera setup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
          {/* Live Readout Comparison */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
              <div className="text-[11px] text-zinc-400">Dash Read</div>
              <div className="font-mono text-lg font-bold tabular-nums text-emerald-400 mt-0.5">
                {detectedUnitVal !== null
                  ? `${detectedUnitVal} ${unitLabel(unit)}`
                  : '—'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
              <div className="text-[11px] text-zinc-400">GPS Speed</div>
              <div className="font-mono text-lg font-bold tabular-nums text-zinc-100 mt-0.5">
                {gpsUnitVal} {unitLabel(unit)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
              <div className="text-[11px] text-zinc-400">Calibration</div>
              <div className="font-mono text-lg font-bold tabular-nums text-zinc-200 mt-0.5">
                {Math.round(dashCam.calibrationRatio * 100)}%
              </div>
            </div>
          </div>

          {dashCam.error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/40 text-xs text-red-200">
              {dashCam.error}
            </div>
          )}

          {/* Camera Preview & Draggable ROI Box */}
          {dashCam.active && dashCam.stream ? (
            <div className="relative w-full flex justify-center bg-black rounded-2xl overflow-hidden border border-zinc-800">
              <div
                ref={frameRef}
                className="relative w-full max-h-[42vh]"
                style={{ aspectRatio: String(videoAspect) }}
              >
                <video
                  ref={previewVideoRef}
                  playsInline
                  muted
                  autoPlay
                  className="w-full h-full object-fill"
                />

                {/* Dimmed backdrop outside target box */}
                <div
                  className="pointer-events-none absolute inset-0 bg-black/35"
                  aria-hidden="true"
                />

                {/* Draggable Target Box */}
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'move')}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  style={{
                    left: `${dashCam.roi.x * 100}%`,
                    top: `${dashCam.roi.y * 100}%`,
                    width: `${dashCam.roi.w * 100}%`,
                    height: `${dashCam.roi.h * 100}%`,
                  }}
                  className={`absolute border-2 rounded-lg touch-none cursor-move ${
                    dashCam.dashSpeedKmh !== null
                      ? 'border-emerald-400 bg-emerald-400/5'
                      : 'border-amber-400 bg-amber-400/5'
                  }`}
                >
                  <div className="absolute -top-6 left-0 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-zinc-100 whitespace-nowrap">
                    <Move className="w-3 h-3 text-emerald-400" />
                    <span>
                      {dashCam.dashSpeedKmh !== null
                        ? `${dashCam.dashSpeedKmh} km/h (${Math.round(
                            dashCam.confidence * 100
                          )}%)`
                        : 'Aim at speed digits'}
                    </span>
                  </div>

                  {/* Live detected digit sub-boxes */}
                  {dashCam.digits.map((d, idx) => (
                    <div
                      key={idx}
                      style={{
                        left: `${d.x * 100}%`,
                        top: `${d.y * 100}%`,
                        width: `${d.w * 100}%`,
                        height: `${d.h * 100}%`,
                      }}
                      className="pointer-events-none absolute border border-emerald-300/90"
                    >
                      <span className="absolute -bottom-4 left-0 text-[10px] font-mono font-bold text-emerald-300 bg-black/80 px-1 rounded">
                        {d.digit}
                      </span>
                    </div>
                  ))}

                  {/* Bottom-right resize handle */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'resize')}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className="absolute -bottom-3 -right-3 w-7 h-7 rounded-full bg-emerald-400 border-2 border-zinc-950 touch-none cursor-nwse-resize flex items-center justify-center"
                    aria-label="Resize target box"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex flex-col items-center text-center gap-3">
              <Camera className="w-8 h-8 text-zinc-400" />
              <div className="text-sm font-medium text-zinc-200">
                Film your motorbike dashboard screen under your mount
              </div>
              <p className="text-xs text-zinc-400 max-w-sm">
                Reads the LCD speed number in real time with zero GPS lag and
                calibrates true speed using your GPS signal.
              </p>
              <button
                type="button"
                onClick={() => void dashCam.startCamera()}
                disabled={dashCam.starting}
                className="min-h-[46px] px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-zinc-950 font-semibold text-sm transition-colors cursor-pointer"
              >
                {dashCam.starting ? 'Starting Camera…' : 'Enable Rear Camera'}
              </button>
            </div>
          )}

          {/* Polarity & Zoom Controls */}
          {dashCam.active && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-300">
                  Dash Display Contrast
                </span>
                <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
                  {(
                    [
                      { id: 'auto', label: 'Auto' },
                      { id: 'dark-on-light', label: 'Day LCD' },
                      { id: 'light-on-dark', label: 'Night Lit' },
                    ] as Array<{ id: LcdPolarity; label: string }>
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => dashCam.setPolarity(opt.id)}
                      className={`min-h-[36px] px-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        dashCam.polarity === opt.id
                          ? 'bg-zinc-100 text-zinc-950'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {dashCam.zoomSupported && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300">Camera Zoom</span>
                    <span className="font-mono tabular-nums text-zinc-400">
                      {dashCam.zoom.toFixed(1)}×
                    </span>
                  </div>
                  <input
                    type="range"
                    min={dashCam.zoomRange.min}
                    max={dashCam.zoomRange.max}
                    step={dashCam.zoomRange.step}
                    value={dashCam.zoom}
                    onChange={(e) => void dashCam.setZoom(Number(e.target.value))}
                    aria-label="Rear camera zoom"
                    className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 pb-safe border-t border-zinc-800/80 bg-[#111319] flex items-center gap-2">
          {dashCam.active && (
            <button
              type="button"
              onClick={() => {
                dashCam.stopCamera();
                onClose();
              }}
              className="min-h-[48px] px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-semibold text-sm transition-colors cursor-pointer"
            >
              Turn Off
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[48px] rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-sm transition-colors cursor-pointer"
          >
            {dashCam.active ? 'Lock & Return to HUD' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
