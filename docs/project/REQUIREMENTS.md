# IT22638168 — Functional and Non-Functional Requirements

**Status:** Phase 1 design baseline  
**Core architecture:** Face + Sinhala/English Text → Mood Fusion → Adaptive Chatbot

## 1. Scope

This component is a supportive conversational system for pregnant women. It is **not a clinical diagnostic system**.

Core mood signals:
1. Facial affect.
2. Sinhala/English text mood.

Typing speed and response delay are **not** core fusion inputs.

## 2. Actors

| Actor | Responsibility |
|---|---|
| User | Chat, consent, camera/settings |
| FER model | Facial mood evidence |
| Text model | Text mood evidence |
| Fusion engine | Combines evidence |
| Chatbot/LLM | Generates response |
| Safety layer | Applies safety constraints |
| Backend | API/LLM/integration orchestration |
| Wider system | Approved health/risk context |
| Researcher | Controlled evaluation |

## 3. Functional Requirements

### FR-01 Application
Launch the mobile application without requiring camera permission.

### FR-02 Bilingual Interface
Support Sinhala and English UI/content paths with correct Unicode rendering.

### FR-03 Text Chat
Allow users to send messages and receive chatbot responses.

### FR-04 Conversation Context
Maintain sufficient session context for coherent follow-up responses.

### FR-05 Camera Consent
Explain camera sensing and obtain permission before camera access.

### FR-06 Camera Disable
Allow the user to disable facial sensing at any time.

### FR-07 Facial Mood Inference
When enabled, process camera input with the selected lightweight FER model and produce mood evidence/confidence.

### FR-08 On-Device FER
Normal FER operation shall not require uploading raw camera frames.

### FR-09 Raw Frame Disposal
Raw facial frames shall not be persistently stored during normal operation.

### FR-10 Text Mood Inference
Analyse Sinhala/English text and return a mood result/confidence where supported.

### FR-11 Language Handling
Handle Sinhala, English, defined mixed-language cases, and unknown/unsupported cases safely.

### FR-12 Confidence Handling
Low-confidence model outputs can be excluded from fusion.

### FR-13 Mood Fusion
Combine available face/text evidence using the approved fusion method.

### FR-14 Missing Modalities
Support face+text, text-only, face-only and neither-modality cases without inventing a mood.

### FR-15 Adaptive Response
Adapt tone, empathy, reassurance and supportive-content suggestions using the application mood state.

### FR-16 Safety Response
Apply predefined safety rules to high-risk scenarios; safety must not depend solely on unconstrained LLM output.

### FR-17 No Diagnosis
Never present model output as proof of depression, anxiety or another clinical condition.

### FR-18 Local History
Provide conversation history according to the approved storage policy and allow supported deletion.

### FR-19 Privacy Controls
Provide camera state and relevant local-data controls.

### FR-20 Supportive Content
Provide approved music/resources where included; do not present them as medical treatment.

### FR-21 Offline Degradation
Handle network loss gracefully and retain only the offline functions actually supported.

### FR-22 Versioned APIs
Use documented, versioned mobile/backend APIs.

### FR-23 Integration Context
Accept only approved fields from the wider MaternaLink system.

### FR-24 Mood Summary
Where integration requires it, export structured mood state/confidence/modalities/model versions without raw facial images.

### FR-25 Research Instrumentation
Support approved experiment metadata such as run ID, condition, model version and metrics without unnecessary sensitive content.

## 4. Non-Functional Requirements

### NFR-01 Privacy
Minimize access to sensitive data and resources and obtain informed consent. OWASP MASVS-PRIVACY-1 establishes this principle. (OWASP MASVS v2, MASVS-PRIVACY-1.)

### NFR-02 Secure Storage
Sensitive local data must be appropriately protected and leakage prevented. (OWASP MASVS v2, MASVS-STORAGE-1 and MASVS-STORAGE-2.)

### NFR-03 Logging
Production logs must not contain raw frames, full sensitive conversations, secrets, tokens or unnecessary health information. (OWASP MASVS v2, MASVS-STORAGE-2.)

### NFR-04 Transparency
Explain relevant data collection and usage clearly. (OWASP MASVS v2, MASVS-PRIVACY-3.)

### NFR-05 User Control
Users must control camera sensing and supported local data. (OWASP MASVS v2, MASVS-PRIVACY-4.)

### NFR-06 Availability
Camera failure must not make text chat unusable.

### NFR-07 Graceful Degradation
Safely handle camera failure, low confidence, model failure, backend failure and LLM failure.

### NFR-08 Performance
Measure FER latency, model size/memory, backend latency and LLM latency. Exact targets will be set after device benchmarking rather than invented.

The measurement protocol, metric definitions, device policy and freeze schedule are defined
in `PERFORMANCE_BENCHMARK_PLAN.md`. That plan distinguishes four concepts that
must not be conflated: **proposal target** (the 3 s FER / 5 s chatbot aspirations in
Proposal §5.3), **engineering requirement** (set at Phase 3 / Phase 6), **measured result**
(produced by the protocol), and **acceptance threshold** (set at Phase 11). No performance
value may be estimated, and emulator timings are never reported as device results.

### NFR-09 Android Compatibility
Test on representative Android devices and document the supported range.

### NFR-10 Sinhala Rendering
Sinhala must render correctly in chat, consent, settings, content and errors.

### NFR-11 Maintainability
Models, fusion rules, safety rules and APIs must be independently versionable.

### NFR-12 Reproducibility
Experiments must record dataset/model/code versions, parameters, seed where relevant, device and metrics.

### NFR-13 Security
Use appropriate TLS, authentication/authorization, validation, limits, secure secrets and safe errors.

### NFR-14 Data Minimization
Collect only data required for product, integration or approved research purposes.

### NFR-15 Safety
Prefer safe fallback behaviour over unsupported confident mood interpretation.

## 5. Out of Scope

- Clinical depression/anxiety diagnosis.
- Medical treatment recommendations.
- Autonomous medical decisions.
- Raw facial-image database.
- Behavioural-signal fusion.
- Claims that pregnancy chatbot or multimodal emotion recognition is inherently novel.
