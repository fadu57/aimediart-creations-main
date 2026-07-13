import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_FOREST_CANOPY,
  fetchForestCanopySettings,
  saveForestCanopySettings,
  type SettingsForestCanopy,
} from "@/lib/forestCanopySettings";
import { SETTINGS_KEYS } from "@/lib/settingsKeys";

type ForestCanopySettingsProps = {
  canAccess: boolean;
};

function NumField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
      </Label>
      <Input
        id={id}
        name={id}
        type="number"
        className="shadow-none h-9"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function SectionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 shadow-none space-y-3">
      <p className="text-sm font-semibold">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

/** Panneau réglages canopée p5 — accordéon Paramètres. */
export default function ForestCanopySettings({ canAccess }: ForestCanopySettingsProps) {
  const { t } = useTranslation("settings");
  const [settings, setSettings] = useState<SettingsForestCanopy>(DEFAULT_FOREST_CANOPY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchForestCanopySettings();
    setSettings(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [canAccess, load]);

  const patchStrip = (patch: Partial<SettingsForestCanopy["strip"]>) =>
    setSettings((p) => ({ ...p, strip: { ...p.strip, ...patch } }));
  const patchParticles = (patch: Partial<SettingsForestCanopy["particles"]>) =>
    setSettings((p) => ({ ...p, particles: { ...p.particles, ...patch } }));
  const patchOverlay = (patch: Partial<SettingsForestCanopy["overlay"]>) =>
    setSettings((p) => ({ ...p, overlay: { ...p.overlay, ...patch } }));
  const patchAnimation = (patch: Partial<SettingsForestCanopy["animation"]>) =>
    setSettings((p) => ({ ...p, animation: { ...p.animation, ...patch } }));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await saveForestCanopySettings(settings);
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(t("forest_canopy.saved"));
    void load();
  };

  if (!canAccess) return null;

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {t("forest_canopy.hint")}{" "}
        <code className="rounded bg-muted px-1">{SETTINGS_KEYS.forestCanopy}</code>
      </p>

      <SectionBlock title={t("forest_canopy.section_strip")}>
        <NumField
          id="fc-canvas-height"
          label={t("forest_canopy.canvas_height")}
          value={settings.strip.canvas_height}
          min={80}
          max={400}
          onChange={(n) => patchStrip({ canvas_height: n })}
        />
        <NumField
          id="fc-max-width"
          label={t("forest_canopy.strip_max_width")}
          value={settings.strip.max_width}
          min={320}
          max={2560}
          onChange={(n) => patchStrip({ max_width: n })}
        />
        <NumField
          id="fc-min-width"
          label={t("forest_canopy.strip_min_width")}
          value={settings.strip.min_width}
          min={240}
          max={1200}
          onChange={(n) => patchStrip({ min_width: n })}
        />
      </SectionBlock>

      <SectionBlock title={t("forest_canopy.section_particles")}>
        <NumField
          id="fc-particle-count"
          label={t("forest_canopy.particle_count")}
          value={settings.particles.count}
          min={50}
          max={3000}
          onChange={(n) => patchParticles({ count: n })}
        />
        <NumField
          id="fc-size-min"
          label={t("forest_canopy.particle_size_min")}
          value={settings.particles.size_min}
          min={4}
          max={120}
          onChange={(n) => patchParticles({ size_min: n })}
        />
        <NumField
          id="fc-size-max"
          label={t("forest_canopy.particle_size_max")}
          value={settings.particles.size_max}
          min={4}
          max={160}
          onChange={(n) => patchParticles({ size_max: n })}
        />
        <NumField
          id="fc-r-min"
          label={t("forest_canopy.particle_r_min")}
          value={settings.particles.color_r_min}
          min={0}
          max={255}
          onChange={(n) => patchParticles({ color_r_min: n })}
        />
        <NumField
          id="fc-r-max"
          label={t("forest_canopy.particle_r_max")}
          value={settings.particles.color_r_max}
          min={0}
          max={255}
          onChange={(n) => patchParticles({ color_r_max: n })}
        />
        <NumField
          id="fc-g-min"
          label={t("forest_canopy.particle_g_min")}
          value={settings.particles.color_g_min}
          min={0}
          max={255}
          onChange={(n) => patchParticles({ color_g_min: n })}
        />
        <NumField
          id="fc-g-max"
          label={t("forest_canopy.particle_g_max")}
          value={settings.particles.color_g_max}
          min={0}
          max={255}
          onChange={(n) => patchParticles({ color_g_max: n })}
        />
        <NumField
          id="fc-b-min"
          label={t("forest_canopy.particle_b_min")}
          value={settings.particles.color_b_min}
          min={0}
          max={255}
          onChange={(n) => patchParticles({ color_b_min: n })}
        />
        <NumField
          id="fc-b-max"
          label={t("forest_canopy.particle_b_max")}
          value={settings.particles.color_b_max}
          min={0}
          max={255}
          onChange={(n) => patchParticles({ color_b_max: n })}
        />
        <NumField
          id="fc-alpha"
          label={t("forest_canopy.particle_alpha")}
          value={settings.particles.alpha}
          min={0}
          max={255}
          onChange={(n) => patchParticles({ alpha: n })}
        />
      </SectionBlock>

      <SectionBlock title={t("forest_canopy.section_overlay")}>
        <NumField
          id="fc-spawn-ms"
          label={t("forest_canopy.spawn_interval_ms")}
          value={settings.overlay.spawn_interval_ms}
          min={200}
          max={10000}
          onChange={(n) => patchOverlay({ spawn_interval_ms: n })}
        />
        <NumField
          id="fc-word-chance"
          label={t("forest_canopy.word_chance")}
          value={settings.overlay.word_chance}
          min={0}
          max={1}
          step={0.01}
          onChange={(n) => patchOverlay({ word_chance: n })}
        />
        <NumField
          id="fc-burst-strip-min"
          label={t("forest_canopy.burst_strip_min")}
          value={settings.overlay.burst_strip_min}
          min={1}
          max={8}
          onChange={(n) => patchOverlay({ burst_strip_min: n })}
        />
        <NumField
          id="fc-burst-strip-max"
          label={t("forest_canopy.burst_strip_max")}
          value={settings.overlay.burst_strip_max}
          min={1}
          max={12}
          onChange={(n) => patchOverlay({ burst_strip_max: n })}
        />
        <NumField
          id="fc-burst-fs-min"
          label={t("forest_canopy.burst_fullscreen_min")}
          value={settings.overlay.burst_fullscreen_min}
          min={1}
          max={12}
          onChange={(n) => patchOverlay({ burst_fullscreen_min: n })}
        />
        <NumField
          id="fc-burst-fs-max"
          label={t("forest_canopy.burst_fullscreen_max")}
          value={settings.overlay.burst_fullscreen_max}
          min={1}
          max={16}
          onChange={(n) => patchOverlay({ burst_fullscreen_max: n })}
        />
        <NumField
          id="fc-word-vy-min"
          label={t("forest_canopy.word_speed_min")}
          value={settings.overlay.word_speed_min}
          min={1}
          max={80}
          step={0.5}
          onChange={(n) => patchOverlay({ word_speed_min: n })}
        />
        <NumField
          id="fc-word-vy-max"
          label={t("forest_canopy.word_speed_max")}
          value={settings.overlay.word_speed_max}
          min={1}
          max={120}
          step={0.5}
          onChange={(n) => patchOverlay({ word_speed_max: n })}
        />
        <NumField
          id="fc-heart-vy-min"
          label={t("forest_canopy.heart_speed_min")}
          value={settings.overlay.heart_speed_min}
          min={1}
          max={80}
          step={0.5}
          onChange={(n) => patchOverlay({ heart_speed_min: n })}
        />
        <NumField
          id="fc-heart-vy-max"
          label={t("forest_canopy.heart_speed_max")}
          value={settings.overlay.heart_speed_max}
          min={1}
          max={120}
          step={0.5}
          onChange={(n) => patchOverlay({ heart_speed_max: n })}
        />
        <NumField
          id="fc-word-fade"
          label={t("forest_canopy.word_fade_per_sec")}
          value={settings.overlay.word_fade_per_sec}
          min={10}
          max={300}
          step={1}
          onChange={(n) => patchOverlay({ word_fade_per_sec: n })}
        />
        <NumField
          id="fc-heart-fade"
          label={t("forest_canopy.heart_fade_per_sec")}
          value={settings.overlay.heart_fade_per_sec}
          min={10}
          max={400}
          step={1}
          onChange={(n) => patchOverlay({ heart_fade_per_sec: n })}
        />
        <NumField
          id="fc-word-font-min"
          label={t("forest_canopy.word_font_min")}
          value={settings.overlay.word_font_min}
          min={10}
          max={80}
          onChange={(n) => patchOverlay({ word_font_min: n })}
        />
        <NumField
          id="fc-word-font-max"
          label={t("forest_canopy.word_font_max")}
          value={settings.overlay.word_font_max}
          min={10}
          max={120}
          onChange={(n) => patchOverlay({ word_font_max: n })}
        />
        <NumField
          id="fc-heart-font-min"
          label={t("forest_canopy.heart_font_min")}
          value={settings.overlay.heart_font_min}
          min={10}
          max={90}
          onChange={(n) => patchOverlay({ heart_font_min: n })}
        />
        <NumField
          id="fc-heart-font-max"
          label={t("forest_canopy.heart_font_max")}
          value={settings.overlay.heart_font_max}
          min={10}
          max={120}
          onChange={(n) => patchOverlay({ heart_font_max: n })}
        />
      </SectionBlock>

      <SectionBlock title={t("forest_canopy.section_animation")}>
        <NumField
          id="fc-bg-r"
          label={t("forest_canopy.background_r")}
          value={settings.animation.background_r}
          min={0}
          max={255}
          onChange={(n) => patchAnimation({ background_r: n })}
        />
        <NumField
          id="fc-bg-g"
          label={t("forest_canopy.background_g")}
          value={settings.animation.background_g}
          min={0}
          max={255}
          onChange={(n) => patchAnimation({ background_g: n })}
        />
        <NumField
          id="fc-bg-b"
          label={t("forest_canopy.background_b")}
          value={settings.animation.background_b}
          min={0}
          max={255}
          onChange={(n) => patchAnimation({ background_b: n })}
        />
        <NumField
          id="fc-bg-a"
          label={t("forest_canopy.background_a")}
          value={settings.animation.background_a}
          min={0}
          max={255}
          onChange={(n) => patchAnimation({ background_a: n })}
        />
        <NumField
          id="fc-pulse-amp"
          label={t("forest_canopy.pulse_amplitude")}
          value={settings.animation.pulse_amplitude}
          min={0}
          max={120}
          step={0.5}
          onChange={(n) => patchAnimation({ pulse_amplitude: n })}
        />
        <NumField
          id="fc-pulse-speed"
          label={t("forest_canopy.pulse_speed")}
          value={settings.animation.pulse_speed}
          min={0.001}
          max={0.2}
          step={0.001}
          onChange={(n) => patchAnimation({ pulse_speed: n })}
        />
      </SectionBlock>

      <Button type="button" className="shadow-none" disabled={saving} onClick={() => void handleSave()}>
        {saving ? t("form_btn_saving") : t("form_btn_save")}
      </Button>
    </div>
  );
}
