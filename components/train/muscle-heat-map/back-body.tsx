import type { ComponentProps } from "react";
import { MuscleBody } from "./muscle-body";

export function BackMuscleBody(props: Omit<ComponentProps<typeof MuscleBody>, "view">) {
  return <MuscleBody {...props} view="back" />;
}
