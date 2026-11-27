# Tally

Talk to your bill.

A voice-first assistant that explains an electricity bill in Gujarati, Hindi or English and helps the user act on it.
Theme: Public infrastructure and civic services. Built for Scaler x Wispr Flow "India Runs on Voice", Round 2.

## Run

    docker compose up --build

Open http://localhost:3000 in Chrome or Edge, tap the mic and allow microphone access.
No API keys or `.env` file are needed. Without Docker: `node server.js` (Node 18+).

## Voice flow

1. Say this month's units, last month's units and the bill amount (digits, or number words in English and Hindi).
2. The app repeats the numbers back for confirmation.
3. Say what ran more (AC, cooler, geyser, fridge, motor, guests).
4. It explains the change in plain words, then offers: savings tips in rupees, a drafted complaint saved to the server,
   a solar subsidy check (PM Surya Ghar), and a WhatsApp summary for family.

The reply language follows the script you speak or type (Gujarati, Devanagari or Latin). Buttons and a text box are the fallback.

## How it works

- Speech in and out: the browser's built-in Web Speech API (no keys). Chrome sends audio to Google for recognition.
  Gujarati speech output depends on the voices installed on the device; text is always shown on screen.
- Logic: rule-based and offline (`public/app.js`, `public/i18n.js`). Savings and the "is my bill too high?" check use an illustrative slab tariff (`public/tariff.js`), not an official DISCOM tariff.
- Server: dependency-free Node (`server.js`) serving the PWA and storing drafted complaints in `data/complaints.json`.

## Limits

Prototype only. Spoken number words are parsed for English and Hindi (not Gujarati yet); Gujarati numbers must come as digits. No real DISCOM integration.

## Tests

    node test-numbers.js && node test-tariff.js && node test-flow.js

No dependencies needed. `test-flow.js` drives the real conversation logic against a fake DOM.
