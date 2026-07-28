"use client";

import { useState } from "react";
import Link from "next/link";
import { useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { motion, useAnimation, useInView } from "motion/react";
import { useRef, useEffect } from "react";
import { OrbitDisplay } from "@/components/auth/orbit-display";
import { AuthInput } from "@/components/auth/auth-input";

const ease = "cubic-bezier(0.16, 1, 0.3, 1)";

// ─── BoxReveal ────────────────────────────────────────────────────────────────

function BoxReveal({
  children,
  width = "fit-content",
  duration = 0.5,
  className,
}: {
  children: React.ReactNode;
  width?: string;
  duration?: number;
  className?: string;
}) {
  const mainControls = useAnimation();
  const slideControls = useAnimation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (isInView) {
      slideControls.start("visible");
      mainControls.start("visible");
    }
  }, [isInView, mainControls, slideControls]);

  return (
    <div ref={ref} style={{ position: "relative", width, overflow: "hidden" }} className={className}>
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 75 },
          visible: { opacity: 1, y: 0 },
        }}
        initial="hidden"
        animate={mainControls}
        transition={{ duration, delay: 0.25 }}
      >
        {children}
      </motion.div>
      <motion.div
        variants={{ hidden: { left: 0 }, visible: { left: "100%" } }}
        initial="hidden"
        animate={slideControls}
        transition={{ duration, ease: "easeIn" }}
        style={{
          position: "absolute",
          top: 4,
          bottom: 4,
          left: 0,
          right: 0,
          zIndex: 20,
          background: "rgba(255, 255, 255, 0.08)",
          borderRadius: 4,
        }}
      />
    </div>
  );
}

// ─── Bottom Gradient ──────────────────────────────────────────────────────────

function BottomGradient() {
  return (
    <>
      <span className="group-hover/btn:opacity-100 block transition duration-500 opacity-0 absolute h-px w-full -bottom-px inset-x-0 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <span className="group-hover/btn:opacity-100 blur-sm block transition duration-500 opacity-0 absolute h-px w-1/2 mx-auto -bottom-px inset-x-10 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { signIn, isLoaded, setActive } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;

    setLoading(true);
    setError("");

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/home");
      }
    } catch (err: unknown) {
      const clerkError = err as { errors?: { message: string }[] };
      setError(clerkError.errors?.[0]?.message ?? "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "oauth_google" | "oauth_github" | "oauth_atlassian") {
    if (!isLoaded) return;
    try {
      await signIn.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/home",
      });
    } catch {
      setError("OAuth sign-in failed. Please try again.");
    }
  }

  return (
    <div className="flex min-h-screen bg-[#09090B]">
      {/* Left — Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center px-6 lg:px-16">
        <div className="w-full max-w-[380px] flex flex-col gap-4">
          <BoxReveal duration={0.3}>
            <h1 className="text-[28px] font-bold text-white">Welcome back</h1>
          </BoxReveal>

          <BoxReveal duration={0.3} className="pb-2">
            <p className="text-[14px] text-white/50">Sign in to your account</p>
          </BoxReveal>

          {/* OAuth Buttons */}
          <BoxReveal duration={0.3} width="100%">
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => handleOAuth("oauth_google")}
                className="group/btn relative flex-1 h-10 rounded-lg border border-white/[0.10] bg-white/[0.03] text-[12px] text-white/80 font-medium hover:bg-white/[0.06] transition-colors cursor-pointer"
                style={{ transitionTimingFunction: ease }}
              >
                <span className="flex items-center justify-center gap-2 h-full">
                  <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 010-9.18l-7.98-6.19a24.01 24.01 0 000 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                  Google
                </span>
                <BottomGradient />
              </button>
              <button
                type="button"
                onClick={() => handleOAuth("oauth_github")}
                className="group/btn relative flex-1 h-10 rounded-lg border border-white/[0.10] bg-white/[0.03] text-[12px] text-white/80 font-medium hover:bg-white/[0.06] transition-colors cursor-pointer"
                style={{ transitionTimingFunction: ease }}
              >
                <span className="flex items-center justify-center gap-2 h-full">
                  <img src="/assets/github.svg" width={16} height={16} alt="GitHub" />
                  GitHub
                </span>
                <BottomGradient />
              </button>
              <button
                type="button"
                onClick={() => handleOAuth("oauth_atlassian")}
                className="group/btn relative flex-1 h-10 rounded-lg border border-white/[0.10] bg-white/[0.03] text-[12px] text-white/80 font-medium hover:bg-white/[0.06] transition-colors cursor-pointer"
                style={{ transitionTimingFunction: ease }}
              >
                <span className="flex items-center justify-center gap-2 h-full">
                  <img src="/assets/atlassian.svg" width={16} height={16} alt="Atlassian" />
                  Atlassian
                </span>
                <BottomGradient />
              </button>
            </div>
          </BoxReveal>

          {/* Divider */}
          <BoxReveal duration={0.3} width="100%">
            <div className="flex items-center gap-4">
              <hr className="flex-1 border-dashed border-white/[0.10]" />
              <span className="text-[12px] text-white/30">or</span>
              <hr className="flex-1 border-dashed border-white/[0.10]" />
            </div>
          </BoxReveal>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <BoxReveal duration={0.3} width="100%">
              <AuthInput
                label="Email"
                type="email"
                required
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </BoxReveal>

            <BoxReveal duration={0.3} width="100%">
              <AuthInput
                label="Password"
                type="password"
                required
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </BoxReveal>

            {error && (
              <p className="text-[12px] text-red-400">{error}</p>
            )}

            <BoxReveal duration={0.3} width="100%">
              <button
                type="submit"
                disabled={loading}
                className="group/btn relative w-full h-10 rounded-lg bg-white text-black text-[13px] font-medium hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer active:scale-[0.98]"
                style={{ transitionTimingFunction: ease }}
              >
                {loading ? "Signing in..." : "Sign in"} &rarr;
                <BottomGradient />
              </button>
            </BoxReveal>

            <BoxReveal duration={0.3}>
              <p className="text-center text-[13px] text-white/40">
                Don&apos;t have an account?{" "}
                <Link href="/join" className="text-white/70 hover:text-white transition-colors">
                  Join
                </Link>
              </p>
            </BoxReveal>
          </form>
        </div>
      </div>

      {/* Right — Orbit Display (hidden on mobile) */}
      <div className="hidden lg:flex w-1/2 items-center justify-center">
        <OrbitDisplay />
      </div>
    </div>
  );
}
