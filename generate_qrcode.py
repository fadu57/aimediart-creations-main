import qrcode
import qrcode.image.svg
import qrcode.image.pil
import os

def generate_qr_code(data: str, filename: str, file_format: str = 'png'):
    """
    Génère un QR code avec des paramètres spécifiques pour une meilleure lisibilité.

    Args:
        data (str): L'URL ou le texte à encoder dans le QR code.
        filename (str): Le nom du fichier de sortie (sans extension).
        file_format (str): Le format du fichier de sortie ('png' ou 'svg').
                           Par défaut, c'est 'png'.
    """
    # Vérifie si l'URL est potentiellement trop longue pour un QR code simple.
    # Il n'y a pas de limite stricte, mais des URL très longues peuvent rendre le QR code dense.
    if len(data) > 70: # Une URL de plus de 70 caractères est considérée comme longue à titre indicatif
        print("\n--- Suggestion ---")
        print("L'URL semble assez longue. Pour une meilleure lisibilité du QR code,")
        print("envisagez d'utiliser un raccourcisseur de lien (comme Bitly, TinyURL, etc.) ici avant de générer le QR code.")
        print("-------------------\n")

    # Utilise le niveau de correction d'erreur M (environ 15% des données peuvent être restaurées)
    # et une bordure de 4 modules pour une zone de silence claire.
    qr = qrcode.QRCode(
        version=1, # Version minimale, s'adaptera si les données sont plus grandes
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10, # Taille de chaque "boîte" ou module du QR code
        border=4,    # Largeur de la bordure (zone de silence)
    )

    qr.add_data(data)
    qr.make(fit=True)

    if file_format.lower() == 'svg':
        # Crée une image SVG
        img = qr.make_image(image_factory=qrcode.image.svg.SvgImage)
        output_path = f"{filename}.svg"
    else:
        # Crée une image PNG (format par défaut)
        img = qr.make_image(image_factory=qrcode.image.pil.PilImage)
        output_path = f"{filename}.png"

    img.save(output_path)
    print(f"QR code généré avec succès : {output_path}")

# --- Exemple d'utilisation ---
if __name__ == "__main__":
    site_url = "https://www.aimediart.com/"

    # Générer un QR code PNG pour le site
    print("Génération d'un QR code PNG pour le site AI-MEDIArt.com...")
    generate_qr_code(site_url, "qrcode_aimediart", "png")

    # Générer un QR code SVG pour le site
    print("Génération d'un QR code SVG pour le site AI-MEDIArt.com...")
    generate_qr_code(site_url, "qrcode_aimediart_svg", "svg")

    # Pour une URL qui pourrait être longue, je réutilise la même logique mais avec l'URL du site
    # afin de démontrer que la suggestion de raccourcisseur de lien s'activera si la longueur dépasse le seuil défini.
    # Note: L'URL de votre site est courte, donc la suggestion ne s'activera pas ici,
    # mais le code est prêt si vous aviez une URL plus complexe pour AI-MEDIArt.com.
    print("\nGénération d'un QR code PNG pour une URL potentiellement longue de AI-MEDIArt.com...")
    generate_qr_code(site_url + "/quelque/chose/d/assez/long/pour/declencher/la/suggestion/de/raccourcisseur/de/lien/si/ca/depasse/le/seuil/de/70/caracteres", "qrcode_aimediart_long_test", "png")