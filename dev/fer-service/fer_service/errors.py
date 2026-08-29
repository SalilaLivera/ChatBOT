"""Typed errors for the FER inference service.

Every error carries a stable machine-readable ``code``. The backend switches on the
code, never on the message text — messages may be reworded, codes may not.

Error messages must never leak filesystem paths, model internals, or training
metadata to an API caller. Detail intended for logs goes in ``detail``, which the
HTTP layer is responsible for NOT serialising to untrusted callers.
"""

from __future__ import annotations


class FERServiceError(Exception):
    """Base class. Carries a stable code and an HTTP status suggestion."""

    code = "fer_error"
    http_status = 500
    message = "FER inference failed."

    def __init__(self, message: str | None = None, detail: str | None = None):
        self.message = message or self.__class__.message
        self.detail = detail
        super().__init__(self.message)

    def to_dict(self, include_detail: bool = False) -> dict:
        payload = {
            "error": {
                "code": self.code,
                "message": self.message,
            }
        }
        if include_detail and self.detail:
            payload["error"]["detail"] = self.detail
        return payload


# -- 4xx: the caller can fix these -----------------------------------------


class MissingImageError(FERServiceError):
    code = "missing_image"
    http_status = 400
    message = "No image was provided in the request."


class UnsupportedFormatError(FERServiceError):
    code = "unsupported_format"
    http_status = 415
    message = "Unsupported image format. Accepted: JPEG, PNG, BMP, WEBP."


class InvalidImageError(FERServiceError):
    code = "invalid_image"
    http_status = 400
    message = "The image could not be decoded. It may be corrupt or truncated."


class ImageTooLargeError(FERServiceError):
    code = "image_too_large"
    http_status = 413
    message = "The image exceeds the maximum accepted upload size."


class ImageTooSmallError(FERServiceError):
    code = "image_too_small"
    http_status = 400
    message = "The image is too small to be a usable face crop."


# -- 5xx: the caller cannot fix these --------------------------------------


class PreprocessingError(FERServiceError):
    code = "preprocessing_failed"
    http_status = 500
    message = "The image could not be preprocessed for inference."


class ModelLoadError(FERServiceError):
    code = "model_load_failed"
    http_status = 503
    message = "The FER model could not be loaded. The service is unavailable."


class InferenceError(FERServiceError):
    code = "inference_failed"
    http_status = 500
    message = "Model inference failed."


class ContractViolationError(FERServiceError):
    code = "contract_violation"
    http_status = 500
    message = (
        "The loaded model does not match the expected tensor contract. "
        "The service refused to serve a prediction."
    )


#: Every code the backend may receive. Anything not in this set is a bug.
ALL_ERROR_CODES = frozenset(
    cls.code
    for cls in (
        MissingImageError,
        UnsupportedFormatError,
        InvalidImageError,
        ImageTooLargeError,
        ImageTooSmallError,
        PreprocessingError,
        ModelLoadError,
        InferenceError,
        ContractViolationError,
        FERServiceError,
    )
)
