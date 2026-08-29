"""The sentiment tokenisation contract, implemented exactly as the reference.

TRANSCRIBED VERBATIM from the two authoritative pipelines, which are identical in
the call that matters:

  ml/sentiment/scripts/final_evaluate_sinbert_experiment02.py :
      tokenizer(texts, return_tensors="pt", truncation=True, max_length=512,
                padding=True)

  ml/sentiment/notebooks/04_sinbert_experiment_02.ipynb  collate() :
      tokenizer(list(texts), truncation=True, max_length=MAX_LENGTH,
                padding=True, return_tensors='pt')          # MAX_LENGTH == 512

NO TEXT NORMALISATION.
---------------------
The reference performs NONE: no ``.strip()``, no lowercasing, no
``unicodedata.normalize`` (NFC/NFKC/NFD/NFKD), no whitespace collapsing, no
punctuation handling. Sinhala combining characters and ZWJ/ZWNJ are meaningful and
Unicode normalisation form changes the token stream. This module therefore passes
the caller's string through UNCHANGED. Do not add normalisation here or anywhere
upstream of ``encode``.

The only thing done to the input string is a type/empty check, which does not
alter any accepted string.
"""

from __future__ import annotations

from .contract import MAX_LENGTH, TRUNCATION
from .errors import EmptyTextError, MissingTextError, TokenisationError

__all__ = ["check_text", "encode"]


def check_text(text) -> str:
    """Validate that ``text`` is a non-empty string. Returns it UNCHANGED.

    An empty or whitespace-only string is rejected because the reference never
    encountered one and its behaviour is therefore unspecified. Note: the
    whitespace check is for REJECTION only — an accepted string is never trimmed.
    """
    if text is None:
        raise MissingTextError()
    if not isinstance(text, str):
        raise MissingTextError(detail=f"expected str, got {type(text).__name__}")
    if text == "" or text.strip() == "":
        raise EmptyTextError()
    return text


def encode(tokenizer, texts, *, padding: bool = True):
    """The verbatim reference tokenisation call.

    Args:
        tokenizer: a loaded ``RobertaTokenizer`` / fast tokenizer.
        texts: a single ``str`` or a list of ``str``. Passed through unchanged.
        padding: ``True`` reproduces the reference's dynamic padding to the
            longest sequence in the batch. For a batch of one this is a no-op.

    Returns:
        A ``BatchEncoding`` of PyTorch tensors.
    """
    if isinstance(texts, str):
        texts = [texts]
    for t in texts:
        check_text(t)
    try:
        return tokenizer(
            list(texts),
            return_tensors="pt",
            truncation=TRUNCATION,
            max_length=MAX_LENGTH,
            padding=padding,
        )
    except Exception as exc:  # noqa: BLE001 - re-typed
        raise TokenisationError(detail=f"{type(exc).__name__}: {exc}") from exc
