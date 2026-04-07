import type { PlanCode } from "@/lib/plans";

export type DemoSession = {
  email: string;
  plan: PlanCode;
  name: string;
};

export type LanguageOption = {
  value: string;
  label: string;
};
