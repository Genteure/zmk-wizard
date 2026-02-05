# GitHub OAuth App Setup

This guide explains how to set up GitHub OAuth authentication for Shield Wizard to enable the "Edit Existing Repository" feature.

## Overview

Shield Wizard uses GitHub OAuth to allow users to:
- Authenticate with their GitHub account
- List their repositories containing Shield Wizard configurations
- Load and edit existing keyboard configurations
- Push changes back to their repositories

## Prerequisites

- A GitHub account
- Access to GitHub Developer Settings

## Creating a GitHub OAuth App

1. **Go to GitHub Developer Settings**
   - Navigate to [GitHub Developer Settings > OAuth Apps](https://github.com/settings/developers)
   - Or: Settings → Developer settings → OAuth Apps

2. **Create a new OAuth App**
   - Click "New OAuth App"
   - Fill in the required fields:

   | Field | Value | Description |
   |-------|-------|-------------|
   | **Application name** | Shield Wizard | Name shown to users during authorization |
   | **Homepage URL** | `https://your-domain.com` | Your Shield Wizard deployment URL |
   | **Authorization callback URL** | `https://your-domain.com/` | Must match your deployment URL (note the trailing slash) |
   | **Application description** | (optional) | Description shown during authorization |

3. **Get your credentials**
   - After creating the app, note down the **Client ID**
   - Click "Generate a new client secret" and save the **Client Secret**
   
   ⚠️ **Important**: The client secret is only shown once. Save it securely!

## Required OAuth Scopes

Shield Wizard requests the following scopes during OAuth authorization:

| Scope | Purpose |
|-------|---------|
| `repo` | Full control of private repositories (read/write contents) |
| `workflow` | Update GitHub Action workflow files (`.github/workflows/`) |

The `repo` scope is required to:
- Read repository contents (including `.github/shield-wizard.json`)
- Write changes to repository files
- Access both public and private repositories

The `workflow` scope is required to:
- Update GitHub Actions workflow files that build the ZMK firmware

## Environment Variables

Configure these environment variables in your deployment:

```env
# Public client ID (safe to expose in client-side code)
PUBLIC_GITHUB_CLIENT_ID=your_client_id_here

# Secret (server-side only, never expose to client)
GITHUB_CLIENT_SECRET=your_client_secret_here
```

### For Cloudflare Workers/Pages

Add these as secrets in your Cloudflare dashboard or `wrangler.toml`:

```toml
[vars]
PUBLIC_GITHUB_CLIENT_ID = "your_client_id_here"

# Add secret via CLI: wrangler secret put GITHUB_CLIENT_SECRET
```

### For Local Development

Create a `.dev.vars` file (gitignored):

```env
PUBLIC_GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
```

## Security Considerations

1. **Never commit secrets**: The client secret should never be committed to version control
2. **HTTPS required**: OAuth callbacks must use HTTPS in production
3. **Callback URL validation**: GitHub validates the callback URL matches exactly
4. **Token storage**: Access tokens are stored in the user's browser localStorage
5. **CSRF protection**: OAuth state parameter prevents cross-site request forgery

## Troubleshooting

### "GitHub OAuth is not configured on this server"
- Ensure `PUBLIC_GITHUB_CLIENT_ID` is set and accessible to client-side code
- Check that `GITHUB_CLIENT_SECRET` is set as a server-side secret

### "OAuth state mismatch"
- The user may have multiple tabs open or the session expired
- Clear browser session storage and try again

### "Failed to exchange OAuth code"
- Verify the client secret is correct
- Check that the callback URL matches exactly (including trailing slash)
- Ensure the OAuth app is not suspended

### Token expires or becomes invalid
- GitHub OAuth tokens don't expire by default
- Users can revoke access in their [GitHub settings](https://github.com/settings/applications)
- If token is invalid, user will need to re-authenticate

## Alternative: GitHub App (Advanced)

For more granular permissions, you could use a GitHub App instead of an OAuth App:

**Advantages of GitHub App:**
- Fine-grained permissions (e.g., only specific repositories)
- Can request only read/write on specific repo contents
- Better rate limits

**Required GitHub App permissions:**
- Repository contents: Read and write
- Workflows: Read and write
- Metadata: Read (automatically included)

This requires additional implementation work for the authentication flow.

## References

- [GitHub OAuth Apps Documentation](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [GitHub OAuth Scopes](https://docs.github.com/en/developers/apps/building-oauth-apps/scopes-for-oauth-apps)
- [Authorizing OAuth Apps](https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps)
