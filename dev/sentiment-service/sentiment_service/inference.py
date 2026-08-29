"""SinBERT sentiment inference. Backend-friendly, training-free.

Contains NO training code, NO 7->3 mood mapping, NO fusion, NO smoothing, and NO
threshold tuning. Those are downstream concerns and are deliberately absent — see
contract.OUT_OF_SCOPE.

Load path mirrors the reference exactly:
    AutoTokenizer.from_pretrained(dir, local_files_only=True)
    AutoModelForSequenceClassification.from_pretrained(dir, local_files_only=True)
    model.eval(); model.to(torch.device("cpu"))
    with torch.no_grad(): logits -> softmax -> argmax
The checkpoint's model.safetensors SHA-256 is verified against
contract.CHECKPOINT_SHA256 at load; the service refuses to serve on mismatch.
"""

from __future__ import annotations

import hashlib
import os
import threading
from typing import Any

from . import contract
from .errors import ContractViolationError, InferenceError, ModelLoadError
from .preprocessing import check_text, encode

__all__ = ["SentimentClassifier", "load_default", "sha256_file"]


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _default_checkpoint_dir() -> str:
    env = os.environ.get("SENTIMENT_CHECKPOINT_DIR")
    if env:
        return env
    # dev/sentiment-service/sentiment_service/inference.py -> repo root is 3 up.
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(os.path.dirname(os.path.dirname(here)))
    return os.path.join(
        root, "ml", "sentiment", "outputs", "development_v2",
        "experiment_02", "best_checkpoint",
    )


class SentimentClassifier:
    """Loads one SinBERT 3-class checkpoint and serves CALM/NEUTRAL/DISTRESSED probs.

    Thread-safety: a torch model in eval + no_grad is safe for concurrent forward
    passes, but inference is serialised behind a lock anyway to match the
    fer-service pattern and to keep behaviour deterministic under load.
    """

    def __init__(
        self,
        checkpoint_dir: str,
        *,
        verify_sha256: bool = True,
        num_threads: int | None = None,
    ) -> None:
        import torch  # local import: keep module import cheap
        from transformers import (
            AutoModelForSequenceClassification,
            AutoTokenizer,
        )

        if not os.path.isdir(checkpoint_dir):
            raise ModelLoadError(detail=f"checkpoint dir not found: {checkpoint_dir}")

        weights = os.path.join(checkpoint_dir, "model.safetensors")
        if not os.path.isfile(weights):
            raise ModelLoadError(detail=f"model.safetensors not found in {checkpoint_dir}")

        self.checkpoint_dir = checkpoint_dir
        self._lock = threading.Lock()
        self._torch = torch

        self.checkpoint_sha256 = sha256_file(weights)
        if verify_sha256 and self.checkpoint_sha256 != contract.CHECKPOINT_SHA256:
            raise ContractViolationError(
                detail=(
                    f"checkpoint sha256 {self.checkpoint_sha256} does not match the "
                    f"pinned {contract.CHECKPOINT_SHA256}"
                )
            )

        if num_threads is not None:
            torch.set_num_threads(num_threads)

        try:
            self.tokenizer = AutoTokenizer.from_pretrained(
                checkpoint_dir, local_files_only=True
            )
            self.model = AutoModelForSequenceClassification.from_pretrained(
                checkpoint_dir, local_files_only=True
            )
        except Exception as exc:  # noqa: BLE001
            raise ModelLoadError(detail=f"{type(exc).__name__}: {exc}") from exc

        self.model.eval()
        self.device = torch.device(contract.DEVICE)
        self.model.to(self.device)
        self._validate_contract()

    # -- validation -------------------------------------------------------------

    def _validate_contract(self) -> None:
        cfg = self.model.config
        id2label = {int(k): v for k, v in cfg.id2label.items()}
        got = tuple(id2label[i] for i in range(len(id2label)))
        if got != contract.LABEL_ORDER:
            raise ContractViolationError(
                detail=f"id2label order {got}, expected {contract.LABEL_ORDER}"
            )
        if int(cfg.num_labels) != contract.N_CLASSES:
            raise ContractViolationError(
                detail=f"num_labels {cfg.num_labels}, expected {contract.N_CLASSES}"
            )
        arch = list(getattr(cfg, "architectures", []) or [])
        if arch and arch[0] != contract.ARCHITECTURE:
            raise ContractViolationError(
                detail=f"architecture {arch[0]}, expected {contract.ARCHITECTURE}"
            )

    # -- inference ------------------------------------------------------------

    def _forward_probs(self, texts, *, padding: bool):
        torch = self._torch
        inputs = encode(self.tokenizer, texts, padding=padding)
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        try:
            with self._lock, torch.no_grad():
                logits = self.model(**inputs).logits
                probs = torch.softmax(logits, dim=-1)
        except Exception as exc:  # noqa: BLE001
            raise InferenceError(detail=f"{type(exc).__name__}: {exc}") from exc
        return probs

    def predict_proba(self, text: str) -> list[float]:
        """Batch-of-1 probability vector, indexed by contract.LABEL_ORDER."""
        check_text(text)
        probs = self._forward_probs([text], padding=True)
        return [float(x) for x in probs[0].tolist()]

    def predict(self, text: str) -> dict:
        """Full path: one string -> response dict. The primary entry point."""
        vec = self.predict_proba(text)
        top = max(range(contract.N_CLASSES), key=lambda i: vec[i])
        return {
            "model_version": contract.MODEL_VERSION,
            "checkpoint_sha256": self.checkpoint_sha256,
            "label_order": list(contract.LABEL_ORDER),
            "probabilities": {
                name: vec[i] for i, name in enumerate(contract.LABEL_ORDER)
            },
            "evidence": {
                contract.DEPLOYED_EVIDENCE_KEYS[i]: vec[i]
                for i in range(contract.N_CLASSES)
            },
            "predicted_label": contract.LABEL_ORDER[top],
            "predicted_label_id": top,
            "confidence": vec[top],
            "label_space": "mood3",
            "supported_language": contract.SUPPORTED_LANGUAGE,
        }

    def predict_proba_batch(self, texts, *, padding: bool = True) -> list[list[float]]:
        """Probabilities for a list of texts in ONE forward pass.

        ``padding=True`` reproduces the reference's dynamic padding to the longest
        sequence in the batch. Caller controls batching.
        """
        texts = list(texts)
        for t in texts:
            check_text(t)
        probs = self._forward_probs(texts, padding=padding)
        return [[float(x) for x in row] for row in probs.tolist()]

    # -- introspection ------------------------------------------------------

    def info(self) -> dict:
        return {
            "model_version": contract.MODEL_VERSION,
            "checkpoint_sha256": self.checkpoint_sha256,
            "label_space": "mood3",
            "label_order": list(contract.LABEL_ORDER),
            "max_length": contract.MAX_LENGTH,
            "device": contract.DEVICE,
            "prediction_rule": contract.PREDICTION_RULE,
            "text_normalisation": contract.TEXT_NORMALISATION,
            "supported_language": contract.SUPPORTED_LANGUAGE,
            "english_in_scope": contract.ENGLISH_IN_SCOPE,
            "performs_mood_fusion": False,
            "performs_language_detection": False,
        }


_DEFAULT: SentimentClassifier | None = None
_DEFAULT_LOCK = threading.Lock()


def load_default(checkpoint_dir: str | None = None, **kwargs) -> SentimentClassifier:
    """Process-wide singleton. Loading the checkpoint is the expensive step."""
    global _DEFAULT
    if _DEFAULT is None:
        with _DEFAULT_LOCK:
            if _DEFAULT is None:
                _DEFAULT = SentimentClassifier(
                    checkpoint_dir or _default_checkpoint_dir(), **kwargs
                )
    return _DEFAULT
