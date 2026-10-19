// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Status } from "./api";

/** One colour per gauge status, shared by /live, /explore and /immersive. */
export const STATUS_COLOR: Record<Status, string> = {
  normal: "#4ade80",
  high: "#fbbf24",
  alert: "#f87171",
  stale: "#8b95a5",
  unknown: "#5b6472",
};
