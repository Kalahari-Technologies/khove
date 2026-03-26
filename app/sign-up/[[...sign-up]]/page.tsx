import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <span className="font-display font-semibold text-white text-2xl tracking-tighter select-none">Khove</span>
        </div>

        <SignUp
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "bg-white/[0.04] border border-white/[0.08] shadow-2xl",
              headerTitle: "text-white",
              headerSubtitle: "text-white/60",
              socialButtonsBlockButton: "bg-white/[0.07] border border-white/[0.10] text-white hover:bg-white/[0.10]",
              dividerLine: "bg-white/[0.08]",
              dividerText: "text-white/35",
              formFieldLabel: "text-white/60",
              formFieldInput: "bg-white/[0.07] border-white/[0.10] text-white focus:border-white/30",
              formButtonPrimary: "bg-white text-black hover:bg-white/90",
              footerActionLink: "text-white/70 hover:text-white",
            },
          }}
        />
      </div>
    </div>
  );
}
