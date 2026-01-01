---
title: "Installation"
description: "Installation guides for xerodev-mcp"
author: "ninonline"
last_updated: "2025-01-01"
tags: ["installation"]
category: "installation"
---

# Installation Guides

This section contains installation guides for xerodev-mcp.

## Installation Methods

### Docker Desktop (Recommended)

The easiest way to get started with xerodev-mcp is using Docker Desktop.

[→ Docker Desktop Guide](docker-desktop.md)

**Prerequisites**:
- Docker Desktop 4.30 or later
- 2GB available memory

**Time**: 5-10 minutes

### From Source

Build and run xerodev-mcp from source code.

[→ Building from Source](from-source.md)

**Prerequisites**:
- Node.js 20.x or higher
- npm or yarn
- TypeScript

**Time**: 10-15 minutes

## Configuration

After installation, configure xerodev-mcp for your needs.

[→ Configuration Reference](configuration.md)

**Covers**:
- Environment variables
- Mock vs live mode
- Verbosity levels
- Docker Compose options
- Security settings

## Quick Installation (Docker)

```bash
# Clone the repository
git clone https://github.com/ninonline/xerodev-mcp.git
cd xerodev-mcp

# Build and start
docker compose up
```

That's it. You now have 3 test tenants and 25 tools available.

## Verify Installation

```bash
# Test that the server responds
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  docker run --rm -i xerodev-mcp:local
```

Expected response: JSON array listing 25 tools.

## I Want To...

- **Get started quickly** → [Getting Started Guide](../user-guide/getting-started.md)
- **See all tools** → [Tools Reference](../user-guide/tools-reference.md)
- **Learn workflows** → [Workflow Guide](../user-guide/workflows.md)
- **Set up live Xero** → [OAuth Setup Guide](../guides/oauth-setup.md)

---

**↑ Up to:** [Documentation Home](../index.md)
