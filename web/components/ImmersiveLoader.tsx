// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";
import dynamic from "next/dynamic";

const Immersive = dynamic(() => import("./Immersive"), { ssr: false });
export default function ImmersiveLoader() {
  return <Immersive />;
}
