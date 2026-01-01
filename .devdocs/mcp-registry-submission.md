# Docker MCP Registry Submission Guide

This document outlines the process for submitting xerodev-mcp to the Docker MCP Catalog.

## Prerequisites

1. **Docker Hub account** with published image
2. **GitHub repository** with `server.yaml` in root
3. **Project is production-ready** (tests passing, documentation complete)

## Current Status

- ✅ Server is production-ready
- ✅ `server.yaml` created
- ✅ Documentation complete
- ✅ Tests passing (481 tests)
- ❌ Docker image not yet published to Docker Hub
- ❌ Not yet submitted to MCP registry

## Submission Steps

### Step 1: Publish Docker Image to Docker Hub

**Option A: Publish to your own repository**

```bash
# Tag the image
docker tag xerodev-mcp:latest ninonline/xerodev-mcp:0.2.0
docker tag xerodev-mcp:latest ninonline/xerodev-mcp:latest

# Push to Docker Hub
docker push ninonline/xerodev-mcp:0.2.0
docker push ninonline/xerodev-mcp:latest
```

**Option B: Apply for official `mcp/` namespace**

1. Join the [Docker MCP organisation](https://github.com/docker/mcp-registry)
2. Follow their submission guidelines
3. Request namespace for `mcp/xerodev-mcp`
4. They will review and approve if compliant

### Step 2: Fork the MCP Registry

```bash
# Fork the official registry
git clone https://github.com/YOUR_USERNAME/mcp-registry.git
cd mcp-registry

# Add upstream
git remote add upstream https://github.com/docker/mcp-registry.git
```

### Step 3: Use the Task Wizard

The MCP registry has a task wizard that helps generate `server.yaml`:

```bash
# From registry root
npx @modelcontextprotocol/inspector task wizard
```

Follow the prompts to generate your `server.yaml`.

**Note**: We've already created `server.yaml` manually, so you can skip this step.

### Step 4: Create Server Directory

```bash
# Create directory for your server
mkdir -p servers/xerodev-mcp

# Copy your server.yaml
cp /path/to/xerodev-mcp/server.yaml servers/xerodev-mcp/server.yaml
```

### Step 5: Submit Pull Request

```bash
git add servers/xerodev-mcp/server.yaml
git commit -m "Add xerodev-mcp server"
git push origin main
```

Then create a PR from your fork to `docker/mcp-registry`.

### Step 6: Review Process

The Docker team will review:
- ✅ Server follows MCP specification
- ✅ `server.yaml` is valid
- ✅ Docker image is publicly accessible
- ✅ Documentation is adequate
- ✅ Server is functional

Typical review time: 1-3 business days

## server.yaml Validation

Before submitting, validate your `server.yaml`:

```bash
# Use the MCP inspector to validate
npx @modelcontextprotocol/inspector validate server.yaml
```

## Current server.yaml Configuration

Our `server.yaml` includes:

- **Name**: xerodev-mcp
- **Version**: 0.2.0
- **Image**: ninonline/xerodev-mcp:latest (to be published)
- **Tools**: 25 tools fully documented
- **Examples**: 3 usage examples for AI agents
- **Regions**: 3 test tenants (AU, UK, US)
- **Tags**: xero, accounting, integration-testing, validation

## Post-Submission

### After Approval

1. **Update README** to include MCP Catalog badge
2. **Announce** on GitHub discussions/issues
3. **Monitor** usage via Docker Hub pull stats
4. **Maintain** - keep server.yaml updated with new versions

### Keeping in Sync

When releasing new versions:

1. Update `server.yaml` version
2. Publish new Docker image
3. Update MCP registry PR

## Troubleshooting

### PR Rejected: "Image not accessible"

**Cause**: Docker image is private or doesn't exist

**Fix**:
```bash
# Verify image is public
docker pull ninonline/xerodev-mcp:latest

# If private, make public on Docker Hub
# Go to Docker Hub → Repository → Settings → Make Public
```

### PR Rejected: "Invalid server.yaml"

**Cause**: YAML syntax error or missing required fields

**Fix**:
```bash
# Validate YAML syntax
cat server.yaml | yamllint

# Use MCP inspector
npx @modelcontextprotocol/inspector validate server.yaml
```

### PR Rejected: "Server doesn't work"

**Cause**: Server fails MCP protocol compliance check

**Fix**:
```bash
# Test server locally
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  docker run --rm -i ninonline/xerodev-mcp:latest

# Expected: JSON array of 25 tools
```

## Alternative: Direct Installation

Users can also install without MCP catalog:

```json
{
  "mcpServers": {
    "xerodev-mcp": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i", "--init",
        "-e", "MCP_MODE=mock",
        "ninonline/xerodev-mcp:latest"
      ]
    }
  }
}
```

## Resources

- [Docker MCP Registry](https://github.com/docker/mcp-registry)
- [MCP Specification](https://modelcontextprotocol.io/)
- [Server Submission Guide](https://github.com/docker/mcp-registry/blob/main/README.md#submission-process)

## Next Steps

1. ✅ `server.yaml` created
2. ⏳ Publish Docker image to Docker Hub
3. ⏳ Fork and submit to mcp-registry
4. ⏳ Address review feedback
5. ⏳ Celebrate approval!

---

**Status**: Ready for Docker Hub publication and MCP registry submission
**Created**: 2025-01-01
**Last Updated**: 2025-01-01
