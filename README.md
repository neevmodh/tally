# Bolo Bijli

A voice-first assistant that explains an electricity bill in Gujarati, Hindi or English and helps the user act on it.
Theme: Public infrastructure and civic services. Built for Scaler x Wispr Flow "India Runs on Voice", Round 2.

## Run

    docker compose up --build

Open http://localhost:3000 in Chrome or Edge, tap the mic and allow microphone access.
No API keys or `.env` file are needed. Without Docker: `node server.js` (Node 18+).

## Voice flow

1. Say this month's units, last month's units and the bill amount (digits in any of the three languages).
2. The app repeats the numbers back for confirmation.
3. Say what ran more (AC, cooler, geyser, fridge, motor, guests).
4. It explains the change in plain words, then offers: savings tips in rupees, a drafted complaint saved to the server,
   a solar subsidy check (PM Surya Ghar), and a WhatsApp summary for family.

The reply language follows the script you speak or type (Gujarati, Devanagari or Latin). Buttons and a text box are the fallback.

## How it works

- Speech in and out: the browser's built-in Web Speech API (no keys). Chrome sends audio to Google for recognition.
  Gujarati speech output depends on the voices installed on the device; text is always shown on screen.
- Logic: rule-based and offline (`public/app.js`, `public/i18n.js`). Savings use an illustrative Rs 5.5 per unit, not an official tariff.
- Server: dependency-free Node (`server.js`) serving the PWA and storing drafted complaints in `data/complaints.json`.

## Limits

Prototype only. Numbers are spoken as digits; spoken number words are not parsed yet. No real DISCOM integration.
