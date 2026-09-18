// Taking the photo, rather than choosing one.
//
// `<input type="file" capture="environment">` is only a hint: desktop browsers
// ignore it and show a file picker, and mobile often still lets you switch to
// the gallery. It cannot enforce "photograph it now". getUserMedia can — a live
// stream painted to a canvas has no file to pick, so an old or borrowed image
// cannot enter the flow at all.
//
// Needs a secure context, which localhost and the deployed HTTPS URL both are.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Icon } from "../design-system";

export function CameraCapture({ onCapture, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  // One place to stop the camera, called on unmount and after a capture. A
  // camera light left on after the sheet closes is the kind of bug people
  // rightly never forgive.
  const stop = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    setReady(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const media = typeof navigator !== "undefined" && navigator.mediaDevices;
    if (!media || !media.getUserMedia) {
      setError("This device has no camera Solvik can use. A report needs a photo taken on the spot, so it can't be filed here.");
      return undefined;
    }
    media
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        // Readiness waits for the first frame, not for the stream: until the
        // video reports dimensions there is nothing to draw, and a shutter press
        // would quietly do nothing.
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err && err.name === "NotAllowedError"
            ? "Camera access was declined. A report needs a photo taken on the spot, so it can't be filed without it."
            : "The camera couldn't be started. A report needs a photo taken on the spot."
        );
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [stop]);

  const take = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    // Enough for the photo check without shipping a 4000px frame over mobile data.
    const scale = Math.min(1, 1280 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    stop();
    // capturedAt is our own clock at the shutter: a canvas capture carries no
    // EXIF, so this is the only timestamp there is, and the server checks it.
    onCapture({ dataUrl, capturedAt: Date.now(), width: canvas.width, height: canvas.height });
  };

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "18px 16px", borderRadius: "var(--radius-card)", background: "var(--surface-card)", border: "1px solid var(--border-card)" }}>
        <div style={{ font: "var(--type-body)", color: "var(--text-body)", textWrap: "pretty" }}>{error}</div>
        <Button variant="secondary" size="md" onClick={onCancel}>Back</Button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ position: "relative", borderRadius: "var(--radius-card)", overflow: "hidden", background: "var(--sand-900, #201e1d)", aspectRatio: "3 / 4" }}>
        <video ref={videoRef} playsInline muted onLoadedMetadata={() => setReady(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        {!ready && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", font: "var(--type-body)" }}>
            Starting the camera…
          </div>
        )}
      </div>
      {/* Said instead of the old "faces are blurred automatically", which was
          not true — nothing blurred anything. */}
      <div style={{ display: "flex", gap: 9, alignItems: "flex-start", font: "var(--type-caption)", color: "var(--text-muted)", textWrap: "pretty" }}>
        <Icon name="shield" size={15} />
        <span>Photograph the problem, not people. The photo is checked and then discarded — it is never stored or shown to anyone.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "center" }}>
        <Button size="lg" fullWidth iconLeft="camera" disabled={!ready} onClick={take} style={{ minWidth: 0, paddingInline: 16 }}>Take photo</Button>
        <Button variant="secondary" size="lg" onClick={onCancel} style={{ minWidth: 88, paddingInline: 16, whiteSpace: "nowrap" }}>Cancel</Button>
      </div>
    </div>
  );
}
