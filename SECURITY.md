# Security policy

## Supported versions

| Version | Supported |
|---------|-----------|
| Latest release on GitHub | Yes |
| Older tags | Best effort |

BLIP is a **local-network P2P** app. Treat your LAN like a trust boundary: anyone on the same broadcast domain may attempt to interact with discovery or open TCP sessions to advertised ports.

## Reporting a vulnerability

**Please do not file public issues** for undisclosed security problems.

Instead:

1. Open a **private vulnerability report** via GitHub (**Security** → **Advisories** → **Report a vulnerability**), if enabled for the repository, **or**
2. Contact the maintainer through a private channel listed on their GitHub profile.

Include:

- Description and impact
- Steps to reproduce
- Affected version / commit
- Optional patch or mitigation ideas

We aim to acknowledge within a few days; timelines depend on maintainer availability.

## Scope (in scope)

- Remote code execution, unsafe IPC, or unsafe `shell.openExternal` usage
- WebRTC / preload bridge weaknesses that break `contextIsolation` assumptions
- Unauthenticated or oversized `avatar-sync` / `clipboard-push` payloads on the LAN mesh
- Packaging / auto-update integrity (when implemented)

## Out of scope

- Physical access to the machine, or malware already running as the user
- Social engineering on the local network
- Denial-of-service by flooding open ports on a hostile LAN (document hardening separately)

## Hardening tips for users

- Run BLIP only on networks you trust.
- Keep the app updated once releases publish security fixes.
- Use OS firewall policies if you expose unusual port overrides.
