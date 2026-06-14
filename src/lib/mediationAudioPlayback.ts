/** Une seule lecture médiation (AudioPlayer) à la fois sur la page. */

let activeStop: (() => void) | null = null;

/** Interrompt la lecture en cours, quelle que soit l’instance AudioPlayer. */
export function interruptMediationAudioPlayback(): void {
  activeStop?.();
  activeStop = null;
}

/** Enregistre l’instance qui lit ; interrompt les autres si besoin. */
export function claimMediationAudioPlayback(onStop: () => void): void {
  if (activeStop && activeStop !== onStop) {
    activeStop();
  }
  activeStop = onStop;
}

export function releaseMediationAudioPlayback(onStop: () => void): void {
  if (activeStop === onStop) {
    activeStop = null;
  }
}
