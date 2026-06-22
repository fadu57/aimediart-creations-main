import { Camera, Loader2, Upload } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useMobileCameraDevice } from "@/hooks/useMobileCameraDevice";
import { cn } from "@/lib/utils";

type PhotoCaptureFieldProps = {
  imageUrl: string;
  uploading: boolean;
  disabled?: boolean;
  onFileSelected: (file: File) => void;
};

const overlayButtonClass =
  "h-9 gap-1.5 border border-white/70 bg-white/55 px-3 text-xs font-semibold text-foreground shadow-sm backdrop-blur-[2px] transition-colors hover:border-[#E63946] hover:bg-[#E63946] hover:text-white";

export function PhotoCaptureField({
  imageUrl,
  uploading,
  disabled = false,
  onFileSelected,
}: PhotoCaptureFieldProps) {
  const { t } = useTranslation("artwork_modal");
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const showCameraButton = useMobileCameraDevice();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
    e.target.value = "";
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <div
        className={cn(
          "group relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-xl border border-border/60 bg-muted/30 sm:max-w-[220px]",
          !imageUrl && "border-dashed",
        )}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={t("img_alt")} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground">
            <Upload className="h-8 w-8 opacity-60" aria-hidden />
            <p className="text-xs">Photo obligatoire</p>
          </div>
        )}

        {uploading ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
            <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden />
          </div>
        ) : (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/0 p-3 transition-colors group-hover:bg-black/10">
            <div
              className={cn(
                "flex w-full max-w-[200px] flex-col items-stretch gap-2",
                showCameraButton ? "sm:max-w-none sm:flex-row sm:justify-center" : "items-center",
              )}
            >
              <Button
                type="button"
                variant="outline"
                className={cn(overlayButtonClass, showCameraButton ? "flex-1" : "w-full max-w-[180px]")}
                disabled={disabled || uploading}
                onClick={() => uploadInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 shrink-0" aria-hidden />
                {showCameraButton ? "Importer" : "Changer la photo"}
              </Button>
              {showCameraButton ? (
                <Button
                  type="button"
                  variant="outline"
                  className={cn(overlayButtonClass, "flex-1")}
                  disabled={disabled || uploading}
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="h-4 w-4 shrink-0" aria-hidden />
                  Photographier
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
      {showCameraButton ? (
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleChange}
        />
      ) : null}
    </div>
  );
}
