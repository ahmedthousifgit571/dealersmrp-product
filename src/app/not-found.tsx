import Link from "next/link";
import { SearchX } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <BrandMark />
      <span className="orb tone-teal size-14 rounded-2xl">
        <SearchX className="size-7" />
      </span>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This product or page doesn&apos;t exist, or it was deleted. Search for it from the Price Finder.
        </p>
      </div>
      <Link href="/" className={buttonVariants()}>
        Go to the Price Finder
      </Link>
    </main>
  );
}
