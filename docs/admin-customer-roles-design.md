# Linked administrator and customer identities

Status: design only; no role conversion or account migration has been implemented.

## Requested behavior

- Super-admin-created administrators also have customer profiles. They appear in the Customers area and can access both their customer and administrator views.
- The super administrator can grant or remove administrator access for a customer.
- A linked administrator and customer use one password and choose the desired view at sign-in.
- For existing administrators, the super administrator reviews each account and links an existing customer or creates a new profile; do not automatically merge records.
- Before removing administrator access, the super administrator must choose an active replacement administrator for the affected administrator's customers. Preserve customer accounts, messages, private notes, and history during reassignment.

## Requirements before release

- Introduce an explicit stable identity link between a customer profile and administrator account. Do not match or merge existing records automatically by username or email. Plan an audited, reversible migration of existing administrators; handle collisions without overwriting customer data.
- Make the sign-in destination explicit when both roles exist. Existing customer login currently routes recognized administrator usernames to administrator sign-in; simply creating a second profile with the same username would make customer sign-in inaccessible. Define password/reset behavior for both roles and protect the super-admin identity.
- Restrict role changes and reassignment to the super administrator. Validate the replacement is active, eligible, and not the administrator being removed. Move all affected ownership and revoke existing administrator sessions atomically with the role change.
- Preserve all customer data and messages when granting or revoking an administrator role. Revoke or rotate relevant sessions on role changes, and prevent bypass through user editing, backup restoration, deletion or username changes.
- Apply the entire multi-record operation in a single atomic state commit. Ensure Supabase compare-and-swap conflicts and local storage failures cannot leave partial links or reassignment.
- Test duplicate identities, role changes, authorization, disabled admins, password reset, both login modes, reassignments and history preservation, deletion/restore, concurrent writes and failure recovery. Do not deploy until existing accounts and a representative production-state migration have been verified.
