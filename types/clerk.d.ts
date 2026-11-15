export {};

declare global {
  /**
   * The claims Value It adds to Clerk's session token (`clerk config patch` `session.claims`, or Clerk Dashboard >
   * Sessions > Customize session token), read by src/auth/identity.ts:
   *   { "email": "{{user.primary_email_address}}", "first_name": "{{user.first_name}}", "metadata": "{{user.public_metadata}}" }
   * Each may be missing (an older token, a user with no first name), so identityFromClaims checks every one.
   */
  interface CustomJwtSessionClaims {
    email?: string | null;
    first_name?: string | null;
    /** The user's public metadata: only Clerk's Backend API or Dashboard can change it. `role: "admin"` opens /admin. */
    metadata?: { role?: string };
  }
}
