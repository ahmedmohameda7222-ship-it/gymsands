"use client";

import { useEffect, useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";

import {
  reportAuthenticatedAppBoot,
  reportWebVitalMetric,
} from "@/lib/observability/performance-metric";

export function PerformanceReporter() {
  useReportWebVitals(reportWebVitalMetric);
  return null;
}

export function AuthenticatedAppBootReporter() {
  const reportedRef = useRef(false);

  useEffect(() => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    reportAuthenticatedAppBoot();
  }, []);

  return null;
}
