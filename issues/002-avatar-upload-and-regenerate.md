# [FEATURE] Avatar upload optional path + deterministic regenerate from BLIP identity

## Type
Enhancement · Profile · Privacy

## Summary
Allow replacing the generated avatar image with user-provided PNG/WebP ≤ N MB while retaining deterministic fallback generated from `(blipId, salt)` seed; expose “Regenerate procedural avatar” reset.

## Background
Balances personalization with LAN-first anonymity and zero cloud dependency.

## Scope
- File picker IPC from renderer → validate MIME, dimensions, decode in main or renderer with capped memory.
- Store asset under `userData` with stable filenames; migrate on ID change optionally.
- `Regenerate` removes custom override and restores seed-based avatar.
- Announce payload MAY include opaque “avatar fingerprint” URI or hash-only if sharing later.

## Acceptance criteria
- [x] Uploaded avatar displays in roster, dial, chat header, call UI where peer shown. _(Roster, chat hub, chat header for self-peer, call window, settings preview; dial has no avatars.)_
- [x] Oversize / invalid mime rejected with surfaced error string (i18n).
- [x] Deterministic procedural avatar recreated after regenerate. _(“Use generated avatar” / remove custom.)_
- [x] Works offline-only; no outbound fetch. _(Stored in `localStorage`.)_

## Technical notes
- Cap decode size early to mitigate decompression bombs. _(1 MB file cap + 64×64 JPEG recompress in renderer.)_
- Consider CSP `blob:`/`file:` allowances when loading local previews.

## Definition of done
Visual regression spot-check across main + optional call surface.
