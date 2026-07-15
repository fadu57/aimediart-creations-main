import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, ChevronLeft, Layers, Loader2, Plus, QrCode, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabase";
import {
  fetchArtworkGroupsForExpo,
  type ArtworkGroupType,
  type ArtworkGroupWithMembers,
} from "@/lib/artworkGroupFetch";
import { generateAndSaveArtworkGroupQrCode } from "@/lib/artworkGroupQr";
import { ArtworkGroupStackPreview } from "@/components/expo/ArtworkGroupStackPreview";
import { cn } from "@/lib/utils";
type ExpoArtworkRow = {
  artwork_id: string;
  artwork_title: string | null;
  artwork_artist_id: string | null;
  artwork_image_url: string | null;
  artwork_photo_url: string | null;
  artists?: {
    artist_id?: string;
    artist_firstname?: string | null;
    artist_lastname?: string | null;
    artist_nickname?: string | null;
  } | {
    artist_id?: string;
    artist_firstname?: string | null;
    artist_lastname?: string | null;
    artist_nickname?: string | null;
  }[] | null;
};

export type ExpoGroupOption = {
  id: string;
  name: string;
  agencyId: string;
};

export type ExpoArtworkGroupsPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Expo ouverte depuis la carte (présélection). */
  expoId: string;
  /** Expositions accessibles dans le périmètre organisateur. */
  expoOptions: ExpoGroupOption[];
};

function artistLabelFromRow(row: ExpoArtworkRow): string {
  const a = row.artists;
  const artist = Array.isArray(a) ? a[0] : a;
  return [artist?.artist_firstname, artist?.artist_lastname]
    .filter(Boolean)
    .join(" ")
    .trim() || (artist?.artist_nickname ?? "").trim();
}

function inferArtistLabel(rows: ExpoArtworkRow[], selectedIds: string[]): string {
  const selected = rows.filter((r) => selectedIds.includes(r.artwork_id));
  const labels = [...new Set(selected.map(artistLabelFromRow).filter(Boolean))];
  return labels.length === 1 ? labels[0]! : "";
}

function inferArtistId(rows: ExpoArtworkRow[], selectedIds: string[]): string | null {
  const selected = rows.filter((r) => selectedIds.includes(r.artwork_id));
  const ids = [...new Set(selected.map((r) => r.artwork_artist_id?.trim() || "").filter(Boolean))];
  return ids.length === 1 ? ids[0]! : null;
}

function groupMemberImageUrls(
  group: ArtworkGroupWithMembers,
  artworkById: Map<string, ExpoArtworkRow>,
): string[] {
  const ordered = [...group.members].sort((a, b) => a.sort_order - b.sort_order);
  return ordered
    .map((m) => {
      const aw = artworkById.get(m.artwork_id);
      return (aw?.artwork_image_url || aw?.artwork_photo_url || "").trim();
    })
    .filter(Boolean);
}

export function ExpoArtworkGroupsPanel({
  open,
  onOpenChange,
  expoId,
  expoOptions,
}: ExpoArtworkGroupsPanelProps) {
  const { t } = useTranslation("artworkGroups");
  const [selectedExpoId, setSelectedExpoId] = useState(expoId);
  const [artworkSearch, setArtworkSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [artworks, setArtworks] = useState<ExpoArtworkRow[]>([]);
  const [groups, setGroups] = useState<ArtworkGroupWithMembers[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupType, setGroupType] = useState<ArtworkGroupType>("theme");
  const [groupLabel, setGroupLabel] = useState("");
  const [displayNumber, setDisplayNumber] = useState("");
  const [selectedArtworkIds, setSelectedArtworkIds] = useState<string[]>([]);
  const [memberOrder, setMemberOrder] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [dissolveTarget, setDissolveTarget] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const activeExpo = useMemo(() => {
    const match =
      expoOptions.find((o) => o.id === selectedExpoId) ??
      expoOptions.find((o) => o.id === expoId) ??
      expoOptions[0];
    return match ?? null;
  }, [expoOptions, selectedExpoId, expoId]);

  const activeExpoId = activeExpo?.id?.trim() ?? "";
  const activeAgencyId = activeExpo?.agencyId?.trim() ?? "";

  const artworkById = useMemo(() => {
    const map = new Map<string, ExpoArtworkRow>();
    for (const aw of artworks) map.set(aw.artwork_id, aw);
    return map;
  }, [artworks]);

  const groupedArtworkMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups) {
      for (const m of group.members) {
        if (editingGroupId && group.id === editingGroupId) continue;
        map.set(m.artwork_id, group.id);
      }
    }
    return map;
  }, [groups, editingGroupId]);

  const filteredArtworks = useMemo(() => {
    const q = artworkSearch.trim().toLowerCase();
    if (!q) return artworks;
    return artworks.filter((aw) => {
      const title = (aw.artwork_title ?? "").toLowerCase();
      const artist = artistLabelFromRow(aw).toLowerCase();
      return title.includes(q) || artist.includes(q);
    });
  }, [artworks, artworkSearch]);

  const resetEditor = () => {
    setEditingGroupId(null);
    setGroupType("theme");
    setGroupLabel("");
    setDisplayNumber("");
    setSelectedArtworkIds([]);
    setMemberOrder([]);
    setShowEditor(false);
  };

  const loadData = useCallback(async () => {
    const exId = activeExpoId;
    if (!exId) return;
    setLoading(true);
    try {
      const [artworksRes, groupsData] = await Promise.all([
        supabase
          .from("artworks")
          .select(
            "artwork_id, artwork_title, artwork_artist_id, artwork_image_url, artwork_photo_url, artists(artist_id, artist_firstname, artist_lastname, artist_nickname)",
          )
          .eq("artwork_expo_id", exId)
          .is("deleted_at", null)
          .is("artwork_deleted_at", null)
          .order("artwork_created_at", { ascending: true }),
        fetchArtworkGroupsForExpo(exId),
      ]);
      if (artworksRes.error) throw artworksRes.error;
      setArtworks((artworksRes.data ?? []) as ExpoArtworkRow[]);
      setGroups(groupsData);
    } catch (e) {
      console.warn("[ExpoArtworkGroupsPanel] load:", e);
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [activeExpoId]);

  useEffect(() => {
    if (!open) return;
    setSelectedExpoId(expoId);
    setArtworkSearch("");
    resetEditor();
  }, [open, expoId]);

  useEffect(() => {
    if (!open || !activeExpoId) return;
    void loadData();
  }, [open, activeExpoId, loadData]);

  const handleExpoChange = (nextExpoId: string) => {
    if (nextExpoId === selectedExpoId) return;
    resetEditor();
    setArtworkSearch("");
    setSelectedExpoId(nextExpoId);
  };

  const openCreateEditor = () => {
    resetEditor();
    setShowEditor(true);
  };

  const openEditGroup = (group: ArtworkGroupWithMembers) => {
    setEditingGroupId(group.id);
    setGroupType(group.group_type);
    setGroupLabel(group.group_label);
    setDisplayNumber(group.group_display_number ?? "");
    const ids = group.members.map((m) => m.artwork_id);
    setSelectedArtworkIds(ids);
    setMemberOrder(ids);
    setShowEditor(true);
  };

  const toggleArtwork = (artworkId: string, checked: boolean) => {
    if (checked) {
      if (groupedArtworkMap.has(artworkId)) {
        toast.error(t("toast_member_conflict"));
        return;
      }
      setSelectedArtworkIds((prev) => [...prev, artworkId]);
      setMemberOrder((prev) => [...prev, artworkId]);
    } else {
      setSelectedArtworkIds((prev) => prev.filter((id) => id !== artworkId));
      setMemberOrder((prev) => prev.filter((id) => id !== artworkId));
    }
  };

  const moveMember = (artworkId: string, direction: -1 | 1) => {
    setMemberOrder((prev) => {
      const idx = prev.indexOf(artworkId);
      if (idx < 0) return prev;
      const nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[nextIdx]] = [copy[nextIdx]!, copy[idx]!];
      return copy;
    });
  };

  useEffect(() => {
    if (!showEditor || groupType !== "artist") return;
    const inferred = inferArtistLabel(artworks, selectedArtworkIds);
    if (inferred && !groupLabel.trim()) setGroupLabel(inferred);
  }, [showEditor, groupType, selectedArtworkIds, artworks, groupLabel]);

  const handleSave = async () => {
    if (!activeExpoId || !activeAgencyId) {
      toast.error(t("toast_need_expo"));
      return;
    }
    if (!groupLabel.trim()) {
      toast.error(t("toast_need_label"));
      return;
    }
    if (memberOrder.length === 0) {
      toast.error(t("toast_need_members"));
      return;
    }
    for (const id of memberOrder) {
      if (groupedArtworkMap.has(id)) {
        toast.error(t("toast_member_conflict"));
        return;
      }
    }

    setSaving(true);
    try {
      const artistId = groupType === "artist" ? inferArtistId(artworks, memberOrder) : null;
      let groupId = editingGroupId;

      if (groupId) {
        const { error } = await supabase
          .from("artwork_groups")
          .update({
            group_type: groupType,
            group_label: groupLabel.trim(),
            group_display_number: displayNumber.trim() || null,
            group_artist_id: artistId,
          })
          .eq("id", groupId);
        if (error) throw error;

        await supabase.from("artwork_group_members").delete().eq("group_id", groupId);
      } else {
        const { data, error } = await supabase
          .from("artwork_groups")
          .insert({
            expo_id: activeExpoId,
            agency_id: activeAgencyId,
            group_type: groupType,
            group_label: groupLabel.trim(),
            group_display_number: displayNumber.trim() || null,
            group_artist_id: artistId,
          })
          .select("id")
          .single();
        if (error) throw error;
        groupId = (data as { id: string }).id;
        setEditingGroupId(groupId);
      }

      const memberRows = memberOrder.map((artwork_id, index) => ({
        group_id: groupId!,
        artwork_id,
        sort_order: index,
      }));
      const { error: membersError } = await supabase.from("artwork_group_members").insert(memberRows);
      if (membersError) throw membersError;

      toast.success(t("toast_saved"));
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateQr = async (groupId: string) => {
    setGeneratingQr(true);
    try {
      await generateAndSaveArtworkGroupQrCode(groupId, activeExpoId);
      toast.success(t("toast_qr_ok"));
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast_qr_fail"));
    } finally {
      setGeneratingQr(false);
    }
  };

  const handleDissolve = async (groupId: string) => {
    try {
      const { error } = await supabase.from("artwork_groups").delete().eq("id", groupId);
      if (error) throw error;
      toast.success(t("toast_dissolved"));
      if (editingGroupId === groupId) resetEditor();
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDissolveTarget(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="fixed left-0 top-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[90dvh] sm:w-[calc(100vw-2rem)] sm:max-w-3xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-xl sm:border">
          <div className="shrink-0 border-b bg-gradient-to-br from-primary/8 via-background to-amber-500/5 px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary sm:h-11 sm:w-11">
                <Layers className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg font-serif sm:text-xl">{t("panel_title")}</DialogTitle>
                <DialogDescription className="mt-1 text-xs sm:text-sm">{t("panel_desc")}</DialogDescription>
                {expoOptions.length > 0 ? (
                  <div className="mt-3 flex flex-col gap-1.5">
                    <Label htmlFor="expo-filter">{t("expo_filter_label")}</Label>
                    <Select
                      value={activeExpoId || undefined}
                      onValueChange={handleExpoChange}
                      disabled={expoOptions.length === 1}
                    >
                      <SelectTrigger id="expo-filter" className="bg-background">
                        <SelectValue placeholder={t("expo_filter_placeholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {expoOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-amber-700">{t("no_expo_available")}</p>
                )}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
              <span className="sr-only">{t("loading")}</span>
            </div>
          ) : showEditor ? (
            <div className="flex flex-col gap-4">
              <Button type="button" variant="ghost" size="sm" className="w-fit gap-1" onClick={resetEditor}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
                {t("existing_groups")}
              </Button>

              <p className="text-sm font-semibold">{editingGroupId ? t("edit_group") : t("create_group")}</p>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <Button
                  type="button"
                  size="sm"
                  className="w-full sm:w-auto"
                  variant={groupType === "artist" ? "default" : "outline"}
                  onClick={() => setGroupType("artist")}
                >
                  {t("type_artist")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="w-full sm:w-auto"
                  variant={groupType === "theme" ? "default" : "outline"}
                  onClick={() => setGroupType("theme")}
                >
                  {t("type_theme")}
                </Button>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="group-label">{t("label")}</Label>
                <Input
                  id="group-label"
                  value={groupLabel}
                  onChange={(e) => setGroupLabel(e.target.value)}
                  placeholder={t("label_placeholder")}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="group-number">{t("display_number")}</Label>
                <Input
                  id="group-number"
                  value={displayNumber}
                  onChange={(e) => setDisplayNumber(e.target.value)}
                  placeholder={t("display_number_placeholder")}
                />
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">{t("select_artworks")}</p>
                <p className="text-xs text-muted-foreground">{t("select_hint")}</p>
                <Input
                  value={artworkSearch}
                  onChange={(e) => setArtworkSearch(e.target.value)}
                  placeholder={t("artwork_search_placeholder")}
                  aria-label={t("artwork_search_placeholder")}
                />
                <ul className="max-h-[min(38dvh,12rem)] space-y-2 overflow-y-auto rounded-md border p-2 sm:max-h-48">
                  {filteredArtworks.length === 0 ? (
                    <li className="py-4 text-center text-sm text-muted-foreground">{t("no_artworks_match")}</li>
                  ) : (
                    filteredArtworks.map((aw) => {
                      const blocked = groupedArtworkMap.has(aw.artwork_id);
                      const checked = selectedArtworkIds.includes(aw.artwork_id);
                      return (
                        <li key={aw.artwork_id} className="flex items-start gap-2">
                          <Checkbox
                            checked={checked}
                            disabled={blocked}
                            onCheckedChange={(v) => toggleArtwork(aw.artwork_id, v === true)}
                            aria-label={aw.artwork_title ?? aw.artwork_id}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug sm:truncate">{aw.artwork_title ?? "—"}</p>
                            <p className="text-xs text-muted-foreground sm:truncate">{artistLabelFromRow(aw)}</p>
                            {blocked ? (
                              <p className="text-[10px] text-amber-700">{t("already_grouped")}</p>
                            ) : null}
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>

              {memberOrder.length > 0 ? (
                <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3 sm:p-4">
                  <p className="text-sm font-medium">{t("members_order")}</p>
                  <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                    <ArtworkGroupStackPreview
                      imageUrls={memberOrder
                        .map((id) => artworkById.get(id))
                        .map((aw) => (aw?.artwork_image_url || aw?.artwork_photo_url || "").trim())
                        .filter(Boolean)}
                      totalCount={memberOrder.length}
                      size="md"
                      className="mx-auto shrink-0 sm:mx-0 sm:hidden"
                    />
                    <ArtworkGroupStackPreview
                      imageUrls={memberOrder
                        .map((id) => artworkById.get(id))
                        .map((aw) => (aw?.artwork_image_url || aw?.artwork_photo_url || "").trim())
                        .filter(Boolean)}
                      totalCount={memberOrder.length}
                      size="lg"
                      className="mx-auto hidden shrink-0 sm:mx-0 sm:block"
                    />
                    <ul className="max-h-[min(32dvh,9rem)] w-full min-w-0 space-y-1 overflow-y-auto pr-1 sm:max-h-36 sm:flex-1">
                    {memberOrder.map((id, index) => {
                      const aw = artworkById.get(id);
                      return (
                        <li key={id} className="flex items-center gap-1.5 sm:gap-2">
                          <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                            {index + 1}.
                          </span>
                          <span className="min-w-0 flex-1 text-sm leading-snug sm:truncate">{aw?.artwork_title ?? id}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={t("move_up")}
                            disabled={index === 0}
                            onClick={() => moveMember(id, -1)}
                          >
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={t("move_down")}
                            disabled={index === memberOrder.length - 1}
                            onClick={() => moveMember(id, 1)}
                          >
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </li>
                      );
                    })}
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:gap-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-foreground">{t("existing_groups")}</p>
                <Button
                  type="button"
                  className="w-full gap-2 gradient-gold gradient-gold-hover-bg text-primary-foreground sm:w-auto"
                  onClick={openCreateEditor}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  {t("create_group")}
                </Button>
              </div>

              {groups.length === 0 ? (
                <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-primary/25 bg-gradient-to-b from-muted/30 to-background px-4 py-8 text-center sm:gap-5 sm:px-6 sm:py-10">
                  <ArtworkGroupStackPreview size="lg" totalCount={4} className="mx-auto" />
                  <div className="max-w-md space-y-2">
                    <p className="font-serif text-lg font-semibold text-foreground">{t("empty_visual_title")}</p>
                    <p className="text-sm text-muted-foreground">{t("empty_visual_desc")}</p>
                    <p className="text-xs text-muted-foreground/80">{t("no_groups")}</p>
                  </div>
                  <Button type="button" className="gap-2" onClick={openCreateEditor}>
                    <Plus className="h-4 w-4" aria-hidden />
                    {t("create_group")}
                  </Button>
                </div>
              ) : (
                <ul className="grid gap-4">
                  {groups.map((group) => {
                    const previews = groupMemberImageUrls(group, artworkById);
                    const typeLabel = group.group_type === "artist" ? t("type_artist") : t("type_theme");
                    return (
                      <li
                        key={group.id}
                        className="group/card flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md sm:gap-4 sm:p-4 md:flex-row md:items-center"
                      >
                        <button
                          type="button"
                          className="flex w-full min-w-0 items-center gap-3 text-left sm:gap-4 md:flex-1"
                          onClick={() => openEditGroup(group)}
                        >
                          <ArtworkGroupStackPreview
                            imageUrls={previews}
                            totalCount={group.members.length}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                  group.group_type === "artist"
                                    ? "bg-amber-100 text-amber-900"
                                    : "bg-sky-100 text-sky-900",
                                )}
                              >
                                {typeLabel}
                              </span>
                              {group.group_display_number ? (
                                <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                                  n° {group.group_display_number}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 truncate font-serif text-base font-semibold">{group.group_label}</p>
                            <p className="text-xs text-muted-foreground">
                              {t("artworks_count", { count: group.members.length })}
                            </p>
                          </div>
                        </button>

                        <div className="flex w-full flex-col gap-2 border-t pt-3 md:w-auto md:shrink-0 md:border-l md:border-t-0 md:pl-4 md:pt-0">
                          <div className="flex items-center justify-between gap-2 md:flex-col md:items-center">
                          {group.group_qr_code_url ? (
                            <img
                              src={group.group_qr_code_url}
                              alt=""
                              className="h-12 w-12 rounded-md border bg-white object-contain p-0.5 sm:h-14 sm:w-14"
                            />
                          ) : (
                            <span className="rounded-md border border-dashed px-2 py-1 text-[10px] text-muted-foreground">
                              {t("group_card_qr_missing")}
                            </span>
                          )}
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 md:hidden"
                            aria-label={t("dissolve_group")}
                            onClick={() => setDissolveTarget(group.id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
                          <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => openEditGroup(group)}>
                            {t("group_card_open")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full gap-1"
                            disabled={generatingQr}
                            onClick={() => void handleGenerateQr(group.id)}
                          >
                            <QrCode className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span className="truncate">{group.group_qr_code_url ? t("regenerate_qr") : t("generate_qr")}</span>
                          </Button>
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="hidden h-8 w-8 text-destructive hover:bg-destructive/10 md:inline-flex"
                            aria-label={t("dissolve_group")}
                            onClick={() => setDissolveTarget(group.id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          </div>

          {showEditor && !loading ? (
            <div className="shrink-0 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
              {editingGroupId && groups.find((g) => g.id === editingGroupId)?.group_qr_code_url ? (
                <div className="mb-3 flex items-center justify-center gap-3 rounded-md border bg-muted/30 p-2">
                  <img
                    src={groups.find((g) => g.id === editingGroupId)!.group_qr_code_url!}
                    alt="QR regroupement"
                    className="h-16 w-16 object-contain sm:h-20 sm:w-20"
                  />
                  <span className="text-xs text-muted-foreground">{t("qr_ready")}</span>
                </div>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button type="button" className="w-full sm:w-auto" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {t("save_group")}
                </Button>
                {editingGroupId ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-1 sm:w-auto"
                    disabled={generatingQr}
                    onClick={() => void handleGenerateQr(editingGroupId)}
                  >
                    <QrCode className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">
                      {groups.find((g) => g.id === editingGroupId)?.group_qr_code_url
                        ? t("regenerate_qr")
                        : t("generate_qr")}
                    </span>
                  </Button>
                ) : null}
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={resetEditor}>
                  {t("cancel")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={dissolveTarget !== null} onOpenChange={(o) => !o && setDissolveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dissolve_group")}</AlertDialogTitle>
            <AlertDialogDescription>{t("dissolve_confirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => dissolveTarget && void handleDissolve(dissolveTarget)}
            >
              {t("dissolve_group")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
