import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Camera,
  Check,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Upload,
  UserCircle2,
  X,
} from "lucide-react";
import imageCompression from "browser-image-compression";

import { supabase } from "@/lib/supabase";
import { useAuthUser } from "@/hooks/useAuthUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PASSWORD_MIN_LENGTH = 8;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const TARGET_COMPRESSED_MB = 0.48; // ~500 KB
const USERNAME_DEBOUNCE_MS = 500;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

const BIRTH_YEARS = Array.from({ length: 2010 - 1920 + 1 }, (_, i) => 2010 - i);

// ---------------------------------------------------------------------------
// Password strength
// ---------------------------------------------------------------------------

type StrengthScore = 0 | 1 | 2 | 3 | 4;

function getPasswordStrength(pw: string): { score: StrengthScore; label: string; colorClass: string } {
  if (!pw) return { score: 0, label: "", colorClass: "bg-border" };
  let n = 0;
  if (pw.length >= 8) n++;
  if (pw.length >= 12) n++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) n++;
  if (/[0-9]/.test(pw)) n++;
  if (/[^A-Za-z0-9]/.test(pw)) n++;
  const score = Math.min(n, 4) as StrengthScore;
  const map: Record<StrengthScore, { label: string; colorClass: string }> = {
    0: { label: "Tres faible", colorClass: "bg-red-600" },
    1: { label: "Faible", colorClass: "bg-red-400" },
    2: { label: "Moyen", colorClass: "bg-yellow-400" },
    3: { label: "Bon", colorClass: "bg-emerald-400" },
    4: { label: "Fort", colorClass: "bg-emerald-600" },
  };
  return { score, ...map[score] };
}

// ---------------------------------------------------------------------------
// Auth error helpers
// ---------------------------------------------------------------------------

function isDuplicateEmail(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("already registered") ||
    m.includes("user already") ||
    m.includes("email_exists") ||
    m.includes("already been registered")
  );
}

function formatAuthError(msg: string): string {
  if (isDuplicateEmail(msg)) return "Cette adresse e-mail est deja utilisee.";
  if (msg.toLowerCase().includes("password")) {
    return `Mot de passe trop court (minimum ${PASSWORD_MIN_LENGTH} caracteres).`;
  }
  return msg;
}

// ---------------------------------------------------------------------------
// Image compression helper
// ---------------------------------------------------------------------------

async function compressBlob(blob: Blob): Promise<Blob> {
  if (blob.size <= TARGET_COMPRESSED_MB * 1024 * 1024) return blob;
  try {
    const file = new File([blob], "avatar.webp", { type: "image/webp" });
    return await imageCompression(file, {
      maxSizeMB: TARGET_COMPRESSED_MB,
      maxWidthOrHeight: 800,
      useWebWorker: true,
      fileType: "image/webp",
      initialQuality: 0.82,
    });
  } catch {
    return blob;
  }
}

// ---------------------------------------------------------------------------
// Webcam mode
// ---------------------------------------------------------------------------

type WebcamMode = "idle" | "requesting" | "active" | "captured" | "denied";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const RegisterSaaS = () => {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuthUser();

  // -- Account fields --
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // -- Profile fields --
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [birthYear, setBirthYear] = useState("");

  // -- Avatar --
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // -- Webcam --
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [webcamMode, setWebcamMode] = useState<WebcamMode>("idle");
  const [webcamError, setWebcamError] = useState<string | null>(null);

  // -- Username availability --
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  // -- Field-level errors --
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [lastNameError, setLastNameError] = useState<string | null>(null);

  // -- Submission --
  const [submitting, setSubmitting] = useState(false);

  // -- Derived --
  const emailValid = /\S+@\S+\.\S+/.test(email.trim());
  const passwordValid = password.length >= PASSWORD_MIN_LENGTH;
  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const passwordStrength = getPasswordStrength(password);
  const usernameBlocked = usernameAvailable === false && username.trim().length >= 3;

  // Redirect already-authenticated users
  if (!authLoading && session) {
    return <Navigate to="/dashboard" replace />;
  }

  // ---------------------------------------------------------------------------
  // Username check
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const trimmed = username.trim();
    if (trimmed.length < 3) {
      setUsernameAvailable(null);
      return;
    }
    setUsernameChecking(true);
    setUsernameAvailable(null);
    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", trimmed)
          .maybeSingle();
        setUsernameAvailable(data === null);
      } catch {
        setUsernameAvailable(null);
      } finally {
        setUsernameChecking(false);
      }
    }, USERNAME_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [username]);

  // ---------------------------------------------------------------------------
  // Webcam
  // ---------------------------------------------------------------------------

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startWebcam = useCallback(async () => {
    setWebcamMode("requesting");
    setWebcamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      setWebcamMode("active");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch (err) {
      stopStream();
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Acces camera refuse. Autorisez la camera dans les parametres du navigateur."
          : "Camera non disponible sur cet appareil.";
      setWebcamError(msg);
      setWebcamMode("denied");
    }
  }, [stopStream]);

  const captureSnapshot = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        void (async () => {
          const compressed = await compressBlob(blob);
          if (avatarPreview) URL.revokeObjectURL(avatarPreview);
          setAvatarPreview(URL.createObjectURL(compressed));
          setAvatarBlob(compressed);
          setWebcamMode("captured");
          stopStream();
        })();
      },
      "image/webp",
      0.88,
    );
  }, [avatarPreview, stopStream]);

  const retakePhoto = useCallback(() => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(null);
    setAvatarBlob(null);
    setWebcamMode("idle");
  }, [avatarPreview]);

  const validateCapture = useCallback(() => {
    setWebcamMode("idle");
  }, []);

  const cancelWebcam = useCallback(() => {
    stopStream();
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(null);
    setAvatarBlob(null);
    setWebcamMode("idle");
  }, [avatarPreview, stopStream]);

  // Cleanup on unmount
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  // ---------------------------------------------------------------------------
  // File upload
  // ---------------------------------------------------------------------------

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
      toast.error("Format non accepte. Utilisez JPEG, PNG ou WebP.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("Fichier trop lourd (max 2 Mo avant compression).");
      e.target.value = "";
      return;
    }
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: TARGET_COMPRESSED_MB,
        maxWidthOrHeight: 800,
        useWebWorker: true,
        fileType: "image/webp",
        initialQuality: 0.82,
      });
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(URL.createObjectURL(compressed));
      setAvatarBlob(compressed);
      setWebcamMode("captured");
    } catch {
      toast.error("Compression impossible. Essayez une autre image.");
    }
    e.target.value = "";
  };

  // ---------------------------------------------------------------------------
  // Form validation
  // ---------------------------------------------------------------------------

  const validate = (): boolean => {
    let ok = true;
    setEmailError(null);
    setPasswordError(null);
    setConfirmError(null);
    setFirstNameError(null);
    setLastNameError(null);

    if (!emailValid) { setEmailError("Adresse e-mail invalide."); ok = false; }
    if (!passwordValid) { setPasswordError(`Minimum ${PASSWORD_MIN_LENGTH} caracteres.`); ok = false; }
    if (!passwordsMatch) { setConfirmError("Les mots de passe ne correspondent pas."); ok = false; }
    if (!firstName.trim()) { setFirstNameError("Le prenom est obligatoire."); ok = false; }
    if (!lastName.trim()) { setLastNameError("Le nom est obligatoire."); ok = false; }
    return ok;
  };

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const metadata: Record<string, unknown> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        language: "fr",
        timezone,
      };
      if (username.trim()) metadata.username = username.trim().toLowerCase();
      if (phone.trim()) metadata.phone = phone.trim();
      if (birthYear) metadata.birth_year = parseInt(birthYear, 10);

      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: metadata },
      });

      if (error) {
        if (isDuplicateEmail(error.message)) {
          setEmailError("Cette adresse e-mail est deja utilisee.");
        } else {
          toast.error(formatAuthError(error.message));
        }
        return;
      }

      const user = data.user;

      // Upload avatar after account creation (needs user.id)
      if (avatarBlob && user) {
        try {
          const path = `${user.id}/avatar.webp`;
          const { error: uploadErr } = await supabase.storage
            .from("selfies")
            .upload(path, avatarBlob, { contentType: "image/webp", upsert: true });

          if (!uploadErr) {
            const { data: { publicUrl } } = supabase.storage.from("selfies").getPublicUrl(path);
            await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
          } else {
            console.warn("[RegisterSaaS] avatar upload:", uploadErr.message);
            toast.error("Photo non enregistree, vous pourrez la modifier plus tard.");
          }
        } catch {
          // Non-blocking — account is already created
        }
      }

      if (!data.session) {
        toast.success("Compte cree ! Verifiez vos e-mails pour activer votre compte.");
        navigate("/login", { replace: true });
      } else {
        toast.success("Bienvenue !");
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Inscription impossible.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isWebcamOpen = webcamMode === "active" || webcamMode === "requesting";
  const hasCaptured = webcamMode === "captured" || (webcamMode === "idle" && avatarPreview);

  return (
    <div className="flex w-full flex-1 flex-col items-center px-4 pb-16 pt-8">
      {/* Page header */}
      <div className="mb-8 text-center">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">
          Creer votre compte
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Deja inscrit ?{" "}
          <Link
            to="/login"
            className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
          >
            Se connecter
          </Link>
        </p>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
        className="w-full max-w-3xl"
        aria-label="Formulaire d'inscription"
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* ================================================================ */}
          {/* LEFT COLUMN — Account + Profile                                   */}
          {/* ================================================================ */}
          <div className="space-y-5">

            {/* --- Section: Connexion --- */}
            <section
              aria-labelledby="section-connexion"
              className="rounded-xl border border-border/60 bg-card/60 p-5"
            >
              <h2
                id="section-connexion"
                className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
              >
                Connexion
              </h2>
              <div className="space-y-4">

                {/* Email */}
                <div className="space-y-1.5">
                  <Label htmlFor="reg-email">
                    E-mail <span className="text-destructive" aria-hidden>*</span>
                  </Label>
                  <Input
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                    placeholder="vous@exemple.com"
                    aria-required="true"
                    aria-invalid={emailError ? "true" : "false"}
                    aria-describedby={emailError ? "reg-email-err" : undefined}
                    disabled={submitting}
                    className={emailError ? "border-destructive" : ""}
                  />
                  {emailError && (
                    <p id="reg-email-err" className="text-xs text-destructive" role="alert">
                      {emailError}
                    </p>
                  )}
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <Label htmlFor="reg-password">
                    Mot de passe <span className="text-destructive" aria-hidden>*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="reg-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }}
                      placeholder={`Minimum ${PASSWORD_MIN_LENGTH} caracteres`}
                      className={`pr-10 ${passwordError ? "border-destructive" : ""}`}
                      aria-required="true"
                      aria-invalid={passwordError ? "true" : "false"}
                      aria-describedby="reg-password-strength"
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-1 flex items-center px-2 text-muted-foreground focus:outline-none focus:ring-0"
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Strength bar */}
                  {password.length > 0 && (
                    <div id="reg-password-strength" aria-live="polite">
                      <div className="flex gap-1">
                        {([1, 2, 3, 4] as const).map((s) => (
                          <div
                            key={s}
                            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                              passwordStrength.score >= s
                                ? passwordStrength.colorClass
                                : "bg-border"
                            }`}
                          />
                        ))}
                      </div>
                      <p
                        className={`mt-1 text-[11px] ${
                          passwordStrength.score >= 3 ? "text-emerald-500" : "text-muted-foreground"
                        }`}
                      >
                        {passwordStrength.label}
                      </p>
                    </div>
                  )}
                  {passwordError && (
                    <p className="text-xs text-destructive" role="alert">{passwordError}</p>
                  )}
                </div>

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <Label htmlFor="reg-confirm">
                    Confirmation <span className="text-destructive" aria-hidden>*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="reg-confirm"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setConfirmError(null); }}
                      placeholder="Repetez le mot de passe"
                      className={`pr-16 ${confirmError ? "border-destructive" : ""}`}
                      aria-required="true"
                      aria-invalid={confirmError ? "true" : "false"}
                      disabled={submitting}
                    />
                    {confirmPassword.length > 0 && (
                      <span className="absolute inset-y-0 right-8 flex items-center">
                        {passwordsMatch ? (
                          <Check
                            className="h-4 w-4 text-emerald-500"
                            aria-label="Mots de passe identiques"
                          />
                        ) : (
                          <X
                            className="h-4 w-4 text-destructive"
                            aria-label="Mots de passe differents"
                          />
                        )}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-1 flex items-center px-2 text-muted-foreground focus:outline-none focus:ring-0"
                      aria-label={showPassword ? "Masquer" : "Afficher"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirmError && (
                    <p className="text-xs text-destructive" role="alert">{confirmError}</p>
                  )}
                </div>
              </div>
            </section>

            {/* --- Section: Identite --- */}
            <section
              aria-labelledby="section-identite"
              className="rounded-xl border border-border/60 bg-card/60 p-5"
            >
              <h2
                id="section-identite"
                className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
              >
                Identite
              </h2>
              <div className="space-y-4">

                {/* First name + Last name */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-firstname">
                      Prenom <span className="text-destructive" aria-hidden>*</span>
                    </Label>
                    <Input
                      id="reg-firstname"
                      type="text"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(e) => { setFirstName(e.target.value); setFirstNameError(null); }}
                      placeholder="Jean"
                      aria-required="true"
                      aria-invalid={firstNameError ? "true" : "false"}
                      disabled={submitting}
                      className={firstNameError ? "border-destructive" : ""}
                    />
                    {firstNameError && (
                      <p className="text-xs text-destructive" role="alert">{firstNameError}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-lastname">
                      Nom <span className="text-destructive" aria-hidden>*</span>
                    </Label>
                    <Input
                      id="reg-lastname"
                      type="text"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(e) => { setLastName(e.target.value); setLastNameError(null); }}
                      placeholder="Dupont"
                      aria-required="true"
                      aria-invalid={lastNameError ? "true" : "false"}
                      disabled={submitting}
                      className={lastNameError ? "border-destructive" : ""}
                    />
                    {lastNameError && (
                      <p className="text-xs text-destructive" role="alert">{lastNameError}</p>
                    )}
                  </div>
                </div>

                {/* Username */}
                <div className="space-y-1.5">
                  <Label htmlFor="reg-username">
                    Pseudo{" "}
                    <span className="text-[11px] font-normal text-muted-foreground">(optionnel)</span>
                  </Label>
                  <div className="relative">
                    <span
                      className="absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground select-none"
                      aria-hidden
                    >
                      @
                    </span>
                    <Input
                      id="reg-username"
                      type="text"
                      autoComplete="username"
                      value={username}
                      onChange={(e) =>
                        setUsername(e.target.value.replace(/\s/g, "").toLowerCase())
                      }
                      placeholder="monpseudo"
                      className="pl-7 pr-8"
                      disabled={submitting}
                    />
                    {username.trim().length >= 3 && (
                      <span className="absolute inset-y-0 right-2.5 flex items-center">
                        {usernameChecking ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                            aria-label="Verification en cours"
                          />
                        ) : usernameAvailable === true ? (
                          <Check className="h-4 w-4 text-emerald-500" aria-label="Pseudo disponible" />
                        ) : usernameAvailable === false ? (
                          <X className="h-4 w-4 text-destructive" aria-label="Pseudo deja pris" />
                        ) : null}
                      </span>
                    )}
                  </div>
                  {usernameBlocked && (
                    <p className="text-xs text-destructive" role="alert">
                      Ce pseudo est deja utilise.
                    </p>
                  )}
                  {usernameAvailable === true && username.trim().length >= 3 && (
                    <p className="text-xs text-emerald-500" aria-live="polite">
                      Pseudo disponible !
                    </p>
                  )}
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <Label htmlFor="reg-phone">
                    Telephone{" "}
                    <span className="text-[11px] font-normal text-muted-foreground">(optionnel)</span>
                  </Label>
                  <Input
                    id="reg-phone"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+33 6 12 34 56 78"
                    disabled={submitting}
                  />
                </div>

                {/* Birth year */}
                <div className="space-y-1.5">
                  <Label htmlFor="reg-birthyear">
                    Annee de naissance{" "}
                    <span className="text-[11px] font-normal text-muted-foreground">(optionnel)</span>
                  </Label>
                  <Select value={birthYear} onValueChange={setBirthYear} disabled={submitting}>
                    <SelectTrigger id="reg-birthyear">
                      <SelectValue placeholder="Selectionnez une annee" />
                    </SelectTrigger>
                    <SelectContent className="max-h-52">
                      {BIRTH_YEARS.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>
          </div>

          {/* ================================================================ */}
          {/* RIGHT COLUMN — Avatar / Selfie                                   */}
          {/* ================================================================ */}
          <section
            aria-labelledby="section-avatar"
            className="flex flex-col"
          >
            <div className="flex flex-1 flex-col rounded-xl border border-border/60 bg-card/60 p-5">
              <h2
                id="section-avatar"
                className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
              >
                Photo de profil{" "}
                <span className="text-muted-foreground/60 normal-case tracking-normal">(optionnel)</span>
              </h2>

              {/* Circular avatar preview */}
              <div className="mb-5 flex justify-center">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Apercu de votre photo de profil"
                    className="h-28 w-28 rounded-full object-cover ring-2 ring-primary/40 ring-offset-2 ring-offset-background transition-all"
                  />
                ) : (
                  <div
                    className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-dashed border-border/50 bg-muted/20"
                    aria-label="Aucune photo selectionnee"
                  >
                    <UserCircle2 className="h-14 w-14 text-muted-foreground/30" aria-hidden />
                  </div>
                )}
              </div>

              {/* Webcam live stream */}
              {isWebcamOpen && (
                <div className="relative mb-3 overflow-hidden rounded-lg bg-black aspect-video">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                    aria-label="Flux webcam en direct"
                  />
                  {webcamMode === "requesting" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70">
                      <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden />
                      <p className="text-xs text-white/70">Acces a la camera...</p>
                    </div>
                  )}
                </div>
              )}

              {/* Hidden canvas for capture */}
              <canvas ref={canvasRef} className="hidden" aria-hidden />

              {/* Error message */}
              {webcamMode === "denied" && webcamError && (
                <div
                  className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                  role="alert"
                >
                  {webcamError}
                </div>
              )}

              {/* Action buttons */}
              <div className="mt-auto space-y-2.5">
                {!isWebcamOpen && !hasCaptured && (
                  <>
                    {/* Webcam button — desktop only */}
                    <Button
                      type="button"
                      variant="outline"
                      className="hidden w-full gap-2 sm:flex"
                      onClick={() => void startWebcam()}
                      disabled={submitting}
                    >
                      <Camera className="h-4 w-4" aria-hidden />
                      Prendre un selfie
                    </Button>

                    {/* File / native camera */}
                    <label
                      htmlFor="reg-avatar-file"
                      className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring ${
                        submitting ? "pointer-events-none opacity-50" : ""
                      }`}
                    >
                      <Upload className="h-4 w-4" aria-hidden />
                      <span className="hidden sm:inline">Choisir une photo</span>
                      <span className="sm:hidden">Prendre ou choisir une photo</span>
                    </label>
                    <input
                      id="reg-avatar-file"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="user"
                      className="sr-only"
                      onChange={(e) => void handleFileSelect(e)}
                      disabled={submitting}
                      aria-label="Choisir une photo de profil"
                    />

                    <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                      JPEG, PNG ou WebP · max 2 Mo
                      <br />
                      Compresse automatiquement a ~500 Ko
                    </p>
                  </>
                )}

                {/* Webcam active — capture button */}
                {webcamMode === "active" && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      className="flex-1 gap-2 gradient-gold gradient-gold-hover-bg text-primary-foreground"
                      onClick={captureSnapshot}
                      disabled={submitting}
                    >
                      <Camera className="h-4 w-4" aria-hidden />
                      Capturer
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="aspect-square px-2"
                      onClick={cancelWebcam}
                      disabled={submitting}
                      aria-label="Annuler la webcam"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Photo captured — validate or retake */}
                {hasCaptured && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={retakePhoto}
                      disabled={submitting}
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden />
                      Reprendre
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 gap-2 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                      onClick={validateCapture}
                      disabled={submitting}
                    >
                      <Check className="h-4 w-4" aria-hidden />
                      Valide
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* ================================================================ */}
        {/* Submit                                                            */}
        {/* ================================================================ */}
        <div className="mt-7 flex flex-col items-center gap-3">
          <Button
            type="submit"
            size="lg"
            className="w-full max-w-sm gradient-gold gradient-gold-hover-bg text-primary-foreground"
            disabled={submitting || usernameBlocked}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Creation en cours...
              </>
            ) : (
              "Creer mon compte"
            )}
          </Button>

          <p className="text-xs text-muted-foreground">
            Les champs marques <span className="text-destructive">*</span> sont obligatoires.
          </p>

          <p className="text-sm text-muted-foreground">
            Deja inscrit ?{" "}
            <Link
              to="/login"
              className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Se connecter
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
};

export default RegisterSaaS;
