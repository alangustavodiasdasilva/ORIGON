import * as React from "react"
import { cn } from "@/lib/utils"
// import { LabelProps } from "@radix-ui/react-label" // Not using radix for now to keep deps low, simple label.

const Label = React.forwardRef<
    HTMLLabelElement,
    React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
    <label
        ref={ref}
        className={cn(
            "text-[10px] font-black uppercase tracking-widest text-slate-600 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
            className
        )}
        {...props}
    />
))
Label.displayName = "Label"

export { Label }
