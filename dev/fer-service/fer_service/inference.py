"""FER TFLite inference. Backend-friendly, framework-light, training-free.

Contains NO training code, NO 7->3 mood mapping, NO fusion, NO smoothing, and NO
confidence gating. Those are downstream application concerns and are deliberately
absent — see contract.OUT_OF_SCOPE.
"""

from __future__ import annotations

import hashlib
import os
import threading
from typing import Any

import numpy as np

from . import contract
from .errors import (
    ContractViolationError,
    InferenceError,
    ModelLoadError,
)
from .preprocessing import preprocess, preprocess_bytes

__all__ = ["FERClassifier", "load_default"]


def _load_interpreter_class():
    """Find a TFLite interpreter without mandating a full TensorFlow install.

    Preference order is deliberate: the standalone runtimes are small and are what
    a deployment image should carry. Full TensorFlow is the last resort and is
    normally only present on a development machine.
    """
    errors = []
    try:
        from ai_edge_litert.interpreter import Interpreter  # type: ignore

        return Interpreter, "ai_edge_litert"
    except ImportError as exc:
        errors.append(f"ai_edge_litert: {exc}")
    try:
        from tflite_runtime.interpreter import Interpreter  # type: ignore

        return Interpreter, "tflite_runtime"
    except ImportError as exc:
        errors.append(f"tflite_runtime: {exc}")
    try:
        # `tf.lite` is a lazily-generated API namespace, NOT an importable package:
        # `from tensorflow.lite import Interpreter` raises ImportError on every TF
        # version, while `tf.lite.Interpreter` works. Notebooks 07/08 used the
        # latter. Do not "simplify" this back to a direct submodule import.
        import tensorflow as tf  # type: ignore

        return tf.lite.Interpreter, "tensorflow.lite"
    except (ImportError, AttributeError) as exc:
        errors.append(f"tensorflow.lite: {exc}")

    raise ModelLoadError(
        detail="no TFLite runtime available; tried " + "; ".join(errors)
    )


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


class FERClassifier:
    """Loads one TFLite FER model and serves calibrated 7-class probabilities.

    Thread-safety: a TFLite Interpreter is not thread-safe. All inference is
    serialised behind a lock, which is correct for the expected load (one request
    at a time per Space replica) and avoids a whole class of silent corruption.
    """

    def __init__(
        self,
        model_path: str,
        *,
        verify_sha256: bool = True,
        num_threads: int | None = None,
    ) -> None:
        if not os.path.isfile(model_path):
            raise ModelLoadError(detail=f"model file not found: {model_path}")

        self.model_path = model_path
        self._lock = threading.Lock()

        self.model_sha256 = sha256_file(model_path)
        if verify_sha256 and self.model_sha256 != contract.MODEL_SHA256:
            # Refuse rather than silently serve an unknown artifact. A model whose
            # identity we cannot vouch for must not sit behind a versioned contract.
            raise ContractViolationError(
                detail=(
                    f"model sha256 {self.model_sha256} does not match the pinned "
                    f"{contract.MODEL_SHA256}"
                )
            )

        InterpreterCls, self.runtime = _load_interpreter_class()

        try:
            kwargs: dict[str, Any] = {"model_path": model_path}
            if num_threads is not None:
                kwargs["num_threads"] = num_threads
            self._interpreter = InterpreterCls(**kwargs)
            self._interpreter.allocate_tensors()
        except Exception as exc:  # noqa: BLE001
            raise ModelLoadError(detail=f"{type(exc).__name__}: {exc}") from exc

        self._in = self._interpreter.get_input_details()[0]
        self._out = self._interpreter.get_output_details()[0]
        self._validate_contract()

    # -- validation --------------------------------------------------------

    def _validate_contract(self) -> None:
        """Fail loudly at startup rather than serving wrong-shaped garbage."""
        in_shape = tuple(int(d) for d in self._in["shape"])
        out_shape = tuple(int(d) for d in self._out["shape"])

        if in_shape != contract.INPUT_SHAPE:
            raise ContractViolationError(
                detail=f"input shape {in_shape}, expected {contract.INPUT_SHAPE}"
            )
        if out_shape != contract.OUTPUT_SHAPE:
            raise ContractViolationError(
                detail=f"output shape {out_shape}, expected {contract.OUTPUT_SHAPE}"
            )
        if np.dtype(self._in["dtype"]) != np.float32:
            raise ContractViolationError(
                detail=f"input dtype {self._in['dtype']}, expected float32"
            )
        if np.dtype(self._out["dtype"]) != np.float32:
            raise ContractViolationError(
                detail=f"output dtype {self._out['dtype']}, expected float32"
            )

    # -- inference ---------------------------------------------------------

    def predict_array(self, x: np.ndarray) -> np.ndarray:
        """Run inference on an already-preprocessed (1, 96, 96, 3) float32 array."""
        if x.shape != contract.INPUT_SHAPE:
            raise InferenceError(
                detail=f"input shape {x.shape}, expected {contract.INPUT_SHAPE}"
            )
        if x.dtype != np.float32:
            raise InferenceError(detail=f"input dtype {x.dtype}, expected float32")

        try:
            with self._lock:
                self._interpreter.set_tensor(self._in["index"], x)
                self._interpreter.invoke()
                raw = self._interpreter.get_tensor(self._out["index"])
            probs = np.array(raw, dtype=np.float32).reshape(-1)
        except Exception as exc:  # noqa: BLE001
            raise InferenceError(detail=f"{type(exc).__name__}: {exc}") from exc

        if probs.shape != (contract.N_CLASSES,):
            raise InferenceError(detail=f"output vector shape {probs.shape}")

        # The graph already ends in a temperature-scaled softmax. We do NOT
        # renormalise or re-apply temperature; both would corrupt the calibration
        # that notebook 07 established. This is a sanity check only.
        total = float(probs.sum())
        if not np.isfinite(total) or abs(total - 1.0) > 1e-3:
            raise InferenceError(
                detail=f"output does not sum to 1 (sum={total}); calibration suspect"
            )

        return probs

    def predict(self, image_bytes: bytes) -> dict:
        """Full path: raw image bytes -> response dict. The primary entry point."""
        return self._build_response(self.predict_array(preprocess_bytes(image_bytes)))

    def predict_pil(self, img) -> dict:
        """Same, from an already-decoded PIL image."""
        return self._build_response(self.predict_array(preprocess(img)))

    # -- response ----------------------------------------------------------

    def _build_response(self, probs: np.ndarray) -> dict:
        top = int(np.argmax(probs))
        return {
            "model_version": contract.MODEL_VERSION,
            "model_sha256": self.model_sha256,
            "class_order": list(contract.CLASS_ORDER),
            "probabilities": {
                name: round(float(p), 6)
                for name, p in zip(contract.CLASS_ORDER, probs)
            },
            "predicted_class": contract.CLASS_ORDER[top],
            "confidence": round(float(probs[top]), 6),
            "calibrated": True,
            "label_space": "fer7",
        }

    # -- introspection -----------------------------------------------------

    def info(self) -> dict:
        """Public, non-sensitive service metadata. Safe to expose on /health.

        Deliberately excludes filesystem paths and all training-only metadata.
        """
        return {
            "model_version": contract.MODEL_VERSION,
            "model_sha256": self.model_sha256,
            "label_space": "fer7",
            "class_order": list(contract.CLASS_ORDER),
            "input_shape": list(contract.INPUT_SHAPE),
            "input_dtype": contract.INPUT_DTYPE,
            "output_shape": list(contract.OUTPUT_SHAPE),
            "output_dtype": contract.OUTPUT_DTYPE,
            "calibrated": True,
            "runtime": self.runtime,
            "performs_mood_mapping": False,
            "performs_face_detection": False,
        }


_DEFAULT: FERClassifier | None = None
_DEFAULT_LOCK = threading.Lock()


def load_default(model_dir: str | None = None, **kwargs) -> FERClassifier:
    """Process-wide singleton. Loading the interpreter is the expensive step."""
    global _DEFAULT
    if _DEFAULT is None:
        with _DEFAULT_LOCK:
            if _DEFAULT is None:
                base = model_dir or os.environ.get(
                    "FER_MODEL_DIR",
                    os.path.join(os.path.dirname(os.path.dirname(__file__)), "models"),
                )
                _DEFAULT = FERClassifier(
                    os.path.join(base, contract.MODEL_FILENAME), **kwargs
                )
    return _DEFAULT
