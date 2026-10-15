// Better Auth endpoints: /api/auth/sign-in/email, /api/auth/sign-up/email, /api/auth/callback/google…

import { getAuth } from "@/lib/auth";

export const GET = (request: Request) => getAuth().handler(request);
export const POST = (request: Request) => getAuth().handler(request);
