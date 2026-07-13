"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Check } from "lucide-react";
import { CommerceCombo } from "@/components/commerce-combo";
import { DeliveryBlock, type DeliveryStatus } from "@/components/delivery-block";
import { ConfirmScreen } from "@/components/confirm-screen";
import { ClosedOverlay } from "@/components/closed-overlay";
import {
  type Commerce,
  type LastOrder,
  closedLabel,
  evaluatePosition,
  formatDT,
  formatPhone,
  isOpenNow,
  isValidPhone,
  loadLastOrder,
  nextCourseNumber,
  normalizePhone,
  openLabel,
  saveLastOrder,
  simulatedDjerbaPosition,
} from "@/lib/djerba";
import type { Quote } from "@/lib/order-types";

type Screen = "order" | "confirm";

// Minimal typing for the PWA install prompt event.
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function Page() {
  // ---- form state ----
  const [order, setOrder] = useState("");
  const [commerce, setCommerce] = useState<Commerce | null>(null);
  const [describe, setDescribe] = useState(false);
  const [describeText, setDescribeText] = useState("");
  const [repere, setRepere] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneFocus, setPhoneFocus] = useState(false);
  const [prenom, setPrenom] = useState("");

  // ---- delivery state ----
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>("idle");
  const [fee, setFee] = useState<number | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [durationMin, setDurationMin] = useState<number | null>(null);
  const [quoteSource, setQuoteSource] = useState<"road" | "estimate">("estimate");
  const [quoting, setQuoting] = useState(false);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);

  // ---- screen / meta state ----
  const [screen, setScreen] = useState<Screen>("order");
  const [courseNumber, setCourseNumber] = useState(47);
  const [orderId, setOrderId] = useState<string | null>(null);
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
    setOpen(isOpenNow());
    const last = loadLastOrder();
    if (last) {
      setReturning(last);
      setPhone(last.phone);
      setPrenom(last.prenom);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      installPrompt.current = e as InstallPromptEvent;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  // Refine the straight-line estimate into a real road-distance fee, once both
  // ends of the trip are known. Needs a commerce with coordinates, which only
  // comes from Google Places — a commerce from the fallback list, or one typed
  // free-hand, keeps the estimate.
  const commerceLat = commerce?.lat;
  const commerceLng = commerce?.lng;
  useEffect(() => {
    if (commerceLat === undefined || commerceLng === undefined) return;
    if (!position || deliveryStatus !== "ready") return;

    let cancelled = false;

    void (async () => {
      setQuoting(true);
      try {
        const res = await fetch("/api/quote", {
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
  }, [commerceLat, commerceLng, position, deliveryStatus]);

  // ---- derived ----
  const commerceLabel = describe ? describeText.trim() : commerce?.name ?? "";
  const hasCommerce = commerceLabel !== "";
  const phoneValid = isValidPhone(phone);

  const missing = useMemo<string | null>(() => {
    if (deliveryStatus === "outzone") return "adresse hors zone de livraison";
    if (order.trim() === "") return "votre commande";
    if (!hasCommerce) return "un commerce";
    if (deliveryStatus !== "ready") return "votre position";
    if (!phoneValid) return "votre numéro";
    return null;
  }, [deliveryStatus, order, hasCommerce, phoneValid]);

  const canSubmit = missing === null;
  const ctaLabel = submitting
    ? "Envoi…"
    : canSubmit && fee !== null
      ? `Commander · Livraison ${formatDT(fee)} DT`
      : "Commander";

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

    const res = evaluatePosition(pos);
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
        () => finish(simulatedDjerbaPosition()), // denied / unavailable → fall back in-zone
        { timeout: 6000, maximumAge: 60000 },
      );
    } else {
      finish(simulatedDjerbaPosition());
    }
  }

  async function submitOrder() {
    if (submitting) return;

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toast.error("Échec de l'envoi — réessayez", {
        description: "Votre commande est conservée",
        action: { label: "Réessayer", onClick: () => submitOrder() },
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: order.trim(),
          commerceName: commerceLabel,
          commerceAddr: commerce?.addr ?? null,
          commercePosition:
            commerce?.lat !== undefined && commerce?.lng !== undefined
              ? { lat: commerce.lat, lng: commerce.lng }
              : null,
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
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(data?.error ?? "Échec de l'envoi — réessayez", {
          description: "Votre commande est conservée",
          action: { label: "Réessayer", onClick: () => submitOrder() },
        });
        return;
      }

      const created = (await res.json()) as { id: string };

      const course = nextCourseNumber();
      setCourseNumber(course);
      setOrderId(created.id);
      saveLastOrder({
        order: order.trim(),
        commerceId: commerce?.id ?? null,
        commerceName: commerceLabel,
        phone,
        prenom,
      });
      setShowPwa(true);
      setScreen("confirm");
      bodyRef.current?.scrollTo({ top: 0 });
    } catch {
      toast.error("Échec de l'envoi — réessayez", {
        description: "Votre commande est conservée",
        action: { label: "Réessayer", onClick: () => submitOrder() },
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleRecommander() {
    if (!returning) return;
    setOrder(returning.order);
    if (returning.commerceId) {
      const c = { id: returning.commerceId, name: returning.commerceName, addr: "" };
      setCommerce(c as Commerce);
      setDescribe(false);
    } else {
      setDescribe(true);
      setDescribeText(returning.commerceName);
    }
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
    toast("Commande pré-remplie — ajoutez votre position pour valider");
  }

  async function handleInstall() {
    const p = installPrompt.current;
    if (p) {
      await p.prompt();
      installPrompt.current = null;
      setShowPwa(false);
    } else {
      toast("Menu du navigateur → « Ajouter à l'écran d'accueil »");
    }
  }

  // Avoid hydration mismatch on time/localStorage-derived UI.
  const isOpen = mounted ? open : true;

  return (
    <div className="flex min-h-[100dvh] w-full justify-center sm:items-center sm:p-6">
      <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-app sm:h-[844px] sm:min-h-0 sm:w-[390px] sm:rounded-[28px] sm:border sm:border-frame sm:shadow-[0_12px_32px_rgba(28,25,23,0.10)]">
        {/* Header */}
        <header className="flex h-[72px] flex-none items-center gap-3 border-b border-hair bg-white px-5">
          <div className="flex size-10 items-center justify-center rounded-full border border-brand-border bg-brand-bg text-xl">
            🛵
          </div>
          <div>
            <div className="text-base font-semibold text-stone-ink">Livraison Djerba</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-stone-muted">
              <span
                className={`size-2 rounded-full ${
                  isOpen ? "animate-pulse-dot bg-success" : "bg-stone-faint"
                }`}
              />
              {isOpen ? openLabel() : "Fermé · Djerba & Midoun"}
            </div>
          </div>
        </header>

        {/* Returning-customer welcome */}
        {mounted && returning && screen === "order" && (
          <div className="anim-fade-in flex-none border-b border-brand-border bg-brand-bg px-5 py-2.5 text-[15px] font-medium text-brand-ink">
            Re-bonjour {returning.prenom || "à vous"} 👋
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
                      Recommander comme la dernière fois
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
                    Recommander
                  </button>
                </div>
              )}

              {/* VOTRE COMMANDE */}
              <section className="flex flex-col gap-3 rounded-[14px] border border-hair bg-white p-4 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-muted">
                  Votre commande
                </div>
                <Textarea
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                  placeholder="Ex : 2 makloub thon + 1 coca bien frais"
                  aria-label="Votre commande"
                  className="min-h-[66px] resize-none rounded-[10px] text-[15px] leading-normal"
                />
                <CommerceCombo
                  selected={commerce}
                  onSelect={setCommerce}
                  describe={describe}
                  describeValue={describeText}
                  onDescribeChange={setDescribeText}
                />
                <button
                  type="button"
                  onClick={() => {
                    setDescribe((d) => !d);
                    setCommerce(null);
                  }}
                  className="self-start text-[13px] text-brand underline underline-offset-[3px]"
                >
                  {describe ? "Choisir dans la liste" : "Introuvable ? Décrivez-le"}
                </button>
              </section>

              {/* LIVRAISON */}
              <section className="flex flex-col gap-3 rounded-[14px] border border-hair bg-white p-4 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-muted">
                  Livraison
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
                />
              </section>

              {/* VOS COORDONNÉES */}
              <section className="flex flex-col gap-3 rounded-[14px] border border-hair bg-white p-4 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-muted">
                  Vos coordonnées
                </div>
                <div
                  className={`relative flex h-12 items-stretch overflow-hidden rounded-[10px] border ${
                    phoneFocus ? "border-brand ring-[3px] ring-brand/15" : "border-hair"
                  }`}
                >
                  <div className="flex flex-none items-center border-r border-hair bg-hair-2 px-3 text-[15px] text-stone-muted">
                    +216
                  </div>
                  <input
                    value={formatPhone(phone)}
                    onChange={(e) => setPhone(normalizePhone(e.target.value))}
                    onFocus={() => setPhoneFocus(true)}
                    onBlur={() => setPhoneFocus(false)}
                    inputMode="numeric"
                    placeholder="22 483 921"
                    aria-label="Téléphone"
                    className="min-w-0 flex-1 bg-white px-3.5 pr-10 text-[15px] text-stone-ink outline-none"
                  />
                  {phoneValid && (
                    <Check className="absolute right-3 top-1/2 size-5 -translate-y-1/2 text-success" strokeWidth={2} />
                  )}
                </div>
                <div className="relative">
                  <Input
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                    placeholder="Prénom (facultatif)"
                    aria-label="Prénom"
                    className="h-12 rounded-[10px] pr-10 text-[15px]"
                  />
                  {prenom.trim() !== "" && (
                    <Check className="absolute right-3 top-1/2 size-5 -translate-y-1/2 text-success" strokeWidth={2} />
                  )}
                </div>
              </section>
            </div>

            {/* CTA footer */}
            <footer className="flex flex-none flex-col gap-2 bg-white px-4 pb-[calc(24px+env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-4px_16px_rgba(28,25,23,0.07)]">
              {isOpen && missing && (
                <div className="text-center text-[13px] text-stone-muted">
                  Il manque : {missing}
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
        {screen === "confirm" && (
          <ConfirmScreen
            orderId={orderId}
            courseNumber={courseNumber}
            order={order.trim()}
            commerceName={commerceLabel}
            fee={fee}
            onProblem={() => toast("Écrivez-nous sur WhatsApp au +216 22 483 921")}
            onInstall={handleInstall}
            showPwa={showPwa}
            onDismissPwa={() => setShowPwa(false)}
          />
        )}

        {/* ---------- CLOSED OVERLAY ---------- */}
        {mounted && !open && screen === "order" && <ClosedOverlay title={closedLabel()} />}
      </div>
    </div>
  );
}
