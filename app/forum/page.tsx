"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ForumRedirect() {
  const router = useRouter();

  useEffect(() => {
    const graphId = sessionStorage.getItem("crucible_graph_id");
    if (graphId) {
      router.replace(`/graph/${graphId}`);
    } else {
      router.replace("/graph");
    }
  }, [router]);

  return null;
}
