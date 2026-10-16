"use client";

import { useSearchParams } from "next/navigation";
import { GoogleSignIn } from "@/components/flowhub/google-sign-in";

export function SignInWithNext() {
  const next = useSearchParams().get("next") ?? undefined;
  return <GoogleSignIn next={next} restore />;
}
