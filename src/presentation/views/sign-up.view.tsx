// Sign-up form for Chronicle: a public auth screen that creates an account through the
// session port (AuthContainer, intent "signUp"). Mirrors the template auth forms
// (login / forgot-password) so the look stays consistent across the sign-in pages.

import type { AuthViewModel } from '@/application/view-models/auth.vm';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { routes } from '@/presentation/navigation';

export function SignUpView(props: AuthViewModel) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-4">
      <p className="text-lg font-semibold tracking-tight text-foreground">{"Chronicle"}</p>
      <Card className="w-full max-w-sm" data-archie-auth-template="signUp">
        <CardHeader>
          <CardTitle>{"Create your account"}</CardTitle>
          <CardDescription>{"Join Chronicle to follow your care journey with your care team."}</CardDescription>
        </CardHeader>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            props.onSubmit();
          }}
        >
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="sign-up-first-name">{"First name"}</Label>
                <Input
                  id="sign-up-first-name"
                  autoComplete="given-name"
                  required
                  value={props.firstName}
                  onChange={(e) => props.onFirstNameChange(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sign-up-last-name">{"Last name"}</Label>
                <Input
                  id="sign-up-last-name"
                  autoComplete="family-name"
                  required
                  value={props.lastName}
                  onChange={(e) => props.onLastNameChange(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sign-up-email">{"Email"}</Label>
              <Input
                id="sign-up-email"
                type="email"
                autoComplete="email"
                required
                value={props.email}
                onChange={(e) => props.onEmailChange(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sign-up-password">{"Password"}</Label>
              <Input
                id="sign-up-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={props.password}
                onChange={(e) => props.onPasswordChange(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{"At least 8 characters."}</p>
            </div>
            {props.error !== null ? (
              <Alert variant="destructive">
                <AlertDescription>{props.error}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2">
            <Button type="submit" className="w-full" disabled={props.loading}>
              {props.loading ? "Creating account…" : "Create account"}
            </Button>
            <Button type="button" variant="link" size="sm" onClick={() => props.navigate(routes["login"]())}>
              {"Already have an account? Sign in"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}

export default SignUpView;
