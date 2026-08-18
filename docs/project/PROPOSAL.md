# IT22638168 — Project Proposal (Revised)

> **Markdown mirror.** Faithful mirror of `IT22638168_Proposal_FINAL.docx`, which remains the authoritative submission document. Content is unchanged; only headings and tables are marked up.

Pregnancy Support System

Project ID: R26-IT-146

Project Proposal Report — Revised

Livera S.D – IT22638168
B.Sc. (Hons) Degree in Information Technology
Department of Information Technology
Sri Lanka Institute of Information Technology

Updated Proposal — Literature-Driven Revision | August 2026

## ABSTRACT

This research proposes a bilingual, mood-aware conversational support component for a broader pregnancy-support application in Sri Lanka. The component is designed for pregnant women who may experience emotional distress between routine antenatal contacts. It combines Sinhala/English conversational support with two complementary mood signals: facial-expression analysis performed on-device and bilingual text-sentiment analysis. The resulting mood estimate is used to adapt the chatbot's response tone and, when a distress threshold is reached, to offer supportive content and encourage appropriate contact with a doctor or midwife. The system is explicitly a support and decision-support feature rather than a diagnostic or therapeutic replacement for clinical care.

Keywords: Pregnancy mental health; Sri Lankan maternal health; bilingual chatbot; Sinhala NLP; facial emotion recognition; multimodal emotion inference; adaptive conversational support; on-device AI

## ACKNOWLEDGEMENT

I thank the supervisor, Dr. Kapila Dissanayake, for guidance throughout the proposal development and for feedback that helped refine the research scope. I also acknowledge the collaboration of the other members of the Pregnancy Support System team: IT22272386, IT22557506, and IT22284716. Their components provide complementary clinical, risk-monitoring, and nutrition functions within the wider maternal-care ecosystem. I also acknowledge the SLIIT Department of Information Technology for the academic resources and infrastructure supporting this research.

## REVISION NOTE

This version supersedes the earlier proposal wording where behavioural signals (typing speed and response delay) were treated as a core mood-fusion input. The completed literature-review work extracted 49 research records and found that behavioural signals are promising but highly user-dependent and insufficiently validated for a generic, safety-sensitive fixed weight. The core architecture is therefore revised to Face + bilingual Text. Behavioural timestamps may be retained as optional telemetry/ablation data but do not control chatbot tone.

## DOCUMENT STRUCTURE

## 1. INTRODUCTION

## 2. OBJECTIVES

## 3. METHODOLOGY

## 4. HIGH-LEVEL SYSTEM ARCHITECTURE

## 5. USER REQUIREMENTS

## 6. COMMERCIALIZATION PLAN

## 7. BUDGET AND JUSTIFICATION

## 8. WORK BREAKDOWN STRUCTURE

## 9. GANTT CHART

## 10. REFERENCES

## 11. APPENDICES

## 1. INTRODUCTION

### 1.1 Background and Context

#### 1.1.1 The Problem

Sri Lankan antenatal care provides important physical monitoring, but the literature reviewed for this project shows that emotional wellbeing during pregnancy remains an important area for earlier identification and support. Sri Lankan studies report meaningful levels of antenatal depression and anxiety, while work from the Rajarata Pregnancy Cohort demonstrates that mental-health screening and management can be incorporated into maternal care. The evidence therefore supports a supplementary digital support layer rather than the claim that Sri Lanka has no maternal mental-health services.

#### 1.1.2 Who Gets Affected

The proposed component is intended for pregnant women who want accessible emotional support between routine clinical contacts. The design is particularly relevant where language preference, distance, stigma, or limited access to specialist mental-health services can make it difficult to seek support immediately. The system is not restricted to a particular province and should be evaluated with Sri Lankan users using Sinhala and English.

#### 1.1.3 What the Literature Shows

The completed literature review contains 49 extracted research records across maternal mental health, digital perinatal support, conversational agents, facial emotion recognition, English and Sinhala NLP, multimodal fusion, adaptive response, therapeutic music, privacy, and behavioural signals. The Sri Lankan evidence establishes the problem context; the technology literature establishes feasibility; and the comparison of the two identifies a narrower unresolved application problem.

#### 1.1.4 Existing Solutions and Limitations

Existing digital perinatal interventions include psychoeducation, mindfulness, CBT-oriented content, messaging, and conversational agents. A particularly relevant comparator is Moment for Parents, a pregnancy/postpartum mental-health chatbot. General mental-health conversational agents also provide evidence for feasibility and personalization. However, the reviewed evidence did not identify a directly matching Sri Lankan pregnancy-support component combining bilingual Sinhala/English text sentiment, facial-expression mood inference, transparent multimodal fusion, and mood-conditioned conversational adaptation. This is the bounded gap used in the revised proposal.

#### 1.1.5 Proposed Solution

The proposed component is a bilingual chatbot that accepts Sinhala or English messages. With explicit user permission, a front-camera frame is periodically captured during an active chat session and processed on-device by a lightweight facial-expression model. The raw frame is discarded immediately after inference. Text is analysed using an English transformer-based sentiment component and a Sinhala-specific/low-resource approach that is validated on pregnancy-domain examples. The two modality scores are combined through a transparent fusion layer. The resulting mood state controls conversational tone and supportive-content triggers.

#### 1.1.6 SDG Alignment

The component aligns primarily with SDG 3 (Good Health and Well-Being) through maternal emotional support, SDG 5 (Gender Equality) through technology focused on women's healthcare needs, and SDG 10 (Reduced Inequalities) by targeting accessible digital support across different connectivity and language contexts.

#### 1.1.7 Research Cluster Alignment

The research fits the Intelligent Systems and Data Science domain through affective computing, low-resource NLP, multimodal AI, mobile inference, and healthcare-oriented intelligent systems.

### 1.2 Literature Review

#### 1.2.1 Maternal Emotional Wellbeing in Sri Lanka

The reviewed Sri Lankan literature establishes antenatal depression and anxiety as meaningful concerns. Agampodi et al. reported antenatal depression in an Anuradhapura sample using the Sinhala EPDS; other Sri Lankan studies reported depressive symptoms and antenatal anxiety in hospital and field-clinic populations. The Rajarata Pregnancy Cohort further demonstrates the feasibility of integrating mental-health screening and management into routine maternal care. These studies justify the need for accessible emotional support while also reinforcing that the proposed chatbot must remain supplementary to clinical care.

#### 1.2.2 Digital Perinatal and Conversational Support

Systematic reviews show that mobile and digital interventions for perinatal depression and anxiety are an established research area, although clinical evaluation and long-term evidence remain heterogeneous. Maternal messaging systems demonstrate the feasibility of mobile support at scale. Moment for Parents is a close pregnancy-specific comparator and means that 'pregnancy chatbot' alone cannot be claimed as the research novelty. General conversational-agent literature supports personalization and empathic response design but also highlights the need for human evaluation.

#### 1.2.3 Facial Emotion Recognition and Mobile Deployment

Facial-expression recognition is technically mature, but real-world deployment is affected by pose, lighting, identity, demographic imbalance, and device constraints. AffectNet provides in-the-wild diversity, while MobileNetV2 offers an efficient architecture suitable for resource-constrained devices. The revised proposal therefore includes confidence filtering, temporal smoothing, held-out testing, and explicit pose and demographic-risk analysis instead of assuming benchmark accuracy transfers directly to phone use.

#### 1.2.4 English Sentiment and Transformers

BERT established transformer-based contextual language representations, while DistilBERT provides a smaller and faster alternative suitable for practical deployment. The reviewed text-emotion literature also shows that emotion language is context-dependent. Consequently, the English model will be treated as a component requiring validation on pregnancy-related utterances rather than as a perfect general-purpose emotion detector.

#### 1.2.5 Sinhala and Low-Resource NLP

Sinhala remains a comparatively low-resource NLP setting, although Sinhala-specific encoder models and evaluation benchmarks are advancing. Existing work supports Sinhala sentiment analysis, sentence embeddings, and transliteration. The proposal therefore treats pregnancy-domain Sinhala emotion vocabulary and labelled examples as an evaluation and adaptation requirement rather than claiming that Sinhala NLP is absent.

#### 1.2.6 Multimodal Emotion Fusion

Multimodal emotion-recognition surveys show that face and text provide complementary information but also introduce alignment, missing-modality, weighting, and generalization challenges. The revised design therefore uses a deliberately simple and transparent late-fusion strategy. Fusion weights will not be asserted as fixed truths; they will be tuned using validation performance and participant self-report agreement.

#### 1.2.7 Adaptive and Affect-Conditioned Response

The purpose of mood inference is to improve the interaction, not merely to produce a label. Research on empathic conversational agents indicates that perceived empathy, appropriateness, and user experience require human evaluation. The proposed evaluation therefore measures whether mood-conditioned responses are perceived as more supportive and appropriate than a non-adaptive baseline.

#### 1.2.8 Supportive Music

Systematic reviews and meta-analyses report evidence that music interventions can reduce anxiety during pregnancy, while also noting heterogeneity and evidence-quality limitations. Music is therefore positioned as a low-risk supportive adjunct after a distress threshold, not as clinical music therapy or a replacement for professional treatment.

#### 1.2.9 Privacy and On-Device Inference

Mobile-health literature emphasizes the sensitivity of patient-generated data. On-device facial inference reduces the need to transmit raw facial images. The proposed privacy-by-design rule is therefore: explicit camera consent, visible camera-state feedback, immediate disposal of raw frames after inference, no cloud storage of facial images, and a text-only fallback when camera access is disabled.

#### 1.2.10 Behavioural-Signal Decision

Typing speed and response delay have research evidence linking them to affect, including smartphone studies. However, the reviewed evidence also shows strong individual dependence, small effects relative to individual variability, and a lack of validation for a generic per-message pregnancy-chatbot classifier. Therefore, typing speed and response delay are removed from the core mood-fusion score. If retained for client or research purposes, they are telemetry/ablation variables only and cannot change safety-sensitive chatbot tone.

### 1.3 Research Gap

Gap 1 — Localized bilingual pregnancy emotional support

The literature establishes maternal emotional-health need in Sri Lanka and shows that Sinhala NLP resources are developing, but the reviewed evidence did not identify a directly matching bilingual pregnancy-support component that combines local context with mood-aware conversational adaptation. The claim is intentionally bounded: it is not a claim that no Sinhala mental-health technology exists.

Gap 2 — Face + bilingual text mood inference in a pregnancy-support context

Multimodal face-and-text emotion recognition is well established as a general technical field. The narrower unresolved problem is its application as a privacy-aware, bilingual, pregnancy-specific mood-inference layer for conversational support in the Sri Lankan context. The contribution is therefore the localized application and evaluation, not the invention of multimodal fusion itself.

Gap 3 — Transparent mood-conditioned response evaluation

Existing conversational-agent studies support personalization and empathic response design, but the proposed work explicitly links a measurable mood estimate to adaptive tone and then evaluates whether users perceive the resulting response as more appropriate and supportive. This closes the loop between sensing, fusion, and interaction rather than treating mood classification as an isolated model.

Gap 4 — Privacy-aware mobile deployment

The reviewed literature supports privacy minimization and on-device inference as appropriate design strategies for mobile health. The proposed system operationalizes this through on-device FER, raw-frame disposal, explicit consent, and a camera-disabled text-only fallback. This is a design contribution and validation requirement rather than a claim of novel privacy technology.

## 2. OBJECTIVES

### 2.1 Main Objective

To design, implement, and evaluate a bilingual Sinhala/English conversational-support component for pregnant women in Sri Lanka that combines on-device facial-expression inference and text sentiment into a transparent mood estimate, adapts chatbot responses to that mood, and provides privacy-aware supportive content without replacing professional clinical care.

### 2.2 Specific Objectives

SO1 — Bilingual Chatbot

Implement a Sinhala/English conversational interface with pregnancy-appropriate, respectful language and reliable Sinhala Unicode rendering.

SO2 — On-Device FER

Develop and evaluate a lightweight facial-expression model for three application-level mood states, exported for on-device inference and tested under realistic mobile conditions.

SO3 — Bilingual Text Mood Detection

Implement English sentiment analysis and a Sinhala low-resource sentiment approach, then validate both on pregnancy-context examples.

SO4 — Transparent Mood Fusion

Combine facial and text mood scores using a transparent late-fusion rule whose weights are selected using validation evidence and self-report agreement rather than arbitrary fixed weights.

SO5 — Adaptive Conversational Response

Inject the current mood state into the chatbot context so that response tone changes appropriately while maintaining safe, supportive boundaries.

SO6 — Supportive Content

Provide evidence-informed supportive content such as breathing guidance and carefully framed music recommendations after a distress threshold.

SO7 — Privacy and Offline Support

Store chat history and saved supportive content locally, discard raw facial frames immediately after inference, and provide a text-only fallback when camera access is disabled.

SO8 — Evaluation

Evaluate modality-level performance, fused mood classification, adaptive-response appropriateness, latency, usability, privacy controls, and offline reliability.

## 3. METHODOLOGY

### 3.1 Research Approach

The study follows Design Science Research (DSR) because the research produces a working artefact and evaluates it against technical and user-centred criteria. Development can be organized using short Agile iterations so that the chatbot, mood models, fusion layer, and privacy controls can be tested incrementally.

### 3.2 Technical Approach

#### 3.2.1 Bilingual Chatbot Interface

A React Native interface will provide Sinhala and English chat input and display. The language layer will use pregnancy-appropriate vocabulary and culturally respectful phrasing. A local content review will be conducted before user testing.

#### 3.2.2 Facial Emotion Recognition

A lightweight MobileNetV2-family model will be fine-tuned using FER-2013 and AffectNet-derived training data, with an application-level three-state mapping. The model will be exported to TensorFlow Lite. During active chat, a permitted camera frame is processed on-device. Confidence filtering and temporal smoothing will reduce unstable predictions. Raw frames are discarded immediately after inference.

#### 3.2.3 Bilingual Text Mood Detection

English text will use a lightweight transformer-based sentiment model such as DistilBERT. Sinhala text will use a low-resource approach informed by Sinhala-specific NLP literature, with a pregnancy-domain vocabulary/labelled validation set. The proposal does not assume that a generic model transfers perfectly to pregnancy conversations; domain evaluation is required.

#### 3.2.4 Mood Fusion Engine

The core fusion contains two signals only: facial mood and bilingual text mood. A transparent late-fusion score will be computed from normalized modality outputs. Initial weights will be treated as tunable parameters and selected using validation performance and agreement with participant self-report. If one modality is unavailable, the remaining modality is used without inventing a behavioural substitute.

#### 3.2.5 Adaptive Response Logic

The mood category is passed to the conversational layer as structured context. Normal mood receives the standard supportive response style. Mild distress produces a gentler, shorter, reassuring style. Significant distress triggers a supportive response, optional calming content, and a suggestion to contact an appropriate human support provider when relevant. The chatbot must not diagnose depression, anxiety, or other clinical conditions.

#### 3.2.6 Supportive Music and Offline Storage

A small curated library of appropriately licensed calming content will be bundled or cached locally. Music is presented as supportive content, not clinical treatment. Chat history and saved content are stored locally so that core history and playback functions can work without network access.

### 3.3 Tools and Platforms

React Native/Expo for the mobile interface and camera access; TensorFlow Lite for on-device FER inference; Python/Keras for model preparation and training; MobileNetV2 as the lightweight vision backbone; Node.js/Express for backend orchestration; Transformers.js or an equivalent lightweight transformer runtime for English sentiment; a Sinhala sentiment/lexicon component for low-resource text analysis; AsyncStorage for local data; and an LLM API for response generation subject to provider terms and privacy constraints.

### 3.4 Data and Ethics

The study will not begin human testing before the required SLIIT ethics process is completed. Participants will be adults who provide informed consent in Sinhala or English. Camera access will be optional and explicitly disclosed. Raw facial frames will not be retained or transmitted. Mood outputs are support signals, not diagnoses. Data minimization, local storage, access control, and deletion procedures will be documented.

### 3.5 How I Will Know If It Works

Evaluation will be separated into model, fusion, interaction, and system-level tests. FER will be evaluated using held-out data and reported overall and by relevant pose/condition subsets. Text sentiment will be evaluated on labelled English and Sinhala pregnancy-context examples. Fusion will be compared with each single modality using accuracy, macro-F1, confusion matrices, and agreement with participant self-report. Adaptive responses will be compared with a non-adaptive baseline using user ratings of appropriateness, supportiveness, and satisfaction. System tests will measure inference latency, response latency, offline functionality, camera-consent behaviour, and data-retention compliance.

## 4. HIGH-LEVEL SYSTEM ARCHITECTURE

### 4.1 Overview

The component is organized into four logical modules: (1) bilingual AI chatbot, (2) mood-detection pipeline, (3) mood-fusion and adaptive-intelligence layer, and (4) local data management. The key revision is that the core mood pipeline now contains Face + Text only; behavioural signals are not allowed to drive mood-sensitive responses.

### 4.2 Layer-by-Layer Description

Layer 1 — Chat Interface

Sinhala/English chat UI, consent controls, camera toggle, supportive-content controls, and local history.

Layer 2 — Mood Detection

On-device FER plus bilingual text sentiment. Behavioural timestamps may be recorded for exploratory analysis but are not fused into the core mood score.

Layer 3 — Mood Fusion and Adaptive Response

Transparent late fusion, mood-state thresholds, structured prompt context, safe response policy, and supportive-content trigger.

Layer 4 — Local Data Management

AsyncStorage/local persistence for chat history, saved content, consent state, and non-identifying mood summaries. Raw camera frames are not stored.

### 4.3 Data Flow — Step by Step

## 1. The user gives consent and starts a chat. 2. The user sends a Sinhala or English message. 3. Text sentiment is computed. 4. If camera sensing is enabled, a frame is captured and processed on-device. 5. The two modality scores are normalized and fused. 6. The mood state is added to the chatbot context. 7. The response generator produces a tone-appropriate answer under the safety policy. 8. The response and local history are saved. 9. If the distress threshold is crossed, supportive content and human-support guidance may be displayed.

## 5. USER REQUIREMENTS

### 5.1 Stakeholders

Primary stakeholder: pregnant women using the support component. Secondary stakeholders: doctors/midwives who may receive a summarized mood history through the wider system, project administrators, and the research team. The component is designed as support and communication infrastructure, not a diagnostic service.

### 5.2 Functional Requirements

FR1

The system shall allow users to communicate with the chatbot in Sinhala or English.

FR2

The system shall analyse the emotional tone of text messages using the selected bilingual text pipeline.

FR3

With explicit permission, the system shall periodically process a camera frame on-device for facial-expression mood inference.

FR4

The system shall combine available facial and text mood signals into a transparent mood estimate.

FR5

The chatbot response tone shall adapt to the current mood state without requiring manual mood entry.

FR6

When a configured distress threshold is reached, the system shall offer supportive content and appropriate human-support guidance.

FR7

The system shall store chat history and saved supportive content locally and provide offline access to those functions.

FR8

The user shall be able to disable camera access at any time; the core mood system shall continue using text only.

FR9

The component shall expose a structured mood-history summary for integration with the wider maternal-care application.

FR10

The system shall present a bilingual privacy/consent notice before camera-enabled mood sensing is first used.

FR11

The system shall not present mood output as a clinical diagnosis.

FR12

Raw facial frames shall not be persisted after inference.

### 5.3 Non-Functional Requirements

Performance

FER inference target: within 3 seconds per permitted frame on the target mid-range Android test device; chatbot response target: within 5 seconds under stable connectivity.

Privacy

No raw facial image storage or transmission; explicit consent; visible camera state; local data minimization.

Language

Sinhala Unicode must render correctly across chat, history, and supportive-content labels.

Compatibility

The prototype shall be tested on representative mid-range Android devices.

Offline

Local history and saved supportive content must remain accessible without internet.

Usability

The interaction should be simple, respectful, and understandable to Sri Lankan users.

Reliability

Local data writes must be recoverable and duplicate/corrupt message records should be prevented.

Safety

The system must not claim diagnosis or replace professional care; distress handling must use predefined safe response rules.

## 6. COMMERCIALIZATION PLAN

### 6.1 Target Market

The primary target market is pregnant women in Sri Lanka who want accessible emotional support between clinical contacts. Secondary users and institutional customers include maternity clinics, hospitals, telemedicine providers, and maternal-health programmes.

### 6.2 Value Proposition

The value proposition is a localized bilingual pregnancy-support experience that combines conversational support with privacy-aware multimodal mood inference, adaptive response, and offline access. The differentiation is the integration and local validation, not the generic existence of a chatbot or multimodal AI.

### 6.3 Revenue Model

Potential models include a free basic tier, an optional premium tier for enhanced history and content, and institutional licensing for clinics or hospitals. Commercialization is secondary to research validation and must not compromise user privacy or clinical safety.

### 6.4 Cost Estimation

The existing proposal estimated approximately LKR 44,000 for the prototype, including model training compute, LLM development quota, licensed/royalty-free content, language review, deployment, datasets, printing, and contingency. The revised architecture removes behavioural-model development from the core build but retains FER training and evaluation.

### 6.5 Pricing Strategy

A low-cost or free pilot is appropriate during validation. Institutional pricing can be considered after usability, safety, and technical performance are demonstrated.

### 6.6 Competitive Advantage

Sri Lankan language/context adaptation; face + bilingual-text mood inference; transparent fusion; on-device FER privacy design; offline local history; and explicit evaluation of whether adaptive responses are actually perceived as more supportive.

### 6.7 Intellectual Property

Software code, model fine-tuning artefacts, locally authored domain lexicons, UI assets, and integration logic should be tracked for ownership and licensing. Any patent or exclusivity claim should only be made after a formal prior-art and institutional IP review.

## 7. BUDGET AND JUSTIFICATION

### 7.1 Budget

The revised prototype budget remains approximately LKR 44,000 because FER training, language review, LLM testing, deployment, and evaluation remain necessary.

Table — Budget and Justification

## 8. WORK BREAKDOWN STRUCTURE

### 8.1 Revised Task Breakdown

The behavioural mood-classification task has been removed from the core WBS. Behavioural timestamps may remain as optional telemetry/ablation data but are not a load-bearing component.

Table — Revised Work Breakdown Structure

## 9. GANTT CHART

### 9.1 Semester Timeline

The project follows the 14-week structure used in the original proposal, with the revised work packages above. The main change is that the behavioural mood classifier is no longer a core implementation dependency.

## 10. REFERENCES

### 10.1 Selected Evidence Base

The revised proposal is based on the completed literature-review extraction of 49 research records. The following references are the principal sources used to justify the revised problem framing, architecture, and evaluation.

[M1] Agampodi, S.B.; Agampodi, T.C. (2013). Antenatal Depression in Anuradhapura, Sri Lanka and the Factor Structure of the Sinhalese Version of Edinburgh Post Partum Depression Scale among Pregnant Women. PLOS ONE. https://doi.org/10.1371/journal.pone.0069708

[M2] Suraweera, C.; Perera, I.; Isuru, L.L.A.; Galhenage, J. (2021). Prevalence and associated factors of antenatal depression of women attending antenatal clinics in two tertiary care maternity hospitals in Sri Lanka. BJPsych Open. https://doi.org/10.1192/bjo.2021.776

[M3] Predictors and occurrence of antenatal depressive symptoms in Galle, Sri Lanka: a mixed-methods cross-sectional study (2021). BMC Pregnancy and Childbirth. https://doi.org/10.1186/s12884-021-04239-w

[M4] Palfreyman et al. (2021). Addressing Psychosocial Vulnerabilities Through Antenatal Care—Depression, Suicidal Ideation, and Behavior: A Study Among Urban Sri Lankan Women. Frontiers in Psychiatry. https://doi.org/10.3389/fpsyt.2021.554808

[M5] Priyadarshanie et al. (2024). Risk factors for antenatal anxiety: a cross-sectional study in field antenatal clinics in Sri Lanka. BMJ Open. https://doi.org/10.1136/bmjopen-2024-083991

[M6] Agampodi et al. (2023). Incorporating early pregnancy mental health screening and management into routine maternal care: experience from the Rajarata Pregnancy Cohort (RaPCo), Sri Lanka. https://pmc.ncbi.nlm.nih.gov/articles/PMC10533714/

[A1] Tsai et al. (2022). Evaluating the effectiveness and quality of mobile applications for perinatal depression and anxiety: a systematic review and meta-analysis. Journal of Affective Disorders. https://doi.org/10.1016/j.jad.2021.09.106

[A2] Hussain-Shamsy et al. (2020). Mobile Health for Perinatal Depression and Anxiety: Scoping Review. JMIR. https://pubmed.ncbi.nlm.nih.gov/32281939/

[A3] Arifin et al. (2024). An evaluation of digital intervention for perinatal depression and anxiety: A systematic review. AIMS Public Health. https://doi.org/10.3934/publichealth.2024025

[A4] Hussain et al. (2018). User assessments and the use of information from MomConnect, a mobile phone text-based information service, by pregnant women and new mothers in South Africa. BMJ Global Health. https://doi.org/10.1136/bmjgh-2017-000561

[C1] Li et al. (2023). Systematic review and meta-analysis of AI-based conversational agents for promoting mental health and well-being. npj Digital Medicine. https://doi.org/10.1038/s41746-023-00979-5

[C2] He et al. (2023). Conversational Agent Interventions for Mental Health Problems: Systematic Review and Meta-analysis of Randomized Controlled Trials. JMIR Mental Health. https://doi.org/10.2196/43862

[C3] Sanjeewa et al. (2024). Empathic Conversational Agent Platform Designs and Their Evaluation in the Context of Mental Health: Systematic Review. JMIR Mental Health. https://doi.org/10.2196/50701

[C4] Morris et al. (2018). Towards an Artificially Empathic Conversational Agent for Mental Health Applications: System Design and User Perceptions. JMIR. https://doi.org/10.2196/e10148

[C5] Fitzpatrick et al. (2017). Delivering Cognitive Behavior Therapy to Young Adults With Symptoms of Depression and Anxiety Using a Fully Automated Conversational Agent (Woebot). JMIR Mental Health. https://doi.org/10.2196/mental.7785

[C6] McAlister et al. (2025). Chatbot to Support the Mental Health Needs of Pregnant and Postpartum Women (Moment for Parents): Design and Pilot Study. JMIR Formative Research. https://pubmed.ncbi.nlm.nih.gov/40202166/

[F1] Facial Expression Recognition: A Survey (2019). Symmetry. https://doi.org/10.3390/sym11101189

[F2] Mollahosseini, A.; Hasani, B.; Mahoor, M.H. (2019). AffectNet: A Database for Facial Expression, Valence, and Arousal Computing in the Wild. IEEE Transactions on Affective Computing. https://doi.org/10.1109/TAFFC.2017.2740923

[F3] Sandler et al. (2018). MobileNetV2: Inverted Residuals and Linear Bottlenecks. CVPR. https://doi.org/10.1109/CVPR.2018.00474

[F4] Zhu et al. (2024). A study on expression recognition based on improved MobileNetV2 network. Scientific Reports. https://doi.org/10.1038/s41598-024-58736-x

[F5] Yang et al. (2018). In-the-wild Facial Expression Recognition in Extreme Poses. arXiv. https://arxiv.org/abs/1811.02194

[F6] Dominguez-Catena, I.; Paternain, D.; Galar, M. (2024). Metrics for Dataset Demographic Bias: A Case Study on Facial Expression Recognition. IEEE TPAMI. https://doi.org/10.1109/TPAMI.2024.3361979

[E1] Sanh et al. (2019). DistilBERT, a distilled version of BERT: smaller, faster, cheaper and lighter. https://arxiv.org/abs/1910.01108

[E2] Devlin et al. (2019). BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding. NAACL. https://doi.org/10.18653/v1/N19-1423

[E3] Acheampong, F.A.; Wenyu, C.; Nunoo-Mensah, H. (2020). Text-based emotion detection: Advances, challenges, and opportunities. Engineering Reports. https://doi.org/10.1002/eng2.12189

[S1] Peiris, Y.N.S. (2021). Sentiment Analysis for the Sinhala Language with BERT Based Language Model. IIT Sri Lanka repository. http://dlib.iit.ac.lk/xmlui/handle/123456789/849

[S2] Ranasinghe et al. (2025). Sinhala Encoder-only Language Models and Evaluation. ACL 2025. https://doi.org/10.18653/v1/2025.acl-long.422

[S3] Weeraprameshwara et al. (2022). Sinhala Sentence Embedding: A Two-Tiered Structure for Low-Resource Languages. PACLIC. https://aclanthology.org/2022.paclic-1.36/

[S4] De Mel et al. (2025). Sinhala Transliteration: A Comparative Analysis Between Rule-based and Seq2Seq Approaches. IndoNLP 2025. https://aclanthology.org/2025.indonlp-1.19/

[S5] Perera, P.S.; Sumanathilaka, D.K. (2025). A Low-Resource Speech-Driven NLP Pipeline for Sinhala Dyslexia Assistance. RANLP 2025. https://aclanthology.org/2025.ranlp-1.106/

[MF1] Lian et al. (2023). A Survey of Deep Learning-Based Multimodal Emotion Recognition: Speech, Text, and Face. Entropy. https://doi.org/10.3390/e25101440

[MF2] Ezzameli, K.; Mahersia, H. (2023). Emotion recognition from unimodal to multimodal analysis: A review. Information Fusion. https://doi.org/10.1016/j.inffus.2023.101847

[AD1] Sanjeewa et al. (2024). Empathic Conversational Agent Platform Designs and Their Evaluation in the Context of Mental Health: Systematic Review. JMIR Mental Health. https://doi.org/10.2196/50701

[AD2] Morris et al. (2018). Towards an Artificially Empathic Conversational Agent for Mental Health Applications. JMIR. https://doi.org/10.2196/e10148

[AD3] Kim et al. (2025). From Seconds to Sentiments: Differential Effects of Chatbot Response Latency on Customer Evaluations. International Journal of Human–Computer Interaction. https://doi.org/10.1080/10447318.2025.2508915

[AD4] Fido trial authors (2024). Effectiveness of a Web-based and Mobile Therapy Chatbot on Anxiety and Depressive Symptoms in Subclinical Young Adults: Randomized Controlled Trial. JMIR. https://pubmed.ncbi.nlm.nih.gov/38506892/

[T1] Lin et al. (2019). Music Interventions for Anxiety in Pregnant Women: A Systematic Review and Meta-Analysis of Randomized Controlled Trials. Journal of Clinical Medicine. https://doi.org/10.3390/jcm8111884

[T2] Alder et al. (2017). Music interventions to reduce stress and anxiety in pregnancy: a systematic review and meta-analysis. BMC Psychiatry. https://doi.org/10.1186/s12888-017-1432-x

[T3] Maul et al. (2024). Systematic review on music interventions during pregnancy in favor of the well-being of mothers and eventually their offspring. AJOG MFM. https://doi.org/10.1016/j.ajogmf.2024.101400

[P1] Wang et al. (2023). Applications of Federated Learning in Mobile Health: Scoping Review. JMIR. https://doi.org/10.2196/43006

[B1] Epp, C.; Lippold, M.; Mandryk, R.L. (2011). Identifying emotional states using keystroke dynamics. CHI. https://doi.org/10.1145/1978942.1979046

[B2] Lee et al. (2015). The Influence of Emotion on Keyboard Typing: An Experimental Study Using Auditory Stimuli. PLOS ONE. https://doi.org/10.1371/journal.pone.0129056

[B3] Ghosh et al. (2019). Emotion detection from touch interactions during text entry on smartphones. International Journal of Human-Computer Studies. https://doi.org/10.1016/j.ijhcs.2019.04.005

[B4] Eisele et al. (2021). Reported Affect Changes as a Function of Response Delay. Frontiers in Psychology. https://doi.org/10.3389/fpsyg.2021.580684

## 11. APPENDICES

Appendix A — Evaluation Instruments

A.1 Self-Reported Mood Instrument

Participants will provide a simple self-reported mood state after selected chat segments. The instrument is used as a validation reference for mood-fusion outputs, not as a clinical diagnosis.

A.2 Adaptive Response Rating

Participants rate response appropriateness, supportiveness, naturalness, and satisfaction for adaptive and non-adaptive response conditions.

A.3 Usability Tasks

Complete a Sinhala chat, English chat, camera-consent flow, camera-disable flow, history retrieval, and supportive-content playback.

Appendix B — Architecture Notes

B.1 Core Mood Pipeline

Face signal + bilingual text signal → normalized modality scores → transparent late fusion → mood state → adaptive response context.

B.2 Missing-Modality Behaviour

If camera permission is disabled or FER confidence is insufficient, text remains the core available modality. No behavioural signal is substituted into the safety-sensitive fusion score.

B.3 Privacy Flow

Camera permission → temporary frame → on-device preprocessing/inference → mood score → immediate raw-frame disposal.

Appendix C — Risk Analysis

R1 FER performance below target

Mitigation: confidence filtering, temporal smoothing, pose-stratified evaluation, augmentation, and fallback lightweight architecture.

R2 Camera privacy concerns

Mitigation: explicit bilingual consent, visible camera state, one-tap disable, raw-frame disposal, and text-only fallback.

R3 FER demographic bias

Mitigation: report subgroup/condition performance where ethically and statistically appropriate and discuss dataset limitations explicitly.

R4 Sinhala sentiment weakness

Mitigation: domain vocabulary, labelled local evaluation, error analysis, and clear fallback behaviour.

R5 Mood fusion overconfidence

Mitigation: transparent fusion, confidence thresholds, missing-modality handling, and self-report validation.

R6 Chatbot unsafe or overly clinical response

Mitigation: response-policy constraints, escalation wording, human-support guidance, and testing with predefined scenarios.

R7 Connectivity failure

Mitigation: local history/content storage and graceful offline mode for supported functions.

R8 User discomfort with mood sensing

Mitigation: consent-first design, clear controls, and ability to use text-only mode.

Appendix D — Privacy Notice (Draft)

Before camera-enabled mood sensing is used, the application will display a bilingual notice explaining that a camera frame may be processed temporarily to estimate facial expression, that the analysis occurs on the device, that raw images are not saved or sent to the server, and that the user can disable camera access at any time. The notice will also explain that the chatbot is a support tool and not a medical diagnosis system.

Appendix E — Ethics and Consent

Before human evaluation, the research team will submit the required ethics documentation to the relevant SLIIT review process. Participants will be adults, participation will be voluntary, consent will be obtained in Sinhala or English, and participants may stop at any time. The research protocol will specify data collection, storage, access, deletion, and camera-consent procedures.

### Table 1

| Area | Earlier proposal | Updated proposal |
|---|---|---|
| Core mood modalities | Face + text + typing/response behaviour | Face + bilingual text |
| Fusion weights | Fixed initial three-way weighting | Transparent two-way fusion; weights tuned from validation evidence |
| Behavioural signals | Core mood input | Optional telemetry/ablation only |
| Novelty framing | Broad passive multimodal claim | Localized pregnancy-specific bilingual face+text application and evaluation |
| FER privacy | On-device | On-device + raw-frame disposal + explicit consent |
| Evaluation | Model accuracy and usability | Modality performance + fusion + adaptive response + privacy/system tests |

### Table 2

| # | Item | Cost (LKR) | Justification |
|---|---|---|---|
| 1 | Google Colab Pro / GPU training | 7,500 | FER model fine-tuning and evaluation |
| 2 | LLM API development/testing quota | 10,000 | Chatbot response generation during prototype development |
| 3 | Licensed / royalty-free supportive audio | 5,000 | Appropriate content for the prototype |
| 4 | Sinhala language/cultural review | 4,000 | Review of language quality and cultural appropriateness |
| 5 | Domain + SSL / deployment | 3,500 | Secure prototype backend deployment |
| 6 | Cloud hosting / load testing | 8,000 | Backend and integration testing beyond free tiers |
| 7 | Open-source software libraries | 0 | React Native, TFLite, Keras, Transformers and related libraries |
| 8 | FER-2013 + AffectNet | 0 | Open research datasets as permitted by their terms |
| 9 | Printing and binding | 2,000 | Final academic submission |
| 10 | Contingency | 4,000 | Unexpected development/testing costs |
|  | TOTAL | 44,000 | Approximate prototype budget |

### Table 3

| ID | Task | Deliverable | Timeline |
|---|---|---|---|
| T1 | Literature review and gap analysis | Verified review, gap matrix, revised proposal | Weeks 1–2 |
| T2 | Bilingual UI and local-storage design | Wireframes and storage schema | Week 3 |
| T3 | FER dataset preparation | FER-2013/AffectNet preprocessing and 3-class mapping | Weeks 3–4 |
| T4 | FER training and TFLite export | Trained model + evaluation report | Weeks 4–6 |
| T5 | Chatbot UI + camera-consent integration | Working bilingual chat and camera controls | Weeks 5–7 |
| T6 | Bilingual text sentiment pipeline | English transformer + Sinhala low-resource pipeline | Weeks 6–8 |
| T7 | Two-modality mood fusion + adaptive logic | Transparent fusion and tone adaptation | Weeks 8–9 |
| T8 | Backend + LLM integration | Mood-aware response API | Weeks 9–10 |
| T9 | Supportive content + offline player/history | Local content and offline functions | Weeks 10–11 |
| T10 | Mood-history integration/export | Structured mood summary for wider system | Weeks 11–12 |
| T11 | Evaluation and deployment testing | Model, fusion, usability, privacy and latency report | Weeks 12–13 |
| T12 | Final documentation and demonstration | Final report, demo and presentation | Weeks 13–14 |

### Table 4

| Task | W1-2 | W3 | W4 | W5-6 | W7-8 | W9-10 | W11-12 | W13-14 |
|---|---|---|---|---|---|---|---|---|
| T1 Literature + gap | ■ |  |  |  |  |  |  |  |
| T2 UI/storage |  | ■ |  |  |  |  |  |  |
| T3 FER prep |  |  | ■ |  |  |  |  |  |
| T4 FER training |  |  |  | ■ |  |  |  |  |
| T5 Chat UI + camera |  |  |  | ■ | ■ |  |  |  |
| T6 Text sentiment |  |  |  |  | ■ | ■ |  |  |
| T7 Fusion + adaptive |  |  |  |  |  | ■ |  |  |
| T8 Backend + LLM |  |  |  |  |  | ■ | ■ |  |
| T9 Supportive content/offline |  |  |  |  |  |  | ■ |  |
| T10 Mood export |  |  |  |  |  |  |  | ■ |
| T11 Evaluation |  |  |  |  |  |  |  | ■ |
| T12 Finalization |  |  |  |  |  |  |  | ■ |
