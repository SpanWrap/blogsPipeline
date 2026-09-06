"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { api } from "./api";

type AuthGateProps = {
  setupRequired: boolean;
  onAuthenticated: (username: string) => void;
};

export function AuthGate({ setupRequired, onAuthenticated }: AuthGateProps) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const username = String(fd.get("username") || "").trim();
    const password = String(fd.get("password") || "");
    try {
      if (setupRequired) {
        await api<{ username: string }>("/api/setup", {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });
      }
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });
      if (result?.error) {
        const code = String(result.code || result.error);
        if (code.includes("rate_limited")) {
          throw new Error("Too many sign-in attempts. Try again in 15 minutes.");
        }
        throw new Error("Invalid username or password");
      }
      if (!result?.ok) {
        throw new Error("Sign in failed");
      }
      onAuthenticated(username);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-gate">
      <form className="panel auth-card" onSubmit={onSubmit}>
        <p className="brand">Spanwrap Pipeline</p>
        <h1>{setupRequired ? "Create admin account" : "Sign in"}</h1>
        <p className="hint">
          {setupRequired
            ? "No accounts yet. Create the first username and password for this pipeline UI."
            : "Only people with an account can use this review UI."}
        </p>
        <label>
          Username
          <input name="username" autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={setupRequired ? "new-password" : "current-password"}
            required
            minLength={8}
          />
        </label>
        {error ? <p className="run-error">{error}</p> : null}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Please wait…" : setupRequired ? "Create account" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
