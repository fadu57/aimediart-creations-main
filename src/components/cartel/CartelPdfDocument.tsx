/**
 * Cartel PDF — @react-pdf/renderer
 *
 * - Page size dynamique (mm → pt)
 * - Maquette 80×80 × scale k = min(w,h)/80, centrée dans la page
 * - Stamp FREE absolu coin HG (ratio pixel exact → pas de déformation)
 * - Zone principale Flexbox (header → QR → titres → artiste)
 * - fontSize auto-réduit si texte trop long
 */
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  CARTEL_LAYOUT_BASE_MM,
  cartelScaleFromPageMm,
  fitFontSizePt,
  mmToPt,
} from "@/lib/cartelPdfMm";
import { AIMEDIART_BRAND_LOGO } from "@/lib/aimediartBrandLogo";

export const CARTEL_FREE_STAMP_URL = "/brand/cartel-free-stamp.png";

export type CartelPdfPageProps = {
  /** Taille complète de la page PDF. */
  pageWidthMm: number;
  pageHeightMm: number;
  /** Offset du slot (position du cartel) dans la page PDF. */
  slotOffsetXMm: number;
  slotOffsetYMm: number;
  widthMm: number;
  heightMm: number;
  headerText: string;
  titleText: string;
  artistText: string;
  extraTitles?: string[];
  qrDataUrl: string;
  /** Stamp PNG déjà pré-tourné (fond transparent). */
  stampSrc: string;
  /** Ratio largeur/hauteur du bitmap pré-tourné (px). */
  stampAspect: number;
  /** Largeur d’affichage du stamp sur maquette 80×80 (mm). */
  stampWidthMm: number;
  /** Logo centré sur le QR (optionnel). */
  logoSrc?: string;
};

export type CartelPdfDocumentProps = {
  pages: CartelPdfPageProps[];
};

function CartelPdfPage({
  pageWidthMm,
  pageHeightMm,
  slotOffsetXMm,
  slotOffsetYMm,
  widthMm,
  heightMm,
  headerText,
  titleText,
  artistText,
  extraTitles = [],
  qrDataUrl,
  stampSrc,
  stampAspect,
  stampWidthMm,
  logoSrc,
}: CartelPdfPageProps) {
  const w = Math.max(1, widthMm);
  const h = Math.max(1, heightMm);
  const k = cartelScaleFromPageMm(w, h);
  const contentMm = CARTEL_LAYOUT_BASE_MM * k;
  const originXMm = (w - contentMm) / 2;
  const originYMm = (h - contentMm) / 2;

  const header = headerText.trim();
  const title = titleText.trim();
  const artist = artistText.trim();
  const extras = extraTitles.map((s) => s.trim()).filter(Boolean);

  const textMaxMm = 70 * k;
  const textMaxPt = mmToPt(textMaxMm);
  const headerMaxPt = mmToPt(60 * k);

  const headerPt = fitFontSizePt(header, 11 * k, headerMaxPt, 6 * k);
  // Même corps pour titre principal et titres i18n (gras vs italique seulement)
  const longestTitle = [title, ...extras].reduce((a, b) => (a.length >= b.length ? a : b), "");
  const titlePt = fitFontSizePt(longestTitle, 12 * k, textMaxPt, 7 * k);
  const artistPt = fitFontSizePt(artist, 11 * k, textMaxPt, 6 * k);

  // Ratio réel du logo exporté en PNG (évite tout “stretch”).
  const logoAspect = Math.max(1, AIMEDIART_BRAND_LOGO.widthPx / Math.max(1, AIMEDIART_BRAND_LOGO.heightPx));

  // Dimensions d’affichage : largeur ancrée, hauteur = largeur / aspect bitmap (aucun stretch)
  const aspect = stampAspect > 0 ? stampAspect : 1;
  const stampWmm = stampWidthMm * k;
  const stampHmm = stampWmm / aspect;

  // On centre explicitement le badge sur le QR (taille QR = 36×36 sur la maquette).
  const qrSizeMm = 36 * k;
  const logoBadgeWmm = qrSizeMm * 0.52;
  const logoBadgeHmm = logoBadgeWmm / logoAspect;

  const styles = StyleSheet.create({
    page: {
      width: mmToPt(pageWidthMm),
      height: mmToPt(pageHeightMm),
      backgroundColor: "#FFFFFF",
      position: "relative",
      fontFamily: "Helvetica",
    },
    content: {
      position: "absolute",
      left: mmToPt(slotOffsetXMm + originXMm),
      top: mmToPt(slotOffsetYMm + originYMm),
      width: mmToPt(contentMm),
      height: mmToPt(contentMm),
    },
    stamp: {
      position: "absolute",
      left: mmToPt(5 * k),
      top: mmToPt(3 * k),
      width: mmToPt(stampWmm),
      height: mmToPt(stampHmm),
    },
    main: {
      position: "absolute",
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      flexDirection: "column",
      alignItems: "center",
      paddingTop: mmToPt(15.8 * k),
      paddingHorizontal: mmToPt(5 * k),
      paddingBottom: mmToPt(4 * k),
    },
    header: {
      alignSelf: "flex-start",
      marginLeft: mmToPt(10 * k),
      marginBottom: mmToPt(1.5 * k),
      fontFamily: "Helvetica-BoldOblique",
      fontSize: headerPt,
      color: "#000000",
      maxWidth: headerMaxPt,
    },
    qrWrap: {
      width: mmToPt(36 * k),
      height: mmToPt(36 * k),
      marginBottom: mmToPt(1.5 * k),
      flexShrink: 0,
      position: "relative",
      alignItems: "center",
      justifyContent: "center",
    },
    qr: {
      width: "100%",
      height: "100%",
    },
    logoBadge: {
      position: "absolute",
      width: mmToPt(logoBadgeWmm),
      height: mmToPt(logoBadgeHmm),
      backgroundColor: "#FFFFFF",
      borderRadius: mmToPt(0.8 * k),
      padding: mmToPt(0.6 * k),
      alignItems: "center",
      justifyContent: "center",
      left: mmToPt((qrSizeMm - logoBadgeWmm) / 2),
      top: mmToPt((qrSizeMm - logoBadgeHmm) / 2),
    },
    logoImg: {
      width: "100%",
      height: "100%",
      objectFit: "contain",
    },
    title: {
      textAlign: "center",
      fontFamily: "Helvetica-Bold",
      fontSize: titlePt,
      color: "#000000",
      maxWidth: textMaxPt,
    },
    extraTitle: {
      textAlign: "center",
      fontFamily: "Helvetica-Oblique",
      fontSize: titlePt,
      color: "#000000",
      marginTop: mmToPt(1 * k),
      maxWidth: textMaxPt,
    },
    artist: {
      textAlign: "center",
      fontFamily: "Helvetica-BoldOblique",
      fontSize: artistPt,
      color: "#000000",
      marginTop: mmToPt(0.6 * k),
      maxWidth: textMaxPt,
    },
  });

  return (
    <Page size={[mmToPt(pageWidthMm), mmToPt(pageHeightMm)]} style={styles.page}>
      <View style={styles.content}>
        <Image src={stampSrc} style={styles.stamp} />

        <View style={styles.main}>
          {header ? <Text style={styles.header}>{header}</Text> : null}

          <View style={styles.qrWrap}>
            <Image src={qrDataUrl} style={styles.qr} />
            {logoSrc ? (
              <View style={styles.logoBadge}>
                <Image src={logoSrc} style={styles.logoImg} />
              </View>
            ) : null}
          </View>

          {title ? <Text style={styles.title}>{title}</Text> : null}

          {extras.map((line) => (
            <Text key={line} style={styles.extraTitle}>
              {line}
            </Text>
          ))}

          {artist ? <Text style={styles.artist}>{artist}</Text> : null}
        </View>
      </View>
    </Page>
  );
}

export function CartelPdfDocument({ pages }: CartelPdfDocumentProps) {
  return (
    <Document title="Cartel AIMEDIArt" author="AIMEDIArt">
      {pages.map((page, index) => (
        <CartelPdfPage key={`cartel-${index}`} {...page} />
      ))}
    </Document>
  );
}
