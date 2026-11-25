"use client";

// wowclip version of this file. Capiyo's original showed the Google sign-in screen, kept the signed-in user and
// their credits, and drew the account menu. wowclip has no accounts or credits, so there is nothing to sign in to:
// the editor gets an empty session, and the account menu becomes a link to wowclip's render history.

type Account = { credits: number };
type Session = { account: Account | null; refreshAccount: () => Promise<void>; signOut: () => void };

const SESSION: Session = { account: null, refreshAccount: async () => undefined, signOut: () => undefined };

export const useSession = () => SESSION;

export default function AuthGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function AccountMenu() {
  return (
    <a href="/history" target="_blank" rel="noreferrer"
      style={{ color: "var(--text-muted)", fontSize: "var(--fs-label)", textDecoration: "none", padding: "0 6px", whiteSpace: "nowrap" }}>
      Render history
    </a>
  );
}
