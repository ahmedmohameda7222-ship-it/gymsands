import type { ReactNode } from "react";
import styles from "./page.module.css";

export default function MyMealPlanLayout({ children }: { children: ReactNode }) {
  return <div className={styles.page}>{children}</div>;
}
