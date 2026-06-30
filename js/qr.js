// Thin wrapper around the vendored qrcodejs library (exposes window.QRCode).
import { el } from "./ui.js";

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
