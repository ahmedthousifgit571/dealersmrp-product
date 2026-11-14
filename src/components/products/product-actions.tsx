"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, IndianRupee, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteProduct, setArchived } from "@/app/actions/products";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { QuickPriceDialog, type QuickPriceProduct } from "./quick-price-dialog";

export function ProductActions({ product, archived }: { product: QuickPriceProduct; archived: boolean }) {
  const router = useRouter();
  const [priceOpen, setPriceOpen] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | null>(null);
  const [pending, startTransition] = useTransition();

  const archive = (value: boolean) =>
    startTransition(async () => {
      const res = await setArchived(product.id, value);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => setPriceOpen(true)}>
        <IndianRupee data-icon="inline-start" /> Update price
      </Button>
      <Link href={`/admin/products/${product.id}/edit`} className={buttonVariants({ variant: "outline" })}>
        <Pencil data-icon="inline-start" /> Edit
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" />}>
          {pending ? <Spinner /> : <MoreHorizontal />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {archived ? (
            <DropdownMenuItem onClick={() => archive(false)}>
              <ArchiveRestore /> Restore to search
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => archive(true)}>
              <Archive /> Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm("delete")}>
            <Trash2 /> Delete permanently
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {priceOpen ? <QuickPriceDialog product={product} open={priceOpen} onOpenChange={setPriceOpen} /> : null}

      <AlertDialog open={confirm === "delete"} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {product.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the product and its whole price history for good. To hide it from search but keep the history,
              archive it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {!archived ? (
              <Button
                variant="outline"
                onClick={() => {
                  setConfirm(null);
                  archive(true);
                }}
              >
                Archive instead
              </Button>
            ) : null}
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await deleteProduct(product.id);
                  if (res.ok) {
                    toast.success(res.message);
                    router.push("/admin/products");
                  } else toast.error(res.error);
                })
              }
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
