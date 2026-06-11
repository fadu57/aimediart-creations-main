/**
 * Détection des sorties audio externes (écouteurs filaires / Bluetooth) via Web API.
 * Équivalent navigateur des événements de branchement matériel natifs.
 */

export type HeadphoneCheckResult = {
  /** True si une sortie externe (écouteurs) semble active. */
  hasExternalOutput: boolean;
  /** True si le navigateur n'expose pas assez d'infos (labels vides sans permission). */
  uncertain: boolean;
  outputs: MediaDeviceInfo[];
};

const HEADPHONE_LABEL_RE =
  /headphone|headset|écouteur|earphone|airpod|bluetooth|wired|usb|casque/i;

function isLikelyHeadphoneLabel(label: string): boolean {
  return HEADPHONE_LABEL_RE.test(label);
}

/** Inspecte les périphériques audio de sortie via enumerateDevices(). */
export async function checkHeadphones(): Promise<HeadphoneCheckResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return { hasExternalOutput: false, uncertain: true, outputs: [] };
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((d) => d.kind === "audiooutput");

    if (outputs.length === 0) {
      return { hasExternalOutput: false, uncertain: true, outputs };
    }

    const labeledHeadphones = outputs.some((d) => d.label && isLikelyHeadphoneLabel(d.label));
    if (labeledHeadphones) {
      return { hasExternalOutput: true, uncertain: false, outputs };
    }

    // Chrome / Android : plusieurs sorties quand des écouteurs sont branchés.
    if (outputs.length > 1) {
      return { hasExternalOutput: true, uncertain: false, outputs };
    }

    const uncertain = outputs.every((d) => !d.label.trim());
    return { hasExternalOutput: false, uncertain, outputs };
  } catch {
    return { hasExternalOutput: false, uncertain: true, outputs: [] };
  }
}

export type DeviceChangeUnsubscribe = () => void;

/**
 * Écoute les branchements / débranchements (équivalent BroadcastReceiver Web).
 * Retourne une fonction de désabonnement.
 */
export function subscribeAudioDeviceChanges(
  onChange: (result: HeadphoneCheckResult) => void,
): DeviceChangeUnsubscribe {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return () => undefined;
  }

  const handler = () => {
    void checkHeadphones().then(onChange);
  };

  navigator.mediaDevices.addEventListener("devicechange", handler);
  void checkHeadphones().then(onChange);

  return () => {
    navigator.mediaDevices.removeEventListener("devicechange", handler);
  };
}

/**
 * Demande l'accès micro (optionnel) pour débloquer les labels de périphériques
 * sur Safari / Chrome mobile — améliore la détection sans enregistrer.
 */
export async function requestDeviceLabelsPermission(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* refus utilisateur — on continue en mode incertain */
  }
}
