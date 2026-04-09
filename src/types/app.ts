import type { PlanCode } from "@/lib/plans";

export type AppSession = {
  email: string;
  plan: PlanCode;
  name: string;
  isAdmin: boolean;
};

export type LanguageOption = {
  value: string;
  label: string;
};
