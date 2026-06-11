import type { ReactNode } from "react";

import { AudioBanOverlay } from "@/components/visitor/AudioBanOverlay";
import { IndoorAudioOnboardingModal } from "@/components/visitor/IndoorAudioOnboardingModal";
import { IndoorAudioGuardProvider, useIndoorAudioGuard } from "@/hooks/useIndoorAudioGuard";

type VisitorIndoorAudioGuardProps = {
  expoId: string;
  artworkId?: string;
  artworkTitle?: string;
  children: ReactNode;
};

function VisitorIndoorAudioGuardUI({ children }: { children: ReactNode }) {
  const guard = useIndoorAudioGuard();

  return (
    <>
      {children}
      <IndoorAudioOnboardingModal
        open={guard.showOnboarding && !guard.isBanned}
        onAccept={guard.acceptConsent}
      />
      <AudioBanOverlay open={guard.isBanned} />
    </>
  );
}

/** Provider + modales audio intérieur pour le parcours visiteur. */
export function VisitorIndoorAudioGuard({
  expoId,
  artworkId,
  artworkTitle,
  children,
}: VisitorIndoorAudioGuardProps) {
  return (
    <IndoorAudioGuardProvider expoId={expoId} artworkId={artworkId} artworkTitle={artworkTitle}>
      <VisitorIndoorAudioGuardUI>{children}</VisitorIndoorAudioGuardUI>
    </IndoorAudioGuardProvider>
  );
}
