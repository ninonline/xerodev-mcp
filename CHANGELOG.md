# Changelog

All notable changes to the xerodev-mcp project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- CI/CD security scanning with Trivy vulnerability scanner
- Docker health check for container monitoring
- OCI image labels for Docker MCP catalog compliance

## [0.2.0] - 2025-01-01

### Added
- OAuth 2.0 flow support with PKCE (5 OAuth tools)
- Multi-region test fixtures (AU/GST, UK/VAT, US)
- CRUD read tools: get_contact, get_invoice, list_contacts, list_invoices
- 18 new fixture files across 3 regions
- OAuth state management with PKCE code verifier

### Changed
- Updated fixture generation to support AU, UK, and US regions
- Enhanced adapter factory for multi-region support
- Improved get_mcp_capabilities with OAuth workflow guidance

### Fixed
- Updated tenant data for all 3 regions with proper tax types
- Fixed fixture file naming (au-acme-* pattern)

## [0.1.0] - 2024-11-28

### Added
- Initial release of xerodev-mcp
- Mock Xero adapter with 150+ realistic test fixtures
- Validation tools (validate_schema_match, introspect_enums)
- Simulation tools (dry_run_sync, seed_sandbox_data, drive_lifecycle)
- Chaos engineering tools (simulate_network_conditions, replay_idempotency)
- CRUD write tools (create_contact, create_invoice, create_quote, create_credit_note, create_payment, create_bank_transaction)
- Core tools (get_mcp_capabilities, switch_tenant_context, get_audit_log)
- Educational error system with recovery.next_tool_call suggestions
- Multi-tenant support (3 tenants)
- Progressive verbosity levels (silent, compact, diagnostic, debug)
- 481 tests across 28 test files
