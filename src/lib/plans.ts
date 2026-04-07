export type PlanCode = "free" | "basic" | "medium" | "high";

export const PLAN_CONFIG: Record<
  PlanCode,
  {
    name: string;
    price: string;
    badge: string;
    maxStoredExports: number;
    maxDailyDownloads: number;
    maxCodeLines: number;
    maxLineLength: number;
    watermark: boolean;
  }
> = {
  free: {
    name: "Free",
    price: "$0",
    badge: "1 download / 24h",
    maxStoredExports: 0,
    maxDailyDownloads: 1,
    maxCodeLines: 120,
    maxLineLength: 90,
    watermark: true
  },
  basic: {
    name: "Basic",
    price: "$19",
    badge: "3 stored exports",
    maxStoredExports: 3,
    maxDailyDownloads: 10,
    maxCodeLines: 400,
    maxLineLength: 110,
    watermark: false
  },
  medium: {
    name: "Medium",
    price: "$39",
    badge: "10 stored exports",
    maxStoredExports: 10,
    maxDailyDownloads: 40,
    maxCodeLines: 1000,
    maxLineLength: 120,
    watermark: false
  },
  high: {
    name: "High",
    price: "$79",
    badge: "25 stored exports",
    maxStoredExports: 25,
    maxDailyDownloads: 120,
    maxCodeLines: 2500,
    maxLineLength: 140,
    watermark: false
  }
};
