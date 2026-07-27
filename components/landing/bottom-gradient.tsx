/**
 * BottomGradient — the two-span hover accent used on every button across the
 * auth pages. Requires the parent to carry the `group/btn` class.
 */
export function BottomGradient() {
  return (
    <>
      <span className="group-hover/btn:opacity-100 block transition duration-500 opacity-0 absolute h-px w-full -bottom-px inset-x-0 bg-gradient-to-r from-transparent via-ink/40 to-transparent" />
      <span className="group-hover/btn:opacity-100 blur-sm block transition duration-500 opacity-0 absolute h-px w-1/2 mx-auto -bottom-px inset-x-10 bg-gradient-to-r from-transparent via-ink/20 to-transparent" />
    </>
  );
}
