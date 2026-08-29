"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-medium transition-colors select-none disabled:opacity-40 disabled:pointer-events-none min-h-[48px]";

const variants: Record<Variant, string> = {
  primary: "bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200",
  secondary:
    "bg-black/5 text-gray-900 hover:bg-black/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15",
  ghost: "text-gray-900 hover:bg-black/5 dark:text-white dark:hover:bg-white/10",
  danger:
    "bg-red-600 text-white hover:bg-red-500 disabled:bg-red-600",
};

export function Button({
  variant = "primary",
  full,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; full?: boolean }) {
  return (
    <button
      className={cn(base, variants[variant], full && "w-full", className)}
      {...props}
    />
  );
}

export function LinkButton({
  variant = "primary",
  full,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; full?: boolean }) {
  return (
    <Link
      className={cn(base, variants[variant], full && "w-full", className)}
      {...props}
    >
      {children as ReactNode}
    </Link>
  );
}
