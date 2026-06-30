// Thin wrapper around the vendored qrcodejs library (exposes window.QRCode).
import { el } from "./ui.js";

export function qrScanIcon() {
  return el("span", {
    class: "qr-scan-icon",
    html: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 4h7v7H4V4zm2 2v3h3V6H6zM13 4h7v7h-7V4zm2 2v3h3V6h-3zM4 13h7v7H4v-7zm2 2v3h3v-3H6z"/>
      <path d="M13 13h2v2h-2v-2zm0 3h2v2h-2v-2zm3-3h2v2h-2v-2zm0 3h2v2h-2v-2zm3-3h2v2h-2v-2zm0 3h2v2h-2v-2zm-3 3h2v2h-2v-2zm3 0h2v2h-2v-2z"/>
    </svg>`,
  });
}

export function qrFor(text, size = 200) {
  const wrap = el("div", { class: "qr-wrap" });
  const box = el("div", { class: "qr-box", style: `--qr-size:${size}px` });
  wrap.append(box);
  // QRCode renders into the element on construction.
  // eslint-disable-next-line no-new
  new window.QRCode(box, {
    text,
    width: size,
    height: size,
    colorDark: "#1d1b2e",
    colorLight: "#ffffff",
    correctLevel: window.QRCode.CorrectLevel.M,
  });
  return wrap;
}
