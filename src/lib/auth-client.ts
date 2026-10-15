import { createAuthClient } from "better-auth/react";

// Same origin as the app: no base URL needed.
export const authClient = createAuthClient();
