"use client";

import dynamic from "next/dynamic";
import { AppShell } from "@/components/AppShell";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), {
  ssr: false,
  loading: () => <div className="map-fallback" />,
});

export default function Page() {
  return <AppShell MapCanvas={MapCanvas} />;
}
