import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base">
      <div className="flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center">
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <span className="text-text-primary font-semibold text-xl tracking-tight">Khove</span>
        </div>

        <SignUp
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "bg-bg-surface border border-border shadow-2xl",
              headerTitle: "text-text-primary",
              headerSubtitle: "text-text-secondary",
              socialButtonsBlockButton: "bg-bg-elevated border border-border text-text-primary hover:bg-bg-overlay",
              dividerLine: "bg-border",
              dividerText: "text-text-tertiary",
              formFieldLabel: "text-text-secondary",
              formFieldInput: "bg-bg-elevated border-border text-text-primary focus:border-brand-primary",
              formButtonPrimary: "bg-brand-primary hover:bg-brand-primaryHover",
              footerActionLink: "text-brand-primary hover:text-brand-primaryHover",
            },
          }}
        />
      </div>
    </div>
  );
}
