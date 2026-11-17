# Third-party notices for A measurement handoff v7.8

- WebEyeTrack: https://github.com/RedForestAI/WebEyeTrack at commit75fbd2f5f784f2eb3a39675a8dcbf1b01c697f1c, MIT. Original/patched TypeScript and patch are in review/source; LICENSE-WebEyeTrack-MIT.txt is retained.
- Public BlazeGaze weights: js/examples/minimal-example/public/web at that commit. Weights are restored locally and hash-checked by setup_runtime_assets.py; not committed.
- TensorFlow.js4.22.0, MediaPipe Tasks Vision0.10.18, ml-matrix6.12.1, mathjs14.5.2: exact package versions in package-lock.json. Legal notices in pilot-worker.js.LEGAL.txt and third-party-licenses/.
- Existing NunDojang numerical utilities and copied C reflow helper: GPL-3.0-or-later. LICENSE-GPL-3.0.txt retained. reference-c/reflow.mjs preserves the previously tested copy rather than replacing it with latest main.
- PDF.js4.10.38: locally restored from the official npm package with hash verification. Its LICENSE and supporting font/CMap notices are restored with it. No PDF.js runtime is committed in this namespace.
- application-two-pages.pdf contains project-authored test text, rendered with ReportLab's standard HYGothic-Medium CID reference. It is not an externally published consent form and embeds no bundled Noto font.

The runtime worker bytes are identical to those used in the supplied v7.8 experiment. Only packaging/review documentation and the asset setup error-path wording change in this handoff.
