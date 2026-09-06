import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import {
  authenticateUser,
  clearLoginFailures,
  getAuthSecret,
  loginRateLimited,
} from "./services/auth";
import { recordActivity } from "./services/activity-log";

class InvalidLoginError extends CredentialsSignin {
  code = "invalid_credentials";
}

class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

declare module "next-auth" {
  interface User {
    username?: string;
  }
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      username?: string;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    username?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET || getAuthSecret(),
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: {
    signIn: "/",
  },
  providers: [
    Credentials({
      id: "credentials",
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const username = String(credentials?.username ?? "");
        const password = String(credentials?.password ?? "");
        const forwarded = request?.headers?.get?.("x-forwarded-for");
        const ip = forwarded?.split(",")[0]?.trim() || "unknown";
        const rateKey = `${ip}:${username.trim().toLowerCase()}`;

        if (loginRateLimited(rateKey)) {
          await recordActivity({
            username: username.trim().toLowerCase() || null,
            action: "login_blocked",
            method: "POST",
            path: "/api/auth/callback/credentials",
            ip,
          });
          throw new RateLimitedError();
        }

        try {
          const user = await authenticateUser(username, password);
          clearLoginFailures(rateKey);
          await recordActivity({
            username: user.username,
            action: "login",
            method: "POST",
            path: "/api/auth/callback/credentials",
            ip,
          });
          return {
            id: user.username,
            name: user.username,
            username: user.username,
          };
        } catch {
          await recordActivity({
            username: username.trim().toLowerCase() || null,
            action: "login_failed",
            method: "POST",
            path: "/api/auth/callback/credentials",
            ip,
          });
          throw new InvalidLoginError();
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const fromUser = user?.username || user?.name;
      if (typeof fromUser === "string" && fromUser) {
        token.username = fromUser;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const username = typeof token.username === "string" ? token.username : undefined;
        session.user.username = username;
        session.user.name = username ?? session.user.name ?? null;
      }
      return session;
    },
  },
});
