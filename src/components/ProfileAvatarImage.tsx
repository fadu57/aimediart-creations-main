import { useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { createSignedAvatarUrl, resolveAvatarDisplayUrl } from "@/lib/supabaseStorage";

type ProfileAvatarImageProps = {
  src: string | null | undefined;
  previewUrl?: string;
  className?: string;
  iconClassName?: string;
  alt?: string;
};

/** Affiche un avatar profil avec repli URL signée si le bucket n'est pas public. */
export function ProfileAvatarImage({
  src,
  previewUrl = "",
  className,
  iconClassName,
  alt = "",
}: ProfileAvatarImageProps) {
  const [displayUrl, setDisplayUrl] = useState("");
  const signedTriedRef = useRef(false);

  useEffect(() => {
    signedTriedRef.current = false;
    if (previewUrl) {
      setDisplayUrl(previewUrl);
      return;
    }
    setDisplayUrl(resolveAvatarDisplayUrl(src));
  }, [src, previewUrl]);

  const handleError = () => {
    if (signedTriedRef.current || previewUrl) return;
    signedTriedRef.current = true;
    void createSignedAvatarUrl(src).then((signed) => {
      if (signed) setDisplayUrl(signed);
    });
  };

  if (!displayUrl) {
    return <UserRound className={cn("text-muted-foreground", iconClassName)} aria-hidden />;
  }

  return (
    <img
      src={displayUrl}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={handleError}
    />
  );
}
