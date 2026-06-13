# Firebase Security Specification

## Data Invariants
1. A lead must contain a valid email address and associated panel ID.
2. Admins can view and write all collections, while anonymous or user-level entities can only write to leads (creation) and read panels.
3. Timestamp invariants must match `request.time`.

## The "Dirty Dozen" Payloads (Vulnerability Targets)
1. Injecting a massive string longer than 128 characters as a panel document ID.
2. An unauthenticated agent trying to delete dynamic panels.
3. Modifying a lead's timestamp to a future fake value.
4. Setting custom administrative roles directly through client payload variables.
5. Ingesting lead records with missing target emails or panel attributes.
6. Deleting administrative audit trails and operational logs from a public browser console.
7. Modifying a CRM configuration singleton document without credentials.
8. Writing custom negative rank weights to shuffle affiliate rankings maliciously.
9. Injecting unverified characters or scripts into fields.
10. Creating or submitting fake lead forms with a spoofed account identity.
11. Bypassing state flow requirements for claims.
12. Creating duplicate admin rules through insecure query configurations.

## Test Cases Definition
- `test_unauthenticated_panel_write`: Fails.
- `test_guest_lead_creation_valid`: Succeeds.
- `test_guest_lead_creation_invalid_format`: Fails.
- `test_admin_privilege_escalation`: Fails.
