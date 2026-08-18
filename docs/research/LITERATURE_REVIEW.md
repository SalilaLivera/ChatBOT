# IT22638168 — Literature Review

> **Markdown mirror.** Faithful mirror of `IT22638168_Literature_Review_FINAL.docx`, which remains authoritative. Content unchanged.

IT22638168 — Literature Review

Completed research synthesis based on 49 extracted papers and an existing-system comparison

## 1. Introduction

IT22638168 is the emotional-support component of the MaternaLink pregnancy-support ecosystem. The target system combines bilingual conversational AI with mood inference and adaptive responses. The literature review therefore needs to establish four things: the maternal mental-health need, the state of digital/conversational support, the technical feasibility of multimodal mood inference, and the limitations that define a defensible research gap.

## 2. Maternal emotional wellbeing and the Sri Lankan context

Sri Lankan evidence establishes that antenatal depression and anxiety are meaningful concerns. Agampodi et al. reported 16.2% antenatal depression in an Anuradhapura sample using the Sinhala EPDS, while a Colombo tertiary-hospital study reported 33.6% screened positive. A Galle mixed-methods study identified social support and health-related factors associated with depressive symptoms, and a 2024 Colombo study found 34.4% antenatal anxiety in first-trimester women using the validated Sinhala PASS-S. The Rajarata Pregnancy Cohort further demonstrated that mental-health screening and targeted support can be integrated into routine maternal care. [M1–M6]

These studies do not imply that Sri Lanka lacks maternal mental-health services. Rather, they establish a well-defined need for accessible emotional support and early identification within a strong antenatal-care environment. This supports positioning the chatbot as a supplementary support and communication layer rather than a replacement for clinical diagnosis or treatment.

## 3. Existing digital and conversational support

Digital perinatal interventions are already an established research area. Reviews of perinatal mobile apps and digital interventions show widespread use of psychoeducation, CBT and mindfulness, but also report heterogeneous evidence and relatively few clinically evaluated products. MomConnect demonstrates the feasibility of maternal mobile messaging at scale, while Moment for Parents is a particularly close comparator: it is a pregnancy/postpartum mental-health chatbot using human-centered design and mood-based exercises. [A1–A4, C6]

General mental-health conversational agents also have evidence of feasibility and some efficacy. Meta-analyses report reductions in depression or distress in some settings, and personalization and empathic responses are repeatedly associated with better outcomes. However, the literature also shows limitations in long-term evidence, evaluation consistency, and the ability of artificial agents to reproduce human empathy. [C1–C5]

## 4. Facial emotion recognition and mobile deployment

FER is a mature computer-vision field, but real-world deployment is substantially harder than benchmark classification. AffectNet provides a large in-the-wild facial-expression dataset, while FER surveys emphasize dataset choice, illumination, pose and identity-related variation. MobileNetV2 is designed for resource-constrained vision and provides an appropriate architectural basis for an on-device model. Recent MobileNetV2-based FER work reinforces the feasibility of lightweight expression recognition. [F1–F4]

Head pose is directly relevant to the proposed smartphone camera setting: pose-aware FER research shows that extreme pose can materially affect recognition. In addition, recent TPAMI work demonstrates that demographic imbalance in FER datasets can produce unfairness. Therefore, the proposal's confidence filtering, temporal smoothing, held-out evaluation and demographic/pose risk discussion are not optional details; they are responses to known FER limitations. [F5–F6]

## 5. English sentiment and transformer models

Transformer-based language models provide the foundation for the English text-sentiment stream. BERT established the effectiveness of bidirectional transformer representations, while DistilBERT demonstrated that knowledge distillation can substantially reduce model size and inference cost while retaining much of BERT's capability. A text-emotion review also highlights the contextual ambiguity of language and the importance of domain and task choice. This supports using DistilBERT as an efficient sentiment component, but it also means that a generic sentiment model should be validated on pregnancy-context utterances rather than assumed to transfer perfectly. [E1–E3]

## 6. Sinhala and low-resource NLP

Sinhala is a low-resource NLP setting, although the research landscape is advancing quickly. Recent ACL work introduced Sinhala-specific encoder models and Sinhala-GLUE, showing that language-specific models can outperform popular multilingual baselines. Earlier work demonstrated strong binary Sinhala sentiment results using a BERT-based approach, while sentence-embedding and transliteration research show both the progress and the practical constraints of Sinhala processing. These findings justify a Sinhala-specific approach, but they also highlight that a pregnancy-domain lexicon must be validated on a dedicated local dataset. [S1–S5]

## 7. Multimodal emotion fusion

Multimodal emotion-recognition surveys consistently treat face, text and other signals as complementary sources. The literature suggests that combining modalities can improve robustness, but it also introduces alignment, missing modality, weighting and generalization problems. For IT22638168, this supports a deliberately simple fusion layer rather than an unnecessarily complex multimodal transformer. The strongest defensible design is to use independently evaluated modality scores and a transparent fusion rule that can be tuned against participant self-report. [MF1–MF4]

## 8. Adaptive and affect-conditioned response

The purpose of mood detection is not merely classification; it is to change the interaction. Mental-health CA reviews identify personalization and empathy as important moderators, while empathic-agent studies show that human evaluation is necessary because automated response metrics do not fully capture perceived empathy. Response latency also affects user evaluation. Therefore, IT22638168 should evaluate not only mood-classification accuracy but also whether mood-conditioned responses are perceived as more appropriate, supportive and satisfying. [AD1–AD4]

## 9. Therapeutic/supportive music

Systematic reviews and meta-analyses provide evidence that music interventions can reduce anxiety during pregnancy, although heterogeneity and risk of bias remain important. This supports the inclusion of music as a low-risk supportive adjunct after a distress threshold, but not as a substitute for clinical care or as a claim of clinical music therapy. [T1–T3]

## 10. Privacy and on-device inference

Mobile-health literature emphasizes the sensitivity of patient-generated data and the privacy risks of centralized collection. Although federated learning is one privacy-preserving option, IT22638168 does not need the complexity of federated training for its current prototype. Running FER on-device and discarding the raw frame immediately after inference is a simpler privacy-by-design strategy. Emerging edge-emotion literature also emphasizes client-side data quality, label noise and heterogeneous devices. [P1–P2]

## 11. Behavioural-signal decision

The behavioural track produced the clearest architecture decision. Keystroke research demonstrates that emotion can influence typing duration, latency and touch patterns, and smartphone research achieved approximately 73% average AUCROC with personalized models. However, controlled experiments also report that emotional effects are small relative to individual variability, while response-delay studies show associations rather than a validated per-message emotion classifier. The evidence therefore supports behavioural sensing as an interesting research signal, but not as a generic fixed 15% contributor to a safety-sensitive mood score. [B1–B6]

Recommended decision: remove typing speed and response delay from the core fusion score for the current build. If the client wants the data observed, retain the timestamps as optional telemetry and evaluate them separately or as an ablation. This keeps the core system as Face + bilingual Text, preserving genuine multimodality while improving methodological defensibility.

## 12. Research gap and proposed contribution

The Sri Lankan maternal-health literature establishes emotional need but does not by itself provide a bilingual, adaptive conversational support system.

Pregnancy chatbots already exist, so 'pregnancy chatbot' alone is not a sufficient novelty claim.

Sinhala NLP is advancing, but pregnancy-domain Sinhala emotion resources and conversational adaptation remain less developed than English resources.

Multimodal emotion recognition is well established generally, but the searched evidence did not identify a directly matching Sri Lankan pregnancy-support system combining facial expression with bilingual Sinhala/English sentiment to adapt responses.

Privacy-preserving on-device FER is technically appropriate for a sensitive maternal context, but must be validated under real mobile pose, lighting and demographic variation.

The research contribution should therefore be framed as a localized, bilingual, pregnancy-specific, multimodal mood-aware conversational support component, with transparent fusion and user-centered evaluation.

## 13. Implications for the final system

## 14. Evidence base and scope

This completed extraction contains 49 verified or source-page-confirmed research records across the planned topics, meeting the master plan's minimum paper target. The final dissertation should use the strongest sources from this matrix and continue screening any additional papers found during supervisor review. Claims of novelty should remain bounded by the actual database/search strategy used in the final dissertation.

References — extracted evidence

[M1] Agampodi, S.B.; Agampodi, T.C. (2013). Antenatal Depression in Anuradhapura, Sri Lanka and the Factor Structure of the Sinhalese Version of Edinburgh Post Partum Depression Scale among Pregnant Women. PLOS ONE. https://doi.org/10.1371/journal.pone.0069708

[M2] Suraweera, C.; Perera, I.; Isuru, L.L.A.; Galhenage, J. (2021). Prevalence and associated factors of antenatal depression of women attending antenatal clinics in two tertiary care maternity hospitals in Sri Lanka. BJPsych Open. https://doi.org/10.1192/bjo.2021.776

[M3] Authors as listed in BMC source (2021). Predictors and occurrence of antenatal depressive symptoms in Galle, Sri Lanka: a mixed-methods cross-sectional study. BMC Pregnancy and Childbirth. https://doi.org/10.1186/s12884-021-04239-w

[M4] Palfreyman et al. (2021). Addressing Psychosocial Vulnerabilities Through Antenatal Care—Depression, Suicidal Ideation, and Behavior: A Study Among Urban Sri Lankan Women. Frontiers in Psychiatry. https://doi.org/10.3389/fpsyt.2021.554808

[M5] Priyadarshanie et al. (2024). Risk factors for antenatal anxiety: a cross-sectional study in field antenatal clinics in Sri Lanka. BMJ Open. https://doi.org/10.1136/bmjopen-2024-083991

[M6] Agampodi et al. (2023). Incorporating early pregnancy mental health screening and management into routine maternal care: experience from the Rajarata Pregnancy Cohort (RaPCo), Sri Lanka. BMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC10533714/

[A1] Tsai et al. (2022). Evaluating the effectiveness and quality of mobile applications for perinatal depression and anxiety: a systematic review and meta-analysis. Journal of Affective Disorders. https://doi.org/10.1016/j.jad.2021.09.106

[A2] Hussain-Shamsy et al. (2020). Mobile Health for Perinatal Depression and Anxiety: Scoping Review. JMIR. https://pubmed.ncbi.nlm.nih.gov/32281939/

[A3] Arifin et al. (2024). An evaluation of digital intervention for perinatal depression and anxiety: A systematic review. AIMS Public Health. https://doi.org/10.3934/publichealth.2024025

[A4] Hussain et al. (2018). User assessments and the use of information from MomConnect, a mobile phone text-based information service, by pregnant women and new mothers in South Africa. BMJ Global Health. https://doi.org/10.1136/bmjgh-2017-000561

[C1] Li et al. (2023). Systematic review and meta-analysis of AI-based conversational agents for promoting mental health and well-being. npj Digital Medicine. https://doi.org/10.1038/s41746-023-00979-5

[C2] He et al. (2023). Conversational Agent Interventions for Mental Health Problems: Systematic Review and Meta-analysis of Randomized Controlled Trials. JMIR Mental Health. https://doi.org/10.2196/43862

[C3] Sanjeewa et al. (2024). Empathic Conversational Agent Platform Designs and Their Evaluation in the Context of Mental Health: Systematic Review. JMIR Mental Health. https://doi.org/10.2196/50701

[C4] Morris et al. (2018). Towards an Artificially Empathic Conversational Agent for Mental Health Applications: System Design and User Perceptions. JMIR. https://doi.org/10.2196/e10148

[C5] Fitzpatrick et al. (2017). Delivering Cognitive Behavior Therapy to Young Adults With Symptoms of Depression and Anxiety Using a Fully Automated Conversational Agent (Woebot): A Randomized Controlled Trial. JMIR Mental Health. https://doi.org/10.2196/mental.7785

[C6] McAlister et al. (2025). Chatbot to Support the Mental Health Needs of Pregnant and Postpartum Women (Moment for Parents): Design and Pilot Study. JMIR Formative Research. https://pubmed.ncbi.nlm.nih.gov/40202166/

[F1] Survey authors (see source) (2019). Facial Expression Recognition: A Survey. Symmetry. https://doi.org/10.3390/sym11101189

[F2] Mollahosseini, A.; Hasani, B.; Mahoor, M.H. (2019). AffectNet: A Database for Facial Expression, Valence, and Arousal Computing in the Wild. IEEE Transactions on Affective Computing. https://doi.org/10.1109/TAFFC.2017.2740923

[F3] Sandler et al. (2018). MobileNetV2: Inverted Residuals and Linear Bottlenecks. CVPR. https://doi.org/10.1109/CVPR.2018.00474

[F4] Zhu et al. (2024). A study on expression recognition based on improved MobileNetV2 network. Scientific Reports. https://doi.org/10.1038/s41598-024-58736-x

[F5] Yang, F.; Zhang, Q.; Zheng, C.; Qiu, G. (2018). In-the-wild Facial Expression Recognition in Extreme Poses. arXiv. https://arxiv.org/abs/1811.02194

[F6] Dominguez-Catena, I.; Paternain, D.; Galar, M. (2024). Metrics for Dataset Demographic Bias: A Case Study on Facial Expression Recognition. IEEE TPAMI. https://doi.org/10.1109/TPAMI.2024.3361979

[E1] Sanh et al. (2019). DistilBERT, a distilled version of BERT: smaller, faster, cheaper and lighter. arXiv. https://arxiv.org/abs/1910.01108

[E2] Devlin et al. (2019). BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding. NAACL. https://doi.org/10.18653/v1/N19-1423

[E3] Acheampong, F.A.; Wenyu, C.; Nunoo-Mensah, H. (2020). Text-based emotion detection: Advances, challenges, and opportunities. Engineering Reports. https://doi.org/10.1002/eng2.12189

[S1] Peiris, Y.N.S. (2021). Sentiment Analysis for the Sinhala Language with BERT Based Language Model. IIT Sri Lanka repository. http://dlib.iit.ac.lk/xmlui/handle/123456789/849

[S2] Ranasinghe et al. (2025). Sinhala Encoder-only Language Models and Evaluation. ACL 2025. https://doi.org/10.18653/v1/2025.acl-long.422

[S3] Weeraprameshwara et al. (2022). Sinhala Sentence Embedding: A Two-Tiered Structure for Low-Resource Languages. PACLIC. https://aclanthology.org/2022.paclic-1.36/

[S4] De Mel et al. (2025). Sinhala Transliteration: A Comparative Analysis Between Rule-based and Seq2Seq Approaches. IndoNLP 2025. https://aclanthology.org/2025.indonlp-1.19/

[S5] Perera, P.S.; Sumanathilaka, D.K. (2025). A Low-Resource Speech-Driven NLP Pipeline for Sinhala Dyslexia Assistance. RANLP 2025. https://aclanthology.org/2025.ranlp-1.106/

[MF1] Lian, H.; Lu, C.; Li, S.; Zhao, Y.; Tang, C.; Zong, Y. (2023). A Survey of Deep Learning-Based Multimodal Emotion Recognition: Speech, Text, and Face. Entropy. https://doi.org/10.3390/e25101440

[MF2] Ezzameli, K.; Mahersia, H. (2023). Emotion recognition from unimodal to multimodal analysis: A review. Information Fusion. https://doi.org/10.1016/j.inffus.2023.101847

[MF3] Survey authors (2023). A review of multimodal emotion recognition from datasets, preprocessing, features, and fusion methods. Neurocomputing. https://doi.org/10.1016/j.neucom.2023.126866

[MF4] Survey authors (2023). Survey on multimodal approaches to emotion recognition. Neurocomputing. https://doi.org/10.1016/j.neucom.2023.126693

[AD1] Sanjeewa et al. (2024). Empathic Conversational Agent Platform Designs and Their Evaluation in the Context of Mental Health: Systematic Review. JMIR Mental Health. https://doi.org/10.2196/50701

[AD2] Morris et al. (2018). Towards an Artificially Empathic Conversational Agent for Mental Health Applications: System Design and User Perceptions. JMIR. https://doi.org/10.2196/e10148

[AD3] Kim, K. et al. (2025). From Seconds to Sentiments: Differential Effects of Chatbot Response Latency on Customer Evaluations. International Journal of Human–Computer Interaction. https://doi.org/10.1080/10447318.2025.2508915

[AD4] Fido trial authors (2024). Effectiveness of a Web-based and Mobile Therapy Chatbot on Anxiety and Depressive Symptoms in Subclinical Young Adults: Randomized Controlled Trial. JMIR. https://pubmed.ncbi.nlm.nih.gov/38506892/

[T1] Lin et al. (2019). Music Interventions for Anxiety in Pregnant Women: A Systematic Review and Meta-Analysis of Randomized Controlled Trials. Journal of Clinical Medicine. https://doi.org/10.3390/jcm8111884

[T2] Alder et al. (2017). Music interventions to reduce stress and anxiety in pregnancy: a systematic review and meta-analysis. BMC Psychiatry. https://doi.org/10.1186/s12888-017-1432-x

[T3] Maul et al. (2024). Systematic review on music interventions during pregnancy in favor of the well-being of mothers and eventually their offspring. AJOG MFM. https://doi.org/10.1016/j.ajogmf.2024.101400

[P1] Wang et al. (2023). Applications of Federated Learning in Mobile Health: Scoping Review. JMIR. https://doi.org/10.2196/43006

[P2] Sakthivel et al. (2026). Federated Learning, Mobile Emotion Recognition, and Client-Side Data Quality: A Survey and Research Agenda. Preprints.org. https://www.preprints.org/manuscript/202603.2175

[B1] Epp, C.; Lippold, M.; Mandryk, R.L. (2011). Identifying emotional states using keystroke dynamics. CHI. https://doi.org/10.1145/1978942.1979046

[B2] Lee et al. (2015). The Influence of Emotion on Keyboard Typing: An Experimental Study Using Auditory Stimuli. PLOS ONE. https://doi.org/10.1371/journal.pone.0129056

[B3] Ghosh et al. (2019). Emotion detection from touch interactions during text entry on smartphones. International Journal of Human-Computer Studies. https://doi.org/10.1016/j.ijhcs.2019.04.005

[B4] Eisele, G.; Vachon, H.; Myin-Germeys, I.; Viechtbauer, W. (2021). Reported Affect Changes as a Function of Response Delay: Findings From a Pooled Dataset of Nine Experience Sampling Studies. Frontiers in Psychology. https://doi.org/10.3389/fpsyg.2021.580684

[B5] Kołakowska, A. (2016). Towards detecting programmers’ stress on the basis of keystroke dynamics. ACSIS. https://doi.org/10.15439/2016F263

[B6] Lau, S.H. (2018). Stress Detection for Keystroke Dynamics. Carnegie Mellon University thesis. https://kilthub.cmu.edu/articles/thesis/Stress_Detection_for_Keystroke_Dynamics/6723227

### Table 1

| Area | Literature implication | Design implication |
|---|---|---|
| FER | Real-world pose/bias matter | MobileNetV2/TFLite + confidence filtering + smoothing + held-out tests |
| English sentiment | Transformers strong but domain transfer matters | DistilBERT + pregnancy-context evaluation |
| Sinhala sentiment | Low-resource but rapidly improving | Pregnancy-domain lexicon + local labelled evaluation |
| Fusion | Multimodal fusion can improve robustness but needs transparency | Simple, tunable Face + Text fusion |
| Adaptive response | Personalization/empathy require human evaluation | Mood-conditioned prompts + tone satisfaction study |
| Music | Pregnancy anxiety evidence exists but is heterogeneous | Supportive recommendation, not clinical therapy claim |
| Privacy | Sensitive mobile-health data should be minimized | On-device FER; discard raw frames |
| Behaviour | Useful but personalization-dependent | Telemetry/ablation, not core 15% weight |
