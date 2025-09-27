"use client";

import Link from "next/link";
import React from "react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
};

type ButtonAsButton = CommonProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps & {
  href: string;
  prefetch?: boolean;
  target?: string;
  rel?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

type ButtonProps = ButtonAsButton | ButtonAsLink;

function baseClasses(variant: Variant, size: Size) {
  const sizes: Record<Size, string> = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
  };

  const variants: Record<Variant, string> = {
    primary:
      "bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50",
    secondary:
      "border border-blue-200 text-blue-700 hover:bg-blue-50 active:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50",
    danger:
      "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-50",
    ghost:
      "text-gray-700 hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:opacity-50",
  };

  return cn(
    "inline-flex items-center justify-center rounded-md transition-colors",
    sizes[size],
    variants[variant]
  );
}

export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", className, children } = props;
  const classes = cn(baseClasses(variant, size), className);

  if ("href" in props && props.href) {
    const { href, prefetch, target, rel, onClick } = props;
    return (
      <Link href={href} prefetch={prefetch} target={target} rel={rel} className={classes} onClick={onClick}>
        {children}
      </Link>
    );
  }

  const { href: _h, ...buttonProps } = props as ButtonAsButton;
  return (
    <button {...buttonProps} className={classes}>
      {children}
    </button>
  );
}
