# Security Policy

HushShot exists to stop sensitive data from leaking, so a flaw that lets redacted content be recovered is treated as a security bug.

## In scope

- Redacted text, faces or codes that can be read or reconstructed from an exported file (including de-pixelation / de-blurring)
- Metadata (EXIF, GPS, XMP, IPTC, PDF info, text layers) surviving export
- The app making any network request with file contents, or a way to bypass the Content-Security-Policy
- Path traversal or remote access in the desktop (Electron) wrapper

Missed *detections* (e.g. an address format that isn't recognised) are ordinary bugs — open a normal issue.

## Reporting

Please **don't open a public issue** for the items above. Use GitHub's private reporting instead:
**[Report a vulnerability](https://github.com/SYasJ/hushshot/security/advisories/new)**.

Include steps to reproduce with a **fictional** document — never attach real personal data. Expect an acknowledgement within a few days.

## Supported versions

Only the latest `main` (and the live site built from it) receives fixes.
