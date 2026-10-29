import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth-options";
import { applySessionCookiePolicy } from "@/lib/auth-session-cookie";

async function handler(
  request: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  let remember = true;
  const authHandler = NextAuth({
    ...authOptions,
    callbacks: {
      ...authOptions.callbacks,
      async jwt(parameters) {
        const token = await authOptions.callbacks!.jwt!(parameters);
        remember = token.remember !== false;
        return token;
      },
    },
  });
  const response: Response = await authHandler(request, context);

  return applySessionCookiePolicy(response, remember);
}

export { handler as GET, handler as POST };
