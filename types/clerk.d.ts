export {};

declare global {
  /**
   * The claims Value It adds to Clerk's session token (Clerk Dashboard > Sessions > Customize session token), read by
   * src/auth/identity.ts. In the Dashboard:
   *   { "email": "{{user.primary_email_address}}", "firstName": "{{user.first_name}}", "metadata": "{{user.public_metadata}}" }
   * Each may be missing (an older token, a user with no first name), so identityFromClaims checks every one.
   */
  interface CustomJwtSessionClaims {
    email?: string | null;
    firstName?: string | null;
    /** The user's public metadata: only Clerk's Backend API or Dashboard can change it. `role: "admin"` opens /admin. */
    metadata?: { role?: string };
  }
}
