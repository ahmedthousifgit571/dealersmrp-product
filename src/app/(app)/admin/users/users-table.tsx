"use client";

import { useState, useTransition } from "react";
import { Copy, KeyRound, MoreHorizontal, Pencil, RefreshCw, ShieldCheck, UserPlus, UserRoundX, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import {
  createUser,
  resetUserPassword,
  setUserActive,
  updateUser,
  type ActionResult,
} from "@/app/actions/users";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDate, initials, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF";
  isActive: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  priceChanges: number;
};

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8)}`;
}

function notify(result: ActionResult) {
  if (result.ok) toast.success(result.message ?? "Saved");
  else toast.error(result.error);
  return result.ok;
}

function RolePicker({ value, onChange }: { value: "ADMIN" | "STAFF"; onChange: (v: "ADMIN" | "STAFF") => void }) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(v) => {
        const next = v[0];
        if (next === "ADMIN" || next === "STAFF") onChange(next);
      }}
      variant="outline"
      className="grid w-full grid-cols-2"
    >
      <ToggleGroupItem value="STAFF" className="h-auto flex-col items-start gap-0.5 px-3 py-2.5 text-left data-pressed:border-primary data-pressed:bg-accent">
        <span className="text-sm font-medium">Staff</span>
        <span className="text-xs font-normal text-muted-foreground">Search, scan, upload invoices</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="ADMIN" className="h-auto flex-col items-start gap-0.5 px-3 py-2.5 text-left data-pressed:border-primary data-pressed:bg-accent">
        <span className="text-sm font-medium">Admin</span>
        <span className="text-xs font-normal text-muted-foreground">Prices, imports, users</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function PasswordField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <InputGroup className="h-10">
      <InputGroupInput
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono"
        autoComplete="new-password"
        spellCheck={false}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label="Generate a new password" onClick={() => onChange(generatePassword())}>
          <RefreshCw />
        </InputGroupButton>
        <InputGroupButton
          size="icon-xs"
          aria-label="Copy password"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            toast.success("Password copied");
          }}
        >
          <Copy />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

export function AddUserButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: "", email: "", role: "STAFF" as "ADMIN" | "STAFF", password: "" });

  const openDialog = () => {
    setForm({ name: "", email: "", role: "STAFF", password: generatePassword() });
    setOpen(true);
  };

  return (
    <>
      <Button onClick={openDialog}>
        <UserPlus data-icon="inline-start" /> Add user
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                if (notify(await createUser(form))) setOpen(false);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Add a user</DialogTitle>
              <DialogDescription>
                Share the email and password with them in person. They can sign in straight away.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="my-5 gap-4">
              <Field>
                <FieldLabel htmlFor="new-name">Name</FieldLabel>
                <Input id="new-name" className="h-10" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-email">Email</FieldLabel>
                <Input
                  id="new-email"
                  type="email"
                  className="h-10"
                  autoCapitalize="none"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </Field>
              <Field>
                <FieldLabel>Access</FieldLabel>
                <RolePicker value={form.role} onChange={(role) => setForm({ ...form, role })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-password">Starting password</FieldLabel>
                <PasswordField id="new-password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
                <FieldDescription>At least 8 characters. Use the arrow to make a new one.</FieldDescription>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Spinner /> : null} Create user
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusBadge({ row }: { row: UserRow }) {
  if (!row.isActive) return <Badge variant="muted">Deactivated</Badge>;
  if (row.locked) return <Badge variant="warning">Locked 15 min</Badge>;
  return <Badge variant="success">Active</Badge>;
}

function RoleBadge({ role }: { role: UserRow["role"] }) {
  return role === "ADMIN" ? (
    <Badge variant="info">
      <ShieldCheck data-icon="inline-start" /> Admin
    </Badge>
  ) : (
    <Badge variant="outline">Staff</Badge>
  );
}

type DialogState =
  | { kind: "edit"; row: UserRow }
  | { kind: "password"; row: UserRow }
  | { kind: "active"; row: UserRow }
  | null;

export function UsersTable({ rows, currentUserId }: { rows: UserRow[]; currentUserId: string }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const now = new Date();

  const actions = (row: UserRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${row.name}`} />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => setDialog({ kind: "edit", row })}>
          <Pencil /> Edit name &amp; access
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setDialog({ kind: "password", row })}>
          <KeyRound /> Reset password
        </DropdownMenuItem>
        {row.id !== currentUserId ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant={row.isActive ? "destructive" : "default"} onClick={() => setDialog({ kind: "active", row })}>
              {row.isActive ? <UserRoundX /> : <UserRoundCheck />}
              {row.isActive ? "Deactivate" : "Reactivate"}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const person = (row: UserRow) => (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-9 rounded-lg">
        <AvatarFallback className={cn("rounded-lg text-xs font-semibold", row.role === "ADMIN" ? "bg-accent text-accent-foreground" : "bg-surface text-muted-foreground")}>
          {initials(row.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className={cn("truncate font-medium", !row.isActive && "text-muted-foreground")}>
          {row.name}
          {row.id === currentUserId ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">{row.email}</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop table */}
      <div className="clay-card hidden overflow-hidden rounded-2xl md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface/60 hover:bg-surface/60">
              <TableHead className="pl-4">Person</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead className="text-right">Price changes</TableHead>
              <TableHead className="w-12 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className={cn(!row.isActive && "opacity-70")}>
                <TableCell className="py-3 pl-4">{person(row)}</TableCell>
                <TableCell>
                  <RoleBadge role={row.role} />
                </TableCell>
                <TableCell>
                  <StatusBadge row={row} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground" suppressHydrationWarning>
                  {row.lastLoginAt ? timeAgo(row.lastLoginAt, now) : "Never"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{row.priceChanges}</TableCell>
                <TableCell className="pr-4 text-right">{actions(row)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Phone cards */}
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className={cn("clay-card rounded-2xl p-3.5", !row.isActive && "opacity-70")}>
            <div className="flex items-start justify-between gap-2">
              {person(row)}
              {actions(row)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <RoleBadge role={row.role} />
              <StatusBadge row={row} />
              <span suppressHydrationWarning>
                · {row.lastLoginAt ? `Signed in ${timeAgo(row.lastLoginAt, now)}` : `Added ${formatDate(row.createdAt)}`}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {dialog?.kind === "edit" ? <EditDialog row={dialog.row} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "password" ? <PasswordDialog row={dialog.row} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "active" ? <ActiveDialog row={dialog.row} onClose={() => setDialog(null)} /> : null}
    </>
  );
}

function EditDialog({ row, onClose }: { row: UserRow; onClose: () => void }) {
  const [name, setName] = useState(row.name);
  const [role, setRole] = useState(row.role);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              if (notify(await updateUser({ id: row.id, name, role }))) onClose();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit {row.name}</DialogTitle>
            <DialogDescription>Changing access signs them out so the new permissions apply at once.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="my-5 gap-4">
            <Field>
              <FieldLabel htmlFor="edit-name">Name</FieldLabel>
              <Input id="edit-name" className="h-10" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Access</FieldLabel>
              <RolePicker value={role} onChange={setRole} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null} Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ row, onClose }: { row: UserRow; onClose: () => void }) {
  const [password, setPassword] = useState(generatePassword);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              if (notify(await resetUserPassword(row.id, password))) onClose();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              {row.name} is signed out everywhere and must use this new password.
            </DialogDescription>
          </DialogHeader>
          <Field className="my-5">
            <FieldLabel htmlFor="reset-password">New password</FieldLabel>
            <PasswordField id="reset-password" value={password} onChange={setPassword} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null} Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ActiveDialog({ row, onClose }: { row: UserRow; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const deactivate = row.isActive;
  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{deactivate ? `Deactivate ${row.name}?` : `Reactivate ${row.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {deactivate
              ? "They are signed out straight away and can't sign in again until reactivated. Their price history stays."
              : "They can sign in again with their existing password."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={deactivate ? "destructive" : "default"}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (notify(await setUserActive(row.id, !deactivate))) onClose();
              })
            }
          >
            {pending ? <Spinner /> : null}
            {deactivate ? "Deactivate" : "Reactivate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
