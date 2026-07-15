import QRCode from "qrcode";
import { buildArtworkGroupQrUrl } from "@/lib/oeuvrePublicUrl";
import { QR_CODE_STORAGE_OPTIONS } from "@/lib/qrCodeScanFriendly";
import { fetchQrPublicSiteOriginFromSettings } from "@/lib/qrPublicSiteOrigin";
import { supabase } from "@/lib/supabase";

/** Génère et persiste le QR PNG d'un regroupement d'œuvres. */
export async function generateAndSaveArtworkGroupQrCode(
  groupId: string,
  expoId?: string | null,
): Promise<string | null> {
  const originOverride = await fetchQrPublicSiteOriginFromSettings();
  const targetUrl = buildArtworkGroupQrUrl(groupId, originOverride, expoId);
  if (!targetUrl) return null;

  const dataUrl = await QRCode.toDataURL(targetUrl, QR_CODE_STORAGE_OPTIONS);
  const blob = await (await fetch(dataUrl)).blob();
  const path = `qrcodes/groups/${groupId}.png`;

  const { error: uploadError } = await supabase.storage.from("qrcode").upload(path, blob, {
    contentType: "image/png",
    cacheControl: "3600",
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data: pub } = supabase.storage.from("qrcode").getPublicUrl(path);
  const publicUrl = pub.publicUrl;
  const { error: updateError } = await supabase
    .from("artwork_groups")
    .update({ group_qr_code_url: publicUrl, group_qrcode_image: publicUrl })
    .eq("id", groupId);
  if (updateError) throw updateError;
  return publicUrl;
}
