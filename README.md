# Mahfuz TV — Secure Drive CSV Edition

Private live-TV catalogue for Android TV and mobile. The CSV is **not** included in the public web build and must never be committed to GitHub or placed in `public/`.

## Architecture
- Frontend: Vite + vanilla JavaScript/CSS
- Android wrapper: Capacitor
- CSV source: private Google Drive file shared only with a Google service account
- API: Vercel Node.js Functions
- Device tokens / one-time activation codes / cache: Upstash Redis
- Channel endpoint: authenticated `GET /api/channels` returns parsed channel records, never the raw CSV file
- One-time activation: `POST /api/activate`; codes expire after 15 minutes and are consumed once
- Admin endpoints require `Authorization: Bearer <ADMIN_SECRET>`

## Security notes (read before deployment)
1. **No frontend secret.** Google service account credentials, Upstash token, and admin secret must be Vercel Environment Variables only.
2. **Keep the Drive file private.** Share the CSV with the service-account email as Viewer; do not use “Anyone with the link”.
3. The raw CSV is not served by any route. An activated device receives channel names/countries/stream URLs as JSON because playback needs them. A technically skilled authorized user can inspect URLs in their own device. This is not DRM.
4. A local PIN is only a UI lock. Device activation is the server-side access control.
5. Device token is stored in app local storage. Someone with device/debug access may extract it. Revoke lost devices with the admin endpoint.
6. Use only streams you own or are authorized to access. Many public IPTV links may be unstable, geo-restricted, or not licensed for redistribution.
7. Admin endpoints use a long random `ADMIN_SECRET`; do not put it in frontend code, a Git repository, or screenshots. Rotate it if exposed.
8. Upstash Redis `keys()` is used for a small personal device list; for large deployments use a maintained device index instead.

## 1) Google Drive private CSV setup
1. In Google Cloud Console, create a project and enable **Google Drive API**.
2. Create a service account and create/download its JSON key securely.
3. Copy the service account's `client_email`.
4. Upload `Mahfuz-Live-iptv.csv` to your Google Drive. Keep General access set to Restricted.
5. Share that one file with the service-account email as Viewer. Do not share the file publicly.
6. Copy the file ID from its Drive URL (`/file/d/FILE_ID/view`) or the file's URL.
7. Keep the service-account JSON file outside the project folder. For Vercel, copy the entire JSON contents into the `GOOGLE_SERVICE_ACCOUNT_JSON` environment variable. Never commit the JSON key.

CSV header names must be `Channel`, `Country`, `URL` (case-insensitive). The API accepts only HTTP/HTTPS stream URLs and skips rows missing a name or URL.

## 2) Create Upstash Redis
1. Create a Redis database in Upstash.
2. Copy its REST URL and REST token.
3. Add both as Vercel environment variables.

## 3) Environment variables
Add these in Vercel → Project → Settings → Environment Variables, for Production (and Preview only if you need Preview):
- `UPSTASH_REDIS_REST_URL` = Upstash REST URL
- `UPSTASH_REDIS_REST_TOKEN` = Upstash REST token
- `GOOGLE_SERVICE_ACCOUNT_JSON` = complete service-account JSON object as one environment variable value
- `GOOGLE_DRIVE_FILE_ID` = private CSV's Drive file ID
- `ADMIN_SECRET` = long random secret (at least 32 random bytes; example generation command below)

Generate an admin secret locally in PowerShell:
```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```
Set the result only in Vercel Environment Variables. Redeploy after changing variables.

## 4) Deploy to Vercel
1. Create a **private** GitHub repository and upload this project. `.gitignore` excludes CSV files, environment files, service-account JSON, Android build output and keys.
2. Do not add your real CSV or Google key to the repository.
3. Import the repository in Vercel. Framework: Vite. Build command: `npm run build`; output directory: `dist`.
4. Add all environment variables listed above and deploy.
5. Test `GET https://YOUR-DOMAIN/api/channels` without Authorization. It must return `401` (not channel data).
6. Never test or share the admin secret in public. Admin endpoint access is required to issue activation codes.

## 5) Create a one-time activation code
PowerShell example:
```powershell
$headers = @{ Authorization = "Bearer YOUR_ADMIN_SECRET" }
Invoke-RestMethod -Method Post -Uri "https://YOUR-DOMAIN/api/admin/create-code" -Headers $headers
```
It returns a 10-character code. Enter it once in Mahfuz TV. The code expires after 15 minutes and is consumed after use.

List activated devices:
```powershell
Invoke-RestMethod -Method Get -Uri "https://YOUR-DOMAIN/api/admin/devices" -Headers $headers
```
Revoke a device (copy its deviceId from the list):
```powershell
Invoke-RestMethod -Method Delete -Uri "https://YOUR-DOMAIN/api/admin/devices?deviceId=DEVICE_ID" -Headers $headers
```
After revocation, the device's next channel request returns 401. It must be activated again with a new code.

## 6) Run locally
Local frontend development works with:
```bash
npm install
npm run dev
```
The API routes require Vercel Functions and configured environment variables. For full local API testing, install Vercel CLI and run `vercel dev` after setting local environment variables in an ignored `.env.local` file. Never commit `.env.local`.

## 7) Build Android APK
Install Node.js LTS and Android Studio. From project root:
```bash
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```
If the `android/` folder already exists, skip `npx cap add android` and run only `npx cap sync android`.
In Android Studio: wait for Gradle sync → Build → Build Bundle(s) / APK(s) → Build APK(s).
Debug APK path:
`android/app/build/outputs/apk/debug/app-debug.apk`

For a signed release APK use Build → Generate Signed Bundle / APK and store the signing key securely.

### Important: set the hosted API URL before APK build
The frontend uses `VITE_API_BASE_URL`. For the website, leave it unset so relative `/api/...` requests work. Before building the APK, create a local `.env.production` file (it is ignored by Git) containing:
```text
VITE_API_BASE_URL=https://YOUR-VERCEL-DOMAIN
```
Use your real Vercel HTTPS domain, then run `npm run build`, `npx cap sync android`, and build APK again. This URL is public configuration, not a secret. Never put admin secrets or Google credentials in any `VITE_` variable or frontend file.

## 8) Automatic updates
The app refreshes every 5 minutes. The server caches parsed Drive data for up to 60 seconds, so CSV edits should appear within roughly 5 minutes. Pull-to-refresh is not implemented; use Refresh list in the side menu.
