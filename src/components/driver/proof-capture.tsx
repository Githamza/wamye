"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/browser";

/**
 * Optional delivery proof.
 *
 * Uploads straight from the browser to Supabase Storage rather than through a
 * Server Action: an action body is capped at 1 MB and a phone photo is 2–5 MB,
 * and the upload would block the action queue — meaning the driver could not
 * tap anything else while it ran. The proofs_insert policy (migration 0016)
 * pins the object to {tenant_id}/…, so letting the client pick the path is safe.
 *
 * Resized before upload: a driver on 3G in Djerba should not be pushing 5 MB.
 */

const MAX_EDGE = 1280;
const QUALITY = 0.7;

async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("canvas encode failed")),
      "image/jpeg",
      QUALITY,
    );
  });
}

export function ProofCapture({
  tenantId,
  orderId,
  onCaptured,
}: {
  tenantId: string;
  orderId: string;
  /** Called with the storage path once the upload lands. */
  onCaptured: (path: string) => void;
}) {
  const t = useTranslations("Dashboard.course");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handle(file: File) {
    setBusy(true);
    setFailed(false);
    try {
      const blob = await shrink(file);
      const path = `${tenantId}/${orderId}/${crypto.randomUUID()}.jpg`;
      const supabase = createClient();
      const { error } = await supabase.storage
        .from("delivery-proofs")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      setDone(true);
      onCaptured(path);
    } catch {
      // Never blocking: the driver can still close the course without a photo.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handle(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="flex h-10 items-center justify-center rounded-[8px] border border-hair px-3 text-[13px] font-medium text-stone-ink transition-colors hover:bg-hair-2 disabled:opacity-60"
      >
        {busy ? t("proofUploading") : done ? t("proofDone") : t("proofAdd")}
      </button>
      {failed && (
        <p className="text-[12px] text-stone-muted">{t("proofFailed")}</p>
      )}
    </div>
  );
}
