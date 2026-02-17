# contract_maker_node

Local-only backend for contract generation, distribution, signing, and final PDF completion.

## Stack
- Node.js + TypeScript + Express
- MySQL (`mysql2/promise`)
- OpenAI SDK (server-side key)
- `nodemailer` (SMTP or dev console mode)
- `pdf-lib` + `@pdf-lib/fontkit` for final signed PDF (Hebrew-capable with TTF)
- `zod` validation + `uuid` IDs

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env file:
   ```bash
   cp .env.example .env
   ```
3. Update `.env` with your MySQL DB name and (optionally) OpenAI/SMTP settings.
4. Run in dev mode:
   ```bash
   npm run dev
   ```
5. Server runs at: `http://localhost:4000`

## Optional table bootstrap
Tables are assumed to exist, but you can bootstrap locally with:
```bash
npm run ensure:tables
```

## Scripts
- `npm run dev` - start dev server (`ts-node-dev`)
- `npm run build` - compile TypeScript to `dist/`
- `npm start` - run compiled app
- `npm run ensure:tables` - create tables if missing


### Hebrew PDF font configuration
- To avoid `WinAnsi cannot encode` errors for Hebrew, the PDF service tries to load a Unicode TTF font.
- It searches in this order: `PDF_FONT_PATH`, local `assets/fonts/` candidates, then common system fonts.
- Recommended: set `PDF_FONT_PATH` in `.env` to a Hebrew-capable `.ttf` (for example DejaVu Sans / Noto Sans Hebrew).
- If no Unicode font is found, generation still completes with a safe fallback that replaces unsupported glyphs instead of crashing.

## API

### 1) Generate contract text with AI
`POST /api/ai/generate`

Body:
```json
{
  "prompt": "Write a freelance design agreement for website branding",
  "language": "en",
  "signers": [{ "name": "Alice" }, { "name": "Bob" }]
}
```

Response:
```json
{
  "title": "...",
  "contractText": "..."
}
```

Notes:
- Includes signer anchor block (`--- SIGNERS ---`).
- Includes disclaimer line: `Not legal advice`.
- If `OPENAI_API_KEY` is missing, a deterministic fallback is returned.

### 2) Create contract + signers
`POST /api/contracts`

Body:
```json
{
  "title": "Website Services Agreement",
  "contractText": "...",
  "language": "en",
  "creatorEmail": "creator@example.com",
  "signers": [
    { "name": "Alice", "email": "alice@example.com" },
    { "name": "Bob", "email": "bob@example.com" }
  ]
}
```

Response:
```json
{ "contractId": "uuid" }
```

### 3) Send signing links
`POST /api/contracts/:id/send`

- Moves contract status to `sent`.
- Sends each signer a link:  
  `http://localhost:5173/sign/:contractId/:token`
- In dev mode (no SMTP), links are logged to console.

Response:
```json
{ "ok": true }
```

### 4) Contract status
`GET /api/contracts/:id/status`

Response includes contract status + signer progress + `finalPdfAvailable`.

### 5) Public tokenized contract view
`GET /api/contracts/:id/public/:token`

Verifies `contractId + token` and returns signer-specific details for the sign page.

### 6) Get final contract PDF (base64)
`GET /api/contracts/:id/pdf`

Returns the completed contract PDF as base64 so frontend can download/save it.

Example response:
```json
{
  "contractId": "a77cfe1d-ba11-4075-a5ad-3a234f85f351",
  "title": "...",
  "pdfBase64": "JVBERi0xLjQK..."
}
```

### 7) Submit signature
`POST /api/contracts/:id/sign/:token`

Body:
```json
{
  "signatureDataUrl": "data:image/png;base64,iVBORw0KGgo..."
}
```

Action:
- Verifies token
- Saves signature image data URL
- Saves `signed_at`
- Saves SHA-256 signature hash
- If all signers signed:
  - generates final A4 PDF with contract + signatures
  - stores PDF in `contracts.final_pdf_data` as **base64 without prefix**
  - updates status to `completed`
  - emails final PDF to all signers and creator (if exists)

Response:
```json
{ "ok": true, "completed": true }
```

## Sample cURL

Generate:
```bash
curl -X POST http://localhost:4000/api/ai/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt":"צור הסכם שירותים לפיתוח אתר",
    "language":"he",
    "signers":[{"name":"יוסי"},{"name":"דנה"}]
  }'
```

Create contract:
```bash
curl -X POST http://localhost:4000/api/contracts \
  -H 'Content-Type: application/json' \
  -d '{
    "title":"הסכם שירותים",
    "contractText":"טקסט חוזה...",
    "language":"he",
    "creatorEmail":"owner@example.com",
    "signers":[
      {"name":"יוסי","email":"yossi@example.com"},
      {"name":"דנה","email":"dana@example.com"}
    ]
  }'
```

Send links:
```bash
curl -X POST http://localhost:4000/api/contracts/<CONTRACT_ID>/send
```

Public view:
```bash
curl http://localhost:4000/api/contracts/<CONTRACT_ID>/public/<TOKEN>
```

Sign:
```bash
curl -X POST http://localhost:4000/api/contracts/<CONTRACT_ID>/sign/<TOKEN> \
  -H 'Content-Type: application/json' \
  -d '{"signatureDataUrl":"data:image/png;base64,iVBORw0KGgo..."}'
```

Status:
```bash
curl http://localhost:4000/api/contracts/<CONTRACT_ID>/status
```

Get final PDF (base64):
```bash
curl http://localhost:4000/api/contracts/<CONTRACT_ID>/pdf
```

## Security notes
- OpenAI key stays server-side only.
- CORS restricted to `CORS_ORIGIN` (default `http://localhost:5173`).
- Signer tokens are generated with `crypto.randomBytes(32).toString('hex')`.
- Tokenized endpoints verify both `contractId` and `token`.
