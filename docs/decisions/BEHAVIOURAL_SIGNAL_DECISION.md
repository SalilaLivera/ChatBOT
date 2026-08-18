# IT22638168 — Behavioural Signal Decision Memo

> **Markdown mirror.** Faithful mirror of `Behavioural_Signal_Decision_Memo_FINAL.docx`, which remains authoritative. The evidence-cited long form is `Behavioural_Signal_Decision_Memo_DETAILED.docx`.

IT22638168 — Behavioural Signal Decision Memo

Literature-driven architecture decision | August 2026

Decision

REMOVE typing speed and response delay from the core mood-fusion score. If required, retain timestamps as optional telemetry/ablation variables only.

Evidence Summary

Epp et al. (2011) demonstrated keystroke-based emotion classification using standard keyboard data.

Lee et al. (2015) found emotion-related typing effects but noted small effects relative to individual variability.

Ghosh et al. (2019) reported smartphone touch-based emotion detection with average AUCROC around 73%, with personalized models and individual-training dependence.

Eisele et al. (2021) found affect associations with response delay but did not establish a per-message pregnancy-chatbot classifier.

Updated Core Architecture

Facial expression signal + bilingual text sentiment → transparent late fusion → mood state → adaptive chatbot response.

Implementation Rule

Behavioural signals must not change the safety-sensitive mood state or chatbot tone in the core build.
