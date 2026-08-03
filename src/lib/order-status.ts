// ============================================================
// The delivery lifecycle — one vocabulary, shared by the driver PWA, the
// dashboard and the customer's tracking page.
//
// The DB holds `orders.state` and guards the transitions in advance_order()
// (migration 0015). This module is the client-side twin: it must agree with
// that function, and the two are meant to be read side by side.
// ============================================================

import type { OrderStage } from "@/lib/order-types";

/** What an order can be. Mirrors the orders_state_check constraint. */
export const ORDER_STATES = [
  "pending",
  "accepted",
  "picked_up",
  "delivered",
  "problem",
  "canceled",
] as const;

export type OrderState = (typeof ORDER_STATES)[number];

export function isOrderState(v: unknown): v is OrderState {
  return typeof v === "string" && (ORDER_STATES as readonly string[]).includes(v);
}

/** Nothing more will happen to an order in one of these. */
export const TERMINAL_STATES: readonly OrderState[] = ["delivered", "problem", "canceled"];

export function isTerminal(state: OrderState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * The step a driver can take from where they are — the single forward move the
 * action bar offers. Bailing out (problem/canceled) is always available on top
 * of this and is handled separately, since it is not part of the happy path.
 */
export const NEXT_STATE: Partial<Record<OrderState, OrderState>> = {
  accepted: "picked_up",
  picked_up: "delivered",
};

/** Legal edges, kept in lockstep with advance_order() in migration 0015. */
export function canAdvance(from: OrderState, to: OrderState): boolean {
  if (to === "problem" || to === "canceled") {
    return from === "accepted" || from === "picked_up";
  }
  return NEXT_STATE[from] === to;
}

/**
 * Collapse the six driver states onto the four coarse stages the customer's
 * timeline has always shown (see OrderStage in @/lib/order-types).
 *
 * `problem` maps to "canceled": from the customer's side, a course the driver
 * abandoned and one they cancelled look the same — something went wrong and
 * nobody is coming. The distinction matters to the tenant, not to them.
 */
export function stageForState(state: OrderState): OrderStage {
  switch (state) {
    case "pending":
      return "searching";
    case "accepted":
    case "picked_up":
      return "enroute";
    case "delivered":
      return "delivered";
    case "problem":
    case "canceled":
      return "canceled";
  }
}

/** True while the driver is expected to be sharing their position. */
export function tracksPosition(state: OrderState): boolean {
  return state === "accepted" || state === "picked_up";
}
