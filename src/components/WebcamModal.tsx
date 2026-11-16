import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Check, X } from 'lucide-react';

interface WebcamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}

export const WebcamModal: React.FC<WebcamModalProps> = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    setCapturedUrl(null);
    setIsStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to access camera. Check browser permissions or upload an image file instead.';
      setCameraError(msg);
    } finally {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopStream();
      setCapturedUrl(null);
      setCameraError(null);
    }
    return () => {
      stopStream();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSnap = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedUrl(dataUrl);
  };

  const handleConfirm = () => {
    if (!capturedUrl) return;
    onCapture(capturedUrl);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Capture handwritten paper"
    >
      <div className="w-full max-w-2xl rounded-xl border border-[#E4E2DC] bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E4E2DC] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Camera className="h-4 w-4 text-[#1D3557]" />
            <h2 className="text-sm font-semibold text-[#18181B]">Capture Handwritten Paper</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[#64625D] hover:bg-[#FAF9F6] hover:text-[#18181B] transition-colors"
            aria-label="Close camera"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="bg-zinc-950 relative aspect-[4/3] w-full flex items-center justify-center overflow-hidden">
          {cameraError ? (
            <div className="max-w-md px-6 text-center text-white">
              <p className="text-sm font-medium text-red-300">{cameraError}</p>
              <button
                type="button"
                onClick={startCamera}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-xs font-medium text-white hover:bg-white/20 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry Camera
              </button>
            </div>
          ) : capturedUrl ? (
            <img
              src={capturedUrl}
              alt="Captured handwritten paper preview"
              className="h-full w-full object-contain"
              referrerPolicy="no-referrer"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-contain"
              />
              {isStarting && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60 text-xs font-medium text-zinc-200">
                  Starting camera...
                </div>
              )}
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="flex items-center justify-between border-t border-[#E4E2DC] bg-[#FAF9F6] px-5 py-3.5">
          <p className="text-xs text-[#64625D]">
            Hold the page flat under even lighting for sharp character recognition.
          </p>
          <div className="flex items-center gap-2.5 shrink-0">
            {capturedUrl ? (
              <>
                <button
                  type="button"
                  onClick={() => setCapturedUrl(null)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E2DC] bg-white px-3.5 py-2 text-xs font-medium text-[#18181B] hover:bg-[#FAF9F6] transition-colors whitespace-nowrap"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retake
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D3557] px-4 py-2 text-xs font-medium text-white hover:bg-[#142640] transition-colors whitespace-nowrap"
                >
                  <Check className="h-3.5 w-3.5" />
                  Add Page
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={Boolean(cameraError) || isStarting}
                onClick={handleSnap}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1D3557] px-4 py-2 text-xs font-medium text-white hover:bg-[#142640] disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                <Camera className="h-3.5 w-3.5" />
                Capture Page
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
