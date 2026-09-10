<div align="center">

# Enamel

Design a badge or a certificate from a preset, save versions, publish it, and hand it out with claim links that expire

[![Live][badge-site]][url-site]
[![HTML5][badge-html]][url-html]
[![CSS3][badge-css]][url-css]
[![JavaScript][badge-js]][url-js]
[![Claude Code][badge-claude]][url-claude]
[![License][badge-license]](LICENSE)

[badge-site]:    https://img.shields.io/badge/live_site-f97316?style=for-the-badge&logo=googlechrome&logoColor=white
[badge-html]:    https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white
[badge-css]:     https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white
[badge-js]:      https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black
[badge-claude]:  https://img.shields.io/badge/Claude_Code-CC785C?style=for-the-badge&logo=anthropic&logoColor=white
[badge-license]: https://img.shields.io/badge/license-MIT-404040?style=for-the-badge

[url-site]:   https://enamel.neorgon.com/
[url-html]:   #
[url-css]:    #
[url-js]:     #
[url-claude]: https://claude.ai/code

</div>

---

## Overview

Enamel is the studio half of Sash. You pick one of 24 finished designs, change
the words, and you have something worth handing out in about half a minute. Then
you publish it and mint a claim link with an expiry and a seat limit, and the
people who follow that link hold the badge in their own wallet on
[sash.neorgon.com](https://sash.neorgon.com/).

Everything it makes is a parody credential, and it says so on the artefact
itself. The renderer draws a provenance strip into every badge and certificate,
in the editor as well as on the export, carrying the origin, the issuing handle
and the address a reader can check the credential at. There is no way to switch
it off, which is the point.

**Live:** enamel.neorgon.com

---

## Features

- **A parametric editor, not a canvas**: fifteen silhouettes, nine patterns, ring
  styles, metals, pips, arc text, a ribbon and a centre glyph or image, each one a
  field in a design document rather than a shape you drag.
- **24 finished presets and a randomize control**: twelve badges, twelve
  certificates and ten font pairings. A pairing names a role, never a family.
- **Versions that are frozen once written**: publishing writes a version and every
  award pins the version it was issued from, so a later edit never changes a badge
  somebody already holds.
- **Claim links with an expiry, a seat limit and an allow list**, minted by the
  deployment, and an issuer dashboard that answers who claimed which link.
- **Two authoring warnings that are measured rather than guessed**: arc text
  leaving the silhouette (it vanishes on export against a light page) and a
  provenance strip too pale to read.
- **Certificates at a fixed A4 aspect** in both orientations, with an embedded
  badge as the seal and a QR of the verify address.

---

## Running locally

ES modules require an HTTP server (not `file://`):

```bash
make serve
```

Or manually:

```bash
python3 -m http.server 8000
```

**Signing in does not work on localhost.** The site carries the fleet's
production Clerk key, and Clerk refuses a production key on any origin that is
not `neorgon.com`. The editor, the presets, the warnings and every read of a
published template work; anything that writes needs the deployed site.

---

## Architecture

There is **no `convex/` folder here.** Enamel points a `ConvexHttpClient` at the
deployment `projects/sash-site/convex/` owns and calls the same functions. The
URL is a `<meta name="neo-convex-url">` on every page, so the two sites cannot
quietly disagree about it.

```
enamel-site/
├── index.html          # The studio: editor, preview, presets, publish
├── templates.html      # The library: versions, archive, admin edit
├── links.html          # Claim links and the issuer dashboard
├── css/
│   └── style.css       # Site styles. Tokens come from the CDN base.css
├── js/
│   ├── app.js          # Entry point, one controller per page
│   ├── state.js        # The working design, one per kind, and the session
│   ├── fields.js       # The editor declared as paths into the design document
│   ├── editor.js       # Those fields as controls, and one delegated listener
│   ├── preview.js      # The kit draws; this appends what it returns
│   ├── warnings.js     # The arc and contrast measurements
│   ├── studio.js       # index.html
│   ├── library.js      # templates.html
│   ├── links.js        # links.html
│   ├── art.js          # Shrink, upload, attach
│   ├── api.js          # The one place this site talks to Convex
│   ├── auth.js         # Clerk session
│   ├── render.js       # Shared DOM pieces
│   ├── events.js       # The modal shell
│   ├── utils.js        # Shared helpers
│   ├── insignia/       # The Insignia Kit, vendored. Never edited here
│   └── vendor/         # The shared auth client, vendored. Never edited here
├── favicon.ico
├── robots.txt
├── sitemap.xml
├── CNAME
├── Makefile
└── README.md
```

---

<div align="center">
<sub>Part of <a href="https://neorgon.com/">Neorgon</a></sub>
</div>
