# keeweb-lite

Lightweight, web-only password manager inspired by [KeeWeb](https://github.com/keeweb/keeweb).

This project is intentionally created because KeeWeb is abandoned.

## Google Drive Setup

To enable Google Drive integration, you need a Google Cloud project with OAuth 2.0 credentials.

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com) and create a project.
2. **APIs & Services → Library** → enable the **Google Drive API**.

### 2. Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Set **User type** to **External**.
3. Fill in the app name and required fields.
4. Go to **Data Access → Add or remove scopes** and add: `https://www.googleapis.com/auth/drive.file`.
5. Add your email as a **test user** while publishing status is **Testing**.

### 3. Create OAuth 2.0 Credentials

1. Go to **APIs & Services → Credentials → Create → OAuth 2.0 Client ID**.
2. Set **Application type** to **Web application**.
3. Add **Authorized JavaScript origins**:
   - `http://localhost:4321` (development)
   - Your production URL
4. Save and copy the **Client ID** and put it in `.env` as `PUBLIC_GOOGLE_CLIENT_ID`.
