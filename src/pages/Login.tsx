import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AlertTriangle, LockKeyhole, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthSession, useLogin } from "@/hooks/use-auth";
import { ApiClientError } from "@/lib/api/client";

export default function Login() {
  const navigate = useNavigate();
  const authSession = useAuthSession();
  const loginMutation = useLogin();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const session = authSession.data;

  if (authSession.isLoading) {
    return <div className="flex min-h-screen items-center justify-center font-mono text-sm text-muted-foreground">Checking session…</div>;
  }

  if (session?.authenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    try {
      await loginMutation.mutateAsync({
        username: username.trim(),
        password,
      });
      navigate("/", { replace: true });
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
        return;
      }

      setErrorMessage("Unable to sign in right now.");
    }
  }

  const stateMessage = errorMessage ?? session?.message ?? null;
  const submitDisabled = !username.trim() || !password.trim();
  const isPending = loginMutation.isPending;

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center">
        <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Admin Login</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign in to manage this DockLite instance remotely.
              </p>
            </div>
          </div>

          {stateMessage ? (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{stateMessage}</p>
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="login-username">Admin user</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="pl-9 font-mono"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-password">Admin password</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pl-9"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isPending || submitDisabled}
            >
              {isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
