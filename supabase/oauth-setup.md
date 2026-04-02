# Supabase OAuth Setup Instructions

## Step 1: Run the database schema

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. Click **SQL Editor** → **New query**
3. Paste the contents of `supabase/schema.sql` and click **Run**

---

## Step 2: Enable Google OAuth

### In Google Cloud Console
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Go to **APIs & Services** → **OAuth consent screen**
   - Select **External**, click Create
   - Fill in App name, User support email, Developer contact email
   - Click Save and Continue through the remaining steps
4. Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Under **Authorized redirect URIs**, add:
     ```
     https://suzavcotbneyhqzygrym.supabase.co/auth/v1/callback
     ```
   - Click Create
5. Copy the **Client ID** and **Client Secret**

### In Supabase
1. Go to **Authentication** → **Providers** → **Google**
2. Toggle **Enable Google provider** on
3. Paste your **Client ID** and **Client Secret**
4. Click **Save**

---

## Step 3: Enable Apple OAuth

### In Apple Developer Portal
1. Go to [developer.apple.com](https://developer.apple.com) → **Account** → **Certificates, Identifiers & Profiles**
2. **Create an App ID** (if you don't have one):
   - Identifiers → + → App IDs → App
   - Enable **Sign In with Apple** capability
3. **Create a Services ID**:
   - Identifiers → + → Services IDs
   - Enter a description and identifier (e.g. `com.yourname.whoopcoach`)
   - Enable **Sign In with Apple**, click Configure:
     - Primary App ID: select the App ID from above
     - Under **Return URLs**, add:
       ```
       https://suzavcotbneyhqzygrym.supabase.co/auth/v1/callback
       ```
   - Save and Register
4. **Create a Key**:
   - Keys → + → name it, enable **Sign In with Apple**, configure → select your App ID
   - Download the `.p8` file (you can only download it once)
   - Note the **Key ID**

### In Supabase
1. Go to **Authentication** → **Providers** → **Apple**
2. Toggle **Enable Apple provider** on
3. Fill in:
   - **Services ID**: the identifier you created (e.g. `com.yourname.whoopcoach`)
   - **Team ID**: found in top-right of Apple Developer portal
   - **Key ID**: from the key you created
   - **Private Key**: paste the full contents of the `.p8` file
4. Click **Save**

---

## Step 4: Add your app URL to Supabase allowed redirects

1. In Supabase → **Authentication** → **URL Configuration**
2. Under **Redirect URLs**, add the URL where your dashboard is hosted
   - If running locally: `http://localhost:PORT/dashboard/index.html`  
   - If hosted (GitHub Pages, Vercel, etc.): your full production URL
3. Click **Save**

---

## Step 5: Test

Open `dashboard/index.html` in a browser. You should see the Google and Apple sign-in buttons. Click either to test the OAuth flow.

> **Note:** Apple Sign In only works on domains served over HTTPS. For local testing, use Google OAuth first.
