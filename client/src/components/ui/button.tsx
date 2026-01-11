import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "../../utils/cn"
import "./button.css"

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    asChild?: boolean
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "accent"
    size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"

        return (
            <Comp
                className={cn(
                    "btn",
                    `btn-${variant}`,
                    `btn-size-${size}`,
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button }
