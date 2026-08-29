"""The FER preprocessing contract, implemented exactly as specified.

This is a transcription of ``ml/fer/outputs/nb07_tensor_spec.json``. Do not
"optimise" it. Every step exists for a measured reason, documented inline.

    1. decode as single-channel grayscale
    2. resize to the FER-2013 native 48x48, bilinear, round, uint8
    3. replicate grayscale -> 3 channels
    4. bilinear resize to the 96x96 model input
    5. map [0, 255] -> [-1, 1]  (mobilenet_v2.preprocess_input)

STEP 2 IS NOT REDUNDANT AND MUST NOT BE REMOVED.
--------------------------------------------------
It looks pointless: downsample to 48x48, then immediately upsample to 96x96. It is
not. The model was trained exclusively on FER-2013, whose images ARE 48x48 — every
image it has ever seen carries 48x48 worth of detail, upsampled. A live camera crop
arriving at, say, 400x400 carries far more. Feeding that straight to a 96x96 resize
would present the model with sharper, higher-frequency input than anything in its
training distribution.

Step 2 deliberately destroys that extra detail so that live input matches the
training distribution. Removing it is a silent distribution shift that would degrade
accuracy in a way no unit test would catch.

ON DECODER FIDELITY
-------------------
Notebook 07 pinned TensorFlow's JPEG decoder to ``dct_method='INTEGER_ACCURATE'``
specifically because that setting is bit-exact with Pillow's decoder (TF's default
IDCT differs from PIL by up to ~13 grey levels). Decoding with Pillow here is
therefore contract-compliant *by construction*, and lets the service run without a
TensorFlow dependency.

PARITY: MEASURED AND VERIFIED (A1, 2026-08-29)
---------------------------------------------
Pillow's bilinear filter and ``tf.image.resize`` bilinear are not guaranteed
bit-identical, so ``tools/verify_parity.py`` measured it rather than assuming it.

Result over all 3,589 VALIDATION images: **max tensor difference exactly 0.0** across
99,228,672 elements, **1.0000 argmax agreement**, all five per-step checkpoints at 0.0.
This pipeline is bit-identical to notebook 07 cell 10. Full record:
``ml/fer/outputs/a1_parity/A1_PARITY_FINDINGS.md``.

WHY STEP 4 RESIZES IN FLOAT32 — do not "simplify" it back to uint8
-----------------------------------------------------------------
A1 FAILED on its first run. Resizing 48->96 as a uint8 image made PIL round every
interpolated pixel to an integer grey level, while ``tf.image.resize`` keeps float32
fractional values — a 1.0 grey level divergence.

That looks negligible and is not. A 0.0078 tensor difference (0.4% of the input range)
produced a 0.135 probability difference and flipped 76 of 3,589 predictions, because
calibration at T=5.727 flattens the softmax and puts many samples near decision
boundaries. Resizing in float32 (mode "F") took the divergence to exactly zero.

The calibrated model is materially sensitive to small input perturbations. Treat any
change to this function as capable of changing predictions, and re-run A1 after it.

CONTRACT NOTE: ``nb07_tensor_spec.json`` says "bilinear resize to 96x96" without naming
a dtype, and the notebooks did it in float32. The float32 resize CONFORMS to the
contract; the earlier uint8 resize was the deviation.
"""

from __future__ import annotations

import io

import numpy as np

try:
    from PIL import Image, UnidentifiedImageError
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "Pillow is required. Install with: pip install -r requirements.txt"
    ) from exc

from .contract import (
    ACCEPTED_FORMATS,
    INPUT_SHAPE,
    MAX_UPLOAD_BYTES,
    MIN_SOURCE_DIMENSION,
    MODEL_INPUT_SIZE,
    NATIVE_SOURCE_SIZE,
)
from .errors import (
    ImageTooLargeError,
    ImageTooSmallError,
    InvalidImageError,
    MissingImageError,
    PreprocessingError,
    UnsupportedFormatError,
)

__all__ = ["decode_image", "preprocess", "preprocess_bytes"]


def decode_image(image_bytes: bytes) -> Image.Image:
    """Decode raw image bytes into a PIL image, with all input validation.

    Raises the typed errors from ``errors.py``; never raises a bare exception.
    """
    if image_bytes is None or len(image_bytes) == 0:
        raise MissingImageError()

    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise ImageTooLargeError(
            detail=f"{len(image_bytes)} bytes > limit {MAX_UPLOAD_BYTES}"
        )

    try:
        img = Image.open(io.BytesIO(image_bytes))
        # Pillow is lazy; force a decode now so corruption surfaces here rather
        # than midway through preprocessing.
        img.load()
    except UnidentifiedImageError as exc:
        raise UnsupportedFormatError(detail=str(exc)) from exc
    except (OSError, ValueError) as exc:
        raise InvalidImageError(detail=str(exc)) from exc

    fmt = (img.format or "").upper()
    # A re-decoded in-memory image can lose .format; only reject when we know.
    if fmt and fmt not in ACCEPTED_FORMATS:
        raise UnsupportedFormatError(detail=f"format={fmt}")

    if min(img.size) < MIN_SOURCE_DIMENSION:
        raise ImageTooSmallError(
            detail=f"size={img.size}, minimum dimension {MIN_SOURCE_DIMENSION}"
        )

    return img


def preprocess(img: Image.Image) -> np.ndarray:
    """Apply the frozen preprocessing contract.

    Args:
        img: a PIL image. Expected to be a FACE CROP — this service does not
            perform face detection. Cropping is the caller's responsibility.

    Returns:
        float32 array of shape (1, 96, 96, 3) with values in [-1, 1].
    """
    try:
        # -- 1. single-channel grayscale ---------------------------------
        gray = img.convert("L")

        # -- 2. down to the FER-2013 native 48x48 ------------------------
        # See the module docstring: this step is load-bearing.
        gray48 = gray.resize(
            (NATIVE_SOURCE_SIZE, NATIVE_SOURCE_SIZE), Image.BILINEAR
        )
        arr48 = np.asarray(gray48, dtype=np.uint8)

        # -- 3+4. resize to 96x96 in FLOAT32, then replicate to 3 channels --------
        # A1 (2026-08-29) measured the previous uint8 resize diverging from the
        # notebook-07 TF reference by up to 1.0 grey level, because PIL rounds a uint8
        # resize to integers while tf.image.resize keeps float32 fractional values.
        # The TF reference casts to float32 BEFORE the 96x96 resize; this matches it.
        # Resize-then-replicate is mathematically identical to TF's replicate-then-resize
        # because all three channels are identical copies.
        img48_f = Image.fromarray(arr48.astype(np.float32), mode="F")
        img96_f = img48_f.resize((MODEL_INPUT_SIZE, MODEL_INPUT_SIZE), Image.BILINEAR)
        arr96_gray = np.asarray(img96_f, dtype=np.float32)
        arr96 = np.stack([arr96_gray, arr96_gray, arr96_gray], axis=-1)

        # -- 5. mobilenet_v2.preprocess_input: [0,255] -> [-1,1] ------------------
        x = arr96 / 127.5 - 1.0

        batched = np.expand_dims(x, axis=0).astype(np.float32)

    except Exception as exc:  # noqa: BLE001 - deliberately broad; re-typed below
        raise PreprocessingError(detail=f"{type(exc).__name__}: {exc}") from exc

    if batched.shape != INPUT_SHAPE:
        raise PreprocessingError(
            detail=f"produced shape {batched.shape}, contract requires {INPUT_SHAPE}"
        )
    if batched.dtype != np.float32:
        raise PreprocessingError(detail=f"produced dtype {batched.dtype}, need float32")

    return batched


def preprocess_bytes(image_bytes: bytes) -> np.ndarray:
    """Convenience: decode + preprocess in one call."""
    return preprocess(decode_image(image_bytes))
