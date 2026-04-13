import * as React from "react"
import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { value?: number }
>(({ className, value, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            "relative h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800",
            className
        )}
        {...props}
    >
        <svg width="100%" height="100%" className="block">
            <rect width={`${value || 0}%`} height="100%" fill="currentColor" className="transition-all duration-500 ease-in-out" />
        </svg>
    </div>
))
Progress.displayName = "Progress"

export { Progress }
