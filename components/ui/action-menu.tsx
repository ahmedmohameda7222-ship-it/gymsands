"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Position = { top: number; left: number };
type ActionMenuContextValue = { close: () => void };

const ActionMenuContext = createContext<ActionMenuContextValue | null>(null);

export function ActionMenu({
  label,
  children,
  disabled = false,
  triggerVariant = "outline",
  triggerClassName,
  icon = <MoreHorizontal className="h-4 w-4" />,
  onTriggerElement
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  triggerVariant?: ButtonProps["variant"];
  triggerClassName?: string;
  icon?: ReactNode;
  onTriggerElement?: (element: HTMLButtonElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const setTriggerRef = useCallback((element: HTMLButtonElement | null) => {
    triggerRef.current = element;
    onTriggerElement?.(element);
  }, [onTriggerElement]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const direction = getComputedStyle(triggerRef.current).direction;
    const margin = 8;
    let left = direction === "rtl" ? trigger.left : trigger.right - menu.width;
    left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - menu.width - margin));
    let top = trigger.bottom + margin;
    if (top + menu.height > window.innerHeight - margin) {
      top = Math.max(margin, trigger.top - menu.height - margin);
    }
    setPosition({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const focusFirst = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']:not(:disabled)")?.focus();
    });
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    const onViewportChange = () => close();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    // Focusing the first menu item can scroll compact mobile viewports. Give
    // that accessibility-driven scroll time to settle before scroll-to-close.
    const scrollListenerTimer = window.setTimeout(() => window.addEventListener("scroll", onViewportChange, true), 250);
    return () => {
      window.cancelAnimationFrame(focusFirst);
      window.clearTimeout(scrollListenerTimer);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [close, open]);

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)") ?? []);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === "ArrowDown") next = current < items.length - 1 ? current + 1 : 0;
    else if (event.key === "ArrowUp") next = current > 0 ? current - 1 : items.length - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Tab") {
      setOpen(false);
      return;
    } else return;
    event.preventDefault();
    items[next]?.focus();
  }

  return (
    <>
      <Button
        ref={setTriggerRef}
        type="button"
        variant={triggerVariant}
        className={cn("min-h-11", triggerClassName)}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        {icon}
        <span>{label}</span>
      </Button>
      {open && typeof document !== "undefined" ? createPortal(
        <ActionMenuContext.Provider value={{ close }}>
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            className="fixed z-[140] grid min-w-52 max-w-[calc(100vw-1rem)] gap-1 rounded-[14px] border bg-card p-2 shadow-luxe"
            style={{ top: position.top, left: position.left }}
            onKeyDown={handleMenuKeyDown}
          >
            {children}
          </div>
        </ActionMenuContext.Provider>,
        document.body
      ) : null}
    </>
  );
}

export function ActionMenuItem({
  children,
  onSelect,
  disabled = false,
  destructive = false
}: {
  children: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const context = useContext(ActionMenuContext);
  if (!context) throw new Error("ActionMenuItem must be used inside ActionMenu.");
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      disabled={disabled}
      className={cn(
        "min-h-11 rounded-xl px-3 text-start text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        destructive && "text-destructive"
      )}
      onClick={() => {
        context.close();
        onSelect();
      }}
    >
      {children}
    </button>
  );
}
