# GitHub App Setup

This guide explains how to set up GitHub App authentication for Shield Wizard to enable the "Edit Existing Repository" feature.

## Overview

Shield Wizard uses GitHub Apps (not OAuth Apps) to allow users to:
- Authenticate with their GitHub account
- Install the app on specific repositories
- Load and edit existing keyboard configurations
- Push changes back to their repositories

GitHub Apps provide better security and more granular permissions than OAuth Apps.

## Prerequisites

- A GitHub account
- Access to GitHub Developer Settings

## Creating a GitHub App

1. **Go to GitHub Developer Settings**
   - Navigate to [GitHub Developer Settings > GitHub Apps](https://github.com/settings/apps)
   - Or: Settings → Developer settings → GitHub Apps

2. **Create a new GitHub App**
   - Click "New GitHub App"
   - Fill in the required fields:

   | Field | Value | Description |
   |-------|-------|-------------|
   | **GitHub App name** | `shield-wizard` | Unique name for your app (will be part of installation URL) |
   | **Homepage URL** | `https://your-domain.com` | Your Shield Wizard deployment URL |
   | **Callback URL** | `https://your-domain.com/` | OAuth redirect URL (note the trailing slash) |
   | **Setup URL** (optional) | `https://your-domain.com/` | Redirect after installation |
   | **Webhook** | Uncheck "Active" | Not needed for Shield Wizard |

3. **Configure Permissions**
   
   Under "Repository permissions", set:
   
   | Permission | Access | Purpose |
   |------------|--------|---------|
   | **Contents** | Read and write | Read and write repository files |
   | **Workflows** | Read and write | Update `.github/workflows/` files |
   | **Metadata** | Read-only | Automatically included |

   Under "Account permissions", no additional permissions are needed.

4. **Installation options**
   - Select "Only on this account" or "Any account" depending on your needs
   - Most users will want "Any account" to allow others to use the app

5. **Create the app**
   - Click "Create GitHub App"
   - Note down the **App ID** (not needed for current implementation)

6. **Generate Client Secret**
   - On the app's settings page, scroll to "Client secrets"
   - Click "Generate a new client secret"
   - Save the **Client secret** immediately (only shown once!)

7. **Get the Client ID**
   - On the app's settings page, find the **Client ID** (not the App ID!)
   - This is used for the OAuth flow

## Environment Variables

Configure these environment variables in your deployment:

```env
# GitHub App Client ID (NOT the App ID)
PUBLIC_GITHUB_CLIENT_ID=Iv1.abc123...

# GitHub App Client Secret
GITHUB_CLIENT_SECRET=abc123...

# GitHub App name (used for installation URL)
PUBLIC_GITHUB_APP_NAME=shield-wizard
```

### For Cloudflare Workers/Pages

Add these in your Cloudflare dashboard or `wrangler.toml`:

```toml
[vars]
PUBLIC_GITHUB_CLIENT_ID = "Iv1.abc123..."
PUBLIC_GITHUB_APP_NAME = "shield-wizard"

# Add secret via CLI: wrangler secret put GITHUB_CLIENT_SECRET
```

### For Local Development

Create a `.dev.vars` file (gitignored):

```env
PUBLIC_GITHUB_CLIENT_ID=Iv1.abc123...
GITHUB_CLIENT_SECRET=abc123...
PUBLIC_GITHUB_APP_NAME=shield-wizard
```

## Authentication Flow

The Shield Wizard GitHub App uses a two-step authentication flow:

1. **Authorization**: User authorizes the app to access their GitHub account
   - User clicks "Connect to GitHub"
   - Redirected to `github.com/login/oauth/authorize`
   - After approval, redirected back with an authorization code
   - Code is exchanged for a user access token

2. **Installation**: User installs the app on repositories
   - After authorization, we check if the app is installed
   - If not installed, user is prompted to install the app
   - User selects which repositories to grant access
   - After installation, user can see their repositories

This flow ensures users have fine-grained control over which repositories the app can access.

## Security Considerations

1. **Fine-grained permissions**: GitHub Apps only access repositories where they're installed
2. **No broad OAuth scopes**: Unlike OAuth Apps, GitHub Apps use specific permissions
3. **User control**: Users can add/remove repository access at any time
4. **Token storage**: Access tokens are stored in the user's browser localStorage
5. **CSRF protection**: OAuth state parameter prevents cross-site request forgery

## Troubleshooting

### "GitHub App is not configured on this server"
- Ensure `PUBLIC_GITHUB_CLIENT_ID` is set
- Ensure `PUBLIC_GITHUB_APP_NAME` is set

### "App installation required"
- User has authorized but hasn't installed the app
- Click "Install Shield Wizard App" to add the app to repositories

### "No repositories found"
- The app may not be installed on any repositories
- Click "Add more repositories" to grant access to additional repos

### Token expires or becomes invalid
- GitHub App user access tokens expire after 8 hours by default
- User will need to re-authenticate when the token expires

## References

- [GitHub Apps Documentation](https://docs.github.com/en/apps/creating-github-apps)
- [Creating a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app)
- [Authenticating with a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app)
- [GitHub App Permissions](https://docs.github.com/en/apps/creating-github-apps/setting-up-a-github-app/choosing-permissions-for-a-github-app)
