"use client";

import { Bot } from "lucide-react";

export interface ChatGptMarkProps {
  size?: number | string;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export interface ChatGptMarkHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

export function ChatGptMark({ size = 24, color = "currentColor", strokeWidth = 2, className = "" }: ChatGptMarkProps) {
  return <Bot size={size} color={color} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
}
