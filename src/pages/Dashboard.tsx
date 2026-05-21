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
import {
  formatBirthDisplay,
  mergeProfileValues,
} from "@/components/dashboard/DashboardProfileEditDialog";
import { DashboardTeamMembersTable } from "@/components/dashboard/DashboardTeamMembersTable";
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
import { useAuthUser } from "@/hooks/useAuthUser";
import { useDashboardProfile, type DashboardTeamMember } from "@/hooks/useDashboardProfile";
import { useProfileAvatar } from "@/hooks/useProfileAvatar";
import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";
import { hasFullDataAccess } from "@/lib/authUser";
import { ProfileAvatarImage, resolveProfileAvatarSource } from "@/components/ProfileAvatarImage";
import {
  canAssignExpoToMember,
  canCreateUsers,
  canDeleteTeamMember,
  canManageTeamMember,
  resolveEffectiveRoleId,
  roleLevelHint,
} from "@/lib/roleHierarchy";
import { supabase } from "@/lib/supabase";
import { softDeleteUserProfile } from "@/lib/userSoftDelete";
import Users from "@/pages/Users";

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
  status: "active" | "expired" | "none" | "unknown" | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "expired":
      return "destructive";
    case "none":
      return "secondary";
    default:
      return "outline";
  }
}

function subscriptionStatusLabel(
  status: "active" | "expired" | "none" | "unknown" | undefined,
): string {
  switch (status) {
    case "active":
      return "Actif";
    case "expired":
      return "Expiré";
    case "none":
      return "Non renseigné";
    default:
      return "Indisponible";
  }
}

const Dashboard = () => {
  const { user, role_id, role_label, role_name, agency_id, expo_id, loading: authLoading } = useAuthUser();
  const { can } = useNavigationMatrix();
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

  const {
    profile,
    agency,
    expo,
    subscription,
    teamStats,
    teamMembers,
    agencyExpos,
    loading: dataLoading,
    error,
    refresh,
    refreshKey,
  } = useDashboardProfile(userId, agency_id, expo_id);

  const mergedProfile = useMemo(() => mergeProfileValues(profile, user), [profile, user]);

  const resolvedAvatarUrl = useProfileAvatar(userId, user, refreshKey, profile?.avatar_url);
  const profileAvatarSync = useMemo(
    () => resolveProfileAvatarSource(profile?.avatar_url, user?.user_metadata),
    [profile?.avatar_url, user?.user_metadata],
  );
  const avatarSource = resolvedAvatarUrl || profileAvatarSync;

  const loading = authLoading || dataLoading;
  const displayName = profileFullName(
    mergedProfile.firstName || first_name_from_auth(user),
    mergedProfile.lastName,
    email || "Utilisateur",
  );
  const isGlobalAdmin = hasFullDataAccess(role_name) || (typeof role_id === "number" && role_id >= 1 && role_id <= 3);
  const effectiveRoleId = useMemo(() => resolveEffectiveRoleId(role_id, role_name), [role_id, role_name]);
  const showCreateUser = canCreateUsers(effectiveRoleId) && can("menu_user");

  const canEditTeamMember = useMemo(
    () => (member: DashboardTeamMember) => {
      if (!canCreateUsers(effectiveRoleId) && !hasFullDataAccess(role_name)) return false;
      return canManageTeamMember(effectiveRoleId, member.role_id);
    },
    [effectiveRoleId, role_name],
  );

  const role4Count = useMemo(() => teamMembers.filter((m) => m.role_id === 4).length, [teamMembers]);

  const canDeleteTeamMemberRow = useMemo(
    () => (member: DashboardTeamMember) => {
      if (!canDeleteTeamMember(effectiveRoleId, member.role_id, userId, member.user_id)) return false;
      if (member.role_id === 4 && role4Count <= 1) return false;
      return true;
    },
    [effectiveRoleId, userId, role4Count],
  );

  const canEditMemberExpos = useMemo(
    () => (member: DashboardTeamMember) => canAssignExpoToMember(effectiveRoleId, member.role_id),
    [effectiveRoleId],
  );

  const handleMemberExposChange = async (member: DashboardTeamMember, nextExpoIds: string[]) => {
    if (!canEditMemberExpos(member)) return;
    setSavingExpoUserId(member.user_id);
    try {
      const unique = [...new Set(nextExpoIds.map((id) => id.trim()).filter(Boolean))];
      await supabase.from("expo_user_role").delete().eq("user_id", member.user_id);
      if (unique.length > 0) {
        const { error: insertErr } = await supabase
          .from("expo_user_role")
          .insert(unique.map((expo_id) => ({ user_id: member.user_id, expo_id })));
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
    if (deleteMemberTarget.role_id !== 4 || !agency_id?.trim()) {
      setDeleteLastRole4InOrg(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error: qErr } = await supabase
        .from("agency_users")
        .select("user_id")
        .eq("role_id", 4)
        .eq("agency_id", agency_id.trim())
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
  }, [deleteMemberTarget, agency_id]);

  const confirmDeleteTeamMember = async () => {
    if (!deleteMemberTarget || !canDeleteTeamMemberRow(deleteMemberTarget)) return;

    const targetRoleId = deleteMemberTarget.role_id;
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

  const quickLinks = useMemo(() => {
    const links: Array<{ to: string; label: string; icon: typeof BarChart3; show: boolean }> = [
      { to: "/statistiques", label: "Statistiques", icon: BarChart3, show: can("menu_stats") },
      { to: "/user/utilisateurs", label: "Équipe", icon: UsersIcon, show: can("menu_user") },
      { to: "/catalogue", label: "Catalogue", icon: ImageIcon, show: can("menu_catalogue") },
      { to: "/agencies", label: "Organisations", icon: Building2, show: can("menu_agence") },
    ];
    return links.filter((l) => l.show);
  }, [can]);

  return (
    <div className="container py-8 space-y-8">
      {/* En-tête */}
      <div className="flex flex-col justify-between gap-4 bg-[#121212]/95 py-2 backdrop-blur-sm md:flex-row md:items-center">
        <div className="min-w-0 shrink-0 md:flex-1">
          <h2 className="text-3xl font-serif font-bold text-white">
            {loading ? "Mon espace" : `Bonjour, ${displayName.split(" ")[0] || displayName}`}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Vue d&apos;ensemble de votre compte, abonnement et équipe
          </p>
        </div>
        <BackofficeStickyAgencyLogoSlot />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Erreur de chargement</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

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
                    Mon profil
                  </CardTitle>
                  {userId && (
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
                  {userId ? (
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
                      <Badge variant="outline">{role_label || role_name || "Rôle inconnu"}</Badge>
                      {typeof role_id === "number" && (
                        <Badge variant="secondary">Niveau {role_id}</Badge>
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
                  <ProfileField icon={Mail} label="E-mail" value={textOrDash(email)} />
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
                  <ProfileField label="Langue" value={textOrDash(mergedProfile.language?.toUpperCase())} />
                </dl>

                {(agency || expo) && (
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Périmètre</p>
                    {agency && (
                      <p className="text-sm">
                        <Building2 className="inline h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                        {agency.name_agency || agency.id}
                      </p>
                    )}
                    {expo && (
                      <p className="text-sm text-muted-foreground">
                        Exposition : {expo.expo_name || expo.id}
                      </p>
                    )}
                  </div>
                )}

                {isGlobalAdmin && !agency_id && (
                  <p className="text-xs text-muted-foreground italic">
                    Compte administrateur global — non rattaché à une organisation.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Abonnement */}
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-gold" />
                    Mon abonnement
                  </CardTitle>
                  <Badge variant={subscriptionBadgeVariant(subscription?.status)}>
                    {subscriptionStatusLabel(subscription?.status)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!agency_id && isGlobalAdmin ? (
                  <p className="text-sm text-muted-foreground py-4">
                    Les administrateurs globaux ne sont pas liés à un abonnement organisation.
                  </p>
                ) : !agency_id ? (
                  <p className="text-sm text-muted-foreground py-4">
                    Aucune organisation associée — l&apos;abonnement sera visible une fois rattaché à une agence.
                  </p>
                ) : subscription?.status === "unknown" ? (
                  <Alert>
                    <AlertTitle>Abonnement non configuré</AlertTitle>
                    <AlertDescription>
                      La table <code className="rounded bg-muted px-1">agency_subscriptions</code> n&apos;est pas
                      encore disponible. Exécutez la migration{" "}
                      <code className="rounded bg-muted px-1">migration_35_agency_subscriptions.sql</code> sur Supabase.
                    </AlertDescription>
                  </Alert>
                ) : subscription?.status === "none" ? (
                  <div className="space-y-3 py-2">
                    <p className="text-sm text-muted-foreground">
                      Aucun abonnement actif enregistré pour{" "}
                      <strong className="text-foreground">{agency?.name_agency || "votre organisation"}</strong>.
                    </p>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/">Voir les offres</Link>
                    </Button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-2xl font-serif font-bold">
                        {subscription?.pricing_label || subscription?.pricing_plan || "Plan inconnu"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {subscription?.billing_cycle === "annual" ? "Facturation annuelle" : "Facturation mensuelle"}
                        {subscription?.monthly_price_eur != null &&
                          ` · ${formatEur(subscription.monthly_price_eur)}/mois`}
                      </p>
                    </div>

                    {subscription?.expires_at && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Expire le</span>
                          <span className="font-medium">{formatDateFr(subscription.expires_at)}</span>
                        </div>
                        {subscription.days_remaining != null && (
                          <p
                            className={`text-sm font-semibold ${
                              subscription.days_remaining <= 14 ? "text-destructive" : "text-foreground"
                            }`}
                          >
                            {subscription.days_remaining > 0
                              ? `${subscription.days_remaining} jour${subscription.days_remaining > 1 ? "s" : ""} restant${subscription.days_remaining > 1 ? "s" : ""}`
                              : subscription.days_remaining === 0
                                ? "Expire aujourd'hui"
                                : "Abonnement expiré"}
                          </p>
                        )}
                        {subscriptionProgress != null && (
                          <Progress value={subscriptionProgress} className="h-2" />
                        )}
                      </div>
                    )}

                    <dl className="grid gap-2 text-sm border-t border-border/50 pt-4">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Œuvres max.</dt>
                        <dd className="font-medium">
                          {subscription?.is_unlimited
                            ? "Illimité"
                            : subscription?.max_oeuvres ?? "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Visiteurs max.</dt>
                        <dd className="font-medium">
                          {subscription?.is_unlimited
                            ? "Illimité"
                            : subscription?.max_visitors ?? "—"}
                        </dd>
                      </div>
                    </dl>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Stats équipe + actions rapides */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Membres équipe"
              value={teamStats.members_count}
              icon={UsersIcon}
              onClick={() => document.getElementById("dashboard-team-members")?.scrollIntoView({ behavior: "smooth" })}
              clickable={teamStats.members_count > 0}
            />
            <StatCard label="Expositions" value={teamStats.expos_count} icon={Building2} href="/expos" />
            <StatCard label="Œuvres catalogue" value={teamStats.artworks_count} icon={ImageIcon} href="/catalogue" />
            <StatCard
              label="Rôle actuel"
              value={role_label || role_name || "—"}
              icon={UserRound}
              isText
            />
          </div>

          {agency_id && (
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
                      <Link to="/user/utilisateurs">Voir toute l&apos;équipe</Link>
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
                {deleteMemberTarget?.role_id === 4 && (
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
