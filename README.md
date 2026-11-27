# Tally

Talk to your bill.

A voice-first assistant that explains an electricity bill in Gujarati, Hindi or English and helps the user act on it.
Theme: Public infrastructure and civic services. Built for Scaler x Wispr Flow "India Runs on Voice", Round 2.

## Run

    docker compose up --build

Open http://localhost:3000 in Chrome or Edge, tap the mic and allow microphone access.
No API keys or `.env` file are needed. Without Docker: `node server.js` (Node 18+).

## What it is

A voice cockpit, not a chat box. The orb is the microphone and moves with your real voice level; Tally's replies appear as large live captions while a dashboard builds up beside them:

- **Bill X-ray:** an animated donut of what you were charged for (each tariff slab, duty, fixed charge) and a gauge showing whether the bill is fair for the units used.
- **What-if simulator:** sliders per appliance (AC, cooler, geyser, motor, lights) with the monthly rupee saving at your current slab. Say "AC one hour less" to move a slider by voice.
- **Rooftop solar:** system size, PM Surya Ghar style subsidy, what you pay and payback years.
- **Savings tips, complaint letter** (save to server, download, print) and a **WhatsApp summary** for family.

## Voice flow

1. Say this month's units, last month's units and the bill amount (digits, or number words in English and Hindi). Tally repeats them back to confirm.
2. Say what ran more (AC, cooler, geyser, fridge, motor, guests).
3. The dashboard opens. Control it by voice: "what if AC one hour less", "solar", "savings", "complaint", "family", "start again". Everything also works by touch or by typing.

The reply language follows the script you speak or type (Gujarati, Devanagari or Latin).

## How it works

- Speech in and out: the browser's built-in Web Speech API (no keys). Chrome sends audio to Google for recognition.
  Gujarati speech output depends on the voices installed on the device; text is always shown on screen.
- Logic: rule-based and offline (`public/app.js`, `tariff.js`, `sim.js`, `numbers.js`, `i18n.js`); visuals in `viz.js`. Savings and the "is my bill too high?" check use an illustrative slab tariff (`public/tariff.js`), not an official DISCOM tariff.
- Server: dependency-free Node (`server.js`) serving the PWA and storing drafted complaints in `data/complaints.json`.

## Limits

Prototype only. Spoken number words are parsed for English and Hindi (not Gujarati yet); Gujarati numbers must come as digits. No real DISCOM integration.

## Tests

    node test-numbers.js && node test-tariff.js && node test-sim.js && node test-i18n.js && node test-flow.js

No dependencies needed. `test-flow.js` drives the real conversation logic against a fake DOM.

Browser test (app running on :3000, `npm i playwright` somewhere on the path): `node test-e2e.js` clicks and types through the whole flow in Chrome on mobile and desktop, in light and dark mode, in all three languages.
