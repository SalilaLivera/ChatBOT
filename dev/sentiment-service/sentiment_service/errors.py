"""Typed errors for the Sinhala sentiment inference service.

Mirrors dev/fer-service/fer_service/errors.py. Every error carries a stable
machine-readable ``code``; a backend switches on the code, never on the message
text. Error messages must never leak filesystem paths, checkpoint internals, or
training metadata to a caller. Detail for logs goes in ``detail``, which the HTTP
layer (B2, not built here) is responsible for NOT serialising to untrusted
callers.
"""

from __future__ import annotations


class SentimentServiceError(Exception):
    """Base class. Carries a stable code and an HTTP status suggestion."""

    code = "sentiment_error"
    http_status = 500
    message = "Sentiment inference failed."

    def __init__(self, message: str | None = None, detail: str | None = None):
        self.message = message or self.__class__.message
        self.detail = detail
        super().__init__(self.message)

    def to_dict(self, include_detail: bool = False) -> dict:
        payload = {"error": {"code": self.code, "message": self.message}}
        if include_detail and self.detail:
            payload["error"]["detail"] = self.detail
        return payload


# -- 4xx: the caller can fix these ---------------------------------------------


class MissingTextError(SentimentServiceError):
    code = "missing_text"
    http_status = 400
    message = "No text was provided in the request."


class EmptyTextError(SentimentServiceError):
    code = "empty_text"
    http_status = 400
    message = "The provided text is empty after decoding."


class TextTooLongError(SentimentServiceError):
    code = "text_too_long"
    http_status = 413
    message = "The provided text exceeds the maximum accepted length."


# -- 5xx: the caller cannot fix these ----------------------------------------


class TokenisationError(SentimentServiceError):
    code = "tokenisation_failed"
    http_status = 500
    message = "The text could not be tokenised for inference."


class ModelLoadError(SentimentServiceError):
    code = "model_load_failed"
    http_status = 503
    message = "The sentiment model could not be loaded. The service is unavailable."


class InferenceError(SentimentServiceError):
    code = "inference_failed"
    http_status = 500
    message = "Model inference failed."


class ContractViolationError(SentimentServiceError):
    code = "contract_violation"
    http_status = 500
    message = (
        "The loaded checkpoint does not match the expected contract. "
        "The service refused to serve a prediction."
    )


#: Every code a backend may receive. Anything not in this set is a bug.
ALL_ERROR_CODES = frozenset(
    cls.code
    for cls in (
        MissingTextError,
        EmptyTextError,
        TextTooLongError,
        TokenisationError,
        ModelLoadError,
        InferenceError,
        ContractViolationError,
        SentimentServiceError,
    )
)
