---
title: "Setting Up Live Xero Connection"
description: "Guide to connecting xerodev-mcp to real Xero organisations using OAuth 2.0"
author: "ninonline"
last_updated: "2025-01-01"
tags: ["oauth", "live-mode", "xero-api"]
category: "guides"
---

# Setting Up Live Xero Connection

This guide explains how to connect xerodev-mcp to your real Xero organisations using OAuth 2.0.

## Prerequisites

Before you begin, you need:

- A [Xero developer account](https://developer.xero.com/) (free)
- A Xero app configured with OAuth 2.0
- Your Xero app credentials:
  - Client ID
  - Client Secret
  - Redirect URI

## Create a Xero App

### Step 1: Go to Xero Developer Portal

Visit [developer.xero.com](https://developer.xero.com/) and sign in.

### Step 2: Create a New App

1. Click **"My Apps"** → **"New App"**
2. Select **"OAuth 2.0"** (not OAuth 1.0a)
3. Enter app details:
   - **App name**: xerodev-mcp (or your preferred name)
   - **App URL**: Your website or repository URL
   - **Callback URL**: `http://localhost:3000/callback` (for local development)

### Step 3: Configure Scopes

Add the following scopes to your app:

| Scope | Purpose |
|-------|---------|
| `accounting.transactions` | Create and read invoices, quotes, credit notes |
| `accounting.contacts` | Create and read contacts |
| `accounting.settings` | Read organisation settings |
| `offline_access` | Required for refresh tokens |

### Step 4: Save Your Credentials

After creating the app, you'll see:
- **Client ID**: A long alphanumeric string
- **Client Secret**: Another long string (click "Show" to reveal)

**Save these securely** - you'll need them for configuration.

## Generate an Encryption Key

xerodev-mcp requires a 64-character hex key to encrypt OAuth tokens.

```bash
openssl rand -hex 32
```

Example output:
```
a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567890
```

**Save this key** - you'll need it for the configuration.

## Configure xerodev-mcp

### Option 1: Environment Variables

Create a `.env` file in your project directory:

```bash
# .env file (NEVER commit this)
MCP_MODE=live
XERO_CLIENT_ID=your_client_id_here
XERO_CLIENT_SECRET=your_client_secret_here
XERO_REDIRECT_URI=http://localhost:3000/callback
MCP_ENCRYPTION_KEY=your_64_char_hex_key_here
LOG_LEVEL=diagnostic
```

### Option 2: Docker Compose Override

Create `docker-compose.live.yml`:

```yaml
version: '3.8'

services:
  xerodev-mcp:
    environment:
      - MCP_MODE=live
      - XERO_CLIENT_ID=${XERO_CLIENT_ID}
      - XERO_CLIENT_SECRET=${XERO_CLIENT_SECRET}
      - XERO_REDIRECT_URI=${XERO_REDIRECT_URI}
      - MCP_ENCRYPTION_KEY=${MCP_ENCRYPTION_KEY}
    volumes:
      - xerodev-data:/app/data

volumes:
  xerodev-data:
```

**Run with live override**:

```bash
# Load environment variables from .env
export $(cat .env | xargs)

# Start with live configuration
docker compose -f docker-compose.yml -f docker-compose.live.yml up
```

## Complete the OAuth Flow

### Step 1: Get the Authorization URL

Once the server is running in live mode, call:

```
Call get_authorization_url with:
{
  "scopes": [
    "accounting.transactions",
    "accounting.contacts",
    "accounting.settings",
    "offline_access"
  ],
  "verbosity": "diagnostic"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "authorization_url": "https://login.xero.com/identity/connect/authorize?...",
    "state": "random_state_value"
  },
  "diagnostics": {
    "narrative": "Visit the authorization_url in your browser to begin the OAuth flow."
  }
}
```

### Step 2: Visit the URL in Your Browser

1. Copy the `authorization_url` from the response
2. Paste it into your web browser
3. If prompted, log in to Xero
4. Review the permissions requested
5. Click **"Allow access"**

### Step 3: Select Organisations to Authorise

1. Xero shows your available organisations
2. Select the organisations you want to connect
3. Click **"Allow access"**

### Step 4: Copy the Callback URL

After authorising, Xero redirects you to your redirect URI with an authorization code:

```
http://localhost:3000/callback?code=AUTH_CODE_HERE&state=STATE_VALUE
```

**Copy the entire URL** from your browser's address bar.

### Step 5: Exchange the Code for Tokens

Call:

```
Call exchange_auth_code with:
{
  "callback_url": "http://localhost:3000/callback?code=AUTH_CODE_HERE&state=STATE_VALUE",
  "verbosity": "diagnostic"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "connections_created": 2,
    "tenants": [
      {
        "tenant_id": "xero-tenant-uuid-1",
        "tenant_name": "Acme Corporation Pty Ltd",
        "token_expires_at": "2025-01-02T10:30:00.000Z"
      },
      {
        "tenant_id": "xero-tenant-uuid-2",
        "tenant_name": "Another Organisation",
        "token_expires_at": "2025-01-02T10:30:00.000Z"
      }
    ]
  },
  "diagnostics": {
    "narrative": "Successfully connected to 2 Xero organisations. Tokens are stored securely and will be refreshed automatically."
  }
}
```

### Step 6: List Your Connections

Verify the connections were created:

```
Call list_connections with:
{
  "include_inactive": false,
  "verbosity": "diagnostic"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "connections": [
      {
        "tenant_id": "xero-tenant-uuid-1",
        "tenant_name": "Acme Corporation Pty Ltd",
        "connection_status": "active",
        "token_expires_at": "2025-01-02T10:30:00.000Z",
        "granted_scopes": ["accounting.transactions", "accounting.contacts", ...]
      }
    ]
  }
}
```

## Use Live Mode

### Switch to a Live Tenant

```
Call switch_tenant_context with:
{
  "tenant_id": "xero-tenant-uuid-1",
  "verbosity": "diagnostic"
}
```

Now all subsequent operations will affect your real Xero data.

### Validate Against Real Data

```
Call validate_schema_match with:
{
  "tenant_id": "xero-tenant-uuid-1",
  "entity_type": "Invoice",
  "payload": { ... your invoice payload ... }
}
```

This validates against your actual Chart of Accounts and contacts.

### Create Real Invoices

```
Call create_invoice with your validated payload
```

**Important**: In live mode, this creates actual invoices in Xero!

## Token Management

### Automatic Refresh

Token refresh happens automatically during API calls. You don't need to manually refresh unless:

- Tokens have been expired for a long time
- You suspect tokens are stale

### Manual Refresh

```
Call refresh_connection with:
{
  "tenant_id": "xero-tenant-uuid-1",
  "verbosity": "diagnostic"
}
```

### Revoke a Connection

To disconnect a Xero organisation:

```
Call revoke_connection with:
{
  "tenant_id": "xero-tenant-uuid-1",
  "verbosity": "diagnostic"
}
```

**Warning**: This cannot be undone. You'll need to complete the OAuth flow again to reconnect.

## Security Best Practices

### 1. Never Commit Credentials

Add `.env` to `.gitignore`:

```bash
echo ".env" >> .gitignore
```

### 2. Use Environment Variables

Never hardcode credentials in Docker Compose files:

```yaml
# Bad
environment:
  - XERO_CLIENT_ID=abc123...

# Good
environment:
  - XERO_CLIENT_ID=${XERO_CLIENT_ID}
```

### 3. Rotate Secrets Regularly

- Generate new encryption keys periodically
- Update Xero app credentials if compromised
- Revoke old connections and re-authorise

### 4. Use Separate Apps for Dev/Prod

Create different Xero apps for:
- Development/testing
- Staging
- Production

This minimises risk if one app is compromised.

### 5. Limit Scopes

Only request the scopes you actually need:

```json
{
  "scopes": [
    "accounting.transactions",
    "accounting.contacts"
    // Don't add unnecessary scopes
  ]
}
```

## Production Deployment

For production use:

### 1. Use a Persistent Volume

```yaml
volumes:
  - xerodev-data:/app/data
```

### 2. Set Appropriate Redirect URI

Use a real URL instead of localhost:

```
XERO_REDIRECT_URI=https://your-domain.com/xero-callback
```

### 3. Use Compact Verbosity

```yaml
environment:
  - LOG_LEVEL=compact
```

### 4. Implement Health Checks

The Docker image includes a built-in health check:

```yaml
healthcheck:
  test: ["CMD", "node", "-e", "process.exit(0)"]
  interval: 30s
  timeout: 3s
  retries: 3
```

## Troubleshooting

### "Invalid Grant" Error

**Cause**: Authorization code expired or already used.

**Fix**: Start the OAuth flow again:
```
Call get_authorization_url
```

### "Access Denied" Error

**Cause**: User denied access during OAuth flow.

**Fix**: Try again and ensure you click "Allow access".

### Token Expires Too Quickly

**Cause**: Missing `offline_access` scope.

**Fix**: Re-authorise with the correct scopes:
```
Call get_authorization_url with:
{
  "scopes": ["accounting.transactions", "offline_access"]
}
```

### "Scope Mismatch"

**Cause**: Xero app doesn't have the required scopes.

**Fix**: Update your Xero app configuration at [developer.xero.com](https://developer.xero.com).

## I Want To...

- **Learn how to use tools** → [Getting Started Guide](../user-guide/getting-started.md)
- **Configure the server** → [Configuration Reference](../installation/configuration.md)
- **See common workflows** → [Workflow Guide](../user-guide/workflows.md)
- **Troubleshoot issues** → [Troubleshooting](../reference/troubleshooting.md)

---

**← Back to:** [Guides](index.md) | **↑ Up to:** [Documentation Home](../index.md)
