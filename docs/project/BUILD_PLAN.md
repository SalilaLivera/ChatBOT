# IT22638168 --- Detailed Build Master Plan

## Project Baseline

**Project:** Pregnancy Support System --- Mood-Aware Conversational
Support Component\
**Project ID:** IT22638168\
**Core architecture:** Facial Emotion + Sinhala/English Text Mood → Mood
Fusion → Adaptive Chatbot

### Important architecture decision

Typing speed and response delay are **not core mood-fusion inputs**.
They may be retained only as optional telemetry/ablation variables and
must not control the safety-sensitive chatbot mood state.

------------------------------------------------------------------------

# Phase 1 --- System and Research Design

## Goal

Freeze the technical and research design before major implementation.

### Work

-   Finalize functional and non-functional requirements.
-   Define the three application mood states.
-   Define FER input/output.
-   Define text-model input/output.
-   Define fusion input/output.
-   Define backend API contracts.
-   Define local-storage schema.
-   Define privacy flow.
-   Define safety and escalation rules.
-   Define repository structure and technology stack.

### Core interfaces

``` text
FER:
camera frame → mood class + confidence

Text:
Sinhala/English message → mood class + confidence + language

Fusion:
face result + text result → mood state + confidence

Chat:
message + structured mood context → adaptive response
```

### Deliverables

Annotated 2026-08-19 with the actual repository filenames satisfying each item. All live in
`docs/system/`.

| Deliverable | Repository document | Status |
|---|---|---|
| `requirements.md` | `REQUIREMENTS.md` | Complete |
| `architecture.md` | `01_System_Architecture_Specification.md` | Complete |
| `mood_state_specification.md` | `MOOD_STATE_SPEC.md` | Part A frozen; Part B open by design |
| `model_interfaces.md` | Label level in Mood State Spec §A4; tensor level at Phase 3 exit | Split |
| `api_contract.md` | `03_API_and_Data_Contract.md` | Complete |
| `local_storage_schema.md` | `IT22638168_Local_Storage_and_Data_Schema.md` | Complete |
| `safety_policy.md` | `SAFETY_POLICY.md` | Structure frozen; wording DRAFT pending ethics |

Supporting Phase 1 documents: `05_Technology_and_Model_Selection.md`,
`02_Module_and_Submodule_Specification.md`,
`04_Data_Privacy_and_Safety_Architecture.md`,
`PERFORMANCE_BENCHMARK_PLAN.md`.

### Exit criteria

Architecture, module boundaries, APIs, mood states, storage, privacy and
safety rules are approved.

**Gate model (added 2026-08-19).** Phase 1 closes in two gates, because Phase 2 depends on
exactly one Phase 1 artefact — the mood state specification:

- **Gate 1A** — mood state specification Part A approved, FER mapping procedure documented,
  dataset licences verified, experiment structure defined → **Phase 2 may begin**.
- **Gate 1B** — safety sign-off, storage spike, target device, mock end-to-end
  verification, governance updates → **Phase 1 formally closed**, in parallel with Phase 2.

This is consistent with §13, which already notes that several phases can run in parallel.
The authoritative checklist is `docs/project/PHASE_1_CLOSURE.md`;
the derivation is in `docs/project/PHASE_1_CLOSURE.md`.

------------------------------------------------------------------------

# Phase 2 --- Data and Dataset Preparation

## Goal

Prepare reproducible datasets for FER and bilingual text modelling.

## FER data

Potential sources from the proposal/literature include:

-   FER-2013
-   AffectNet

### Tasks

1.  Acquire permitted datasets.
2.  Inspect class distributions.
3.  Remove corrupt/invalid samples.
4.  Define application-level label mapping.
5.  Create train/validation/test splits.
6.  Prevent data leakage.
7.  Build preprocessing scripts.
8.  Record dataset versions and decisions.

## Text data

Prepare:

### English

-   general sentiment/emotion resources;
-   pregnancy-domain examples;
-   manually reviewed validation examples.

### Sinhala

-   Sinhala sentiment resources;
-   Sinhala-specific language-model resources;
-   pregnancy-domain Sinhala examples;
-   manually labelled examples.

## Annotation

Create a consistent annotation guide covering:

-   language;
-   text;
-   application mood;
-   confidence;
-   annotator notes.

### Data-quality checks

-   class balance;
-   duplicates;
-   Unicode correctness;
-   language correctness;
-   train/test leakage;
-   annotation agreement.

### Deliverables

``` text
data/
scripts/
text_annotation_guidelines.md
bilingual_validation_dataset.csv
annotation_log.csv
```

### Exit criteria

Both model datasets are reproducible, documented and ready for
training/evaluation.

------------------------------------------------------------------------

# Phase 3 --- Facial Emotion Recognition Model

## Goal

Build a lightweight facial-expression model suitable for mobile
inference.

## Pipeline

``` text
Dataset
  ↓
Preprocessing
  ↓
Augmentation
  ↓
MobileNetV2-family model
  ↓
Training
  ↓
Validation
  ↓
Testing
  ↓
TensorFlow Lite
```

## Work

-   Establish a baseline.
-   Train the selected lightweight architecture.
-   Track seeds, hyperparameters and dataset versions.
-   Evaluate augmentation choices.
-   Evaluate class imbalance.
-   Produce confusion matrices.
-   Measure accuracy, precision, recall and macro-F1.
-   Examine pose, lighting and image-quality effects.
-   Add confidence filtering.
-   Add temporal smoothing.
-   Convert to TFLite.
-   Benchmark mobile inference time and model size.

## Required experiments

-   baseline model;
-   augmented model;
-   confidence threshold;
-   temporal smoothing;
-   TFLite accuracy comparison;
-   mobile latency.

### Deliverables

-   trained FER model;
-   TFLite model;
-   evaluation report;
-   confusion matrix;
-   mobile benchmark;
-   model card.

### Exit criteria

The model is evaluated, mobile-compatible and version-frozen.

------------------------------------------------------------------------

# Phase 4 --- Bilingual Text Mood Model

## Goal

Create the independent Sinhala/English text mood signal.

## Pipeline

``` text
Message
  ↓
Language detection
  ↓
Text preprocessing
  ↓
Language-specific model
  ↓
Mood + confidence
```

## English

Start with a lightweight transformer such as a DistilBERT-family model
and validate it on pregnancy-domain text.

## Sinhala

Evaluate:

-   Sinhala-specific pretrained models;
-   Sinhala sentiment resources;
-   lightweight transformer approaches;
-   lexicon/rule-assisted approaches;
-   transliteration handling where necessary.

Do not assume that English performance transfers to Sinhala.

## Preprocessing

Document handling of:

-   Unicode normalization;
-   punctuation;
-   emojis;
-   repeated characters;
-   mixed Sinhala/English;
-   transliterated Sinhala.

## Evaluation

For each language report:

-   accuracy;
-   precision;
-   recall;
-   macro-F1;
-   confusion matrix;
-   pregnancy-domain error analysis;
-   confidence behaviour.

### Exit criteria

English and Sinhala approaches are selected, validated and
version-frozen.

------------------------------------------------------------------------

# Phase 5 --- Mobile Application Development

## Goal

Build the user-facing Android/mobile application independently of the
final AI fusion.

## Foundation

Set up:

-   React Native / Expo;
-   navigation;
-   state management;
-   API client;
-   local storage;
-   environment configuration;
-   Android build.

## Main screens

``` text
Welcome / Consent
       ↓
Home
       ↓
Chat
 ├── Camera permission
 ├── Mood sensing state
 └── Supportive content
       ↓
History
       ↓
Settings / Privacy
```

## Work

-   Sinhala/English UI;
-   Unicode rendering;
-   responsive layouts;
-   chat interface;
-   camera permission UX;
-   visible camera enabled/disabled state;
-   text-only fallback;
-   local history;
-   loading/error/retry states.

### Exit criteria

The app launches, navigates, supports Sinhala/English, sends test
messages, manages camera permission and saves/retrieves local data.

------------------------------------------------------------------------

# Phase 6 --- Backend and Chatbot

## Goal

Build the conversational infrastructure.

## Conceptual flow

``` text
Mobile
  ↓
Chat API
  ↓
Validate request
  ↓
Add structured mood context
  ↓
LLM
  ↓
Safety processing
  ↓
Response
  ↓
Mobile
```

## Backend work

Potential proposal-aligned stack:

-   Node.js;
-   Express.

Implement:

-   routing;
-   validation;
-   LLM integration;
-   mood-context handling;
-   error handling;
-   timeouts;
-   logging;
-   integration endpoints.

## Structured context

Example:

``` json
{
  "language": "si",
  "mood_state": "distressed",
  "mood_confidence": 0.81,
  "conversation_context": "...",
  "safety_flags": []
}
```

## Safety

The chatbot must:

-   avoid diagnosis;
-   avoid pretending to be a clinician;
-   avoid unsafe medical advice;
    *(Superseded 2026-08-28: the system provides **no** medical advice at all — see
    `../decisions/MEDICAL_KNOWLEDGE_BASE_DECISION.md`. This rule now holds trivially.)*
-   respond appropriately to distress;
-   encourage professional/human support when required.

### Tests

-   valid request;
-   invalid request;
-   missing mood;
-   low-confidence mood;
-   LLM timeout;
-   LLM failure;
-   network failure;
-   unsafe-output scenarios.

### Exit criteria

The mobile application can communicate with the backend and receive safe
bilingual chatbot responses.

------------------------------------------------------------------------

# Phase 7 --- Mood Fusion Engine

## Goal

Combine the two independently evaluated signals.

## Inputs

``` text
Face:
class + confidence

Text:
class + confidence
```

## Conceptual fusion

``` text
Fused score =
    W_face × Face score
  + W_text × Text score
```

with weights selected empirically.

Do **not** assume an arbitrary fixed weighting.

## Experiments

Compare:

1.  equal weighting;
2.  validation-derived weighting;
3.  confidence-aware weighting.

## Missing modalities

### Camera disabled

``` text
Text → Mood
```

### FER confidence too low

``` text
Text → Mood
```

### Text confidence too low

``` text
Face → Mood
```

### Both unavailable

``` text
No reliable mood signal
```

The system must not invent a mood.

## Main research experiment

Compare:

``` text
Face only
Text only
Face + Text
```

Measure:

-   accuracy;
-   macro-F1;
-   confusion matrix;
-   agreement with participant self-report.

### Exit criteria

The fusion method, weighting strategy and missing-modality behaviour are
experimentally justified and frozen.

------------------------------------------------------------------------

# Phase 8 --- Adaptive Intelligence and Safety

## Goal

Use the mood estimate to change conversational behaviour safely.

## Response modes

### Normal

Standard supportive conversation.

### Mild distress

Gentler, more reassuring response.

### Higher distress

Supportive response plus appropriate supportive content.

### Safety concern

Follow the predefined escalation policy and encourage appropriate
human/professional support.

These states are **not clinical diagnoses**.

## Adaptation

Mood may affect:

-   tone;
-   wording;
-   response length;
-   reassurance;
-   supportive-content suggestions.

Mood should not automatically change factual medical advice.

> **Superseded 2026-08-28.** The system provides no factual medical advice, so this rule
> holds trivially. Factual questions are acknowledged, supported and redirected to a
> health professional. See `../decisions/MEDICAL_KNOWLEDGE_BASE_DECISION.md`.

## Safety testing

Create scenarios covering:

-   sadness;
-   fear;
-   anxiety-like language;
-   hopelessness;
-   emergency statements;
-   self-harm-related statements;
-   diagnosis requests;
-   medication requests.

## Research comparison

Build:

``` text
A — Non-adaptive chatbot
B — Mood-aware chatbot
```

Measure:

-   supportiveness;
-   appropriateness;
-   empathy;
-   naturalness;
-   satisfaction.

### Exit criteria

Adaptive response logic and safety rules work and are ready for user
evaluation.

------------------------------------------------------------------------

# Phase 9 --- Offline Storage and Supportive Content

## Goal

Implement supporting product functionality.

## Local storage

Store:

-   conversation history;
-   selected mood summaries;
-   saved content;
-   settings;
-   consent state.

Never store raw facial frames.

## Offline behaviour

Expected baseline:

``` text
Chat history → available
Saved content → available
Settings → available
Local FER → potentially available
LLM response → requires network unless an offline model exists
```

Do not claim the entire chatbot is offline unless the implementation
actually supports it.

## Supportive content

Music/supportive content should be:

-   appropriately licensed;
-   culturally appropriate;
-   clearly labelled as supportive;
-   not described as medical treatment.

### Exit criteria

Local history, saved content, offline states and privacy controls work
correctly.

------------------------------------------------------------------------

# Phase 10 --- Integration With the Wider MaternaLink System

## Goal

Connect IT22638168 to the other components without tightly coupling the
implementation.

## Conceptual integration

``` text
Approved health/risk context
          ↓
     IT22638168
          ↓
Mood-aware conversation
          ↓
Structured mood summary
          ↓
Wider maternal system
```

## Potential shared information

-   user/session ID;
-   approved pregnancy context;
-   relevant risk flags;
-   mood summary;
-   timestamp;
-   confidence;
-   escalation state.

Only necessary information should be exchanged.

## Mood summary

Example:

``` json
{
  "timestamp": "...",
  "mood_state": "distressed",
  "confidence": 0.81,
  "modalities": ["text", "face"],
  "source": "fusion"
}
```

Never export raw facial images.

## Integration tests

Test:

-   user mapping;
-   session mapping;
-   missing context;
-   stale context;
-   API failures;
-   duplicate requests;
-   invalid data;
-   privacy boundaries.

### Exit criteria

Integration contracts are agreed, implemented and tested.

------------------------------------------------------------------------

# Phase 11 --- Testing and Research Evaluation

## Goal

Prove both technical performance and research value.

This is more than checking whether the app runs.

## AI evaluation

### FER

Report:

-   accuracy;
-   precision;
-   recall;
-   macro-F1;
-   confusion matrix;
-   confidence distribution;
-   pose/condition analysis;
-   mobile inference latency.

### Text

Report:

-   English performance;
-   Sinhala performance;
-   pregnancy-domain performance;
-   macro-F1;
-   confusion matrix;
-   error categories.

## Fusion evaluation

Compare:

``` text
Face only
Text only
Face + Text
```

Questions:

1.  Does fusion improve performance?
2.  When does face help?
3.  When does text help?
4.  What happens when one modality is missing?
5.  Does confidence-aware fusion improve reliability?

## Self-report

Participants provide a simple mood reference after selected
interactions.

Compare:

``` text
System mood
     vs
Participant self-report
```

This is a validation reference, not a clinical diagnostic ground truth.

## Adaptive-response evaluation

Compare:

``` text
Non-adaptive chatbot
vs
Mood-aware chatbot
```

Measure:

-   appropriateness;
-   supportiveness;
-   empathy;
-   naturalness;
-   satisfaction.

## Engineering evaluation

Measure:

-   app startup time;
-   FER inference time;
-   backend latency;
-   LLM latency;
-   memory usage;
-   model size;
-   offline reliability;
-   crash/error rate.

## Privacy evaluation

Verify:

-   explicit camera permission;
-   camera disable;
-   raw-frame disposal;
-   no unintended image uploads;
-   local data handling;
-   deletion behaviour;
-   sensitive data not exposed in logs.

## Usability

Evaluate:

-   Sinhala usability;
-   English usability;
-   navigation;
-   camera controls;
-   readability;
-   comfort with mood sensing;
-   usefulness of responses.

### Exit criteria

All planned model, fusion, user, privacy and engineering experiments
have reproducible results.

------------------------------------------------------------------------

# Phase 12 --- Final Validation, Documentation and Demonstration

## Goal

Freeze the final research artefact.

## Code freeze

Freeze:

-   mobile version;
-   backend version;
-   model versions;
-   datasets;
-   configuration;
-   API version.

Create a release tag.

## Documentation

Prepare:

``` text
README.md
ARCHITECTURE.md
API.md
MODEL_CARD_FER.md
TEXT_MODEL_REPORT.md
FUSION_REPORT.md
PRIVACY.md
SAFETY.md
TESTING.md
DEPLOYMENT.md
```

## Final academic evidence

The final dissertation should document:

1.  problem;
2.  literature;
3.  research gap;
4.  objectives;
5.  methodology;
6.  system design;
7.  implementation;
8.  experiments;
9.  results;
10. limitations;
11. conclusion.

## Final demonstration

The demo should show:

``` text
Open app
   ↓
Consent
   ↓
Sinhala/English chat
   ↓
Text mood analysis
   ↓
Camera-enabled mood sensing
   ↓
Face + Text fusion
   ↓
Mood-aware response
   ↓
Supportive content
   ↓
History
   ↓
Camera disabled → text-only fallback
```

### Exit criteria

Final mobile build, backend, models, documentation, evaluation results,
dissertation evidence and presentation are complete.

------------------------------------------------------------------------

# 13. Overall Dependency

``` text
PHASE 1 — DESIGN
       ↓
PHASE 2 — DATA
       ↓
   +---+---+
   ↓       ↓
PHASE 3  PHASE 4
FER      TEXT
   +---+---+
       ↓
PHASE 5 — MOBILE
       +
PHASE 6 — BACKEND
       ↓
PHASE 7 — FUSION
       ↓
PHASE 8 — ADAPTIVE INTELLIGENCE
       ↓
PHASE 9 — OFFLINE / CONTENT
       ↓
PHASE 10 — SYSTEM INTEGRATION
       ↓
PHASE 11 — EVALUATION
       ↓
PHASE 12 — FINALIZATION
```

Several phases can run in parallel. For example, FER and text modelling
can proceed together, while the mobile and backend teams can use mock
mood outputs before the real models are finished.

**Phase 1 / Phase 2 overlap (added 2026-08-19).** Phase 2 depends on exactly one Phase 1
artefact — the mood state specification — so Phase 2 dataset preparation begins at
**Gate 1A** while the remaining Phase 1 items (safety sign-off, storage spike, target
device, mock end-to-end, governance) close as **Gate 1B** alongside it. See the Phase 1
exit criteria above.

------------------------------------------------------------------------

# 14. Development Milestones

## Milestone 1 --- Basic Product

``` text
Mobile UI
+
Basic chatbot
```

## Milestone 2 --- Independent AI

``` text
FER
+
Bilingual text mood model
```

## Milestone 3 --- Multimodal Intelligence

``` text
FER
+
Text
→
Mood
```

## Milestone 4 --- Adaptive Chatbot

``` text
Mood
→
Response adaptation
```

## Milestone 5 --- Product Features

``` text
History
+
Offline content
+
Privacy
+
Supportive content
```

## Milestone 6 --- Full System

``` text
Mobile
+
Backend
+
FER
+
Text
+
Fusion
+
Adaptive chatbot
+
Integration
```

## Milestone 7 --- Research Validation

``` text
Experiments
+
Ablation
+
User evaluation
+
System benchmarks
```

------------------------------------------------------------------------

# 15. Suggested Repository Structure

``` text
IT22638168/
│
├── mobile/
│   ├── app/
│   ├── components/
│   ├── screens/
│   ├── services/
│   ├── storage/
│   ├── models/
│   └── assets/
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── models/
│   │   ├── safety/
│   │   └── config/
│   └── tests/
│
├── ml/
│   ├── fer/
│   │   ├── data/
│   │   ├── notebooks/
│   │   ├── training/
│   │   ├── evaluation/
│   │   └── export/
│   │
│   ├── text/
│   │   ├── data/
│   │   ├── training/
│   │   └── evaluation/
│   │
│   └── fusion/
│       ├── experiments/
│       ├── evaluation/
│       └── inference/
│
├── research/
│   ├── literature/
│   ├── datasets/
│   ├── experiments/
│   ├── results/
│   └── analysis/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── privacy/
│   ├── safety/
│   └── deployment/
│
└── README.md
```

------------------------------------------------------------------------

# 16. Definition of Done

## AI

-   [ ] FER evaluated
-   [ ] Text models evaluated
-   [ ] Fusion evaluated
-   [ ] Missing-modality handling works
-   [ ] Model versions frozen

## Mobile

-   [ ] Sinhala works
-   [ ] English works
-   [ ] Chat works
-   [ ] Camera consent works
-   [ ] Camera disable works
-   [ ] History works
-   [ ] Offline features work

## Backend

-   [ ] Chat API works
-   [ ] LLM integration works
-   [ ] Safety layer works
-   [ ] Error handling works
-   [ ] Integration APIs work

## Privacy

-   [ ] Raw frames are not stored
-   [ ] Raw frames are not transmitted
-   [ ] Consent is explicit
-   [ ] Camera state is visible
-   [ ] Data minimization is verified

## Research

-   [ ] Face-only experiment
-   [ ] Text-only experiment
-   [ ] Face+Text experiment
-   [ ] Self-report comparison
-   [ ] Adaptive vs non-adaptive evaluation
-   [ ] Usability evaluation
-   [ ] Engineering benchmarks

## Final

-   [ ] Final mobile build
-   [ ] Final backend
-   [ ] Final models
-   [ ] Documentation
-   [ ] Dissertation
-   [ ] Presentation
-   [ ] Demonstration

------------------------------------------------------------------------

# 17. Decisions That Are Now Project Baselines

Unless new evidence or an implementation constraint requires a formal
revision:

1.  Core modalities are **Face + Text**.
2.  Typing speed and response delay are **not** core fusion signals.
3.  FER is intended for **on-device inference**.
4.  Raw facial frames are **not stored**.
5.  Camera sensing requires **explicit consent**.
6.  Text-only fallback is required.
7.  The system is **not a clinical diagnostic tool**.
8.  Fusion weights must be **empirically justified**.
9.  Sinhala performance must be evaluated separately.
10. Adaptive response quality must be evaluated with users.

------------------------------------------------------------------------

# 18. Immediate Next Step

The first implementation task is **Phase 1 --- Detailed System Design**.

Before training models or building the complete application, produce:

1.  Final architecture diagram
2.  Module list
3.  Module responsibilities
4.  Input/output definitions
5.  API contracts
6.  Local-storage schema
7.  Mood-state specification
8.  Fusion specification
9.  Safety specification
10. Privacy specification
11. Technology stack
12. Repository structure
13. Development environment
14. Phase 1 verification checklist

Once Phase 1 is approved, proceed to Phase 2 dataset preparation and
Phase 3/4 model development.

------------------------------------------------------------------------

# Final Strategy

The project is built as:

**Design → Data → Models → Mobile → Backend → Fusion → Adaptive
Intelligence → Offline/Product Features → Integration → Evaluation →
Finalization**

The key principle is:

> **We are not only building an app. We are building a research system
> where every important AI decision can be measured, explained,
> reproduced and defended during evaluation and viva.**
