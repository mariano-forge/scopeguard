import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

// Same origin as the app: no base URL needed.
export const authClient = createAuthClient({ plugins: [organizationClient()] });
