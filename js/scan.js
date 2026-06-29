// In-app QR scanner — joins a game room by reading the host's join link.
import { el, toast } from "./ui.js";

export function parseJoinUrl(text) {
  if (!text) return null;
  const m = String(text).match(/#\/join\/([^/?#]+)\/([^/?#]+)/);
  return m ? { gameId: decodeURIComponent(m[1]), peerId: decodeURIComponent(m[2]) } : null;
}

function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/jsqr.min.js";
    s.onload = () => resolve(window.jsQR);
    s.onerror = reject;
    document.head.append(s);
  });
}

export function openScanner(onJoin) {
  let stream = null;
  let raf = 0;
  let closed = false;

  const video = el("video", { playsinline: "", muted: "", style: "width:100%; border-radius:16px; background:#000" });
  const hint = el("p", { class: "muted center", style: "margin:12px 0 0" }, "Point at your partner's QR code");
  const errBox = el("p", { class: "center", style: "color:var(--bad); display:none" });

  const close = () => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    bg.remove();
  };

  const sheet = el("div", { class: "modal scan-modal" }, [
    el("div", { class: "topbar" }, [
      el("h2", {}, "Scan to join"),
      el("div", { class: "spacer" }),
      el("button", { class: "iconbtn", "aria-label": "Close", onClick: close }, "✕"),
    ]),
    el("div", { class: "scan-frame" }, video),
    hint,
    errBox,
    el("p", { class: "muted center", style: "font-size:.82rem; margin-top:10px" },
      "Camera stays on your phone — nothing is uploaded."),
  ]);
  const bg = el("div", { class: "modal-bg", onClick: (e) => { if (e.target === bg) close(); } }, [sheet]);
  document.body.append(bg);

  (async () => {
    try {
      const jsQR = await loadJsQR();
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (closed) return;
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = () => {
        if (closed) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (code && code.data) {
            const join = parseJoinUrl(code.data);
            if (join) {
              close();
              toast("Room found! Joining…");
              onJoin(join.gameId, join.peerId);
              return;
            }
          }
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      errBox.style.display = "block";
      errBox.textContent = e.name === "NotAllowedError"
        ? "Camera permission denied. Allow camera access or open the join link manually."
        : "Couldn't open the camera on this device.";
      hint.textContent = "You can still paste a join link from your partner.";
    }
  })();
}
