# LocalPass - Secure Offline Password Manager

LocalPass is a high-security password manager designed to operate 100% offline. Unlike other managers, your credentials never leave your device and are protected by military-grade encryption standards.

## Core Features

- **Total Privacy (Air-Gapped by Design):** No servers, no cloud databases, no telemetry. Everything is processed on the client (browser).
- **AES-256-GCM Encryption:** Uses the native browser Web Crypto API to encrypt data.
- **Robust Key Derivation:** Implements PBKDF2 with SHA-512 and 210,000 iterations to protect your Master Password against brute-force attacks.
- **Local Password Generator:** Create secure keys with customizable parameters without sending data to the internet.
- **Security Audit:** Integrated deterministic security agent that analyzes password robustness and detects common patterns locally.
- **Smart Conflict Management:** Dedicated interface to resolve duplicates when importing or manually syncing vaults between devices.
- **Multilingual Support:** Full interface in English and Spanish.
- **Auto-Lock:** The vault closes automatically after 10 minutes of inactivity to protect your session.

## Security Architecture

1. **Master Password:** The user defines a key that is never stored.
2. **Salt & IV:** Unique cryptographic random values are generated for each save session.
3. **Derivation:** PBKDF2 is used to transform the password into a 256-bit CryptoKey.
4. **Encryption:** Data is transformed into a JSON string, encrypted with AES-GCM, and stored as a Base64 blob in the browser's LocalStorage.

## Tech Stack

- **Frontend:** Next.js 15 (App Router), React 19, Tailwind CSS.
- **UI Components:** Shadcn UI & Lucide Icons.
- **Security:** Web Crypto API (Native).
- **Storage:** LocalStorage (Encrypted).

## How to Get Started

1. Clone the repository.
2. Install dependencies: `npm install`.
3. Run the development environment: `npm run dev`.
4. Open `http://localhost:9002` in your browser.

---
**Security Note:** LocalPass does not have a "Recover Password" mechanism. If you forget your Master Password, your data is mathematically impossible to recover. Frequently back up your encrypted .json vault files.
