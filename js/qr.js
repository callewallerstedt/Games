// Thin wrapper around the vendored qrcodejs library (exposes window.QRCode).
import { el } from "./ui.js";

const MINI_QR_PATTERN = [
  "11111101110",
  "10000101010",
  "10110101110",
  "10110100000",
  "11111101010",
  "00000000000",
  "11101110101",
  "01010101010",
  "11101010101",
  "01000001010",
  "11111111111",
];

export function fakeMiniQrIcon() {
  const grid = el("span", { class: "mini-qr-icon", "aria-hidden": "true" });
  MINI_QR_PATTERN.join("").split("").forEach((cell) => {
    grid.append(el("i", { class: cell === "1" ? "on" : "" }));
  });
  return grid;
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
