# myNonRev

An offline-first **PWA** that keeps your airline nonrev logins in an **encrypted vault** and gets you into each portal with one tap. It is the web rebuild of the RouteMe / myNonRev React Native app, structured like the CertStudy PWA: plain ES modules, no framework, no runtime dependencies, strict Content-Security-Policy, and a build-hashed service worker.

Built-in portals: **American Airlines** (Travel Planner), **Delta** (TravelNet), **myIDTravel**, **United**, **Southwest**. You can add your own in the app.

## Two ways to run it

The same code runs in two places, and the difference matters for sign-in:

| | Browser / Home Screen PWA | **Native iPhone app** (Capacitor) |
|---|---|---|
| Opening a portal | A browser tab | **Inside the app** (a real in-app browser) |
| Signing in | Copy buttons, or the autofill bookmarklet | **Automatic**: the sign-in engine is injected into every page, like the old RouteMe app |
| Vault storage | Browser `localStorage` | `localStorage` plus a durable copy in native storage |
| Installing | Add to Home Screen | TestFlight (build described below) |

**Why the PWA alone can't log in inside the app:** a web app cannot run scripts inside another site's page, and airline sites refuse to be framed. Only a native web view can, which is why the native shell exists. The PWA's bookmarklet is the best a browser can do.

The autofill engine is a straight port of the RouteMe one (username, Next, password, Sign in, then click-through steps), so sign-in behaves the same.

## Features

- **Encrypted vault**: logins are encrypted with a key wrapped by your passphrase (PBKDF2-SHA-256, 600,000 iterations, AES-GCM). The vault is ciphertext at rest and only decrypted in memory while unlocked.
- **Auto-lock** when you leave the app or it sits idle (On leave / 1 / 5 / 15 min).
- **One-tap launcher** for every portal, plus copy buttons for username and password. Copied passwords are wiped from the clipboard after 30 seconds (browsers only allow this while the app is in front, so it happens when you return to it).
- **Autofill bookmarklet** for hands-off sign-in on the airline's own page (see below).
- **Custom portals** with their own name, address and colour.
- **Encrypted backup** export and restore (new phone, or insurance against Safari clearing site data).
- Works **offline**, installs to the Home Screen, light/dark theme, update prompt when a new version is deployed.

## Autofill in a browser: how the bookmarklet works

(The native app does not need this: it signs in inside its own browser. The Autofill tab is hidden there.)

1. Open **Autofill** in the app and tap **Set up autofill**. This makes a random key that lives only in your vault.
2. Tap **Copy bookmark code**, then in Safari create a bookmark named *myNonRev* and paste the code as its address (the app lists the exact steps).
3. In the app, tap **Sign in** on a portal. It copies an **encrypted login code** and opens the site.
4. On the airline page, open Bookmarks and tap **myNonRev**. It reads the code, decrypts it with the key stored in the bookmark, and runs the sign-in engine. If the site moves to a new page part-way, tap the bookmark again; it picks up where it left off.

The clipboard only ever holds ciphertext, the code is useless without your bookmark's key, and it expires after 5 minutes. If the clipboard can't be read, the bookmark offers a paste box instead.

**iPhone caveat:** links opened from the Home Screen app may show in a small in-app viewer that has no Bookmarks menu. Tap its Safari icon (or Share, then *Open in Safari*) first. This is iOS behaviour and could not be tested from a desktop; the plain copy buttons always work.

## Run it

Requires Node 20 or newer. There is nothing to install.

```powershell
npm test              # unit tests (vault, encryption, login codes, bookmarklet, portals)
npm start             # dev server at http://127.0.0.1:8080/
npm run build         # regenerate build.json + precache.js after changing any file
npm run check         # CI: fail if those generated files are stale
```

`npm start -- --lan` serves on your network, but iOS only allows service workers and WebCrypto on **https** (localhost is exempt), so to try it on a phone, deploy it.

`tests/fixtures/login.html` is a fake two-step airline login you can open at `http://127.0.0.1:8080/fixtures/login.html` to try the bookmarklet without touching a real site. It is not deployed.

## Deploy to GitHub Pages

1. Create a GitHub repository (the workflow is restricted to the `JWHIT49` account, same as CertStudy), push this folder, and in **Settings, Pages** set the source to **GitHub Actions**.
2. `.github/workflows/pages.yml` runs the tests, checks the generated files, and publishes `https://jwhit49.github.io/<repo>/`.
3. On your iPhone open that address in **Safari**, tap Share, then **Add to Home Screen**, and create your vault **in the installed app** (storage in Safari and in the installed app is separate).
4. Run `npm run build` and commit `precache.js` / `build.json` whenever you change any file under `js/`, `css/`, `icons/`, `index.html`, `manifest.webmanifest` or `sw.js`. Installed copies then show an **Update** prompt.

## Security notes

- Nothing leaves the device. The CSP allows no connections except to the app's own origin, and there is no analytics or cloud sync.
- A forgotten passphrase cannot be recovered. Keep an exported backup somewhere safe (it is encrypted too).
- Use a long passphrase: it is the only thing between someone with your unlocked phone's storage and your logins.
- **GitHub Pages shares one origin across all of an account's project sites**, including CertStudy. The vault is encrypted so other pages can only see ciphertext, but a script on another page of that origin could read or delete it. For stronger isolation, host this under its own domain or account.
- The password is briefly in the page's memory while unlocked or revealed; the vault locks itself and drops the key and data when it locks.
- Use this only for your own accounts and authorized employee travel.

## Tuning the click-through steps

Portals are defined in [js/portals.js](js/portals.js). Each `navSteps` entry is `{ text: 'regex', label: 'Friendly name', timeout: 12000 }`, where `text` is a case-insensitive regular expression matched against a link or button's visible text. American's two steps are enabled; the others ship empty. After editing, run `npm test` (it checks every regex compiles) and `npm run build`. The steps travel inside the encrypted login code each time, so the bookmark does not need to be reinstalled.

## Build the native iPhone app

The Xcode project is in `ios/` (Capacitor 8, Swift Package Manager, iOS 15+, bundle ID `com.jwhit49.routeme`, the same App Store Connect record as the old app). You do not need a Mac: GitHub builds it.

1. Add four repository secrets (Settings, Secrets and variables, Actions): `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, and `ASC_KEY_P8` (the contents of an App Store Connect API key `.p8`). The steps to create the key are at the top of [.github/workflows/ios.yml](.github/workflows/ios.yml).
2. Actions tab, **iOS build and TestFlight**, **Run workflow**. It runs the tests, copies the web files into the Xcode project, signs with cloud-managed certificates, and uploads to TestFlight.
3. Install from TestFlight on your iPhone. A build number must be higher than every one already in App Store Connect; the workflow uses `1000 + run number` unless you give one.

Locally, `npm run cap:sync` copies the web files and plugins into `ios/`, and `npm run cap:open` opens Xcode on a Mac.

**What is verified and what is not:** the web layer, the in-app browser wiring (against a stand-in for the plugin) and the exact injected script (against the fake-airline fixture) are tested. The Xcode build, the signing, and the real in-app browser on a device have **not** been run, because that needs a Mac and an iPhone. Expect to fix small things on the first TestFlight build.

Native pieces used: [@capgo/capacitor-inappbrowser](https://github.com/Cap-go/capacitor-inappbrowser) (in-app browser with script injection), `@capacitor/preferences` (durable vault copy), `filesystem` and `share` (backup export), `status-bar`.

## Project layout

```
index.html, manifest.webmanifest, sw.js    PWA shell and offline service worker
precache.js, build.json                    generated by tools/build.mjs
css/app.css                                styles (light/dark)
icons/                                     app icons
js/main.js                                 boot, routes, lock guard
js/crypto.js, js/vault.js                  encryption primitives and the encrypted vault
js/autofill/engine.js                      sign-in state machine (ported from RouteMe)
js/autofill/bookmarklet.js                 login codes and bookmarklet builder (browser)
js/autofill/inject.js                      the script injected by the native in-app browser
js/native.js, js/inapp.js                  bridge to the native shell; the in-app browser
js/portals.js                              portal catalogue and custom portals
js/views/                                  lock, home, portal, edit, autofill, settings
capacitor.config.json, ios/                native shell (Xcode project)
tools/                                     build, dev server, staging for the native app
tests/                                     node:test suites and a fake-airline fixture
```
