# HIPAA Security Risk Assessment (SRA) Tool

![SaberGuard Logo](SaberGuard_1.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
[![GitHub Pages](https://img.shields.io/badge/Demo-GitHub%20Pages-blue)](https://youruser.github.io/hipaa-sra/)
[![Compliance](https://img.shields.io/badge/HIPAA-SRA%20Tool-teal)]()

A **local-first HIPAA Security Risk Assessment (SRA) workspace**, created by [SaberGuard](https://saberguard.tech). It runs entirely in the browser with no backend, trackers, cookies, or browser persistence. Work exists only in the current tab until the assessor explicitly downloads a portable JSON assessment file.

## ✨ Features
- Covers HIPAA Security Rule safeguards (164.308, 164.310, 164.312, 164.316)
- Guided, plain-language review of 28 administrative, physical, technical, and documentation safeguards
- Per-safeguard implementation notes and local evidence attachments
- Filterable gap review and live assessment progress
- Multi-item risk register with likelihood × impact, owners, target dates, remediation, and residual risk
- Management attestation block for executive sign‑off
- **No data leaves the tab unless the assessor chooses to download or print it**
- Portable JSON export/import includes responses, risk records, and attached evidence
- Review-ready print layout for **Print → Save as PDF**

## 🚀 Quick Start
```bash
# Clone the repo
git clone https://github.com/YOURUSER/hipaa-sra-tool.git
cd hipaa-sra-tool

# Open in browser
open index.html   # or double‑click in Finder/Explorer
```
Or deploy as a static application with **GitHub Pages**:
1. Push repo to GitHub.
2. Go to Settings → Pages → Deploy from branch → `main` → `/ (root)`.
3. Access at `https://youruser.github.io/hipaa-sra-tool/`.

### Vercel

Import the GitHub repository into Vercel and deploy it as-is. The included `vercel.json` serves the static app and adds security headers. No environment variables, database, or server functions are required.

## 🔐 Data handling

- The application does not use `localStorage`, `sessionStorage`, IndexedDB, cookies, analytics, or network APIs.
- Unsaved work is held in JavaScript memory and is lost when the tab is closed or refreshed.
- JSON files and printed reports can contain sensitive security details. Store them only in an approved encrypted location and follow the client's retention and access-control policies.

## ⚖️ Disclaimer
This tool is provided **“as‑is”** for educational and compliance support purposes. It does **not** constitute legal advice. Covered Entities and Business Associates are responsible for validating results with legal/compliance professionals. HIPAA requires SRA documentation retention for **6 years**.

## 📄 License
Open‑sourced under the MIT License. See [LICENSE](LICENSE) for details.

---

💜 Made with care by **SaberGuard** - empowering small teams and HIPAA‑regulated providers with transparent, secure tools.
