import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

type ActionButtonProps = ComponentProps<typeof Button>;

export function PrimaryButton(props: ActionButtonProps) {
  return <Button {...props} />;
}

export function SecondaryButton(props: ActionButtonProps) {
  return <Button variant="secondary" {...props} />;
}
