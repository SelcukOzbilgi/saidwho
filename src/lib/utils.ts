import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Joins class names and lets a later Tailwind class win over an earlier one,
// the helper the 21st.dev components are written against.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
