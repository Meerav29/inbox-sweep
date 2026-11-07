# Google Cloud setup for inbox-sweep

You need a Google Cloud project with the Gmail API enabled, a consent screen, and an OAuth client. Part A creates the project and enables the API. Part B is the same for everyone.

Work account (Google Workspace)? Your admin may block unverified apps or limit who can create projects. A personal @gmail.com account avoids this.

## Part A, option 1: gcloud

Use this if `gcloud --version` works. Show each command before running it. Use any 6 random lowercase letters or digits for the project id suffix.

1. `gcloud auth login` (you do this one yourself, it opens a browser)
2. `gcloud projects create inbox-sweep-<random6>`
3. `gcloud config set project inbox-sweep-<random6>`
4. `gcloud services enable gmail.googleapis.com`
5. `gcloud services list --enabled` and look for `gmail.googleapis.com`

If step 2 says the id is taken, pick another suffix. If it says billing or an organisation policy blocks it, use the console instead.

## Part A, option 2: console

1. Open https://console.cloud.google.com/projectcreate, name it `inbox-sweep`, press Create.
2. Make sure the new project is selected in the top bar.
3. Open https://console.cloud.google.com/apis/library/gmail.googleapis.com and press Enable.

## Part B: consent screen and OAuth client

Google calls this area "Google Auth Platform", and menu names change now and then. If a name below is missing, look for the closest one.

1. Open the Google Auth Platform page for your project and press Get started.
2. App name: `inbox-sweep`. Support email: your own address. Press Next.
3. Audience: **External**. Press Next. Add your own address as the contact email, agree to the policy, press Create.
4. Leave the publishing status as **Testing**. Do not press Publish app.
5. Open **Audience**, then **Test users**, then Add users, and add **your own Google address** (the one you will connect).

   **Do not skip this.** Without it you get "Access blocked", or a page that hangs, with no clear error.

6. Open **Clients**, then Create client. Application type: **Web application** (not Desktop). Name it anything.
7. Under Authorised redirect URIs, press Add URI and paste the value from `npm run doctor`, line `redirect_uri` (normally `http://localhost:8787/api/auth/google/callback`). It must match exactly. Press Create.
8. Copy the client ID and client secret into `.env` yourself, on the `GOOGLE_CLIENT_ID=` and `GOOGLE_CLIENT_SECRET=` lines. Do not paste them into the chat.
9. Restart the app (stop `npm run dev` and start it again). `.env` is only read at start.
10. Run `npm run doctor`. `google_client` should pass.

Scope: the app asks only for `gmail.modify`. You do not need to add scopes on the consent screen.

## When you press Connect Gmail

Google shows "Google hasn't verified this app". That is expected, it is your own app. Press **Advanced**, then **Continue**, then allow access.

In Testing mode the connection expires after 7 days. Press Connect Gmail again when that happens.
