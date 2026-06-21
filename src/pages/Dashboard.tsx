import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  BarChart3,
  Building2,
  Calendar,
  CreditCard,
  ImageIcon,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  UserPlus,
  Users as UsersIcon,
  UserRound,
} from "lucide-react";

import { BackofficeStickyAgencyLogoSlot } from "@/components/BackofficeStickyAgencyLogo";
import { StandbyDashboardBanner } from "@/components/dashboard/StandbyDashboardBanner";
import {
  formatBirthDisplay,
  mergeProfileValues,
} from "@/components/dashboard/DashboardProfileEditDialog";
import { DashboardGrantedCommercialTermsCard } from "@/components/dashboard/DashboardGrantedCommercialTermsCard";
import { DashboardOrganisationCommercialTermsBlock } from "@/components/dashboard/DashboardOrganisationCommercialTermsBlock";
import { DashboardNavigationModeSelector } from "@/components/dashboard/DashboardNavigationModeSelector";
import { DashboardProfileSelector } from "@/components/dashboard/DashboardProfileSelector";
import { DashboardPlanActions } from "@/components/dashboard/DashboardPlanActions";
import { DashboardStandbyButton } from "@/components/dashboard/DashboardStandbyButton";
import { DashboardTeamMembersTable } from "@/components/dashboard/DashboardTeamMembersTable";
import { SponsoringConventionButton } from "@/components/dashboard/SponsoringConventionButton";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { ETINCELLE_UI, resolveGrantedPlanSubscribeButtons, subscribePlanHref, subscriptionIsEtincellePlan } from "@/lib/organisation/planLimits";
import {
  commercialKindLabel,
  hasAgencyPresetDiscount,
  hasCommercialDiscount,
  hasGrantedCommercialTerms,
} from "@/lib/organisation/commercialTerms";
import { useDashboardProfile, type DashboardSubscription, type DashboardTeamMember } from "@/hooks/useDashboardProfile";
import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";
import { useProfileAvatar } from "@/hooks/useProfileAvatar";
import { useOrganisationStandby } from "@/providers/OrganisationStandbyProvider";
import { hasFullDataAccess, mapRoleNameFromRoleId } from "@/lib/authUser";
import { ProfileAvatarImage } from "@/components/ProfileAvatarImage";
import { resolveProfileAvatarSource } from "@/lib/resolveProfileAvatarSource";
import {
  canAssignExpoToMember,
  canCreateUsers,
  canDeleteTeamMember,
  canManageTeamMember,
  resolveEffectiveRoleId,
  roleLevelHint,
} from "@/lib/roleHierarchy";
import { resolveExpoStorageIds } from "@/lib/expoStorageIds";
import { supabase } from "@/lib/supabase";
import { softDeleteUserProfile } from "@/lib/userSoftDelete";
import type { StandbyPlanCode } from "@/components/organisation/StandbyPlanModal";
import Users from "@/pages/Users";

function formatSeniority(startedAt: string | null | undefined): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return "—";
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 1) return "< 1 mois";
  if (months < 12) return `${months} mois`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `${years} an${years > 1 ? "s" : ""}`;
  return `${years} an${years > 1 ? "s" : ""} ${rem} mois`;
}

function formatUsageRatio(used: number, max: number | null | undefined, unlimited: boolean | null | undefined): string {
  if (unlimited) return `${used} · Illimité`;
  if (max == null) return String(used);
  return `${used} / ${max}`;
}

function resolveStandbyPlanCode(planCode: string | null | undefined): StandbyPlanCode | null {
  const code = (planCode ?? "").trim().toUpperCase();
  if (code === "ATELIER" || code === "HORIZON") return code;
  return null;
}

function textOrDash(v: string | null | undefined): string {
  return v?.trim() || "—";
}

function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatEur(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  if (value === 0) return "Gratuit";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function profileFullName(
  first: string | null | undefined,
  last: string | null | undefined,
  fallback: string,
): string {
  const full = [first?.trim(), last?.trim()].filter(Boolean).join(" ");
  return full || fallback;
}

function subscriptionBadgeVariant(
  status: DashboardSubscription["status"] | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
    case "standby":
      return "default";
    case "trial":
      return "secondary";
    case "expired":
    case "cancelled":
      return "destructive";
    case "none":
      return "secondary";
    default:
      return "outline";
  }
}

function subscriptionStatusLabel(status: DashboardSubscription["status"] | undefined): string {
  switch (status) {
    case "active":
      return "Actif";
    case "trial":
      return "Essai";
    case "standby":
      return "Veille";
    case "expired":
      return "Expiré";
    case "cancelled":
      return "Résilié";
    case "none":
      return "Aucun";
    default:
      return "Indisponible";
  }
}

function standbyStatusLabel(status: string | null | undefined): string {
  switch ((status ?? "").toLowerCase()) {
    case "active":
      return "Veille active";
    case "inactive":
      return "Inactive";
    default:
      return "—";
  }
}

function formatDaysRemaining(days: number): string {
  if (days > 0) return `${days} jour${days > 1 ? "s" : ""} restant${days > 1 ? "s" : ""}`;
  if (days === 0) return "Échéance aujourd'hui";
  return "Période échue";
}

function subscriptionIsEtincelle(subscription: DashboardSubscription | null | undefined): boolean {
  return subscriptionIsEtincellePlan(subscription);
}

function formatLangRange(min: number | null | undefined, max: number | null | undefined): string {
  if (min == null && max == null) return "—";
  if (min != null && max != null && min !== max) return `${min} à ${max}`;
  const value = min ?? max;
  return value != null ? String(value) : "—";
}

const Dashboard = () => {
  const {
    user,
    role_id,
    role_label,
    role_name,
    agency_id,
    expo_id,
    loading: authLoading,
    canSwitchNavigationMode,
    navigationMode,
    setNavigationMode,
    globalRoleId,
    agencyRoleId,
    hasGlobalStaffRole,
  } = useEffectiveAuth();
  const { can } = useNavigationMatrix();
  const { state: standbyState, isStandbyNavRestricted } = useOrganisationStandby();
  const effectiveAgencyId = agency_id ?? standbyState.agency_id ?? null;
  const [viewedUserId, setViewedUserId] = useState<string | null>(null);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [deleteMemberTarget, setDeleteMemberTarget] = useState<DashboardTeamMember | null>(null);
  const [deletingMember, setDeletingMember] = useState(false);
  const [deleteLastRole4InOrg, setDeleteLastRole4InOrg] = useState(false);
  const [savingExpoUserId, setSavingExpoUserId] = useState<string | null>(null);

  const openUserFiche = (targetUserId: string) => {
    const trimmed = targetUserId.trim();
    if (!trimmed) return;
    setCreateUserOpen(false);
    setEditUserId(trimmed);
  };

  const userId = user?.id ?? null;
  const email = user?.email ?? null;
  const effectiveRoleId = useMemo(() => resolveEffectiveRoleId(role_id, role_name), [role_id, role_name]);
  const profileUserId = viewedUserId ?? userId;
  const isViewingSelf = Boolean(profileUserId && userId && profileUserId === userId);

  const {
    profile,
    agency,
    expo,
    subscription,
    teamStats,
    teamMembers,
    profilePickerMembers,
    agencyExpos,
    loading: dataLoading,
    error,
    refresh,
    refreshKey,
  } = useDashboardProfile(profileUserId, effectiveAgencyId, expo_id, effectiveRoleId, userId);

  const viewedMember = useMemo(
    () =>
      profilePickerMembers.find((m) => m.user_id === profileUserId) ??
      teamMembers.find((m) => m.user_id === profileUserId) ??
      null,
    [teamMembers, profilePickerMembers, profileUserId],
  );

  const mergedProfile = useMemo(
    () => mergeProfileValues(profile, isViewingSelf ? user : null),
    [profile, user, isViewingSelf],
  );

  const resolvedAvatarUrl = useProfileAvatar(
    profileUserId,
    isViewingSelf ? user : null,
    refreshKey,
    profile?.avatar_url,
  );
  const profileAvatarSync = useMemo(
    () =>
      isViewingSelf
        ? resolveProfileAvatarSource(profile?.avatar_url, user?.user_metadata)
        : profile?.avatar_url ?? null,
    [profile?.avatar_url, user?.user_metadata, isViewingSelf],
  );
  const avatarSource = resolvedAvatarUrl || profileAvatarSync;

  const loading = authLoading || dataLoading;
  const displayName = profileFullName(
    mergedProfile.firstName || (isViewingSelf ? first_name_from_auth(user) : ""),
    mergedProfile.lastName,
    isViewingSelf ? email || "Utilisateur" : profile?.username || "Membre",
  );
  const isGlobalAdmin = hasGlobalStaffRole || hasFullDataAccess(mapRoleNameFromRoleId(globalRoleId));
  const dashboardAgencyId = agency?.id ?? effectiveAgencyId ?? null;
  const profileAgencyId = agency?.id ?? null;
  const canSwitchProfiles = isGlobalAdmin;
  const teamMembersCount = teamMembers.length > 0 ? teamMembers.length : teamStats.members_count;
  const showCreateUser = canCreateUsers(effectiveRoleId) && can("menu_user");
  const standbyPlanCode = resolveStandbyPlanCode(subscription?.plan_code);

  const canEditTeamMember = useMemo(
    () => (member: DashboardTeamMember) => {
      if (!canCreateUsers(effectiveRoleId) && !hasFullDataAccess(role_name)) return false;
      return canManageTeamMember(effectiveRoleId, member.role_id);
    },
    [effectiveRoleId, role_name],
  );

  const role4Count = useMemo(
    () => teamMembers.filter((m) => m.agency_role_id === 4).length,
    [teamMembers],
  );

  const canDeleteTeamMemberRow = useMemo(
    () => (member: DashboardTeamMember) => {
      if (!canDeleteTeamMember(effectiveRoleId, member.role_id, userId, member.user_id)) return false;
      if (member.agency_role_id === 4 && role4Count <= 1) return false;
      return true;
    },
    [effectiveRoleId, userId, role4Count],
  );

  const canEditMemberExpos = useMemo(
    () => (member: DashboardTeamMember) =>
      canAssignExpoToMember(effectiveRoleId, member.agency_role_id ?? member.role_id),
    [effectiveRoleId],
  );

  const showGlobalCommercialTermsCard =
    isViewingSelf && canSwitchNavigationMode && navigationMode === "global";

  const showOrganisationCommercialTermsBlock = useMemo(
    () =>
      Boolean(profileAgencyId) &&
      hasGrantedCommercialTerms(agency) &&
      subscription?.status === "none" &&
      !showGlobalCommercialTermsCard,
    [agency, profileAgencyId, showGlobalCommercialTermsCard, subscription?.status],
  );

  const grantedPlanSubscribeButtons = useMemo(
    () =>
      resolveGrantedPlanSubscribeButtons(
        agency?.commercial_plan_code,
        hasGrantedCommercialTerms(agency),
        showOrganisationCommercialTermsBlock,
      ),
    [agency, showOrganisationCommercialTermsBlock],
  );

  const showSponsoringConventionButton = useMemo(
    () =>
      isViewingSelf &&
      (effectiveRoleId === 4 || agencyRoleId === 4) &&
      Boolean(profileAgencyId) &&
      hasAgencyPresetDiscount(agency) &&
      !showOrganisationCommercialTermsBlock,
    [agency, agencyRoleId, effectiveRoleId, isViewingSelf, profileAgencyId, showOrganisationCommercialTermsBlock],
  );

  const handleMemberExposChange = async (member: DashboardTeamMember, nextExpoIds: string[]) => {
    if (!canEditMemberExpos(member)) return;
    setSavingExpoUserId(member.user_id);
    try {
      const unique = [...new Set(nextExpoIds.map((id) => id.trim()).filter(Boolean))];
      const storageIds = await resolveExpoStorageIds(unique);
      await supabase.from("expo_user_role").delete().eq("user_id", member.user_id);
      if (storageIds.length > 0) {
        const { error: insertErr } = await supabase
          .from("expo_user_role")
          .insert(storageIds.map((expo_id) => ({ user_id: member.user_id, expo_id })));
        if (insertErr) throw insertErr;
      }
      toast.success("Expositions mises à jour.");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour des expositions impossible.");
    } finally {
      setSavingExpoUserId(null);
    }
  };

  useEffect(() => {
    if (!deleteMemberTarget) {
      setDeleteLastRole4InOrg(false);
      return;
    }
    if ((deleteMemberTarget.agency_role_id ?? deleteMemberTarget.role_id) !== 4 || !dashboardAgencyId?.trim()) {
      setDeleteLastRole4InOrg(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error: qErr } = await supabase
        .from("agency_users")
        .select("user_id")
        .eq("role_id", 4)
        .eq("agency_id", dashboardAgencyId.trim())
        .neq("user_id", deleteMemberTarget.user_id)
        .limit(1);
      if (cancelled) return;
      if (qErr) {
        setDeleteLastRole4InOrg(false);
        return;
      }
      setDeleteLastRole4InOrg(((data as Array<{ user_id?: string }> | null) ?? []).length === 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [deleteMemberTarget, dashboardAgencyId]);

  const confirmDeleteTeamMember = async () => {
    if (!deleteMemberTarget || !canDeleteTeamMemberRow(deleteMemberTarget)) return;

    const targetRoleId = deleteMemberTarget.agency_role_id ?? deleteMemberTarget.role_id;
    if (effectiveRoleId === 4 && targetRoleId != null && ![4, 5, 6].includes(targetRoleId)) {
      toast.error("Suppression non autorisée pour ce rôle.");
      return;
    }

    setDeletingMember(true);
    try {
      const result = await softDeleteUserProfile(deleteMemberTarget.user_id);
      if (!result.ok) throw new Error(result.message);

      toast.success("Utilisateur envoyé en corbeille.");
      setDeleteMemberTarget(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suppression impossible.");
    } finally {
      setDeletingMember(false);
    }
  };

  const deleteMemberDisplayName = useMemo(() => {
    if (!deleteMemberTarget) return "";
    const full = [deleteMemberTarget.first_name?.trim(), deleteMemberTarget.last_name?.trim()]
      .filter(Boolean)
      .join(" ");
    return full || deleteMemberTarget.username || "cet utilisateur";
  }, [deleteMemberTarget]);

  const subscriptionProgress = useMemo(() => {
    if (!subscription?.expires_at || !subscription.started_at) return null;
    const start = new Date(subscription.started_at).getTime();
    const end = new Date(subscription.expires_at).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
    const total = end - start;
    const elapsed = Date.now() - start;
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  }, [subscription?.expires_at, subscription?.started_at]);

  const isEtincelleSubscription = subscriptionIsEtincelle(subscription);

  const quickLinks = useMemo(() => {
    const teamUsersHref = dashboardAgencyId
      ? `/user/utilisateurs?scope=equipe&agency_id=${encodeURIComponent(dashboardAgencyId)}`
      : teamMembers.length > 0
        ? "/user/utilisateurs?scope=site"
        : "/user/utilisateurs";
    const links: Array<{ to: string; label: string; icon: typeof BarChart3; show: boolean }> = [
      { to: "/statistiques", label: "Statistiques", icon: BarChart3, show: can("menu_stats") },
      { to: teamUsersHref, label: "Équipe", icon: UsersIcon, show: can("menu_user") },
      { to: "/catalogue", label: "Catalogue", icon: ImageIcon, show: can("menu_catalogue") },
      { to: "/agencies", label: "Organisations", icon: Building2, show: can("menu_agence") },
    ];
    return links.filter((l) => l.show && !isStandbyNavRestricted);
  }, [can, isStandbyNavRestricted, dashboardAgencyId]);

  return (
    <div className="container py-8 space-y-8">
      {/* En-tête */}
      <div className="flex flex-col justify-between gap-4 bg-[#121212]/95 py-2 backdrop-blur-sm md:flex-row md:items-center">
        <div className="min-w-0 shrink-0 md:flex-1 space-y-3">
          <div>
            <h2 className="text-3xl font-serif font-bold text-white">
              {loading ? "Mon espace" : `Bonjour, ${displayName.split(" ")[0] || displayName}`}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Vue d&apos;ensemble de votre compte, abonnement et équipe
            </p>
          </div>
          {canSwitchProfiles && userId ? (
            <div className="max-w-md">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                Profil affiché
              </p>
              <DashboardProfileSelector
                members={profilePickerMembers}
                currentUserId={userId}
                selectedUserId={profileUserId ?? userId}
                onSelect={(id) => setViewedUserId(id === userId ? null : id)}
              />
            </div>
          ) : null}
        </div>
        <BackofficeStickyAgencyLogoSlot />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Erreur de chargement</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <StandbyDashboardBanner />

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Chargement de votre espace…
        </div>
      )}

      {!loading && (
        <>
          {/* Grille principale : profil + abonnement */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Profil */}
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <UserRound className="h-5 w-5 text-gold" />
                    {isViewingSelf ? "Mon profil" : "Profil membre"}
                  </CardTitle>
                  {profileUserId && isViewingSelf && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => openUserFiche(userId)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Modifier
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-start gap-4">
                  {profileUserId ? (
                    <div className="relative flex h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/30">
                      <ProfileAvatarImage
                        src={avatarSource ?? profile?.avatar_url}
                        className="h-full w-full object-cover"
                        iconClassName="h-10 w-10"
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-serif font-bold truncate">{displayName}</p>
                    {profile?.username && (
                      <p className="text-sm text-muted-foreground">@{profile.username}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {isViewingSelf ? (
                        <>
                          <Badge variant="outline">{role_label || role_name || "Rôle inconnu"}</Badge>
                          {typeof role_id === "number" && (
                            <Badge variant="secondary">Niveau {role_id}</Badge>
                          )}
                        </>
                      ) : (
                        <>
                          {viewedMember?.agency_role_label ? (
                            <Badge variant="outline">{viewedMember.agency_role_label}</Badge>
                          ) : viewedMember?.role_label ? (
                            <Badge variant="outline">{viewedMember.role_label}</Badge>
                          ) : null}
                          {viewedMember?.agency_role_id != null ? (
                            <Badge variant="secondary">Niveau {viewedMember.agency_role_id}</Badge>
                          ) : viewedMember?.role_id != null ? (
                            <Badge variant="secondary">Niveau {viewedMember.role_id}</Badge>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <ProfileField label="Prénom" value={textOrDash(mergedProfile.firstName)} />
                  <ProfileField label="Nom" value={textOrDash(mergedProfile.lastName)} />
                  <ProfileField label="Pseudo" value={mergedProfile.username ? `@${mergedProfile.username}` : "—"} />
                  <ProfileField
                    label="Mois et année de naissance"
                    value={formatBirthDisplay(mergedProfile.birthMonth, mergedProfile.birthYear)}
                  />
                  <ProfileField icon={Mail} label="E-mail" value={isViewingSelf ? textOrDash(email) : "—"} />
                  <ProfileField icon={Phone} label="Téléphone" value={textOrDash(mergedProfile.phone)} />
                  <ProfileField
                    icon={MapPin}
                    label="Localisation"
                    value={
                      [mergedProfile.city, mergedProfile.zipCode, profile?.country_code].filter(Boolean).join(", ") ||
                      "—"
                    }
                  />
                  <ProfileField icon={Calendar} label="Membre depuis" value={formatDateFr(profile?.created_at)} />
                </dl>

                {showSponsoringConventionButton && profileAgencyId ? (
                  <SponsoringConventionButton organisationId={profileAgencyId} />
                ) : null}

                {isViewingSelf && canSwitchNavigationMode ? (
                  <DashboardNavigationModeSelector
                    navigationMode={navigationMode}
                    globalRoleId={globalRoleId}
                    agencyRoleId={agencyRoleId}
                    onChange={setNavigationMode}
                  />
                ) : null}

                {(agency || agencyExpos.length > 0) && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                    <div className="min-w-0 flex-1 rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Périmètre</p>
                      {agency && (
                        <p className="text-sm">
                          <Building2 className="inline h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                          {agency.name_agency || agency.id}
                        </p>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                      {agencyExpos.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Expositions</p>
                          <ul className="space-y-0.5 text-sm text-muted-foreground">
                            {agencyExpos.map((item) => (
                              <li key={item.id}>{item.label}</li>
                            ))}
                          </ul>
                        </div>
                      ) : expo ? (
                        <p className="text-sm text-muted-foreground">
                          Exposition : {expo.expo_name || expo.id}
                        </p>
                      ) : null}
                      {isEtincelleSubscription ? (
                        <p className="text-sm font-medium text-destructive">{ETINCELLE_UI.expoLimitBlocked}</p>
                      ) : null}
                    </div>
                  </div>
                )}

                {isViewingSelf && isGlobalAdmin && !agency_id && !profileAgencyId && (
                  <p className="text-xs text-muted-foreground italic">
                    Compte administrateur global — non rattaché à une organisation.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Abonnement ou conditions commerciales (mode admin global) */}
            {showGlobalCommercialTermsCard ? (
              <DashboardGrantedCommercialTermsCard />
            ) : (
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-xl flex shrink-0 items-center gap-2">
                    <CreditCard className="h-5 w-5 text-gold" />
                    Mon abonnement
                  </CardTitle>
                  {isEtincelleSubscription && subscriptionProgress != null ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Progress value={subscriptionProgress} className="h-2" />
                      <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                        {subscriptionProgress}%
                      </span>
                    </div>
                  ) : (
                    <div className="flex-1" aria-hidden />
                  )}
                  <Badge variant={subscriptionBadgeVariant(subscription?.status)} className="shrink-0">
                    {subscriptionStatusLabel(subscription?.status)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!profileAgencyId && isGlobalAdmin && isViewingSelf ? (
                  <p className="text-sm text-muted-foreground py-4">
                    Les administrateurs globaux ne sont pas liés à un abonnement organisation.
                  </p>
                ) : !profileAgencyId ? (
                  <p className="text-sm text-muted-foreground py-4">
                    Aucune organisation associée — l&apos;abonnement sera visible une fois rattaché à une agence.
                  </p>
                ) : subscription?.status === "unknown" ? (
                  <Alert>
                    <AlertTitle>Abonnement non configuré</AlertTitle>
                    <AlertDescription>
                      Les tables de facturation ne sont pas encore disponibles. Exécutez la migration{" "}
                      <code className="rounded bg-muted px-1">migration_79_pricing_billing_schema.sql</code> sur
                      Supabase.
                    </AlertDescription>
                  </Alert>
                ) : subscription?.status === "none" ? (
                  <div className="space-y-3 py-2">
                    <p className="text-sm text-muted-foreground">
                      Aucun abonnement actif enregistré pour{" "}
                      <strong className="text-foreground">{agency?.name_agency || "votre organisation"}</strong>.
                    </p>

                    {showOrganisationCommercialTermsBlock && profileAgencyId && agency ? (
                      <DashboardOrganisationCommercialTermsBlock
                        agency={agency}
                        organisationId={profileAgencyId}
                        subscriptionStartedAt={subscription?.started_at}
                        subscriptionExpiresAt={subscription?.expires_at}
                        subscribeButtons={grantedPlanSubscribeButtons}
                      />
                    ) : null}

                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {showOrganisationCommercialTermsBlock
                        ? null
                        : grantedPlanSubscribeButtons.map((button) =>
                            button.variant === "primary" ? (
                              <Button
                                key={button.plan}
                                asChild
                                size="sm"
                                className="gradient-gold gradient-gold-hover-bg text-primary-foreground"
                              >
                                <Link to={subscribePlanHref(button.plan)}>{button.label}</Link>
                              </Button>
                            ) : (
                              <Button key={button.plan} asChild variant="outline" size="sm">
                                <Link to={subscribePlanHref(button.plan)}>{button.label}</Link>
                              </Button>
                            ),
                          )}
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/organisation#tarifs">Comparer les offres</Link>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-4">
                      <div className="w-full shrink-0 sm:w-[260px] sm:max-w-[260px]">
                        <p className="text-2xl font-serif font-bold">
                          {subscription?.display_name ||
                            subscription?.pricing_label ||
                            subscription?.plan_code ||
                            "Plan inconnu"}
                        </p>
                        <p
                          className={`text-sm mt-1 ${
                            isEtincelleSubscription ? "font-medium text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {isEtincelleSubscription
                            ? ETINCELLE_UI.trialLabel
                            : subscription?.billing_cycle === "annual"
                              ? "Facturation annuelle"
                              : "Facturation mensuelle"}
                          {!isEtincelleSubscription &&
                            (subscription?.net_price_eur != null || subscription?.monthly_price_eur != null) &&
                            ` · ${formatEur(subscription.net_price_eur ?? subscription.monthly_price_eur)}${
                              subscription?.billing_cycle === "annual" ? "/an" : "/mois"
                            }`}
                        </p>
                        {commercialKindLabel(subscription?.commercial_kind) ? (
                          <p className="mt-1 text-xs font-medium text-[#9d2525]">
                            {commercialKindLabel(subscription?.commercial_kind)}
                          </p>
                        ) : null}
                        {hasCommercialDiscount(subscription) && !isEtincelleSubscription ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Catalogue {formatEur(subscription?.list_price_eur)}
                            {(subscription?.discount_percent ?? 0) > 0
                              ? ` · −${subscription?.discount_percent} %`
                              : null}
                            {(subscription?.discount_amount_eur ?? 0) > 0
                              ? ` · −${formatEur(subscription?.discount_amount_eur)}`
                              : null}
                            {" · Net "}
                            <span className="font-medium text-foreground">
                              {formatEur(subscription?.net_price_eur)}
                            </span>
                          </p>
                        ) : null}
                        <div className="mt-2 space-y-1 text-sm">
                          {subscription?.started_at ? (
                            isEtincelleSubscription ? (
                              <>
                                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                  <span className="text-muted-foreground">
                                    Début ·{" "}
                                    <span className="text-foreground font-medium">
                                      {formatDateFr(subscription.started_at)}
                                    </span>
                                  </span>
                                  {subscription.expires_at ? (
                                    <span className="text-muted-foreground">
                                      Fin ·{" "}
                                      <span className="text-foreground font-medium">
                                        {formatDateFr(subscription.expires_at)}
                                      </span>
                                    </span>
                                  ) : null}
                                </div>
                                {subscription.days_remaining != null ? (
                                  <p className="font-semibold text-destructive">
                                    {formatDaysRemaining(subscription.days_remaining)}
                                  </p>
                                ) : null}
                              </>
                            ) : (
                              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                <span className="text-muted-foreground">
                                  Début ·{" "}
                                  <span className="text-foreground font-medium">
                                    {formatDateFr(subscription.started_at)}
                                  </span>
                                </span>
                                <span className="text-muted-foreground">
                                  Ancienneté ·{" "}
                                  <span className="text-foreground font-medium">
                                    {formatSeniority(subscription.started_at)}
                                  </span>
                                </span>
                              </div>
                            )
                          ) : null}
                          <dl className="grid gap-2 pt-2">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex justify-between gap-3">
                                <dt className="text-muted-foreground">Œuvres créées</dt>
                                <dd className="font-medium text-right">
                                  {formatUsageRatio(
                                    teamStats.artworks_count,
                                    subscription?.max_oeuvres,
                                    subscription?.is_unlimited,
                                  )}
                                </dd>
                              </div>
                              {isEtincelleSubscription && subscription?.max_oeuvres != null ? (
                                <p className="text-xs font-medium text-destructive text-right">
                                  {Math.max(0, subscription.max_oeuvres - teamStats.artworks_count)} œuvre
                                  {Math.max(0, subscription.max_oeuvres - teamStats.artworks_count) > 1 ? "s" : ""}{" "}
                                  restante
                                  {Math.max(0, subscription.max_oeuvres - teamStats.artworks_count) > 1 ? "s" : ""} à
                                  créer
                                </p>
                              ) : null}
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <div className="flex justify-between gap-3">
                                <dt className="text-muted-foreground">Visiteurs (mois en cours)</dt>
                                <dd className="font-medium text-right">
                                  {formatUsageRatio(
                                    teamStats.visitors_this_month,
                                    subscription?.max_visitors,
                                    subscription?.is_unlimited,
                                  )}
                                </dd>
                              </div>
                              {isEtincelleSubscription && subscription?.max_visitors != null ? (
                                <p className="text-xs font-medium text-destructive text-right">
                                  {Math.max(0, subscription.max_visitors - teamStats.visitors_this_month)} visiteur
                                  {Math.max(0, subscription.max_visitors - teamStats.visitors_this_month) > 1
                                    ? "s"
                                    : ""}{" "}
                                  restant
                                  {Math.max(0, subscription.max_visitors - teamStats.visitors_this_month) > 1
                                    ? "s"
                                    : ""}{" "}
                                  ce mois
                                </p>
                              ) : null}
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-muted-foreground">Langues médiation</dt>
                              <dd className="font-medium text-right">
                                {formatLangRange(
                                  subscription?.included_mediation_langs_min,
                                  subscription?.included_mediation_langs_max,
                                )}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-muted-foreground">Langues audio</dt>
                              <dd className="font-medium text-right">
                                {subscription?.included_audio_langs ?? "—"}
                              </dd>
                            </div>
                            {subscription?.standby_monthly_price_eur != null ? (
                              <div className="flex justify-between gap-3">
                                <dt className="text-muted-foreground">Tarif veille</dt>
                                <dd className="font-medium text-right">
                                  {formatEur(subscription.standby_monthly_price_eur)}/mois
                                </dd>
                              </div>
                            ) : null}
                            {subscription?.source === "organisation" ? (
                              <>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <dt className="text-muted-foreground">Mode veille</dt>
                                  <dd className="flex flex-wrap items-center justify-end gap-2 font-medium text-right">
                                    <span>{standbyStatusLabel(subscription.standby_status)}</span>
                                    {standbyState.can_request_standby &&
                                    standbyPlanCode &&
                                    subscription?.standby_monthly_price_eur != null ? (
                                      <DashboardStandbyButton
                                        planCode={standbyPlanCode}
                                        planDisplayName={
                                          subscription.display_name ||
                                          subscription.pricing_label ||
                                          standbyPlanCode
                                        }
                                        monthlyPriceEur={
                                          subscription.standby_monthly_price_eur ??
                                          subscription.monthly_price_eur ??
                                          0
                                        }
                                      />
                                    ) : null}
                                  </dd>
                                </div>
                                {subscription.standby_requested_at ? (
                                  <div className="flex justify-between gap-3">
                                    <dt className="text-muted-foreground">Demande veille</dt>
                                    <dd className="font-medium text-right">
                                      {formatDateFr(subscription.standby_requested_at)}
                                    </dd>
                                  </div>
                                ) : null}
                                {subscription.standby_cancel_deadline_at ? (
                                  <div className="flex justify-between gap-3">
                                    <dt className="text-muted-foreground">Annulation possible jusqu&apos;au</dt>
                                    <dd className="font-medium text-right">
                                      {formatDateFr(subscription.standby_cancel_deadline_at)}
                                    </dd>
                                  </div>
                                ) : null}
                                {subscription.standby_started_at ? (
                                  <div className="flex justify-between gap-3">
                                    <dt className="text-muted-foreground">Veille effective depuis</dt>
                                    <dd className="font-medium text-right">
                                      {formatDateFr(subscription.standby_started_at)}
                                    </dd>
                                  </div>
                                ) : null}
                              </>
                            ) : null}
                          </dl>
                        </div>
                      </div>
                      {profileAgencyId && subscription?.subscription_id && (isGlobalAdmin || isEtincelleSubscription) ? (
                        <div className="w-full min-w-0 flex-1 rounded-lg border border-border/60 bg-muted/30 p-3">
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Changer d&apos;offre
                          </p>
                          <DashboardPlanActions
                            organisationId={profileAgencyId}
                            subscriptionId={subscription.subscription_id}
                            currentPlanCode={subscription.plan_code}
                            isEtincelle={isEtincelleSubscription}
                            onChanged={refresh}
                          />
                        </div>
                      ) : null}
                    </div>

                    {!isEtincelleSubscription && (subscription?.next_renewal_at || subscription?.expires_at) && (
                      <div className="space-y-2">
                        {subscription.next_renewal_at ? (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Prochaine échéance</span>
                            <span className="font-medium">{formatDateFr(subscription.next_renewal_at)}</span>
                          </div>
                        ) : null}
                        {subscription.expires_at ? (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              {subscription.is_trial ? "Fin d'essai" : "Fin de période"}
                            </span>
                            <span className="font-medium">{formatDateFr(subscription.expires_at)}</span>
                          </div>
                        ) : null}
                        {subscription.days_remaining != null && (
                          <p
                            className={`text-sm font-semibold ${
                              subscription.days_remaining <= 14 ? "text-destructive" : "text-foreground"
                            }`}
                          >
                            {subscription.days_remaining > 0
                              ? `${subscription.days_remaining} jour${subscription.days_remaining > 1 ? "s" : ""} restant${subscription.days_remaining > 1 ? "s" : ""}`
                              : subscription.days_remaining === 0
                                ? "Échéance aujourd'hui"
                                : "Période échue"}
                          </p>
                        )}
                        {subscriptionProgress != null && (
                          <Progress value={subscriptionProgress} className="h-2" />
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            )}
          </div>

          {/* Stats équipe + actions rapides */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Membres équipe"
              value={teamMembersCount}
              icon={UsersIcon}
              onClick={() => document.getElementById("dashboard-team-members")?.scrollIntoView({ behavior: "smooth" })}
              clickable={teamMembersCount > 0}
            />
            <StatCard label="Expositions" value={teamStats.expos_count} icon={Building2} href="/expos" />
            <StatCard label="Œuvres catalogue" value={teamStats.artworks_count} icon={ImageIcon} href="/catalogue" />
            <StatCard
              label="Rôle actuel"
              value={
                isViewingSelf
                  ? role_label || role_name || "—"
                  : viewedMember?.agency_role_label || viewedMember?.role_label || "—"
              }
              icon={UserRound}
              isText
            />
          </div>

          {(dashboardAgencyId || teamMembers.length > 0) && (
            <Card id="dashboard-team-members" className="glass-card scroll-mt-24">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl flex items-center gap-2">
                  <UsersIcon className="h-5 w-5 text-gold" />
                  Membres de l&apos;équipe
                  <span className="text-sm font-normal text-muted-foreground">({teamMembers.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DashboardTeamMembersTable
                  members={teamMembers}
                  expoOptions={agencyExpos}
                  currentUserId={userId}
                  canEditMember={canEditTeamMember}
                  canDeleteMember={canDeleteTeamMemberRow}
                  canEditMemberExpos={canEditMemberExpos}
                  savingExpoUserId={savingExpoUserId}
                  onEditMember={(member) => openUserFiche(member.user_id)}
                  onDeleteMember={setDeleteMemberTarget}
                  onMemberExposChange={(member, expoIds) => {
                    void handleMemberExposChange(member, expoIds);
                  }}
                />
              </CardContent>
            </Card>
          )}

          {/* Création utilisateur + liens rapides */}
          <div className="grid gap-6 lg:grid-cols-2">
            {showCreateUser && (
              <Card className="glass-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-gold" />
                    Gestion de l&apos;équipe
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Créez des comptes pour votre organisation. {roleLevelHint(role_id)}
                  </p>
                  {teamMembers.length > 0 ? (
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2 max-h-56 overflow-y-auto">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Équipe ({teamMembers.length})
                      </p>
                      <ul className="space-y-1">
                        {teamMembers.map((member) => {
                          const name = profileFullName(
                            member.first_name,
                            member.last_name,
                            member.username || "Membre",
                          );
                          const isSelected = member.user_id === profileUserId;
                          return (
                            <li key={member.user_id}>
                              <button
                                type="button"
                                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50 ${
                                  isSelected ? "bg-primary/10 font-medium" : ""
                                }`}
                                onClick={() => {
                                  if (canSwitchProfiles && userId) {
                                    setViewedUserId(member.user_id === userId ? null : member.user_id);
                                  } else {
                                    openUserFiche(member.user_id);
                                  }
                                }}
                              >
                                <span className="truncate">{name}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {member.agency_role_label || member.role_label || "—"}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Aucun membre dans le périmètre actuel.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="gradient-gold gradient-gold-hover-bg text-primary-foreground"
                      onClick={() => setCreateUserOpen(true)}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Nouvel utilisateur
                    </Button>
                    <Button asChild variant="outline">
                      <Link
                        to={
                          dashboardAgencyId
                            ? `/user/utilisateurs?scope=equipe&agency_id=${encodeURIComponent(dashboardAgencyId)}`
                            : "/user/utilisateurs?scope=site"
                        }
                      >
                        Voir toute l&apos;équipe
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {quickLinks.length > 0 && (
              <Card className="glass-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xl">Accès rapides</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {quickLinks.map(({ to, label, icon: Icon }) => (
                      <Button key={to} asChild variant="outline" className="justify-start h-auto py-3">
                        <Link to={to}>
                          <Icon className="h-4 w-4 mr-2 shrink-0" />
                          {label}
                        </Link>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {(createUserOpen || editUserId) && (
        <Users
          embeddedDialogOnly
          forcedEditUserId={editUserId}
          forceCreateDialog={createUserOpen && !editUserId}
          onDialogClosed={() => {
            setEditUserId(null);
            setCreateUserOpen(false);
            refresh();
          }}
          onUserSaved={() => refresh()}
        />
      )}

      <AlertDialog open={Boolean(deleteMemberTarget)} onOpenChange={(open) => !open && setDeleteMemberTarget(null)}>
        <AlertDialogContent className="z-[100]">
          <AlertDialogHeader>
            <AlertDialogTitle>Envoyer en corbeille ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  L&apos;utilisateur <strong className="text-foreground">{deleteMemberDisplayName}</strong> sera
                  archivé et pourra être restauré depuis la corbeille utilisateurs.
                </p>
                {(deleteMemberTarget?.agency_role_id === 4 || deleteMemberTarget?.role_id === 4) && (
                  <p className="font-semibold text-destructive">
                    Attention : vous supprimez un responsable d&apos;organisation.
                  </p>
                )}
                {deleteLastRole4InOrg && (
                  <p className="font-semibold text-destructive">
                    C&apos;est le dernier responsable d&apos;organisation de cette organisation — l&apos;accès
                    administrateur pourrait être compromis.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingMember}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmDeleteTeamMember();
              }}
            >
              {deletingMember ? "Envoi…" : "Corbeille"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

function first_name_from_auth(user: { user_metadata?: Record<string, unknown> } | null): string | null {
  const meta = user?.user_metadata;
  if (typeof meta?.first_name === "string") return meta.first_name.trim() || null;
  return null;
}

function ProfileField({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </dt>
      <dd className="font-medium mt-0.5 truncate" title={value}>
        {value}
      </dd>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  isText = false,
  clickable = false,
  onClick,
  href,
}: {
  label: string;
  value: number | string;
  icon: typeof UsersIcon;
  isText?: boolean;
  clickable?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <CardContent className="p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-gold" />
      </div>
      <p className={`font-serif font-bold ${isText ? "text-base truncate" : "text-3xl"}`}>{value}</p>
      {clickable && !href && (
        <p className="text-xs text-muted-foreground mt-2">Cliquer pour voir le détail</p>
      )}
      {href && <p className="text-xs text-muted-foreground mt-2">Voir la page</p>}
    </CardContent>
  );

  if (href) {
    return (
      <Link to={href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Card className="glass-card cursor-pointer hover:shadow-lg transition-shadow h-full">{inner}</Card>
      </Link>
    );
  }

  return (
    <Card
      className={`glass-card ${clickable ? "cursor-pointer hover:shadow-lg transition-shadow" : ""}`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {inner}
    </Card>
  );
}

export default Dashboard;
