import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { CountryFlagIcon } from "@/components/CountryFlagIcon";
import { GoogleLogoIcon } from "@/components/OAuthProviderIcons";
import { TravelDiaryPreviewFlipbook } from "@/components/visitor/TravelDiaryPreviewFlipbook";
import { resolveProfileCountryLabel } from "@/components/users/UserProfileAddressFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { COUNTRY_OPTIONS, getCountryOption } from "@/lib/countries";
import { postalPlaceholderForCountryLabel } from "@/lib/postalCode";
import { startDiaryRegistrationOAuth } from "@/lib/visitorOAuth";
import { supabase } from "@/lib/supabase";
import { getOrCreateVisitorUuid } from "@/lib/visitorIdentity";

type Props = {
  open: boolean;
  expoId?: string | null;
  initialEmail?: string;
  initialFirstName?: string;
  initialLastName?: string;
  initialZipCode?: string;
  initialCity?: string;
  initialCountryCode?: string;
  isAuthenticated?: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const REQUIRED_MARK = <span className="text-[#E63946]">*</span>;
const FIELD_LABEL_CLASS = "text-xs";

export function VisitorDiaryRegistrationDialog({
  open,
  expoId,
  initialEmail = "",
  initialFirstName = "",
  initialLastName = "",
  initialZipCode = "",
  initialCity = "",
  initialCountryCode = "FR",
  isAuthenticated = false,
  onClose,
  onSuccess,
}: Props) {
  const { t } = useTranslation("visitor");
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [email, setEmail] = useState(initialEmail);
  const [zipCode, setZipCode] = useState(initialZipCode);
  const [city, setCity] = useState(initialCity);
  const [country, setCountry] = useState(() => resolveProfileCountryLabel(null, initialCountryCode));
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const postalPlaceholder = useMemo(() => postalPlaceholderForCountryLabel(country), [country]);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFirstName(initialFirstName);
    setLastName(initialLastName);
    setEmail(initialEmail);
    setZipCode(initialZipCode);
    setCity(initialCity);
    setCountry(resolveProfileCountryLabel(null, initialCountryCode));
    setPassword("");
    setPasswordConfirm("");
    setError(null);
  }, [open, initialFirstName, initialLastName, initialEmail, initialZipCode, initialCity, initialCountryCode]);

  if (!open) return null;

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    const { error: oauthError } = await startDiaryRegistrationOAuth();
    if (oauthError) {
      setGoogleLoading(false);
      toast.error(oauthError.message || t("diary.registration_google_error"));
    }
  };

  const handleSubmit = async () => {
    setError(null);
    const fn = firstName.trim();
    const ln = lastName.trim();
    const mail = email.trim();
    const zip = zipCode.trim();
    const c = city.trim();
    const countryLabel = country.trim();
    const countryCode = getCountryOption(countryLabel)?.iso?.toUpperCase() ?? null;

    if (!fn || !ln || !mail || !zip || !c || !countryLabel) {
      setError(t("diary.registration_missing_fields"));
      return;
    }

    setSubmitting(true);
    try {
      if (isAuthenticated) {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) throw new Error(t("diary.registration_auth_error"));

        const { error: profileErr } = await supabase
          .from("profiles")
          .update({
            first_name: fn,
            last_name: ln,
            zip_code: zip,
            city: c,
            country: countryLabel,
            country_code: countryCode,
            updated_at: new Date().toISOString(),
          })
          .eq("id", uid);
        if (profileErr) throw new Error(profileErr.message);
      } else {
        if (password.trim().length < 6) {
          setError(t("diary.registration_password_short"));
          setSubmitting(false);
          return;
        }
        if (password.trim() !== passwordConfirm.trim()) {
          setError(t("diary.registration_password_mismatch"));
          setSubmitting(false);
          return;
        }

        const visitorUuid = getOrCreateVisitorUuid();
        const { data, error: fnErr } = await supabase.functions.invoke("register-visitor-instant", {
          body: {
            email: mail,
            password: password.trim(),
            prenom: fn,
            nom: ln,
            user_expo_id: expoId?.trim() || null,
            visitor_uuid: visitorUuid || null,
          },
        });

        if (fnErr) throw new Error(fnErr.message);

        const signIn = await supabase.auth.signInWithPassword({ email: mail, password: password.trim() });
        if (signIn.error) throw new Error(signIn.error.message);

        const authId = signIn.data.user?.id;
        if (authId && visitorUuid) {
          await supabase.rpc("link_visitor_to_auth_user", {
            p_visitor_client_id: visitorUuid,
            p_auth_user_id: authId,
          });
        }

        if (authId) {
          await supabase
            .from("profiles")
            .update({
              zip_code: zip,
              city: c,
              country: countryLabel,
              country_code: countryCode,
              updated_at: new Date().toISOString(),
            })
            .eq("id", authId);
        }

        void data;
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("diary.registration_unknown_error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] overflow-y-auto bg-black/65 px-3 py-4 sm:px-4 sm:py-6"
      onClick={onClose}
      role="presentation"
    >
      <div className="flex min-h-full items-start justify-center sm:items-center">
        <div
          className="my-auto w-full max-w-[360px] rounded-xl border border-gray-200 bg-white p-4 shadow-xl sm:p-5"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={t("diary.registration_title")}
        >
          <div className="flex items-start gap-3">
            <div className="flex w-[105px] shrink-0 items-end justify-start self-start text-right">
              <TravelDiaryPreviewFlipbook
                variant="miniature"
                showHint={false}
                expoId={expoId}
                visitorFirstName={firstName}
                visitorLastName={lastName}
                className="shrink-0"
              />
            </div>
            <div className="flex w-[200px] shrink-0 flex-col self-start">
              <p className="w-full text-sm leading-[19px] text-neutral-600">
                <span className="font-bold">{t("diary.registration_desc_line1")}</span>
                <br />
                {t("diary.registration_desc_line2")}
              </p>
              {!isAuthenticated ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 h-[49px] w-full whitespace-normal border-2 border-neutral-400 bg-white px-2 py-1 text-sm font-bold leading-[23px] text-neutral-900 !shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_4px_14px_rgba(0,0,0,0.2)] hover:bg-neutral-50 hover:!shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_6px_18px_rgba(0,0,0,0.24)]"
                  disabled={googleLoading || submitting}
                  onClick={() => void handleGoogleSignIn()}
                >
                  {googleLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      {t("diary.registration_google_loading")}
                    </span>
                  ) : (
                    <span className="flex w-full flex-col items-center">
                      <span className="flex items-center gap-2">
                        <GoogleLogoIcon className="h-4 w-4 shrink-0" />
                        {t("diary.registration_google_line1")}
                      </span>
                      <span>{t("diary.registration_google_line2")}</span>
                    </span>
                  )}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="diary-first-name" className={FIELD_LABEL_CLASS}>
                {t("diary.field_first_name")} {REQUIRED_MARK}
              </Label>
              <Input
                id="diary-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 text-neutral-900"
                autoComplete="given-name"
              />
            </div>
            <div>
              <Label htmlFor="diary-last-name" className={FIELD_LABEL_CLASS}>
                {t("diary.field_last_name")} {REQUIRED_MARK}
              </Label>
              <Input
                id="diary-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 text-neutral-900"
                autoComplete="family-name"
              />
            </div>
            <div>
              <Label htmlFor="diary-email" className={FIELD_LABEL_CLASS}>
                {t("diary.field_email")} {REQUIRED_MARK}
              </Label>
              <Input
                id="diary-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 text-neutral-900"
                autoComplete="email"
                disabled={isAuthenticated && Boolean(initialEmail)}
              />
            </div>
            {!isAuthenticated ? (
              <>
                <div>
                  <Label htmlFor="diary-password" className={FIELD_LABEL_CLASS}>
                    {t("diary.field_password")} {REQUIRED_MARK}
                  </Label>
                  <Input
                    id="diary-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 text-neutral-900"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <Label htmlFor="diary-password-confirm" className={FIELD_LABEL_CLASS}>
                    {t("diary.field_password_confirm")} {REQUIRED_MARK}
                  </Label>
                  <Input
                    id="diary-password-confirm"
                    type="password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    className="mt-1 text-neutral-900"
                    autoComplete="new-password"
                  />
                </div>
              </>
            ) : null}
            <div className="space-y-1">
              <div className="flex items-end gap-2">
                <Label htmlFor="diary-country" className={`${FIELD_LABEL_CLASS} w-[46px] shrink-0`}>
                  {t("diary.field_country")} {REQUIRED_MARK}
                </Label>
                <Label htmlFor="diary-zip" className={`${FIELD_LABEL_CLASS} w-[88px] shrink-0`}>
                  {t("diary.field_zip")} {REQUIRED_MARK}
                </Label>
                <Label htmlFor="diary-city" className={`${FIELD_LABEL_CLASS} w-[180px] shrink-0`}>
                  {t("diary.field_city")} {REQUIRED_MARK}
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-[46px] shrink-0">
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger
                      id="diary-country"
                      aria-label={country || t("diary.field_country")}
                      className="mt-0 h-9 w-full justify-center px-1 text-neutral-900 [&>svg]:hidden"
                    >
                      <CountryFlagIcon iso={getCountryOption(country)?.iso} className="mx-auto" />
                    </SelectTrigger>
                    <SelectContent className="z-[140] max-h-72">
                      {COUNTRY_OPTIONS.map((option) => (
                        <SelectItem key={option.label} value={option.label} textValue={option.label}>
                          <span className="flex items-center gap-2">
                            <CountryFlagIcon iso={option.iso} />
                            <span>{option.label}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-[88px] shrink-0">
                  <Input
                    id="diary-zip"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    placeholder={postalPlaceholder}
                    className="mt-0 w-full items-start justify-start px-1 text-neutral-900"
                    autoComplete="postal-code"
                  />
                </div>
                <div className="w-[180px] shrink-0">
                  <Input
                    id="diary-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="mt-0 w-full text-neutral-900"
                    autoComplete="address-level2"
                  />
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <p className="mt-3 text-xs text-[#E63946]" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col gap-2">
            <Button
              type="button"
              className="w-full gradient-gold gradient-gold-hover-bg text-primary-foreground"
              onClick={() => void handleSubmit()}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("diary.registration_submit")}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={onClose} disabled={submitting}>
              {t("btn_close")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
