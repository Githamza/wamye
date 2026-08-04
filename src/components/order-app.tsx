"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Check } from "lucide-react";
import { CommerceCombo } from "@/components/commerce-combo";
import {
  DeliveryBlock,
  type DeliveryStatus,
} from "@/components/delivery-block";
import { ConfirmScreen } from "@/components/confirm-screen";
import { LiveCourses, type LiveCourse } from "@/components/live-courses";
import { ClosedOverlay } from "@/components/closed-overlay";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Logo } from "@/components/logo";
import type { Commerce, TenantPublicConfig } from "@/lib/config-types";
import { evaluatePosition, simulatedPosition } from "@/lib/geo";
import { formatDinar } from "@/lib/format";
import { startingFee } from "@/lib/fees";
import { formatPhone, isValidPhone, normalizePhone } from "@/lib/phone";
import { closedState, isOpenNow } from "@/lib/hours";
import {
  type ActiveOrder,
  type LastOrder,
  addActiveOrder,
  clearActiveOrder,
  loadActiveOrders,
  loadLastOrder,
  nextCourseNumber,
  saveLastOrder,
} from "@/lib/storage";
import { useTrackedOrders } from "@/lib/hooks/use-tracked-orders";
import {
  isSettled,
  type ApiErrorBody,
  type CreatedOrder,
  type Quote,
} from "@/lib/order-types";

type Screen = "order" | "confirm";

/** Why the order cannot be submitted yet, if it cannot. */
type BlockedReason = "outzone" | "order" | "commerce" | "position" | "phone";

/**
 * One whole message per cause, rather than "Il manque : " glued to a fragment.
 * Arabic cannot take the fragment form — word order and agreement change per
 * cause — and the glue read as nonsense for `outzone` in any language: an
 * address outside the zone is not a field the customer forgot to fill.
 */
const BLOCKED_KEY: Record<BlockedReason, string> = {
  outzone: "blockedOutzone",
  order: "blockedOrder",
  commerce: "blockedCommerce",
  position: "blockedPosition",
  phone: "blockedPhone",
};

// Minimal typing for the PWA install prompt event.
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * The whole customer ordering flow (order → confirm), driven entirely by a
 * tenant's public config. Rendered by src/app/t/[slug]/page.tsx, which loads
 * that config server-side. All API calls carry the tenant slug so the server
 * routes file the order against the right tenant.
 */
export function OrderApp({ config }: { config: TenantPublicConfig }) {
  const t = useTranslations("Order");
  const tHours = useTranslations("Hours");
  const tStatus = useTranslations("Status");
  const tApiError = useTranslations("ApiError");

  // ---- form state ----
  const [order, setOrder] = useState("");
  const [commerce, setCommerce] = useState<Commerce | null>(null);
  const [repere, setRepere] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneFocus, setPhoneFocus] = useState(false);
  const [prenom, setPrenom] = useState("");

  // ---- delivery state ----
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>("idle");
  const [fee, setFee] = useState<number | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [durationMin, setDurationMin] = useState<number | null>(null);
  const [quoteSource, setQuoteSource] = useState<"road" | "estimate">(
    "estimate",
  );
  const [quoting, setQuoting] = useState(false);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  // ---- screen / meta state ----
  const [screen, setScreen] = useState<Screen>("order");
  /**
   * Every course still running, newest first. They outlive the confirm screen —
   * the customer can go back and order again while one is on its way — and they
   * survive a reload, which is the only reason they are persisted at all: the
   * tracking tokens exist nowhere else.
   */
  const [courses, setCourses] = useState<ActiveOrder[]>([]);
  /** Which one the confirm screen is showing. */
  const [viewing, setViewing] = useState<ActiveOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [returning, setReturning] = useState<LastOrder | null>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(true);
  const [showPwa, setShowPwa] = useState(true);

  const installPrompt = useRef<InstallPromptEvent | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // ---- effects ----
  useEffect(() => {
    setMounted(true);
    setOpen(isOpenNow(config.hours));
    const last = loadLastOrder(config.slug);
    if (last) {
      setReturning(last);
      setPhone(last.phone);
      setPrenom(last.prenom);
    }
    // Courses still running from a previous visit. The form stays the landing
    // screen — the bar above it is the way back — so a reload is never hijacked
    // by a timeline the customer may be done with.
    setCourses(loadActiveOrders(config.slug));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      installPrompt.current = e as InstallPromptEvent;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [config.hours, config.slug]);

  // Refine the straight-line estimate into a real road-distance fee, once both
  // ends of the trip are known.
  const commerceLat = commerce?.lat;
  const commerceLng = commerce?.lng;
  const slug = config.slug;
  useEffect(() => {
    if (commerceLat === undefined || commerceLng === undefined) return;
    if (!position || deliveryStatus !== "ready") return;

    let cancelled = false;

    void (async () => {
      setQuoting(true);
      try {
        const res = await fetch(`/api/quote?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { lat: commerceLat, lng: commerceLng },
            destination: position,
          }),
        });
        if (cancelled) return;

        // A failed quote is not fatal: the straight-line estimate still stands.
        if (!res.ok) {
          console.error("[quote] failed:", res.status);
          return;
        }

        const q = (await res.json()) as Quote;
        if (cancelled) return;

        setFee(q.fee);
        setDistanceKm(q.distanceKm);
        setDurationMin(q.durationMin);
        setQuoteSource(q.source);
      } catch (err) {
        if (!cancelled) console.error("[quote] failed:", err);
      } finally {
        if (!cancelled) setQuoting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [commerceLat, commerceLng, position, deliveryStatus, slug]);

  // ---- derived ----
  // A commerce only exists once it carries coordinates (the combo refuses to
  // hand one over otherwise), so `commerce !== null` is the whole check.
  const commerceLabel = commerce?.name ?? "";
  const hasCommerce = commerce !== null;
  const phoneValid = isValidPhone(phone);

  const blocked = useMemo<BlockedReason | null>(() => {
    if (deliveryStatus === "outzone") return "outzone";
    if (order.trim() === "") return "order";
    if (!hasCommerce) return "commerce";
    if (deliveryStatus !== "ready") return "position";
    if (!phoneValid) return "phone";
    return null;
  }, [deliveryStatus, order, hasCommerce, phoneValid]);

  const canSubmit = blocked === null;

  // ---- live courses ----
  // One poll for all of them, shared with the confirm screen: opening a course
  // does not start a second poll of it.
  const tokens = useMemo(
    () =>
      courses
        .map((c) => c.trackingToken)
        .filter((tk): tk is string => tk !== null),
    [courses],
  );
  const tracked = useTrackedOrders(tokens);

  const stageOf = (c: ActiveOrder) =>
    (c.trackingToken ? tracked[c.trackingToken]?.stage : undefined) ??
    "searching";

  /**
   * What the bar offers. Gated on `mounted`: it comes from localStorage, which
   * the server rendering this page knows nothing about.
   */
  const live = useMemo<LiveCourse[]>(() => {
    if (!mounted) return [];
    return courses
      .map((course) => {
        const t = course.trackingToken ? tracked[course.trackingToken] : null;
        return {
          course,
          stage: t?.stage ?? "searching",
          driverName: t?.driverName ?? null,
        };
      })
      .filter((c) => !isSettled(c.stage));
  }, [mounted, courses, tracked]);

  // Settled courses leave localStorage so they do not come back as "searching"
  // on the next visit, for the second it takes a poll to settle them again.
  // Effects are for external systems, and storage is one — `courses` itself is
  // left alone, since `live` already filters on the polled stage.
  const cleared = useRef(new Set<number>());
  useEffect(() => {
    for (const c of courses) {
      const stage = c.trackingToken ? tracked[c.trackingToken]?.stage : null;
      if (!stage || !isSettled(stage)) continue;
      if (cleared.current.has(c.createdAt)) continue;
      cleared.current.add(c.createdAt);
      clearActiveOrder(config.slug, c.createdAt);
    }
  }, [courses, tracked, config.slug]);

  /**
   * The delivery price, announced before anything is filled in — it is the
   * first question every customer asks, and it used to appear only once the
   * address was known.
   *
   * The live fee replaces the announced one as soon as there is one, so the
   * header never contradicts the button.
   */
  const starting = startingFee(config.feeConfig);
  const headerFee = formatDinar(fee ?? starting.amount);
  const headerFeeLabel =
    fee !== null || starting.flat
      ? t("feeHeader", { fee: headerFee })
      : t("feeHeaderFrom", { fee: headerFee });

  const ctaLabel = submitting
    ? t("submitting")
    : canSubmit && fee !== null
      ? t("submitWithFee", { fee: formatDinar(fee) })
      : t("submit");

  // ---- handlers ----
  /**
   * Apply a coordinate — from geolocation, or from the customer dragging the
   * pin. The zone verdict and the straight-line fee estimate land immediately;
   * the road-distance quote refines the fee afterwards (see the effect below).
   */
  function applyPosition(pos: { lat: number; lng: number }) {
    setPosition(pos);
    // Any new coordinate invalidates the previous road quote.
    setDurationMin(null);
    setQuoteSource("estimate");

    const res = evaluatePosition(pos, config.zone, config.feeConfig);
    if (res.inZone) {
      setFee(res.fee);
      setDistanceKm(res.distanceKm);
      setDeliveryStatus("ready");
    } else {
      setFee(null);
      setDistanceKm(null);
      setDeliveryStatus("outzone");
    }
  }

  function handleUseLocation() {
    setDeliveryStatus("locating");

    const finish = (pos: { lat: number; lng: number }) => {
      window.setTimeout(() => applyPosition(pos), 1400);
    };

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => finish({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => finish(simulatedPosition(config.zone)), // denied / unavailable → fall back in-zone
        { timeout: 6000, maximumAge: 60000 },
      );
    } else {
      finish(simulatedPosition(config.zone));
    }
  }

  /**
   * Every way a submit can fail offers the same reassurance and the same way
   * back in; only the headline differs when the server names a cause.
   *
   * The API reports codes rather than sentences (it has no locale), so an
   * unrecognised one — an older deploy, say — falls back rather than showing
   * the reader a raw identifier.
   */
  function toastSubmitFailed(code?: string) {
    const headline =
      code && tApiError.has(code) ? tApiError(code) : t("sendFailed");
    toast.error(headline, {
      description: t("sendFailedDescription"),
      action: { label: t("retry"), onClick: () => submitOrder() },
    });
  }

  async function submitOrder() {
    if (submitting) return;

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toastSubmitFailed();
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: config.slug,
          order: order.trim(),
          commerceName: commerceLabel,
          commerceAddr: commerce?.addr ?? null,
          // Google place id: what lets the driver see the shop by name in Maps
          // instead of an anonymous dropped pin. Commerce.id already is one.
          commercePlaceId: commerce?.id ?? null,
          commercePosition: commerce && {
            lat: commerce.lat,
            lng: commerce.lng,
          },
          repere: repere.trim(),
          phone,
          prenom: prenom.trim(),
          fee,
          distanceKm,
          quoteSource,
          position,
        }),
      });

      if (!res.ok) {
        const data = (await res
          .json()
          .catch(() => null)) as Partial<ApiErrorBody> | null;
        toastSubmitFailed(data?.error);
        return;
      }

      const created = (await res.json()) as CreatedOrder;

      const running: ActiveOrder = {
        trackingToken: created.trackingToken ?? null,
        courseNumber: nextCourseNumber(config.slug),
        order: order.trim(),
        commerceName: commerceLabel,
        fee,
        createdAt: Date.now(),
      };
      setCourses(addActiveOrder(config.slug, running));
      setViewing(running);
      saveLastOrder(config.slug, {
        order: order.trim(),
        commerce,
        commerceName: commerceLabel,
        phone,
        prenom,
      });
      setShowPwa(true);
      setScreen("confirm");
      bodyRef.current?.scrollTo({ top: 0 });
    } catch {
      toastSubmitFailed();
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Back to the form for another order. What was just sent is deliberately
   * cleared — the customer is writing a new one, and the reorder card above
   * already offers the previous one back in one tap. Address, phone and name
   * stay: same customer, same doorstep, so the quote holds.
   */
  function handleNewOrder() {
    setOrder("");
    setScreen("order");
    bodyRef.current?.scrollTo({ top: 0 });
  }

  function handleOpenCourse(course: ActiveOrder) {
    setViewing(course);
    setScreen("confirm");
  }

  function handleRecommander() {
    if (!returning) return;
    setOrder(returning.order);
    // Entries saved before commerces carried coordinates can't be reordered
    // as-is; the rest of the form still prefills and the customer just picks
    // the shop again.
    if (returning.commerce) setCommerce(returning.commerce);
    bodyRef.current?.scrollTo({
      top: bodyRef.current.scrollHeight,
      behavior: "smooth",
    });
    toast(t(returning.commerce ? "reorderToast" : "reorderToastNoCommerce"));
  }

  async function handleInstall() {
    const p = installPrompt.current;
    if (p) {
      await p.prompt();
      installPrompt.current = null;
      setShowPwa(false);
    } else {
      toast(t("installHint"));
    }
  }

  // Avoid hydration mismatch on time/localStorage-derived UI.
  const isOpen = mounted ? open : true;
  const supportPhone = config.branding.supportPhone;

  return (
    <div className="flex min-h-[100dvh] w-full justify-center sm:items-center sm:p-6">
      <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-app sm:h-[844px] sm:min-h-0 sm:w-[390px] sm:rounded-[28px] sm:border sm:border-frame sm:shadow-[0_12px_32px_rgba(28,25,23,0.10)]">
        {/* Header */}
        <header className="flex h-[72px] flex-none items-center gap-3 border-b border-hair bg-white px-5">
          {/* The Wamye mark, not the tenant's emoji: the customer is on Wamye,
              and the line beside it already names the neighbourhood served. */}
          <Logo variant="mark" className="size-10 flex-none" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold text-stone-ink">
              {config.branding.areaLabel
                ? t("headerTitle", { area: config.branding.areaLabel })
                : t("headerTitleNoArea")}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-stone-muted">
              <span
                className={`size-2 flex-none rounded-full ${
                  isOpen ? "animate-pulse-dot bg-success" : "bg-stone-faint"
                }`}
              />
              {/* Truncates rather than wraps: the header is a fixed 72px, and
                  an opening time overruns it in either language. Secondary
                  detail, so clipping it is fine. The area name lives in the
                  title above, so it is not repeated here. */}
              <span className="truncate">
                {isOpen
                  ? tHours("openUntil", { hour: config.hours.closeHour })
                  : tStatus("closed")}
              </span>
            </div>
          </div>
          {/* A shared shop link lands here directly, never passing the landing
              page — so this is the only switcher most customers will see. */}
          <LocaleSwitcher />
        </header>

        {/* Delivery price — and, right beside it, what it is not. A customer
            reading a single number on a delivery page assumes it is the total;
            the disclaimer travels with the price rather than being filed away
            somewhere else on the screen. */}
        {screen === "order" && (
          <div className="flex flex-none items-baseline justify-between gap-2 border-b border-hair bg-white px-5 pb-2.5">
            <span className="flex-none text-[14px] font-semibold text-brand">
              {headerFeeLabel}
            </span>
            <span className="truncate text-[12px] text-stone-muted">
              {t("feeExcludesItems")}
            </span>
          </div>
        )}

        {/* Deliveries in progress. Directly under the header and outside the
            scroller, so a running course cannot be scrolled out of reach — and
            it takes the welcome bar's place rather than stacking on it: while a
            driver is on the move, that is the news, not the greeting. */}
        {screen === "order" && (
          <LiveCourses courses={live} onOpen={handleOpenCourse} />
        )}

        {/* Returning-customer welcome */}
        {mounted && returning && live.length === 0 && screen === "order" && (
          <div className="anim-fade-in flex-none border-b border-brand-border bg-brand-bg px-5 py-2.5 text-[15px] font-medium text-brand-ink">
            {returning.prenom
              ? t("welcomeBack", { name: returning.prenom })
              : t("welcomeBackFallback")}
          </div>
        )}

        {/* ---------- ORDER SCREEN ---------- */}
        {screen === "order" && (
          <>
            <div
              ref={bodyRef}
              className={`flex flex-1 flex-col gap-4 overflow-y-auto p-4 ${
                !isOpen ? "pointer-events-none opacity-35 saturate-[0.6]" : ""
              }`}
            >
              {mounted && returning && (
                <div className="flex items-center gap-3 rounded-[14px] border border-brand-border bg-white p-4 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="text-[13px] font-semibold text-brand">
                      {t("reorderTitle")}
                    </div>
                    <div className="truncate text-[14px] text-stone-muted2">
                      {returning.order} · {returning.commerceName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRecommander}
                    className="h-11 flex-none rounded-[10px] bg-brand px-4 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover"
                  >
                    {t("reorderAction")}
                  </button>
                </div>
              )}

              {/* VOTRE COMMANDE */}
              <section className="flex flex-col gap-3 rounded-[14px] border border-hair bg-white p-4 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-muted">
                  {t("sectionOrder")}
                </div>
                <Textarea
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                  placeholder={t("orderPlaceholder")}
                  aria-label={t("orderAria")}
                  className="min-h-[66px] resize-none rounded-[10px] text-[15px] leading-normal"
                />
                <CommerceCombo
                  selected={commerce}
                  onSelect={setCommerce}
                  zone={config.zone}
                  position={position}
                  regionCode={config.phoneCountry.toLowerCase()}
                />
              </section>

              {/* LIVRAISON */}
              <section className="flex flex-col gap-3 rounded-[14px] border border-hair bg-white p-4 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-muted">
                  {t("sectionDelivery")}
                </div>
                <DeliveryBlock
                  status={deliveryStatus}
                  fee={fee}
                  distanceKm={distanceKm}
                  durationMin={durationMin}
                  quoteSource={quoteSource}
                  quoting={quoting}
                  position={position}
                  onPositionChange={applyPosition}
                  repere={repere}
                  onRepere={setRepere}
                  onUseLocation={handleUseLocation}
                  areaLabel={config.branding.areaLabel}
                />
              </section>

              {/* VOS COORDONNÉES */}
              <section className="flex flex-col gap-3 rounded-[14px] border border-hair bg-white p-4 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-muted">
                  {t("sectionContact")}
                </div>
                {/* A phone number is LTR even in an RTL page, so this field
                    opts out of the paragraph direction. Left to inherit rtl,
                    bidi reorders the groups — "22 483 921" renders as
                    "921 483 22" — and puts the neutral "+" on the wrong side
                    of the dial code, giving "216+". */}
                <div
                  dir="ltr"
                  className={`relative flex h-12 items-stretch overflow-hidden rounded-[10px] border ${
                    phoneFocus
                      ? "border-brand ring-[3px] ring-brand/15"
                      : "border-hair"
                  }`}
                >
                  <div className="flex flex-none items-center border-e border-hair bg-hair-2 px-3 text-[15px] text-stone-muted">
                    +216
                  </div>
                  <input
                    value={formatPhone(phone)}
                    onChange={(e) => setPhone(normalizePhone(e.target.value))}
                    onFocus={() => setPhoneFocus(true)}
                    onBlur={() => setPhoneFocus(false)}
                    inputMode="numeric"
                    placeholder={t("phonePlaceholder")}
                    aria-label={t("phoneAria")}
                    className="min-w-0 flex-1 bg-white px-3.5 pe-10 text-[15px] text-stone-ink outline-none"
                  />
                  {phoneValid && (
                    <Check
                      className="absolute end-3 top-1/2 size-5 -translate-y-1/2 text-success"
                      strokeWidth={2}
                    />
                  )}
                </div>
                <div className="relative">
                  <Input
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                    placeholder={t("firstNamePlaceholder")}
                    aria-label={t("firstNameAria")}
                    className="h-12 rounded-[10px] pe-10 text-[15px]"
                  />
                  {prenom.trim() !== "" && (
                    <Check
                      className="absolute end-3 top-1/2 size-5 -translate-y-1/2 text-success"
                      strokeWidth={2}
                    />
                  )}
                </div>
              </section>
            </div>

            {/* CTA footer */}
            <footer className="flex flex-none flex-col gap-2 bg-white px-4 pb-[calc(24px+env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-4px_16px_rgba(28,25,23,0.07)]">
              {isOpen && blocked && (
                <div className="text-center text-[13px] text-stone-muted">
                  {t(BLOCKED_KEY[blocked])}
                </div>
              )}
              {/* Last word before the button, which carries a price: the amount
                  buys the trip, not the food. */}
              {isOpen && !blocked && (
                <div className="text-center text-[12px] text-stone-muted">
                  {t("ctaFeeNotice")}
                </div>
              )}
              <button
                type="button"
                disabled={!canSubmit || !isOpen || submitting}
                onClick={submitOrder}
                className="h-14 w-full rounded-xl bg-brand text-base font-semibold text-white transition-colors hover:bg-brand-hover active:bg-brand-active disabled:cursor-not-allowed disabled:bg-hair disabled:text-stone-faint"
              >
                {ctaLabel}
              </button>
            </footer>
          </>
        )}

        {/* ---------- CONFIRM SCREEN ---------- */}
        {/* Rendered from the stored course, not the form: the form is free to
            hold the *next* order by the time the customer comes back here. */}
        {screen === "confirm" && viewing && (
          <ConfirmScreen
            key={viewing.createdAt}
            stage={stageOf(viewing)}
            driverName={
              (viewing.trackingToken
                ? tracked[viewing.trackingToken]?.driverName
                : null) ?? null
            }
            trackingNumber={
              (viewing.trackingToken
                ? tracked[viewing.trackingToken]?.trackingNumber
                : null) ?? null
            }
            brandName={config.branding.name}
            courseNumber={viewing.courseNumber}
            order={viewing.order}
            commerceName={viewing.commerceName}
            fee={viewing.fee}
            onNewOrder={handleNewOrder}
            onProblem={() =>
              toast(
                supportPhone
                  ? t("supportWhatsApp", { phone: supportPhone })
                  : t("supportFallback"),
              )
            }
            onInstall={handleInstall}
            showPwa={showPwa}
            onDismissPwa={() => setShowPwa(false)}
          />
        )}

        {/* ---------- CLOSED OVERLAY ---------- */}
        {mounted && !open && screen === "order" && (
          <ClosedOverlay {...closedState(config.hours)} />
        )}
      </div>
    </div>
  );
}
