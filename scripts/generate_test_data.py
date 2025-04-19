# Script to create a test dataset which is handy for testing the atlas generation,
# images still need to be copied into the right directory
import os
import random
from pathlib import Path
from typing import Optional, Tuple, Union

from PIL import Image, ImageDraw, ImageFont
from multiprocessing import Pool, cpu_count

# --- Configuration & Constants ---
FONT_FILES = ("arial.ttf", "Helvetica.ttc")
MIN_FONT_SIZE = 5
DEFAULT_TEXT_COLOR = (0, 0, 0, 255)
DEFAULT_IMAGE_FORMAT = "PNG"
FILENAME_FORMAT = "image_{:04d}.png"

def get_font(font_paths, size) -> Optional[ImageFont.FreeTypeFont]:
    for path in font_paths:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return None

def binary_search_font_size(draw, text, img_size, font_paths) -> Tuple[ImageFont.ImageFont, int]:
    """
    Finds the biggest font size that fits.
    """
    min_size, max_size, best_font, best_size = MIN_FONT_SIZE, img_size[1], None, 0
    while min_size <= max_size:
        mid = (min_size + max_size) // 2
        font = get_font(font_paths, mid)
        if not font:
            break
        bbox = draw.textbbox((0,0), text, font=font)
        width, height = bbox[2]-bbox[0], bbox[3]-bbox[1]
        if width <= img_size[0] and height <= img_size[1]:
            best_font, best_size = font, mid
            min_size = mid + 1
        else:
            max_size = mid - 1
    if best_font:
        return best_font, best_size
    return ImageFont.load_default(), MIN_FONT_SIZE

def draw_centered_text(draw, text, font, img_size, color):
    bbox = draw.textbbox((0,0), text, font=font)
    text_width, text_height = bbox[2]-bbox[0], bbox[3]-bbox[1]
    x = (img_size[0] - text_width) // 2 - bbox[0]
    y = (img_size[1] - text_height) // 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=color)

def generate_image(
    index: int,
    img_dir: Union[Path, str],
    min_dim: int, max_dim: int,
    font_paths,
    text_color
) -> None:
    w, h = random.randint(min_dim, max_dim), random.randint(min_dim, max_dim)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    font, _ = binary_search_font_size(draw, str(index), (w, h), font_paths)
    draw_centered_text(draw, str(index), font, (w, h), text_color)
    tmp_path = Path(img_dir) / (FILENAME_FORMAT.format(index) + ".tmp")
    out_path = Path(img_dir) / FILENAME_FORMAT.format(index)
    img.save(tmp_path, format=DEFAULT_IMAGE_FORMAT)
    os.replace(tmp_path, out_path)

def generate_images_concurrent(
    num_images: int,
    img_dir: Union[Path, str],
    min_dim: int,
    max_dim: int,
    font_preference: Optional[str] = None,
    text_color: tuple = DEFAULT_TEXT_COLOR,
    num_workers: Optional[int] = None
) -> None:
    Path(img_dir).mkdir(parents=True, exist_ok=True)
    font_paths = [font_preference] if font_preference else []
    font_paths += FONT_FILES
    args = [
        (i, img_dir, min_dim, max_dim, font_paths, text_color)
        for i in range(1, num_images + 1)
    ]
    if num_workers is None:
        num_workers = cpu_count()
    with Pool(num_workers) as pool:
        pool.starmap(generate_image, args)

# --- Main ---
if __name__ == "__main__":
    NUM_IMAGES = 5
    MIN_DIMENSION = 8000
    MAX_DIMENSION = 12000
    OUTPUT_DIR = Path(__file__).parent / "images"
    FONT = None
    generate_images_concurrent(
        NUM_IMAGES, OUTPUT_DIR, MIN_DIMENSION, MAX_DIMENSION,
        font_preference=FONT, text_color=DEFAULT_TEXT_COLOR,
        num_workers=None
    )