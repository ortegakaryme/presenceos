import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="eyebrow text-taupe">404</p>
      <h1 className="font-display mt-2 text-4xl">Not found</h1>
      <p className="mt-2 text-sm text-stone">This campaign or page does not exist. It may have been deleted, or the local data directory was reset.</p>
      <Link href="/" className="mt-6 text-sm underline underline-offset-4">Back to overview</Link>
    </div>
  );
}
