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
    url_example_short = "https://www.google.com"
    url_example_long = "https://fr.wikipedia.org/wiki/Code_QR_et_code_barres_2D_-_Principes_de_fonctionnement_et_applications_dans_l%27industrie"

    # Générer un QR code PNG avec une URL courte
    print("Génération d'un QR code PNG avec une URL courte...")
    generate_qr_code(url_example_short, "mon_qrcode_court", "png")

    # Générer un QR code SVG avec une URL courte
    print("Génération d'un QR code SVG avec une URL courte...")
    generate_qr_code(url_example_short, "mon_qrcode_court_svg", "svg")

    # Générer un QR code PNG avec une URL longue (cela déclenchera la suggestion)
    print("\nGénération d'un QR code PNG avec une URL longue...")
    generate_qr_code(url_example_long, "mon_qrcode_long", "png")

    # Générer un QR code SVG avec une URL longue (cela déclenchera la suggestion)
    print("\nGénération d'un QR code SVG avec une URL longue...")
    generate_qr_code(url_example_long, "mon_qrcode_long_svg", "svg")