# IT22638168 — Proposal Revision Change Log

> **Markdown mirror.** Faithful mirror of `Proposal_Revision_Change_Log.docx`, which remains authoritative.

IT22638168 — Proposal Revision Change Log

Revision basis: original March 2026 proposal + completed literature-review extraction of 49 records.

Final Architecture Statement

Face + bilingual text sentiment → mood fusion → adaptive conversational response, with optional behavioural telemetry that cannot drive the core mood state.

### Table 1

| Area | Change | Reason |
|---|---|---|
| Problem framing | Reframed as a supplementary support layer, not a replacement for clinical care. | Literature establishes need but does not justify broad claims about absence of services. |
| Novelty | Removed 'pregnancy chatbot' as a novelty claim. | Moment for Parents and other digital perinatal interventions already exist. |
| Core modalities | Changed from Face + Text + Behaviour to Face + bilingual Text. | Behavioural evidence is promising but too user-dependent for a fixed safety-sensitive weight. |
| Fusion | Removed fixed three-way behavioural weighting; use transparent two-way fusion with empirical tuning. | Weights should be justified by validation evidence and self-report agreement. |
| FER | Added confidence filtering, temporal smoothing, pose-stratified evaluation, and demographic-risk discussion. | Real-world FER literature identifies pose and bias as deployment risks. |
| Sinhala NLP | Reframed as a low-resource but advancing field; added pregnancy-domain validation requirement. | Recent Sinhala-specific models and benchmarks mean 'Sinhala NLP is absent' is inaccurate. |
| Adaptive response | Added human evaluation of appropriateness/supportiveness against a non-adaptive baseline. | Literature emphasizes perceived empathy and personalization. |
| Privacy | Strengthened consent, visible camera state, raw-frame disposal, and text-only fallback. | Sensitive mobile-health data requires minimization and explicit user control. |
| WBS | Removed behavioural classifier as a core implementation task. | Keeps build aligned with revised research architecture. |
