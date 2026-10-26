# RSNL — a11y Library Install Guide v1

**Rebuilt 2026-10-26.** The original 1.0.0 was written 2026-09-08 and lost with the
chat it was delivered in. This file is a reconstruction from this guide and §05
Phase 2 of the Web Compliance Playbook. It has the same version number because
nothing was ever deployed against the original — no site pins the old hash. It has
never run on a live site: verify on one before rolling it anywhere.

**Internal.** How to host and deploy `rsnl-a11y-v1.js` per platform. This README is
the guide; the Google Doc it came from is retired, so the doc and the code can't
drift again.

---

## Short answer to "do I add this to the repo?"

**Only Shopify.** The three platforms work differently and it's worth being clear
about why:

| Platform | Is there a repo? | Is there a build step? | How the file gets there |
|---|---|---|---|
| **Webflow** | No | No | Webflow hosts the site. You give it a `<script src>` pointing at a file hosted elsewhere. |
| **WordPress** | Sometimes | Rarely | A one-file must-use plugin enqueues it from a hosted URL. |
| **Shopify** | Yes, with CLI | Yes | The file lives **in the theme** as `assets/rsnl-a11y.js` and ships with `shopify theme push`. |

So two of three need the file **hosted somewhere public first**. That's step 0 and
it's the same for both.

---

## File facts

- **Raw:** 35,228 bytes
- **Gzipped over the wire:** 9,483 bytes — under 10KB, no meaningful performance cost
- **MD5:** `1c9b59e21d0c5ebed1fa85d5f3094779`
- **SRI (sha384):** `wncEZrgoZRHmHOFdZ1rCt5QV7aw8uTYwkLeLYQTGtAWrximonKuYKUb0CVqOOrv9`

Regenerate the SRI hash on every version bump:

```bash
openssl dgst -sha384 -binary rsnl-a11y-v1.js | openssl base64 -A
```

Not minified on purpose. At under 10KB gzipped the saving isn't worth losing
readable stack traces when something misbehaves on a client site at 6pm.

---

## STEP 0 — Host it (done once)

### Public GitHub repo served by jsDelivr

Free, global CDN, immutable version tags, no infrastructure. This repo is it.

1. Repo: `rsnlcreative/rsnl-a11y`. **Public.** The library contains no secrets —
   it's generic accessibility code.
2. `rsnl-a11y-v1.js` committed at the root.
3. Release tagged:

```bash
git tag 1.0.0 && git push origin 1.0.0
```

4. The URL is:

```
https://cdn.jsdelivr.net/gh/rsnlcreative/rsnl-a11y@1.0.0/rsnl-a11y-v1.js
```

### THE ONE RULE THAT MATTERS

**Never point a client site at a floating reference.** Not `@latest`, not `@main`,
not a branch.

```
BAD   .../rsnl-a11y@latest/rsnl-a11y-v1.js
BAD   .../rsnl-a11y@main/rsnl-a11y-v1.js
GOOD  .../rsnl-a11y@1.0.0/rsnl-a11y-v1.js
```

A floating tag means one careless push changes behavior on every client site
simultaneously, with no rollback and no notification. Pin the version. Roll sites
forward deliberately, one at a time, after testing.

### Alternative if you want RSNL branding on the URL

Cloudflare R2 or Pages behind `cdn.rsnlcreative.com`. Keeps the source private,
gives you `https://cdn.rsnlcreative.com/a11y/1.0.0/rsnl-a11y.js`, costs pennies.
More setup, same result. Do it later if it matters; don't let it block step 1.

---

## WEBFLOW

No repo, no build. Two deployment paths.

### Path A — manual, per site (2 minutes)

1. Site Settings → **Custom Code** → **Footer Code**
2. Paste:

```html
<script src="https://cdn.jsdelivr.net/gh/rsnlcreative/rsnl-a11y@1.0.0/rsnl-a11y-v1.js"
        integrity="sha384-wncEZrgoZRHmHOFdZ1rCt5QV7aw8uTYwkLeLYQTGtAWrximonKuYKUb0CVqOOrv9"
        crossorigin="anonymous"
        defer></script>
```

3. Save → **Publish**. Custom code changes only take effect on publish.

Footer, not head — it needs the DOM. The `defer` is belt-and-braces; the library
handles both readyState cases either way.

### Path B — scripted across every site at once (the real answer)

Webflow's Data API has a registered-scripts mechanism, which is what "deploy" looks
like on this platform:

1. `register_hosted_script` — takes `hosted_location` and `integrity_hash`, returns
   a script ID
2. `add_site_script` — applies it to a site with `location: "footer"` and a version
3. Publish

Constraints worth knowing before you rely on it:

- **Registered script versions are immutable.** You cannot overwrite 1.0.0; bump
  the SemVer to change anything.
- Up to **800 registered scripts** per site. Not a real limit.
- **Changes only take effect on publish**, same as freeform code.
- The custom-code endpoints require an **OAuth app token** — a plain site or
  workspace token is rejected. The MCP connector is an OAuth app, so it clears this.

This is the path to use, because it can run across the whole Webflow book in one
pass instead of 20 copy-pastes. Point the connector at the RSNL workspace and it's
one job.

### After install, on the Holistic Homes main site only

Delete the inlined Instagram block from the footer. It's module 14 of the library
(`feedImages`), pasted in early to clear the 25 unlabeled images before hosting
existed. There's a comment in the footer marking it. Leaving it duplicates the work
harmlessly but it's dead weight and a future dev will wonder.

---

## WORDPRESS

Use the must-use plugin — `rsnl-a11y-mu-plugin.php`.

1. Drop the single file into `wp-content/mu-plugins/` (create the directory if it
   doesn't exist)
2. Done. **No activation step.** WordPress loads mu-plugins automatically, before
   regular plugins.

### Why an mu-plugin and not the alternatives

- **functions.php** belongs to the theme. Change or update the theme and the script
  silently stops loading. Across a book of client sites that's a failure you won't
  notice for months.
- **A header/footer plugin** can be deactivated by the client, or by another
  plugin's conflict resolution.
- **An mu-plugin** doesn't appear in the deactivatable plugin list, survives theme
  changes, and loads early. That's the correct pattern for agency-wide code.

### What the plugin does

- Enqueues in the **footer**, deferred, no dependencies (deliberately not
  jQuery-bound)
- Adds integrity and crossorigin, and skips them automatically for same-origin loads
- Front end only — never in wp-admin, the block editor, the login screen or the
  Customizer. The library rewrites ARIA on rendered markup; doing that to an editor
  UI helps nobody and risks fighting the editor's own scripts.
- Version and base URL are constants you can override in `wp-config.php` per site
- An `rsnl_a11y_enabled` filter to opt a site out without editing the file
- An admin notice if the version was bumped without updating the SRI hash —
  **that's the regression it exists to catch.** A stale hash against a new file
  means the browser refuses to run the script and the site silently loses every fix,
  with nothing on the page to show it.

### To roll a site forward

Change `RSNL_A11Y_VERSION` and `RSNL_A11Y_SRI` together. Both, every time.

---

## SHOPIFY

This is the one that genuinely lives in the repo.

### With Shopify CLI (recommended for any store you touch more than once)

```bash
shopify theme pull --store your-store.myshopify.com
cp rsnl-a11y-v1.js assets/rsnl-a11y.js
```

Then in `layout/theme.liquid`, immediately before `</body>`:

```liquid
<script src="{{ 'rsnl-a11y.js' | asset_url }}" defer></script>
```

```bash
shopify theme push --unpublished    # preview first
```

Preview, verify, then publish from the admin.

`asset_url` self-hosts the file from Shopify's CDN, so there's **no external
dependency and no SRI needed** — the file is part of the theme and versioned with
it. That's cleaner than the Webflow and WordPress situation, and it's why Shopify is
the only platform where "in the repo, deployed during builds" is the right mental
model.

### Without CLI

Admin → Online Store → Themes → **duplicate the theme first** → Edit code → Assets →
Add a new asset → upload `rsnl-a11y.js` → edit `layout/theme.liquid` and add the tag
above → preview → publish.

### CRITICAL — do not put this on checkout

Checkout is a separate surface. **Any script on the checkout page can disqualify the
merchant from simplified PCI SAQ A** (requirements 6.4.3 and 11.6.1, mandatory since
March 31 2025). Shopify certifies its own systems, not your checkout page.

`theme.liquid` does not cover checkout, so following the steps above is already
correct. The rule is: never add it to `checkout.liquid`, and never register it as a
checkout script or Shopify Pixel. If a store needs accessibility work inside
checkout, that's a Shopify Plus checkout-extensibility conversation, not this
library.

---

## Verifying the install, any platform

1. Load a page and open the console. The library logs a debug line listing which
   modules found elements:

   ```
   [rsnl-a11y] v1.0.0 ready [{module: "formStatus", elements: 3}, …]
   ```

   Modules reporting 0 elements are normal — it means that markup isn't on the page.
   This build has 15 modules (dialogs and tables are split); the report names all 15.
2. Check `window.__rsnlA11y.version` returns `1.0.0`.
3. Tab through the page. Focus should be visible, ordered, and Escape should close
   any overlay and return focus to its trigger.
4. If the console shows nothing at all, the script didn't load: check the URL, then
   check whether a stale SRI hash is blocking it. A hash mismatch is silent in the
   page and explicit in the console.

---

## Rolling out a new version later

1. Edit the library, bump the filename or tag to the new SemVer
2. Regenerate the SRI hash
3. Publish the new tag
4. **Roll one site forward and test it.** Not all of them.
5. Then the rest, in batches

Never mutate a published version in place. The whole point of pinning is that a
client site's behavior cannot change without someone deciding it should.
