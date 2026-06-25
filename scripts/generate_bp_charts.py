#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Génère les graphiques et cartes pour le dossier plan d'affaires AIMEDIArt."""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

# Import des données financières depuis le générateur Excel
sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_bp_excel import END_BASE, SCENARIOS, scaled_end, run_scenario  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "docs" / "assets" / "bp"
GEOJSON_URL = (
    "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/"
    "regions-version-simplifiee.geojson"
)

# Charte AIMEDIArt
RED = "#E63946"
RED_DARK = "#C1121F"
RED_LIGHT = "#F4A3A8"
GRAY = "#4A4A4A"
GRAY_LIGHT = "#E8E8E8"
WHITE = "#FFFFFF"
ACCENT = "#1D3557"
ACCENT2 = "#457B9D"

plt.rcParams.update(
    {
        "font.family": "sans-serif",
        "font.sans-serif": ["Segoe UI", "Arial", "DejaVu Sans"],
        "axes.titlesize": 14,
        "axes.titleweight": "bold",
        "axes.labelsize": 11,
        "figure.facecolor": WHITE,
        "axes.facecolor": WHITE,
        "savefig.facecolor": WHITE,
        "savefig.dpi": 160,
        "savefig.bbox": "tight",
    }
)

# --- Données marché (cartographie-marche-france.md) ---
REGIONS = [
    "Île-de-France",
    "Auvergne-Rhône-Alpes",
    "Occitanie",
    "PACA",
    "Nouvelle-Aquitaine",
    "Bretagne / Normandie",
    "Autres / DOM-TOM",
    "Hauts-de-France",
    "Grand Est",
]
REGION_TOTALS = [12400, 2600, 2300, 2000, 1900, 1350, 1450, 1300, 1300]
REGION_SHARES = [t / sum(REGION_TOTALS) * 100 for t in REGION_TOTALS]

DISCIPLINES = ["Peinture & arts graphiques", "Photographie", "Sculpture & design", "Art numérique"]
DISCIPLINE_TOTALS = [14750, 6550, 4050, 1250]

REGION_DISCIPLINES = {
    "Île-de-France": [7500, 2500, 1800, 600],
    "Auvergne-Rhône-Alpes": [1400, 600, 450, 150],
    "Occitanie": [1100, 800, 300, 100],
    "PACA": [900, 700, 350, 50],
    "Nouvelle-Aquitaine": [1000, 500, 300, 100],
}

# Correspondance noms GeoJSON → nos agrégats
GEO_TO_BUCKET = {
    "Île-de-France": "Île-de-France",
    "Auvergne-Rhône-Alpes": "Auvergne-Rhône-Alpes",
    "Occitanie": "Occitanie",
    "Provence-Alpes-Côte d'Azur": "PACA",
    "Nouvelle-Aquitaine": "Nouvelle-Aquitaine",
    "Bretagne": "Bretagne / Normandie",
    "Normandie": "Bretagne / Normandie",
    "Hauts-de-France": "Hauts-de-France",
    "Grand Est": "Grand Est",
    "Centre-Val de Loire": "Autres / DOM-TOM",
    "Bourgogne-Franche-Comté": "Autres / DOM-TOM",
    "Pays de la Loire": "Autres / DOM-TOM",
    "Corse": "Autres / DOM-TOM",
}

BUCKET_VALUES = dict(zip(REGIONS, REGION_TOTALS))


def _footer(fig: plt.Figure, text: str = "AIMEDIArt · Art-mediation with AI · juin 2026") -> None:
    fig.text(0.5, 0.01, text, ha="center", va="bottom", fontsize=8, color=GRAY)


def _save(fig: plt.Figure, name: str) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    fig.savefig(path, dpi=160, bbox_inches="tight", pad_inches=0.25)
    plt.close(fig)
    return path


def chart_bar_regions() -> Path:
    """Barres horizontales — volume d'expositions par région."""
    order = np.argsort(REGION_TOTALS)
    labels = [REGIONS[i] for i in order]
    values = [REGION_TOTALS[i] for i in order]
    colors = [RED if "Île-de-France" in lb else ACCENT2 for lb in labels]

    fig, ax = plt.subplots(figsize=(10, 6.5))
    bars = ax.barh(labels, values, color=colors, edgecolor="white", height=0.7)
    ax.set_xlabel("Expositions par an (estimation)")
    ax.set_title("Volume d'expositions d'arts visuels par région — France")
    ax.set_xlim(0, max(values) * 1.12)
    ax.grid(axis="x", alpha=0.25, linestyle="--")
    ax.spines[["top", "right"]].set_visible(False)

    for bar, val in zip(bars, values):
        pct = val / sum(REGION_TOTALS) * 100
        ax.text(
            bar.get_width() + 120,
            bar.get_y() + bar.get_height() / 2,
            f"{val:,}  ({pct:.1f} %)".replace(",", " "),
            va="center",
            fontsize=9,
            color=GRAY,
        )
    _footer(fig)
    return _save(fig, "bar-volumes-region.png")


def _load_geojson() -> dict | None:
    try:
        with urllib.request.urlopen(GEOJSON_URL, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        print(f"  ⚠ GeoJSON indisponible ({exc}) — carte simplifiée utilisée")
        return None


def _plot_polygon(ax, coords, color, edge="#ffffff", lw=0.8):
    if not coords:
        return
    if isinstance(coords[0][0], (float, int)):
        rings = [coords]
    else:
        rings = coords
    for ring in rings:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        ax.fill(xs, ys, color=color, edgecolor=edge, linewidth=lw)


def chart_map_france() -> Path:
    """Carte choroplèthe — densité d'expositions par région."""
    cmap = LinearSegmentedColormap.from_list("aimediart", ["#FDE8EA", RED_LIGHT, RED, RED_DARK])
    vmax = max(REGION_TOTALS)

    geo = _load_geojson()
    fig, ax = plt.subplots(figsize=(9, 10))

    if geo:
        for feat in geo["features"]:
            nom = feat["properties"].get("nom", "")
            bucket = GEO_TO_BUCKET.get(nom, "Autres / DOM-TOM")
            val = BUCKET_VALUES.get(bucket, 1450)
            color = cmap(val / vmax)
            geom = feat["geometry"]
            gtype = geom["type"]
            coords = geom["coordinates"]
            if gtype == "Polygon":
                _plot_polygon(ax, coords, color)
            elif gtype == "MultiPolygon":
                for poly in coords:
                    _plot_polygon(ax, poly, color)

        # Étiquettes sur centroïdes approximatifs
        labels_pos = {
            "Île-de-France": (2.0, 48.6),
            "Auvergne-Rhône-Alpes": (4.2, 45.5),
            "Occitanie": (2.2, 43.4),
            "PACA": (5.8, 43.8),
            "Nouvelle-Aquitaine": (-0.8, 45.2),
            "Bretagne / Normandie": (-2.5, 48.3),
            "Hauts-de-France": (2.5, 50.2),
            "Grand Est": (6.2, 48.4),
            "Autres / DOM-TOM": (1.5, 47.2),
        }
        for region, (x, y) in labels_pos.items():
            val = BUCKET_VALUES[region]
            pct = val / sum(REGION_TOTALS) * 100
            ax.text(
                x,
                y,
                f"{region}\n{val:,}".replace(",", " ") + f"\n{pct:.1f} %",
                ha="center",
                va="center",
                fontsize=7.5,
                fontweight="bold" if region == "Île-de-France" else "normal",
                color=WHITE if val > 4000 else GRAY,
                bbox=dict(boxstyle="round,pad=0.25", fc=(0, 0, 0, 0.35) if val > 4000 else (1, 1, 1, 0.75), ec="none"),
            )
        ax.set_xlim(-5.5, 9.5)
        ax.set_ylim(41.0, 51.5)
    else:
        # Carte bulles de repli
        centroids = {
            "Île-de-France": (2.35, 48.85, 12400),
            "Auvergne-Rhône-Alpes": (4.85, 45.75, 2600),
            "Occitanie": (2.5, 43.6, 2300),
            "PACA": (5.5, 43.8, 2000),
            "Nouvelle-Aquitaine": (-0.5, 45.0, 1900),
            "Bretagne / Normandie": (-2.0, 48.5, 1350),
            "Hauts-de-France": (2.8, 50.5, 1300),
            "Grand Est": (6.0, 48.5, 1300),
            "Autres / DOM-TOM": (8.5, 42.0, 1450),
        }
        ax.set_facecolor("#F8F9FA")
        ax.add_patch(plt.Rectangle((-5, 41), 11, 11, fill=False, edgecolor=GRAY_LIGHT, lw=2))
        for name, (x, y, val) in centroids.items():
            size = (val / 12400) * 8000
            ax.scatter(x, y, s=size, c=[cmap(val / vmax)], alpha=0.85, edgecolors=WHITE, linewidths=1.5)
            ax.text(x, y, f"{val//1000}k", ha="center", va="center", fontsize=8, color=WHITE if val > 3000 else GRAY)
        ax.set_xlim(-5.5, 9.5)
        ax.set_ylim(40.5, 52)

    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title("Carte des volumes d'expositions — arts visuels (France)", pad=12)

    sm = plt.cm.ScalarMappable(cmap=cmap, norm=plt.Normalize(0, vmax))
    sm.set_array([])
    cbar = fig.colorbar(sm, ax=ax, fraction=0.03, pad=0.02, shrink=0.55)
    cbar.set_label("Expositions / an", fontsize=9)
    _footer(fig)
    return _save(fig, "carte-volumes-region.png")


def chart_pie_disciplines() -> Path:
    """Répartition nationale par discipline."""
    colors = [RED, ACCENT, ACCENT2, "#A8DADC"]
    explode = (0.04, 0, 0, 0.06)

    fig, ax = plt.subplots(figsize=(8, 6))
    wedges, texts, autotexts = ax.pie(
        DISCIPLINE_TOTALS,
        labels=DISCIPLINES,
        autopct=lambda p: f"{p:.1f} %",
        colors=colors,
        explode=explode,
        startangle=90,
        pctdistance=0.78,
        textprops={"fontsize": 9},
    )
    for t in autotexts:
        t.set_fontweight("bold")
        t.set_color(WHITE)
    ax.set_title("Répartition nationale par discipline\n~26 600 expositions / an")
    _footer(fig)
    return _save(fig, "pie-disciplines.png")


def chart_stacked_disciplines() -> Path:
    """Empilé — top 5 régions × disciplines."""
    regions = list(REGION_DISCIPLINES.keys())
    data = np.array([REGION_DISCIPLINES[r] for r in regions])
    colors = [RED, ACCENT, ACCENT2, "#A8DADC"]

    fig, ax = plt.subplots(figsize=(11, 6.5))
    bottom = np.zeros(len(regions))
    for i, disc in enumerate(DISCIPLINES):
        bars = ax.bar(regions, data[:, i], bottom=bottom, label=disc, color=colors[i], edgecolor="white", linewidth=0.8)
        for bar, val in zip(bars, data[:, i]):
            if val >= 200:
                ax.text(
                    bar.get_x() + bar.get_width() / 2,
                    bar.get_y() + val / 2,
                    f"{val:,}".replace(",", " "),
                    ha="center",
                    va="center",
                    fontsize=7,
                    color=WHITE if i < 2 else GRAY,
                    fontweight="bold",
                )
        bottom += data[:, i]

    ax.set_ylabel("Expositions / an")
    ax.set_title("Figure 4 — Spécialisation régionale par discipline\n5 régions leaders · peinture, photo, sculpture, art numérique")
    ax.legend(loc="upper right", fontsize=8, framealpha=0.95)
    plt.xticks(rotation=12, ha="right")
    ax.set_ylim(0, max(bottom) * 1.08)
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", alpha=0.2, linestyle="--")
    _footer(fig)
    path = _save(fig, "stacked-disciplines-region.png")
    # Copie explicite pour référence figure 4 (Word / liens directs)
    import shutil

    fig2_path = OUT / "figure-04-specialisation-regionale.png"
    shutil.copy2(path, fig2_path)
    return path


def chart_schematic_density() -> Path:
    """Schéma des axes régionaux — hub Île-de-France (remplace Mermaid dans Word)."""
    fig, ax = plt.subplots(figsize=(11, 7))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)
    ax.axis("off")

    def box(x, y, w, h, title, lines, face, edge=RED):
        patch = FancyBboxPatch(
            (x, y),
            w,
            h,
            boxstyle="round,pad=0.02,rounding_size=0.15",
            facecolor=face,
            edgecolor=edge,
            linewidth=1.5,
        )
        ax.add_patch(patch)
        ax.text(x + w / 2, y + h - 0.35, title, ha="center", va="top", fontsize=9, fontweight="bold", color=GRAY)
        ax.text(x + w / 2, y + h / 2 - 0.15, "\n".join(lines), ha="center", va="center", fontsize=7.5, color=GRAY)

    # Hub central
    box(3.6, 6.8, 2.8, 1.6, "Île-de-France — 46,6 %", ["12 400 expos/an", "Paris · musées nationaux"], RED, RED_DARK)
    ax.text(5, 8.7, "Cœur du marché", ha="center", fontsize=10, fontweight="bold", color=RED_DARK)

    box(0.3, 4.5, 2.5, 1.5, "Axe Sud — Photo", ["Occitanie 2 300", "PACA 2 000", "Arles · Perpignan"], "#FDE8EA")
    box(7.2, 4.5, 2.5, 1.5, "Est & Nord", ["Grand Est 1 300", "HDF 1 300", "Metz · Lille"], "#E8F4F8")
    box(0.5, 1.8, 2.6, 1.5, "Ouest", ["NAQ 1 900", "Bretagne/Norm. 1 350"], "#F0F4E8")
    box(3.5, 0.5, 3.0, 1.5, "Auvergne-Rhône-Alpes", ["2 600 expos/an", "Lyon · design · FRAC"], "#FFF3E0")
    box(7.0, 1.8, 2.5, 1.2, "DOM-TOM", ["Autres 1 450"], "#F5F5F5", GRAY)

    ax.annotate("", xy=(1.55, 5.2), xytext=(4.2, 6.9), arrowprops=dict(arrowstyle="-|>", color=RED_LIGHT, lw=1.5))
    ax.annotate("", xy=(8.45, 5.2), xytext=(5.8, 6.9), arrowprops=dict(arrowstyle="-|>", color=RED_LIGHT, lw=1.5))
    ax.annotate("", xy=(1.8, 3.3), xytext=(4.5, 6.8), arrowprops=dict(arrowstyle="-|>", color=RED_LIGHT, lw=1.5))
    ax.annotate("", xy=(5, 2.0), xytext=(5, 6.8), arrowprops=dict(arrowstyle="-|>", color=RED_LIGHT, lw=1.5))
    ax.annotate("", xy=(8.2, 2.4), xytext=(5.5, 6.8), arrowprops=dict(arrowstyle="-|>", color=RED_LIGHT, lw=1.5))

    ax.set_title("Carte schématique — logique de densité et axes régionaux", pad=14)
    _footer(fig)
    return _save(fig, "carte-schematique-densite.png")


def chart_priorisation() -> Path:
    """Matrice de priorisation commerciale (heatmap)."""
    tiers = ["T1 — Cœur", "T1 — Saison", "T2 — Province", "T2 — Ouest", "T3 — Numérique", "T3 — Ultramarin"]
    criteria = ["Volume marché", "Marge cible", "Saisonnalité", "Multilingue", "Urgence A1–A3"]
    # Scores 1–5
    scores = np.array(
        [
            [5, 5, 3, 4, 5],
            [3, 4, 5, 5, 4],
            [3, 4, 3, 3, 4],
            [3, 3, 3, 2, 3],
            [2, 3, 2, 3, 3],
            [1, 4, 2, 4, 2],
        ]
    )

    fig, ax = plt.subplots(figsize=(9, 5.5))
    im = ax.imshow(scores, cmap=LinearSegmentedColormap.from_list("prio", [GRAY_LIGHT, RED_LIGHT, RED]), aspect="auto")
    ax.set_xticks(range(len(criteria)))
    ax.set_xticklabels(criteria, rotation=20, ha="right")
    ax.set_yticks(range(len(tiers)))
    ax.set_yticklabels(tiers)
    for i in range(scores.shape[0]):
        for j in range(scores.shape[1]):
            ax.text(j, i, str(scores[i, j]), ha="center", va="center", color=GRAY, fontweight="bold")
    ax.set_title("Matrice de priorisation commerciale par tier régional")
    cbar = fig.colorbar(im, ax=ax, fraction=0.03, pad=0.02)
    cbar.set_label("Score (1 = faible · 5 = fort)", fontsize=8)
    _footer(fig)
    return _save(fig, "heatmap-priorisation.png")


def chart_saisonnalite() -> Path:
    """Saisonnalité du volume d'expositions."""
    trimestres = ["T1\n(janv.–mars)", "T2\n(avr.–juin)", "T3\n(juil.–sept.)", "T4\n(oct.–déc.)"]
    national = [18, 40, 22, 20]
    idf = [20, 35, 22, 23]
    sud = [12, 48, 28, 12]

    x = np.arange(len(trimestres))
    w = 0.25
    fig, ax = plt.subplots(figsize=(9, 5.5))
    ax.bar(x - w, national, w, label="France", color=ACCENT2, edgecolor="white")
    ax.bar(x, idf, w, label="Île-de-France", color=RED, edgecolor="white")
    ax.bar(x + w, sud, w, label="PACA + Occitanie", color=ACCENT, edgecolor="white")
    ax.set_xticks(x)
    ax.set_xticklabels(trimestres)
    ax.set_ylabel("Part du volume annuel (%)")
    ax.set_title("Saisonnalité des expositions — pic printemps / été")
    ax.legend()
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", alpha=0.2, linestyle="--")
    _footer(fig)
    return _save(fig, "saisonnalite-expositions.png")


def chart_ca_scenarios() -> Path:
    """CA HT annuel — 3 scénarios."""
    labels, ca_a1, ca_a2, ca_a3 = [], [], [], []
    for name, cfg in SCENARIOS.items():
        end = scaled_end(END_BASE, cfg["client_factor"])
        rows = run_scenario(name, end)
        labels.append(name.replace(" (-30%)", "\n(−30 %)").replace(" (+30%)", "\n(+30 %)"))
        for y, bucket in enumerate([ca_a1, ca_a2, ca_a3], 1):
            yr = [r for r in rows if r["Année"] == y]
            bucket.append(sum(r["CA HT"] for r in yr) / 1000)

    x = np.arange(len(labels))
    w = 0.25
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.bar(x - w, ca_a1, w, label="Année 1", color=RED_LIGHT, edgecolor="white")
    ax.bar(x, ca_a2, w, label="Année 2", color=RED, edgecolor="white")
    ax.bar(x + w, ca_a3, w, label="Année 3", color=RED_DARK, edgecolor="white")
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylabel("Chiffre d'affaires HT (k€)")
    ax.set_title("Prévisionnel — chiffre d'affaires par scénario")
    ax.legend()
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", alpha=0.2, linestyle="--")
    _footer(fig)
    return _save(fig, "bp-ca-scenarios.png")


def chart_mrr_croissance() -> Path:
    """MRR et clients payants — scénario de référence."""
    end = scaled_end(END_BASE, 1.0)
    rows = run_scenario("Base", end)
    months = [r["Mois"] for r in rows]
    mrr = [r["MRR abo TTC"] for r in rows]
    clients = [r["Clients payants"] for r in rows]

    fig, ax1 = plt.subplots(figsize=(10, 5.5))
    ax1.fill_between(months, mrr, alpha=0.2, color=RED)
    ax1.plot(months, mrr, color=RED, lw=2.5, label="MRR abonnements (TTC)")
    ax1.set_xlabel("Mois")
    ax1.set_ylabel("MRR TTC (€)", color=RED)
    ax1.tick_params(axis="y", labelcolor=RED)
    for y in (12, 24, 36):
        ax1.axvline(y, color=GRAY_LIGHT, ls="--", lw=1)
        ax1.text(y, max(mrr) * 0.95, f"A{y//12}", ha="center", fontsize=8, color=GRAY)

    ax2 = ax1.twinx()
    ax2.plot(months, clients, color=ACCENT, lw=2, ls="--", label="Clients payants")
    ax2.set_ylabel("Clients payants", color=ACCENT)
    ax2.tick_params(axis="y", labelcolor=ACCENT)

    lines1, lab1 = ax1.get_legend_handles_labels()
    lines2, lab2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, lab1 + lab2, loc="upper left")
    ax1.set_title("Croissance MRR et parc clients — scénario de référence")
    ax1.spines[["top"]].set_visible(False)
    _footer(fig)
    return _save(fig, "bp-mrr-croissance.png")


def chart_tresorerie() -> Path:
    """Trésorerie cumulée — 3 scénarios."""
    fig, ax = plt.subplots(figsize=(10, 5.5))
    styles = {"Prudent (-30%)": ("#457B9D", "-"), "Base": (RED, "-"), "Ambitieux (+30%)": (GRAY, "--")}
    for name, cfg in SCENARIOS.items():
        end = scaled_end(END_BASE, cfg["client_factor"])
        rows = run_scenario(name, end)
        months = [r["Mois"] for r in rows]
        cash = [r["Trésorerie"] / 1000 for r in rows]
        color, ls = styles.get(name, (GRAY, "-"))
        ax.plot(months, cash, label=name, color=color, lw=2.5, ls=ls)

    ax.axhline(0, color=GRAY, lw=0.8, alpha=0.5)
    for y in (12, 24, 36):
        ax.axvline(y, color=GRAY_LIGHT, ls="--", lw=1)
    ax.set_xlabel("Mois")
    ax.set_ylabel("Trésorerie cumulée (k€)")
    ax.set_title("Trajectoire de trésorerie — 3 scénarios (36 mois)")
    ax.legend(loc="lower left", fontsize=9)
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(alpha=0.2, linestyle="--")
    _footer(fig)
    return _save(fig, "bp-tresorerie-scenarios.png")


def chart_clients_plans() -> Path:
    """Répartition clients par plan — fin A1, A2, A3."""
    plans = ["Atelier", "Horizon", "Rayonnement", "Zénith"]
    a1 = [5, 10, 0, 0]
    a2 = [10, 35, 2, 1]
    a3 = [20, 70, 5, 3]
    years = ["Fin A1", "Fin A2", "Fin A3"]
    data = np.array([a1, a2, a3])
    colors = [RED_LIGHT, RED, RED_DARK, ACCENT]

    fig, ax = plt.subplots(figsize=(9, 5.5))
    bottom = np.zeros(3)
    for i, plan in enumerate(plans):
        ax.bar(years, data[:, i], bottom=bottom, label=plan, color=colors[i], edgecolor="white")
        bottom += data[:, i]
    ax.set_ylabel("Nombre de clients (contrats actifs)")
    ax.set_title("Montée en gamme du portefeuille — scénario de référence")
    ax.legend()
    ax.spines[["top", "right"]].set_visible(False)
    _footer(fig)
    return _save(fig, "bp-clients-plans.png")


def chart_funnel() -> Path:
    """Entonnoir d'acquisition Étincelle → payant."""
    stages = ["Prospects\nqualifiés", "Essai\nÉtincelle", "Conversion\n50 %", "Clients\npayants A3"]
    values = [400, 200, 100, 95]
    widths = [v / max(values) for v in values]

    fig, ax = plt.subplots(figsize=(8, 6))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, len(stages) + 1)
    ax.axis("off")

    for i, (stage, w) in enumerate(zip(stages, widths)):
        y = len(stages) - i
        left = 5 - w * 4
        rect = FancyBboxPatch(
            (left, y - 0.35),
            w * 8,
            0.7,
            boxstyle="round,pad=0.02,rounding_size=0.08",
            facecolor=plt.cm.Reds(0.35 + 0.15 * i),
            edgecolor=RED,
            linewidth=1.2,
        )
        ax.add_patch(rect)
        ax.text(5, y, f"{stage}\n{values[i]:,}".replace(",", " "), ha="center", va="center", fontsize=10, fontweight="bold")
        if i < len(stages) - 1:
            ax.annotate(
                "",
                xy=(5, y - 0.45),
                xytext=(5, y - 0.65),
                arrowprops=dict(arrowstyle="->", color=GRAY, lw=1.5),
            )

    ax.set_title("Entonnoir d'acquisition — objectif conversion Étincelle 50 %", pad=20)
    _footer(fig)
    return _save(fig, "bp-funnel-acquisition.png")


def chart_workflow() -> Path:
    """Schéma de la chaîne de valeur produit."""
    steps = [
        ("Photo\nœuvre", RED_LIGHT),
        ("8 registres\n× 5 langues", RED),
        ("Audio\nTTS", RED),
        ("QR &\ncartels", ACCENT2),
        ("Visiteur\nmobile", ACCENT),
        ("Émotion\n& stats", ACCENT2),
        ("Carte\ngeo", RED_DARK),
    ]
    fig, ax = plt.subplots(figsize=(12, 3.2))
    ax.set_xlim(0, len(steps) + 1)
    ax.set_ylim(0, 2)
    ax.axis("off")

    for i, (label, color) in enumerate(steps, 1):
        box = FancyBboxPatch(
            (i + 0.05, 0.55),
            0.9,
            0.9,
            boxstyle="round,pad=0.02,rounding_size=0.1",
            facecolor=color,
            edgecolor=WHITE,
            linewidth=2,
        )
        ax.add_patch(box)
        ax.text(i + 0.5, 1.0, label, ha="center", va="center", fontsize=9, fontweight="bold", color=WHITE)
        if i < len(steps):
            ax.add_patch(
                FancyArrowPatch(
                    (i + 0.98, 1.0),
                    (i + 1.02, 1.0),
                    arrowstyle="-|>",
                    mutation_scale=14,
                    color=GRAY,
                    lw=2,
                )
            )
    ax.set_title("Chaîne de valeur AIMEDIArt — de la photo au bilan curatorale", y=1.15)
    _footer(fig)
    return _save(fig, "bp-workflow-chaine.png")


def chart_tam_sam_som() -> Path:
    """Entonnoir marché TAM → SAM → SOM."""
    fig, ax = plt.subplots(figsize=(8, 6))
    levels = [
        ("TAM — Marché total\n~27 000 expos / an", 10, RED_LIGHT),
        ("SAM — Structures abonnables\n~3 750 structures", 7, RED),
        ("SOM — Objectif A3\n95 clients payants", 4, RED_DARK),
    ]
    ax.set_xlim(0, 12)
    ax.set_ylim(0, 4)
    ax.axis("off")
    for i, (label, width, color) in enumerate(levels):
        y = 2.8 - i * 1.0
        left = 6 - width / 2
        rect = FancyBboxPatch(
            (left, y - 0.35),
            width,
            0.7,
            boxstyle="round,pad=0.03",
            facecolor=color,
            edgecolor=WHITE,
            linewidth=2,
        )
        ax.add_patch(rect)
        ax.text(6, y, label, ha="center", va="center", fontsize=10, fontweight="bold", color=WHITE)
    ax.set_title("Marché adressable — France arts visuels", pad=12)
    _footer(fig)
    return _save(fig, "bp-tam-sam-som.png")


def chart_pricing() -> Path:
    """Grille tarifaire visuelle."""
    plans = ["Étincelle", "Atelier", "Horizon", "Rayonnement", "Zénith"]
    prices = [0, 59, 149, 549, 15000]
    colors = [GRAY_LIGHT, RED_LIGHT, RED, RED_DARK, ACCENT]

    fig, ax = plt.subplots(figsize=(9, 5))
    bars = ax.bar(plans, [p if p < 1000 else p / 30 for p in prices], color=colors, edgecolor="white")
    ax.set_ylabel("Prix TTC (€ / mois — Zénith : €/mois lissé sur 30 mois)")
    ax.set_title("Grille tarifaire AIMEDIArt")
    for bar, price, plan in zip(bars, prices, plans):
        label = "0 €" if price == 0 else (f"{price:,} €".replace(",", " ") if price < 1000 else "15–17 k€\n/ projet")
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 5, label, ha="center", fontsize=9, fontweight="bold")
    ax.spines[["top", "right"]].set_visible(False)
    _footer(fig)
    return _save(fig, "bp-grille-tarifaire.png")


def chart_trois_axes_deploiement() -> Path:
    """Synthèse — 3 axes de déploiement commercial (section 10 cartographie)."""
    fig = plt.figure(figsize=(12, 9))
    gs = fig.add_gridspec(2, 1, height_ratios=[1.15, 0.85], hspace=0.08)
    ax_map = fig.add_subplot(gs[0])
    ax_axes = fig.add_subplot(gs[1])

    # --- Carte conceptuelle Volume ↔ Premium ---
    ax_map.set_xlim(0, 10)
    ax_map.set_ylim(0, 10)
    ax_map.axis("off")
    ax_map.set_title("Synthèse — logique de déploiement géographique", fontsize=14, fontweight="bold", pad=14)

    # Axes vertical Volume / Premium
    ax_map.annotate(
        "",
        xy=(5, 9.2),
        xytext=(5, 0.8),
        arrowprops=dict(arrowstyle="<->", color=GRAY, lw=2.2),
    )
    ax_map.text(5.35, 9.35, "VOLUME\n(galeries, format S)", ha="left", va="top", fontsize=9, fontweight="bold", color=ACCENT)
    ax_map.text(5.35, 0.55, "PREMIUM\n(musées, format L)", ha="left", va="bottom", fontsize=9, fontweight="bold", color=RED_DARK)

    def zone(cx, cy, r, title, subtitle, face, edge=RED, fs=9):
        circle = plt.Circle((cx, cy), r, facecolor=face, edgecolor=edge, linewidth=2, zorder=2)
        ax_map.add_patch(circle)
        ax_map.text(cx, cy + 0.12, title, ha="center", va="center", fontsize=fs, fontweight="bold", color=GRAY, zorder=3)
        ax_map.text(cx, cy - 0.28, subtitle, ha="center", va="center", fontsize=7.5, color=GRAY, zorder=3)

    # Hub central
    zone(7.2, 5.0, 1.05, "Île-de-France", "47 % du marché", RED, RED_DARK, 10)
    ax_map.text(7.2, 6.35, "IDF", ha="center", fontsize=8, color=RED_DARK, fontweight="bold")

    zone(2.8, 7.2, 0.72, "Occitanie", "photo", "#FDE8EA")
    zone(7.8, 7.5, 0.72, "PACA", "festivals", "#FDE8EA")
    zone(1.8, 4.8, 0.72, "Ouest", "NAQ · Bretagne", "#F0F4E8", ACCENT2)
    zone(3.2, 2.2, 0.72, "ARA", "design", "#FFF3E0", "#E9A319")
    zone(8.5, 2.5, 0.72, "Est / Nord", "numérique", "#E8F4F8", ACCENT)

    for xy_from, xy_to in [
        ((7.2, 5.0), (2.8, 7.2)),
        ((7.2, 5.0), (7.8, 7.5)),
        ((7.2, 5.0), (1.8, 4.8)),
        ((7.2, 5.0), (3.2, 2.2)),
        ((7.2, 5.0), (8.5, 2.5)),
    ]:
        ax_map.annotate(
            "",
            xy=xy_to,
            xytext=xy_from,
            arrowprops=dict(arrowstyle="-", color=RED_LIGHT, lw=1.2, connectionstyle="arc3,rad=0.1"),
            zorder=1,
        )

    # --- 3 axes de déploiement ---
    ax_axes.set_xlim(0, 10)
    ax_axes.set_ylim(0, 3.2)
    ax_axes.axis("off")
    ax_axes.set_title("3 axes de déploiement — objectifs A3 (scénario de référence)", fontsize=12, fontweight="bold", loc="left", pad=8)

    axes_data = [
        ("Axe 1 — Paris & métropole", "Île-de-France", "~45 clients payants\n(50 % du SOM)", RED, RED_DARK),
        ("Axe 2 — Sud photo", "PACA + Occitanie", "~15 clients payants\n+ 1–2 Zénith / an", ACCENT, "#2A4A6B"),
        ("Axe 3 — Province muséale", "ARA · NAQ · Bretagne\nGrand Est · HDF", "~35 clients Horizon", ACCENT2, "#2C5F7A"),
    ]
    w = 3.05
    gap = 0.22
    x0 = 0.35
    for i, (axe, regions, obj, face, edge) in enumerate(axes_data):
        x = x0 + i * (w + gap)
        patch = FancyBboxPatch(
            (x, 0.35),
            w,
            2.35,
            boxstyle="round,pad=0.03,rounding_size=0.12",
            facecolor=face,
            edgecolor=edge,
            linewidth=2,
            alpha=0.92,
        )
        ax_axes.add_patch(patch)
        ax_axes.text(x + w / 2, 2.35, axe, ha="center", va="top", fontsize=9.5, fontweight="bold", color=WHITE)
        ax_axes.text(x + w / 2, 1.55, regions, ha="center", va="center", fontsize=8.5, color=WHITE, linespacing=1.35)
        ax_axes.text(x + w / 2, 0.75, obj, ha="center", va="center", fontsize=8, color=WHITE, fontweight="bold", linespacing=1.3)

    _footer(fig, "AIMEDIArt · Synthèse déploiement commercial · juin 2026")
    return _save(fig, "synthese-3-axes-deploiement.png")


def chart_methodologie_calcul() -> Path:
    """Schéma — Annexe A : méthodologie de calcul en 6 points."""
    fig, ax = plt.subplots(figsize=(12, 10))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 12)
    ax.axis("off")
    ax.set_title(
        "Annexe A — Méthodologie de calcul du prévisionnel (36 mois)",
        fontsize=14,
        fontweight="bold",
        pad=16,
    )

    steps = [
        (
            "1",
            "Montée progressive linéaire",
            "Effectifs payants en rampe linéaire\nsur chaque année · recalage fin d'année\n(snap) sur les cibles du § 6.3",
            RED,
            RED_DARK,
        ),
        (
            "2",
            "Attrition (churn)",
            "Dès le mois 9 · taux initial 5 %/mois\nsur clients payants (Atelier, Horizon,\nRayonnement) · −10 %/mois sur le taux",
            "#F4A3A8",
            RED,
        ),
        (
            "3",
            "Facturation annuelle",
            "Part annuelle croissante (40 % → 60 %)\nCoefficient 11/12 sur l'annuel\n(1 mois offert · ex. Rayonnement 6 039 €)",
            ACCENT,
            "#2A4A6B",
        ),
        (
            "4",
            "Contrats Zénith",
            "Revenus ponctuels hors abonnement\nM18 : 15 000 € TTC · M30 & M34 :\n17 000 € TTC · présenté en CA HT",
            ACCENT2,
            "#2C5F7A",
        ),
        (
            "5",
            "TVA",
            "CA et charges en HT (TVA 20 %)\nTrésorerie : encaissements TTC,\ndécaissements TTC",
            "#A8DADC",
            ACCENT,
        ),
        (
            "6",
            "Scénarios",
            "Prudent × 0,70 · Référence × 1,00\nAmbitieux × 1,30 · 0 à 5 dev\nGénérateur : generate_bp_excel.py",
            GRAY_LIGHT,
            GRAY,
        ),
    ]

    box_w, box_h = 4.2, 1.45
    x_left, x_right = 0.55, 5.25
    y_positions = [10.0, 8.15, 6.3, 4.45, 2.6, 0.75]

    for i, (num, title, detail, face, edge) in enumerate(steps):
        x = x_left if i % 2 == 0 else x_right
        y = y_positions[i]
        patch = FancyBboxPatch(
            (x, y),
            box_w,
            box_h,
            boxstyle="round,pad=0.03,rounding_size=0.12",
            facecolor=face,
            edgecolor=edge,
            linewidth=2,
        )
        ax.add_patch(patch)
        # Pastille numéro
        ax.add_patch(plt.Circle((x + 0.35, y + box_h - 0.32), 0.22, facecolor=edge, edgecolor="white", linewidth=1.5, zorder=3))
        ax.text(x + 0.35, y + box_h - 0.32, num, ha="center", va="center", fontsize=10, fontweight="bold", color=WHITE, zorder=4)
        ax.text(x + 0.75, y + box_h - 0.32, title, ha="left", va="center", fontsize=9.5, fontweight="bold", color=GRAY if face == GRAY_LIGHT else WHITE, zorder=3)
        ax.text(x + box_w / 2, y + 0.55, detail, ha="center", va="center", fontsize=7.5, color=GRAY if face == GRAY_LIGHT else WHITE, linespacing=1.25, zorder=3)

        if i < len(steps) - 1:
            nx = x_left if (i + 1) % 2 == 0 else x_right
            ny = y_positions[i + 1] + box_h
            cx, cy = x + box_w / 2, y
            ncx, ncy = nx + box_w / 2, ny
            ax.annotate(
                "",
                xy=(ncx, ncy),
                xytext=(cx, cy),
                arrowprops=dict(arrowstyle="-|>", color=RED_LIGHT, lw=2, connectionstyle="arc3,rad=0.25"),
                zorder=1,
            )

    # Légende flux
    ax.text(
        5.0,
        11.55,
        "Flux de modélisation → Excel 36 mois (3 scénarios)",
        ha="center",
        fontsize=9,
        color=GRAY,
        style="italic",
    )

    _footer(fig, "AIMEDIArt · Méthodologie prévisionnel · juin 2026")
    return _save(fig, "annexe-a-methodologie-calcul.png")


def main() -> None:
    generators = [
        ("Carte régions", chart_map_france),
        ("Barres régions", chart_bar_regions),
        ("Camembert disciplines", chart_pie_disciplines),
        ("Empilé disciplines", chart_stacked_disciplines),
        ("Carte schématique densité", chart_schematic_density),
        ("Heatmap priorisation", chart_priorisation),
        ("Saisonnalité", chart_saisonnalite),
        ("CA scénarios", chart_ca_scenarios),
        ("MRR croissance", chart_mrr_croissance),
        ("Trésorerie", chart_tresorerie),
        ("Clients par plan", chart_clients_plans),
        ("Funnel acquisition", chart_funnel),
        ("Workflow", chart_workflow),
        ("TAM/SAM/SOM", chart_tam_sam_som),
        ("Grille tarifaire", chart_pricing),
        ("Synthèse 3 axes", chart_trois_axes_deploiement),
        ("Méthodologie calcul", chart_methodologie_calcul),
    ]
    print(f"Génération des visuels → {OUT}")
    for label, fn in generators:
        path = fn()
        print(f"  ✓ {label}: {path.name}")
    print(f"\n{len(generators)} fichiers PNG générés.")


if __name__ == "__main__":
    main()
