## Verified dataset facts

_Generated at runtime by `01_dataset_exploration.ipynb`, run `run_20260819_031400`._


- Dataset root resolved to: `C:/Users/Yasindu/Desktop/Chat_Research/IT22638168/ml/fer/data/raw`
- Total files: 35887 (train: 28709, val/PublicTest: 3589, test/PrivateTest: 3589)
- Classes (7): angry, disgust, fear, happy, neutral, sad, surprise
- Train max:min class imbalance ratio: 16.55
- Test max:min class imbalance ratio: 15.98
- Prefix census: ALL PASSED
- Image dimensions: uniform (48, 48)
- Corrupt/unreadable files: 0 (zero-byte: 0)
- MD5 exact-duplicate groups: 1516 (cross-group leakage: 557 groups, 1323 files)
- dHash exact-duplicate groups: 1581 (cross-group leakage: 588 groups, 1422 files)
- Near-duplicate groups (Hamming<=3): 2051 (cross-group leakage: 807 groups, 2311 files)
- Overall pixel intensity: mean=129.38, std=65.08, min=0, max=255, median=134.0
- Quality-anomaly candidates flagged: near-constant=14, fully-black=12, fully-white=0, brightness-outliers=67

### Per-split class distribution

Train:

| class | count | percent |
| --- | --- | --- |
| angry | 3995 | 13.92 |
| disgust | 436 | 1.52 |
| fear | 4097 | 14.27 |
| happy | 7215 | 25.13 |
| neutral | 4965 | 17.29 |
| sad | 4830 | 16.82 |
| surprise | 3171 | 11.05 |

Val (PublicTest):

| class | count | percent |
| --- | --- | --- |
| angry | 467 | 13.01 |
| disgust | 56 | 1.56 |
| fear | 496 | 13.82 |
| happy | 895 | 24.94 |
| neutral | 607 | 16.91 |
| sad | 653 | 18.19 |
| surprise | 415 | 11.56 |

Test (PrivateTest):

| class | count | percent |
| --- | --- | --- |
| angry | 491 | 13.68 |
| disgust | 55 | 1.53 |
| fear | 528 | 14.71 |
| happy | 879 | 24.49 |
| neutral | 626 | 17.44 |
| sad | 594 | 16.55 |
| surprise | 416 | 11.59 |
