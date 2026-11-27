# Phase T — Platform OAuth and publishing setup

## Vercel environment variables

### YouTube OAuth
- `YOUTUBE_OAUTH_CLIENT_ID`
- `YOUTUBE_OAUTH_CLIENT_SECRET`
- `YOUTUBE_OAUTH_REDIRECT_URI` — `https://YOUR_APP_DOMAIN/api/youtube/callback`
- `PLATFORM_TOKEN_ENCRYPTION_KEY` — base64 encoding of 32 cryptographically random bytes.

### Meta / Instagram OAuth
- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI` — `https://YOUR_APP_DOMAIN/api/instagram/callback`
- `META_LOGIN_CONFIG_ID`
- `META_GRAPH_VERSION`
- `META_TOKEN_ENCRYPTION_KEY` — base64 encoding of 32 cryptographically random bytes.

Generate each encryption key independently. Never reuse one key for both token stores. Do not commit secrets or expose them as NEXT_PUBLIC variables.

## OAuth provider configuration

Google Cloud Console: configure an OAuth consent screen, enable YouTube Data API v3, create a Web application OAuth client, and add the exact callback URL above as an authorized redirect URI. Add the required test users while the consent screen is in testing.

Meta Developers: configure Facebook Login for Business and Instagram Graph API permissions in the login configuration; add the exact callback URL as a valid OAuth redirect URI. The Instagram account must be a Business or Creator account linked to a Facebook Page. App review / business verification may be required for users outside app roles.

## Database
Apply migration `20261127000800_phase_t_platform_oauth.sql` after the workspace and Phase R/S migrations. It migrates the existing Instagram connection into the default workspace and creates the YouTube token table.

## Connect accounts
Sign in, choose a workspace, open Publishing Connections, and connect the YouTube and Instagram accounts for that workspace. Verify account names and token status. OAuth callbacks require the same signed-in browser session.

## n8n credential broker
The application exposes `POST /api/internal/publishing/credentials`. Send:
```json
{"ownerId":"<app user id>","workspaceId":"<workspace uuid>","platform":"youtube"}
```
or platform `instagram`, with header `x-publishing-callback-secret: <N8N_PUBLISHING_CALLBACK_SECRET>`.

The endpoint returns a short-lived access token to the trusted workflow only. Configure n8n to call it immediately before each platform upload, use the returned token for the platform request, and never log or persist the response. The YouTube access token is refreshed using its encrypted refresh token when near expiry. Instagram Page tokens are long-lived; reconnect when the API reports expiry.

## Important limitations
- Google OAuth verification and Meta app review are external provider tasks.
- Instagram publishing requires eligible professional account permissions and supported media; platform publishing may reject videos that do not meet current media requirements.
- The existing `n8n/platform-publishing.json` workflow still needs to be updated/imported and activated to call the credential broker for each platform. Until that is done, the legacy workflow may still use static n8n environment tokens.
- A successful OAuth connection does not prove a live post. Test with a private/unlisted YouTube upload and an Instagram test Reel before enabling unattended publishing.
