"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

import { AuctionLiveRoom } from "@/components/subastas/auction-live-room";

type AuctionLiveRoomClientProps = ComponentProps<typeof AuctionLiveRoom>;

const AuctionLiveRoomNoSSR = dynamic(
  () => import("@/components/subastas/auction-live-room").then((m) => m.AuctionLiveRoom),
  {
    ssr: false,
    loading: () => <div className="mx-auto max-w-6xl px-4 py-16 text-center text-neutral-500">Cargando sala…</div>,
  },
);

export function AuctionLiveRoomClient(props: AuctionLiveRoomClientProps) {
  return <AuctionLiveRoomNoSSR {...props} />;
}
