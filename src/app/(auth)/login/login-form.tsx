"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, Eye, EyeOff, Info, Lock, Mail } from "lucide-react";
import { login, type LoginState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "";
  const ended = params.get("ended") === "1";
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />

      {ended && !state.error ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-info/25 bg-info-soft px-3 py-2.5 text-sm text-info-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>You were signed out. Your access or password may have changed, so sign in again.</span>
        </div>
      ) : null}

      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <Field data-invalid={!!state.fieldErrors?.email}>
        <FieldLabel htmlFor="email">Work email</FieldLabel>
        <InputGroup className="h-11">
          <InputGroupAddon>
            <Mail />
          </InputGroupAddon>
          <InputGroupInput
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@yourshop.in"
            defaultValue={state.email}
            aria-invalid={!!state.fieldErrors?.email}
            className="text-base sm:text-sm"
            required
            autoFocus
          />
        </InputGroup>
        <FieldError>{state.fieldErrors?.email}</FieldError>
      </Field>

      <Field data-invalid={!!state.fieldErrors?.password}>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <InputGroup className="h-11">
          <InputGroupAddon>
            <Lock />
          </InputGroupAddon>
          <InputGroupInput
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            aria-invalid={!!state.fieldErrors?.password}
            className="text-base sm:text-sm"
            required
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-sm"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <FieldError>{state.fieldErrors?.password}</FieldError>
      </Field>

      <Button type="submit" size="lg" className="h-11 w-full text-[15px]" disabled={pending}>
        {pending ? <Spinner /> : null}
        {pending ? "Signing in…" : "Sign in"}
        {!pending ? <ArrowRight data-icon="inline-end" /> : null}
      </Button>
    </form>
  );
}
