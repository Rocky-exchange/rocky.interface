const AVATAR_SIZE = 128;

// Mirrors the backend cap in profile.rs (AVATAR_MAX_CHARS); a 128x128 webp/png
// is far below this, the check only guards against pathological encoder output.
const AVATAR_MAX_CHARS = 200_000;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read image file"));
    img.src = url;
  });
}

/**
 * Convert a user-picked image file into a small square avatar data URL:
 * center-cropped and downscaled to 128x128, encoded as webp (png where the
 * browser cannot encode webp).
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error("Could not read image file");

    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image");

    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

    const webp = canvas.toDataURL("image/webp", 0.85);
    const dataUrl = webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
    if (dataUrl.length > AVATAR_MAX_CHARS) {
      throw new Error("Image is too large");
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
