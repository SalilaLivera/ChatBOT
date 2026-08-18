# IT22638168 — System Design Specification

**Status:** Phase 1 design baseline
**Consolidated:** 2026-08-19

This document is the authoritative system design specification. It consolidates six
previously separate documents into one coherent specification. **No technical content was
changed** — the parts below are the original documents verbatim, with heading levels
shifted down one so they nest under their Part heading.

| Part | Content | Original document |
|---|---|---|
| 1 | System Architecture | `01_System_Architecture_Specification.md` |
| 2 | Modules and Submodules (M1–M12) | `02_Module_and_Submodule_Specification.md` |
| 3 | API and Data Contract | `03_API_and_Data_Contract.md` |
| 4 | Data, Privacy and Safety Architecture | `04_Data_Privacy_and_Safety_Architecture.md` |
| 5 | Technology and Model Selection | `05_Technology_and_Model_Selection.md` |
| 6 | Local Storage and Data Schema | `IT22638168_Local_Storage_and_Data_Schema.md` |

**Related specifications kept separate** because they are formal, individually-frozen
documents referenced in their own right:

- `MOOD_STATE_SPEC.md` — the four mood states, mood/safety separation, parameter register
- `SAFETY_POLICY.md` — safety categories, deterministic detection, escalation wording
- `PERFORMANCE_BENCHMARK_PLAN.md` — measurement protocol for NFR-08
- `../project/REQUIREMENTS.md` — FR-01–FR-25, NFR-01–NFR-15

---


# Part 1 — System Architecture

> Source: `01_System_Architecture_Specification.md` (content unchanged).

## IT22638168 — System Architecture Specification

**Status:** Design baseline  
**Date:** 2026-08-18  
**Architecture:** Face + Sinhala/English Text → Mood Fusion → Adaptive Chatbot

### 1. Source Basis

This specification is derived from the current IT22638168 proposal, the completed literature review, the research-gap analysis, and targeted current technical/security research.

The original proposal defines a four-layer architecture: chat interface, background mood detection, mood fusion/adaptive response, and local offline storage. It also specifies React Native/Expo, TensorFlow Lite, FER-2013/AffectNet, Sinhala NLP, Node.js and local storage as the main implementation environment. (Proposal §3.3 and §4.2.)

The literature review subsequently changed the core signal architecture. It recommends removing typing speed and response delay from the core fusion score because the evidence supports them as interesting but insufficiently validated, user-dependent signals for a generic fixed safety-sensitive weight. The revised core is Face + bilingual Text. (Literature Review §11; Behavioural Signal Decision Memo, `docs/decisions/`.)

### 2. System Boundary

#### In scope

- Android/mobile conversational interface.
- Sinhala and English text interaction.
- Optional front-camera facial affect inference.
- On-device FER inference.
- Bilingual text mood inference.
- Transparent two-signal fusion.
- Mood-conditioned conversational adaptation.
- Supportive content/music.
- Local conversation history.
- Privacy and consent controls.
- Integration interfaces with the wider MaternaLink system.
- Research evaluation.

#### Out of scope

- Clinical diagnosis.
- Depression/anxiety diagnosis.
- Medical decision making.
- Raw facial-image storage.
- Behavioural signals controlling core mood.
- Claiming pregnancy chatbot or multimodal fusion itself is novel.

### 3. Logical Architecture

```text
+----------------------------------------------------------+
|                    MOBILE APPLICATION                    |
|                                                          |
|  Chat UI   Camera/Consent   History   Settings   Music  |
|      |          |              |          |        |     |
+------+----------+--------------+----------+--------+-----+
       |                         |
       | text                    | temporary frame
       v                         v
+---------------+        +--------------------+
| Text Mood     |        | On-device FER      |
| Inference     |        | TFLite model      |
| Sinhala/EN    |        | confidence        |
+-------+-------+        +---------+----------+
        |                          |
        +------------+-------------+
                     v
              +-------------+
              | Mood Fusion |
              | Engine      |
              +------+------+
                     |
                     v
              +-------------+
              | Mood State  |
              +------+------+
                     |
                     v
              +-------------+
              | Adaptive    |
              | Response +  |
              | Safety      |
              +------+------+
                     |
                     v
              +-------------+
              | Backend/API |
              | + LLM       |
              +------+------+
                     |
                     v
                 Response

Local storage remains on-device for history/settings/content.
Raw camera frames terminate at the FER inference boundary.
```

### 4. Runtime Data Flow

#### 4.1 Text-only interaction

```text
User message
 → language detection
 → text preprocessing
 → text mood model
 → confidence check
 → mood result
 → fusion
 → adaptive policy
 → backend/LLM
 → response
```

#### 4.2 Camera-enabled interaction

```text
Camera permission
 → temporary frame
 → face preprocessing
 → FER
 → confidence/quality check
 → raw frame discarded
 → facial mood result
 → fusion with text
 → adaptive policy
 → backend/LLM
 → response
```

#### 4.3 Camera unavailable

The system must degrade gracefully:

```text
No camera / low FER confidence
 → text mood only
 → adaptive response
```

The system must never invent a facial mood result.

### 5. Architectural Layers

#### Layer 1 — Presentation

Responsibilities:

- chat;
- camera consent;
- camera status;
- language selection;
- history;
- settings;
- supportive content;
- errors/loading states.

#### Layer 2 — Local AI

Responsibilities:

- language detection;
- text preprocessing;
- text mood inference where appropriate;
- camera frame preprocessing;
- TFLite FER inference;
- confidence handling;
- temporal smoothing.

#### Layer 3 — Mood Intelligence

Responsibilities:

- normalize modality outputs;
- fuse face/text;
- handle missing modalities;
- produce application-level mood state;
- pass structured context to response policy.

#### Layer 4 — Conversational Backend

Responsibilities:

- API validation;
- session/context handling;
- LLM request;
- response policy;
- safety checks;
- integration with wider system.

#### Layer 5 — Local Data

Responsibilities:

- chat history;
- settings;
- consent state;
- saved supportive content;
- optional mood summaries.

### 6. Key Architectural Principle

The system separates:

**Inference** from **decision policy**.

FER and text models produce evidence.

The fusion engine produces an application-level mood estimate.

The response policy decides how the chatbot should behave.

The LLM does not independently decide whether the user is clinically distressed.

### 7. Deployment Split

#### On device

- UI;
- camera capture;
- FER;
- local storage;
- consent/privacy controls;
- supportive content;
- optionally text preprocessing.

#### Backend

- chatbot API;
- LLM orchestration;
- safety policy enforcement;
- integration with other project components;
- non-sensitive application state where required.

#### Why

The proposal already targets on-device FER for privacy and offline operation. Current OWASP MASVS guidance also emphasizes minimizing access to sensitive resources, transparency, user control and secure storage. (OWASP MASVS v2, PRIVACY and STORAGE groups.)

### 8. Failure Architecture

Every external dependency must have a fallback.

| Failure | Required behaviour |
|---|---|
| Camera permission denied | Text-only mode |
| FER low confidence | Ignore FER result |
| Text model unavailable | Normal chatbot mode |
| Backend unavailable | Show offline/connection state |
| LLM timeout | Retry or safe fallback |
| Local storage failure | Continue session if possible; notify user |
| Invalid integration context | Ignore invalid field; do not crash |
| Unsafe LLM output | Replace/block according to safety policy |

### 9. Research Architecture

The architecture must make ablation possible:

```text
Experiment A: Text only
Experiment B: Face only
Experiment C: Face + Text
Experiment D: Face + Text + confidence handling
```

This is important because the research question is not simply whether the app works; it is whether combining the two modalities provides useful evidence for adaptive conversational support.

### 10. Architecture Acceptance Criteria

- [ ] Core modalities are Face + bilingual Text.
- [ ] Behavioural telemetry cannot alter the core mood state.
- [ ] FER can operate without backend image upload.
- [ ] Camera denial produces a working text-only mode.
- [ ] Fusion accepts missing modalities.
- [ ] LLM receives structured mood context rather than raw model internals.
- [ ] Raw frames are not persisted.
- [ ] Architecture supports ablation experiments.

---

# Part 2 — Modules and Submodules

> Source: `02_Module_and_Submodule_Specification.md` (content unchanged).

## IT22638168 — Module and Submodule Specification

### 1. Module Map

| ID | Module | Main responsibility | Runs |
|---|---|---|---|
| M1 | Mobile Presentation | User interaction | Device |
| M2 | Consent & Privacy | Camera/data controls | Device |
| M3 | Camera/FER | Facial affect inference | Device |
| M4 | Bilingual Text Mood | Text affect inference | Device/backend depending final benchmark |
| M5 | Mood Fusion | Combine face/text evidence | Device/backend |
| M6 | Adaptive Response Policy | Convert mood into response behaviour | Backend |
| M7 | Chatbot/LLM | Generate conversational response | Backend |
| M8 | Safety Layer | Constrain unsafe/high-risk responses | Backend + deterministic rules |
| M9 | Local Storage | History/settings/content | Device |
| M10 | Supportive Content | Music/content recommendations | Device |
| M11 | Integration Gateway | Wider MaternaLink communication | Backend |
| M12 | Evaluation/Telemetry | Research measurements | Controlled research environment |

### 2. M1 — Mobile Presentation

#### Submodules

- Navigation
- Chat screen
- Camera state UI
- History screen
- Settings
- Language UI
- Supportive content player
- Error/loading states

#### Inputs

- user actions;
- API responses;
- mood-state display data.

#### Outputs

- text messages;
- camera permission requests;
- settings changes;
- API requests.

#### Acceptance

The user must be able to complete a chat session without camera access.

---

### 3. M2 — Consent and Privacy

#### Responsibilities

- Explain camera use.
- Obtain explicit permission.
- Show whether camera sensing is active.
- Allow disabling.
- Explain what is stored and what is not.
- Prevent model execution before required consent.

OWASP MASVS-PRIVACY-1 recommends minimizing access to sensitive resources and obtaining informed consent. (OWASP MASVS v2, MASVS-PRIVACY-1.)

#### Acceptance

- No hidden camera use.
- No processing before required consent.
- Camera disable is immediate.
- Privacy information is available in Sinhala and English.

---

### 4. M3 — Camera / FER

#### Pipeline

```text
Camera
 → Frame quality
 → Face detection/crop
 → Resize/normalize
 → MobileNetV2-family classifier
 → Confidence
 → Temporal smoothing
 → Mood result
```

#### Inputs

Temporary camera frame.

#### Outputs

```json
{
  "class": "neutral",
  "confidence": 0.82,
  "timestamp": "..."
}
```

#### Constraints

- no raw frame persistence;
- no automatic upload;
- low-confidence results may be discarded.

#### Research

Evaluate:

- accuracy;
- macro-F1;
- confusion matrix;
- pose;
- lighting;
- mobile latency.

---

### 5. M4 — Bilingual Text Mood

#### Submodules

- language detection;
- Unicode normalization;
- Sinhala preprocessing;
- English preprocessing;
- model inference;
- confidence estimation.

#### Language strategy

English and Sinhala must be evaluated independently.

Recent Sinhala transformer research shows that transformer approaches are viable but still have materially lower benchmark performance than mature English sentiment systems; one 2025 study reported XLM-R-large at 75.90% accuracy / 72.31 macro-F1 for three-class Sinhala news-comment sentiment. This is a news-comment benchmark, not a pregnancy-chat benchmark, so it should guide model selection rather than be treated as expected project performance. [S2]

#### Output

```json
{
  "language": "si",
  "class": "distressed",
  "confidence": 0.76
}
```

---

### 6. M5 — Mood Fusion

#### Responsibilities

- align label spaces;
- normalize scores;
- weight modalities;
- handle confidence;
- handle missing modalities;
- emit one application-level state.

#### Initial model

Late fusion:

```text
Fused(c) =
  Wf × Face(c)
  +
  Wt × Text(c)
```

where:

```text
Wf + Wt = 1
```

The final weights must be selected experimentally.

#### No behaviour

Typing speed/response delay are not a third input.

---

### 7. M6 — Adaptive Response Policy

#### Responsibilities

Map application mood to conversational behaviour.

Example:

```text
CALM/NEUTRAL
 → normal supportive response

DISTRESSED
 → more empathetic wording
 → optional supportive content

HIGH-SAFETY CONCERN
 → deterministic safety guidance
```

Mood must not be represented as a medical diagnosis.

---

### 8. M7 — Chatbot / LLM

#### Responsibilities

- generate natural language;
- preserve language;
- use conversation context;
- follow response policy;
- remain pregnancy-appropriate.

#### Input

Structured context:

```json
{
  "language": "si",
  "mood_state": "distressed",
  "mood_confidence": 0.81,
  "conversation_context": "...",
  "safety_state": "normal"
}
```

#### Output

Natural-language response plus internal metadata where needed.

---

### 9. M8 — Safety Layer

#### Deterministic checks

Detect requests/statements involving:

- medical diagnosis;
- medication;
- emergencies;
- self-harm;
- severe distress;
- unsafe instructions.

#### Principle

The safety layer must not depend entirely on the LLM's own judgement.

---

### 10. M9 — Local Storage

#### Candidate entities

```text
Conversation
Message
MoodSummary
SavedContent
ConsentState
UserSettings
```

#### Important security rule

OWASP recommends minimizing sensitive local storage and protecting sensitive data at rest. (OWASP MASVS v2, MASVS-STORAGE-1 and MASVS-STORAGE-2.)

Raw facial frames are excluded from the schema.

---

### 11. M10 — Supportive Content

Includes:

- licensed/royalty-free music;
- calming content;
- informational/supportive resources.

Music is an adjunct, not a treatment claim. The literature review supports cautious inclusion based on antenatal music-intervention evidence while noting heterogeneity and risk of bias. (Literature Review §9; [T1]–[T3].)

---

### 12. M11 — Integration Gateway

#### Responsibilities

- receive approved context from other maternal-health components;
- expose structured mood summaries if required;
- validate identity/session fields;
- enforce minimum-data exchange.

The wider proposal identifies IT22638168 as the mood-aware conversational layer and describes interaction with the health/risk component. (Proposal §1.1.5 and §5.2 FR9.)

---

### 13. M12 — Evaluation/Telemetry

Research-only data may include:

- model predictions;
- confidence;
- latency;
- experimental condition;
- participant self-report;
- response ratings.

Do not mix research telemetry with production user data without ethics approval and explicit documentation.

---

# Part 3 — API and Data Contract

> Source: `03_API_and_Data_Contract.md` (content unchanged).

## IT22638168 — API and Data Contract

### 1. Purpose

This document defines the interfaces between mobile, AI services, chatbot backend and the wider maternal-health system.

The API is a design contract. Exact endpoint names may change during implementation, but the data responsibilities should remain stable.

---

## 2. Client → Backend

### POST /api/v1/chat

#### Request

```json
{
  "session_id": "string",
  "message": "string",
  "language": "si|en|mixed",
  "mood": {
    "state": "calm|neutral|distressed|unknown",
    "confidence": 0.0,
    "modalities": ["text", "face"]
  }
}
```

#### Response

```json
{
  "response": "string",
  "language": "si",
  "response_mode": "normal|supportive|safety",
  "content_suggestion": null,
  "session_id": "string"
}
```

The backend should not require raw camera frames.

---

## 3. Text Mood Endpoint

### POST /api/v1/mood/text

```json
{
  "text": "string",
  "language": "si"
}
```

Response:

```json
{
  "language": "si",
  "mood": {
    "calm": 0.10,
    "neutral": 0.20,
    "distressed": 0.70
  },
  "predicted_state": "distressed",
  "confidence": 0.70,
  "model_version": "..."
}
```

---

## 4. Facial Mood Interface

FER is intended to be on-device.

The preferred production interface is therefore:

```text
Device camera
 → local FER
 → structured result
```

not:

```text
Camera
 → raw image upload
 → backend FER
```

Example local result:

```json
{
  "mood": {
    "calm": 0.20,
    "neutral": 0.15,
    "distressed": 0.65
  },
  "predicted_state": "distressed",
  "confidence": 0.65,
  "model_version": "fer-v1"
}
```

---

## 5. Fusion Interface

### Input

```json
{
  "face": {
    "state": "distressed",
    "confidence": 0.65,
    "scores": {
      "calm": 0.20,
      "neutral": 0.15,
      "distressed": 0.65
    }
  },
  "text": {
    "state": "distressed",
    "confidence": 0.70,
    "scores": {
      "calm": 0.10,
      "neutral": 0.20,
      "distressed": 0.70
    }
  }
}
```

### Output

```json
{
  "state": "distressed",
  "confidence": 0.68,
  "modalities_used": ["face", "text"],
  "fusion_version": "fusion-v1"
}
```

---

## 6. Missing Modality Rules

```text
face = unavailable
text = available
→ text-only

face = available
text = unavailable
→ face-only

face = low confidence
text = available
→ text-only

both unavailable
→ unknown
```

Unknown must not be converted into distress automatically.

---

## 7. History API

### GET /api/v1/history

Returns only the minimum information required by the mobile history screen.

Example:

```json
{
  "sessions": [
    {
      "session_id": "s1",
      "started_at": "...",
      "last_message_preview": "...",
      "final_mood": "neutral"
    }
  ]
}
```

If the design remains fully local for history, this API should not be implemented.

---

## 8. Supportive Content

### GET /api/v1/supportive-content

Only required if content is remotely managed.

For a fully bundled/local prototype, content can remain in the application package and local storage.

---

## 9. Integration Contract

### GET /api/v1/integration/context

Potential response:

```json
{
  "session_id": "...",
  "approved_health_context": {
    "risk_level": "..."
  }
}
```

Only approved fields from the wider system may be consumed.

---

## 10. Mood Summary Export

```json
{
  "session_id": "...",
  "timestamp": "...",
  "state": "distressed",
  "confidence": 0.81,
  "modalities": ["face", "text"],
  "source": "fusion",
  "model_versions": {
    "face": "fer-v1",
    "text": "text-v1",
    "fusion": "fusion-v1"
  }
}
```

No raw facial image is included.

---

## 11. API Security

The final implementation should apply:

- HTTPS/TLS;
- authentication where required;
- authorization;
- input validation;
- request size limits;
- rate limiting where appropriate;
- safe error messages;
- no sensitive data in logs.

OWASP MASVS treats secure network communication, authentication/authorization, storage, privacy and platform interaction as distinct mobile security concerns. (OWASP MASVS v2, MASVS-NETWORK, MASVS-AUTH, MASVS-STORAGE, MASVS-PRIVACY and MASVS-PLATFORM groups.)

---

## 12. Versioning

All public contracts should be versioned:

```text
/api/v1/...
```

Breaking changes require a new version.

---

## 13. LLM Provider Boundary

The LLM provider and model are deliberately **not** selected during Phase 1. Technology
and Model Selection §7 records why, and §11 forbids freezing a model merely because it is
named in the proposal or is convenient.

To keep that deferral cheap, the provider sits behind a boundary with the following fixed
properties. Provider selection happens in Phase 6.

### 13.1 Boundary rules

- The Adaptive Response Policy (M6) and the Safety Layer (M8) are **provider-independent**
  and must not import or depend on provider SDK types.
- Only the structured mood context defined in Module Specification §8 crosses the boundary
  inbound; text plus metadata crosses outbound. Nothing provider-shaped crosses it.
- Prompt templates, safety wording and escalation text are **versioned project assets**,
  not provider configuration. Swapping provider must not alter them.
- Safety enforcement never depends on provider-side features. Deterministic checks run on
  our side of the boundary (Safety Policy §1).

### 13.2 Conceptual interface

```text
Structured mood context + conversation context
        ↓
   LLM adapter (provider-specific, replaceable)
        ↓
Response text + { provider, model_id, model_version, latency }
```

### 13.3 Reproducibility

Every research run records provider, model ID and model version alongside its results, so
that a provider change is visible in the experimental record rather than silently
confounding it. NFR-12 already requires this.

### 13.4 Constraint on earlier phases

No Phase 2, 3 or 4 artefact may name or assume an LLM provider.

---

## 14. Error Contract

Example:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "The request could not be processed.",
    "request_id": "..."
  }
}
```

Do not expose internal stack traces or model/system prompts.

---

# Part 4 — Data, Privacy and Safety Architecture

> Source: `04_Data_Privacy_and_Safety_Architecture.md` (content unchanged).

## IT22638168 — Data, Privacy and Safety Architecture

### 1. Risk Context

This is a sensitive application because it can process:

- pregnancy-related conversations;
- emotional-state information;
- facial information;
- health context received from other system components.

The proposal already specifies explicit camera consent, on-device facial processing, no saved/sent photos, local conversation storage and ethics clearance before user testing. (Proposal §3.4, Appendix D and Appendix E.)

Current OWASP MASVS privacy guidance requires data minimization, transparency and user control. (OWASP MASVS v2, MASVS-PRIVACY-1, MASVS-PRIVACY-3 and MASVS-PRIVACY-4.)

---

## 2. Data Classification

| Data | Sensitivity | Default location | Retention |
|---|---|---|---|
| Raw camera frame | Very high | memory only | immediate disposal |
| Facial mood result | High | transient/local summary | minimum required |
| Chat text | High | local history / backend transiently | defined by policy |
| Mood summary | High | local / integration if required | defined by policy |
| Consent state | Medium | local | until changed |
| App settings | Low/medium | local | until changed |
| Music metadata | Low | local | until removed |
| Research participant data | Very high | controlled research storage | ethics-approved period |

---

## 3. Camera Privacy Flow

```text
User sees explanation
       ↓
User grants permission
       ↓
Camera active indicator
       ↓
Temporary frame
       ↓
Local FER
       ↓
Mood result
       ↓
Frame discarded
```

No production path should silently upload the frame.

---

## 4. Consent

Consent UI must explain:

- why camera is used;
- that it is optional;
- where processing occurs;
- whether images are stored;
- how to disable it;
- what happens when disabled.

The proposal's draft notice already follows this pattern. (Proposal Appendix D.)

Consent must be available in Sinhala and English.

---

## 5. User Controls

Settings should include:

- Camera sensing ON/OFF.
- Clear local history.
- Clear saved content.
- Privacy notice.
- Language.
- Optional research participation state where applicable.

OWASP MASVS-PRIVACY-4 explicitly calls for user control over data. (OWASP MASVS v2, MASVS-PRIVACY-4.)

---

## 6. Local Storage

Do not use public/shared storage for sensitive data unless there is a strong reason and appropriate protection.

OWASP recommends minimizing sensitive local storage and protecting data at rest; platform keystore facilities should be used for secrets/keys. (OWASP MASVS v2, MASVS-STORAGE-1, MASVS-STORAGE-2 and MASVS-CRYPTO key-management guidance.)

Recommended principle:

```text
Sensitive
  ↓
Private app storage
  ↓
Encryption where required
  ↓
Platform-protected key material
```

---

## 7. Logging

Never log:

- raw camera frames;
- full sensitive conversations;
- authentication secrets;
- API keys;
- access tokens;
- private health information unnecessarily.

Logs should contain technical identifiers and error categories rather than sensitive content.

---

## 8. LLM Privacy

Only send the minimum conversation/context needed to generate a response.

Avoid sending:

- raw facial images;
- unnecessary health metrics;
- unnecessary identity information.

Mood should be sent as a structured application-level signal.

---

## 9. Safety Boundary

The chatbot is:

> A supportive conversational system.

It is not:

> A diagnostic or clinical decision system.

The system should never claim:

- "you have depression";
- "you are clinically anxious";
- "your facial expression proves distress."

Instead:

- "You seem to be having a difficult moment."
- "Would you like some supportive information?"
- "If you are concerned about your wellbeing, consider speaking with a healthcare professional."

Final wording requires ethics/safety review.

---

## 10. High-Risk Response Layer

The safety layer should identify:

- emergency symptoms;
- self-harm-related content;
- requests for diagnosis;
- medication questions;
- severe distress;
- dangerous instructions.

The LLM should not be the sole safety mechanism.

---

## 11. Integration Safety

Health/risk information from other components must be treated as:

```text
context
```

not as permission for the chatbot to diagnose.

Example:

```text
Risk component says HIGH
        ↓
Chatbot receives approved context
        ↓
Chatbot can respond more carefully
        ↓
Chatbot does NOT independently diagnose
```

---

## 12. Research Ethics

Before human testing:

- ethics approval must be obtained;
- participant consent must be obtained;
- adult participants only according to the current proposal;
- withdrawal must be possible;
- research data must be separately controlled;
- retention/deletion periods must be documented.

The proposal explicitly states that user testing will follow SLIIT Institutional Ethical Review Committee approval and written consent. (Proposal §3.4 and Appendix E.)

---

## 13. Privacy Acceptance Criteria

- [ ] Camera permission is explicit.
- [ ] Camera can be disabled.
- [ ] Raw frames are never persisted.
- [ ] Raw frames are never transmitted in the production architecture.
- [ ] Sensitive local data is protected.
- [ ] Sensitive data is absent from logs.
- [ ] User can clear local data.
- [ ] Third-party SDKs are reviewed.
- [ ] Research data is separated from normal app data.

---

# Part 5 — Technology and Model Selection

> Source: `05_Technology_and_Model_Selection.md` (content unchanged).

## IT22638168 — Technology and Model Selection

### 1. Selection Principle

Technology is selected using:

1. research defensibility;
2. mobile feasibility;
3. Sinhala/English support;
4. privacy;
5. student-accessible tooling;
6. reproducibility;
7. evaluation capability;
8. maintenance complexity.

The original proposal already identifies React Native/Expo, TensorFlow Lite, FER-2013/AffectNet, Sinhala NLP resources, Hugging Face Transformers and Python/Keras as the main stack. (Proposal §3.3.)

---

## 2. Mobile Framework

### Proposed

**React Native + Expo**

#### Why

- cross-platform mobile development;
- Android testing;
- camera integration;
- suitable for the proposed UI;
- consistent with the existing proposal.

The proposal specifically identifies React Native/Expo for the mobile interface and camera access. (Proposal §3.3.)

#### Risk

Some ML/camera integrations may require native configuration beyond a pure Expo workflow.

#### Decision rule

Use Expo where it does not constrain the final FER integration. If a native module requires a development build/prebuild, use that rather than forcing a less suitable architecture.

---

## 3. FER Model

### Proposed baseline

**MobileNetV2-family lightweight classifier → TensorFlow Lite**

#### Why

- lightweight architecture;
- transfer-learning friendly;
- mobile deployment;
- compatible with the original proposal;
- literature supports lightweight/mobile FER but requires real-world evaluation.

#### Data

- FER-2013;
- AffectNet, subject to permitted use and exact dataset terms.

#### Required evaluation

- accuracy;
- macro-F1;
- confusion matrix;
- pose;
- lighting;
- demographic limitations;
- mobile latency.

---

## 4. Text Model

### English

Start with a lightweight transformer baseline such as DistilBERT-family sentiment classification.

Then validate on pregnancy-domain examples.

### Sinhala

Evaluate Sinhala-capable transformers rather than assuming a generic English model is adequate.

Recent ACL-published Sinhala sentiment work compared BERT, DistilBERT, RoBERTa and XLM-RoBERTa and reported XLM-R-large as strongest in that benchmark. However, that benchmark concerns Sinhala news comments rather than pregnancy conversations, so it supports model benchmarking but does not establish expected project performance. [S2]

#### Selection experiment

Compare at least:

- lightweight Sinhala-capable transformer;
- simpler baseline/lexicon approach;
- pregnancy-domain validation.

Choose based on measured accuracy, macro-F1, latency and model size.

---

## 5. Fusion

### Proposed

Transparent late fusion.

```text
Face probabilities
+
Text probabilities
→ weighted combination
→ application mood
```

#### Why

- interpretable;
- easy to ablate;
- easy to explain in a viva;
- supports missing modalities;
- directly testable.

Do not start with a complex neural fusion model unless the simpler method fails to answer the research question.

---

## 6. Backend

### Proposal-aligned baseline

**Node.js + Express**

Responsibilities:

- chat API;
- LLM orchestration;
- safety policy;
- integration.

The proposal identifies Node.js as the backend environment. (Proposal §3.3.)

---

## 7. LLM

The proposal establishes the need for adaptive chatbot responses but does not uniquely determine one LLM provider/model.

Therefore the LLM should remain an implementation choice until:

- API cost;
- privacy;
- latency;
- Sinhala quality;
- safety;
- availability

are benchmarked.

Do not lock the dissertation to a provider merely because it is convenient.

---

## 8. Storage

### Local

Use private application storage for:

- conversation history;
- settings;
- consent state;
- saved supportive content.

### Backend

Store only what is required by the final integration and research design.

OWASP recommends minimizing sensitive local storage and protecting data at rest. (OWASP MASVS v2, MASVS-STORAGE-1 and MASVS-STORAGE-2.)

---

## 9. Security Baseline

Use OWASP MASVS as the security checklist.

Relevant groups:

- MASVS-STORAGE;
- MASVS-CRYPTO;
- MASVS-AUTH;
- MASVS-NETWORK;
- MASVS-PLATFORM;
- MASVS-CODE;
- MASVS-PRIVACY.

(OWASP MASVS v2.)

---

## 10. Technology Decision Matrix

| Area | Candidate | Initial choice | Reason |
|---|---|---|---|
| Mobile | React Native / Expo | Yes | Proposal-aligned |
| FER | MobileNetV2 | Yes | Lightweight/mobile |
| FER runtime | TFLite | Yes | On-device |
| English NLP | DistilBERT-family | Baseline | Lightweight transformer |
| Sinhala NLP | Sinhala-capable transformer + baseline | Evaluate | Low-resource/domain issue |
| Fusion | Late weighted fusion | Yes | Transparent/researchable |
| Backend | Node.js/Express | Yes | Proposal-aligned |
| LLM | Provider/model TBD | Benchmark | Proposal does not justify a unique provider |
| Local storage | Private app storage | Yes | Privacy |
| Security | OWASP MASVS | Baseline | Industry security framework |

---

## 11. Technology Freeze Rule

Do not freeze a model simply because it is named in the proposal.

Freeze it only after:

```text
Candidate
 ↓
Benchmark
 ↓
Domain evaluation
 ↓
Mobile/backend feasibility
 ↓
Privacy review
 ↓
Final selection
```

This is especially important for Sinhala NLP and the LLM.

---

# Part 6 — Local Storage and Data Schema

> Source: `IT22638168_Local_Storage_and_Data_Schema.md` (content unchanged).

## IT22638168 — Local Storage and Data Schema

**Status:** Phase 1 design baseline

### 1. Storage Principle

Store the minimum necessary data. Raw facial frames are **not** persistent application data.

OWASP recommends minimizing sensitive local storage and preventing storage leakage. (OWASP MASVS v2, MASVS-STORAGE-1 and MASVS-STORAGE-2.)

### 2. Data Classification

| Data | Sensitivity | Persistent? | Rule |
|---|---|---:|---|
| Raw camera frame | Very high | **No** | Memory-only FER lifecycle |
| Face mood result | High | Optional | Only if product/research requires |
| User message | High | Yes if history enabled | User-facing history |
| Assistant response | High | Yes if history enabled | User-facing history |
| Mood summary | High | Optional | Derived data only |
| Consent state | Medium/high | Yes | Preserve user choice |
| Settings | Low/medium | Yes | App configuration |
| Saved content | Low | Yes | User-selected content |
| Secrets/tokens | High | Only if required | Secure platform storage |
| Research metadata | High | Separate | Ethics-controlled storage |

### 3. UserSettings

```text
id
language
camera_enabled
history_enabled
created_at
updated_at
```

`camera_enabled` is an application preference and does not replace OS permission.

### 4. ConsentState

```text
id
camera_consent_status
consent_version
granted_at
withdrawn_at
updated_at
```

Status:
`not_requested | granted | withdrawn`

### 5. Conversation

```text
id
started_at
last_activity_at
language
status
```

### 6. Message

```text
id
conversation_id
sender
text
language
created_at
```

Sender:
`user | assistant`

Do not store raw internal system prompts as normal history.

### 7. MoodSummary

```text
id
conversation_id
timestamp
state
confidence
modalities_used
fusion_version
face_model_version
text_model_version
```

Example:

```json
{
  "state": "distressed",
  "confidence": 0.81,
  "modalities_used": ["face", "text"],
  "fusion_version": "fusion-v1",
  "face_model_version": "fer-v1",
  "text_model_version": "text-v1"
}
```

This is derived evidence, not the source camera image.

### 8. SavedContent

```text
id
content_id
title
type
source
saved_at
```

Types can include `music`, `supportive_resource`, `informational_resource`.

### 9. Raw Camera Data

There is deliberately **no RawCameraFrame entity**.

```text
Camera frame
 → memory
 → preprocessing
 → FER
 → prediction
 → frame released
```

### 10. Research Data Separation

```text
Production app
     ↓
Approved research export
     ↓
Controlled research storage
```

Research participant data must follow the approved ethics protocol.

### 11. Storage Technology

> **See `docs/decisions/LOCAL_STORAGE_DECISION.md`.** That memo
> reconciles the Proposal's AsyncStorage reference with the prohibition below by assigning
> the entities in this schema to storage tiers: AsyncStorage-class storage is acceptable for
> `UserSettings` and `SavedContent`, while `Conversation`, `Message`, `MoodSummary` and
> `ConsentState` require encrypted database-style storage. The entities and retention rules
> in this schema are unchanged by that memo. Technology selection remains open pending the
> feasibility spike defined there, and is required before Phase 5.

Select the exact local database after a prototype feasibility test.

Do not use ordinary unencrypted key-value storage for sensitive conversation data. Current React Native guidance distinguishes ordinary AsyncStorage-style storage from secure storage, while OWASP recommends platform-protected key storage for cryptographic keys. (React Native / Expo storage documentation; OWASP MASVS v2, MASVS-CRYPTO key-management guidance.)

### 12. Retention

Default rule:

> If the feature does not require persistence, do not persist the data.

Candidate policy:

| Data | Retention |
|---|---|
| Raw frame | None |
| Conversation | Until user deletes / approved policy |
| Mood summary | Minimum required |
| Consent | Until superseded/withdrawn |
| Settings | Until changed |
| Saved content | Until removed |
| Research data | Ethics-approved period |

Exact retention periods must be finalized before human testing.

### 13. Deletion

Clear-history functionality should remove applicable conversations, messages and user-facing derived mood summaries.

Also review caches, logs, temporary files, backups and exports. OWASP identifies these as possible leakage paths. (OWASP MASVS v2, MASVS-STORAGE-2.)

### 14. Security

Sensitive stored data should use private app storage and appropriate encryption/protection. Do not hardcode encryption keys. OWASP warns against unencrypted sensitive storage and filesystem-stored encryption keys. (OWASP MASVS v2, MASVS-STORAGE-1 and MASVS-CRYPTO key-management guidance.)

### 15. Acceptance

- [ ] No raw-frame entity.
- [ ] Conversation/message schema defined.
- [ ] Mood summary is derived-only.
- [ ] Consent is versioned.
- [ ] Research data is separated.
- [ ] Storage technology selected before implementation.
- [ ] Deletion/retention defined.
- [ ] Backup/cache/log leakage tested.

---
