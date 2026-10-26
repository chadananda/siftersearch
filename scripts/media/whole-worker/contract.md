Whole-recording job v1

Input directory: job.json and exactly one original input file. Job metadata is
resolved by Tower; no credentials or database paths enter the bundle. The input
is retained unchanged. Worker writes item/ with derived media and result.json.

Tower must validate input hash, output hashes, paths (no traversal/symlinks),
required stages and outputs before adopting a result. Partial output never
publishes. A retry reuses the same job identity; a claimed job is not issued to
another worker until its lease is recovered. A worker restart resumes the job
from its local stage checkpoints rather than copying the original again.

Worker self-reports stage, CPU/RAM/VRAM/temperature, ready depth and completed
jobs. Admission is based on live resource readings. CPU stages may overlap a
GPU stage on another recording. GPU model admission reserves headroom so
multiple processes cannot all spend the same free VRAM.

All ffmpeg, ffprobe, metrics, loudness/encoding, waveforms, ASR, speaker detection,
alignment, restoration and word-guard processing run here. Tower performs job
selection, metadata/text enrichment, result validation and publication only.
