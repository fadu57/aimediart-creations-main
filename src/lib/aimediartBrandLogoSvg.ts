import {
  AIMEDIART_BRAND_LOGO,
  AIMEDIART_LOGO_RED,
  LUCIDE_HEART_PATH,
} from "@/lib/aimediartBrandLogo";

/** SVG vectoriel du bloc logo marque (161×40 px) — source unique pour PDF et export statique. */
export function buildAimediartBrandLogoSvg(): string {
  const { widthPx, heightPx, boxPx, boxRadiusPx, textX, titleFontSizePx, subtitleFontSizePx } =
    AIMEDIART_BRAND_LOGO;
  const heartOffset = (boxPx - 24) / 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}" role="img" aria-label="AIMEDIArt.com — Art-mediation with AI">
  <rect x="0" y="0" width="${boxPx}" height="${boxPx}" rx="${boxRadiusPx}" fill="${AIMEDIART_LOGO_RED}" />
  <g transform="translate(${heartOffset}, ${heartOffset})">
    <path
      d="${LUCIDE_HEART_PATH}"
      fill="none"
      stroke="#ffffff"
      stroke-width="2.25"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </g>
  <text
    x="${textX}"
    y="15"
    font-family="Inter, ui-sans-serif, system-ui, sans-serif"
    font-size="${titleFontSizePx}"
    font-weight="700"
    letter-spacing="-0.025em"
    fill="${AIMEDIART_LOGO_RED}"
  >AIMEDIArt.com</text>
  <text
    x="${textX}"
    y="32"
    font-family="Inter, ui-sans-serif, system-ui, sans-serif"
    font-size="${subtitleFontSizePx}"
    font-weight="700"
    font-style="italic"
    fill="${AIMEDIART_LOGO_RED}"
  >Art-mediation with AI</text>
</svg>`;
}
