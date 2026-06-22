import { useEffect, useState } from "react";

/** Smartphone / tablette tactile : afficher le bouton « Photographier » en plus de l'import fichier. */
export function useMobileCameraDevice(): boolean {
  const [isMobileCamera, setIsMobileCamera] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px), (pointer: coarse)");
    const update = () => {
      const touch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
      setIsMobileCamera(mq.matches && touch);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobileCamera;
}
