import type { HTMLAttributes, PropsWithChildren } from "react";
import { cn } from "./cn";

export const Panel = ({ className, children, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) => (
  <div
    className={cn(
      "rounded-lg border border-stone-200/80 bg-white/70 shadow-soft backdrop-blur-xl",
      className
    )}
    {...props}
  >
    {children}
  </div>
);
