"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

const EXT_BY_TYPE: Record<(typeof ACCEPTED_TYPES)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function OrganizationBrandingForm({
  organizationId,
  initialName,
  initialLogoPath,
  initialLogoUrl,
}: {
  organizationId: string;
  initialName: string;
  initialLogoPath: string | null;
  initialLogoUrl: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [logoPath, setLogoPath] = useState(initialLogoPath);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setName(initialName);
    setLogoPath(initialLogoPath);
    setLogoUrl(initialLogoUrl);
    setPendingFile(null);
    setRemoveLogo(false);
  }, [initialName, initialLogoPath, initialLogoUrl]);

  useEffect(() => {
    if (!pendingFile) return;
    const objectUrl = URL.createObjectURL(pendingFile);
    setLogoUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [pendingFile]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError("");
    setSuccess("");

    if (!file) {
      setPendingFile(null);
      return;
    }

    if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
      setError("Logo must be a PNG, JPEG, or WebP image.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      setError("Logo must be 2MB or smaller.");
      event.target.value = "";
      return;
    }

    setPendingFile(file);
    setRemoveLogo(false);
  }

  function handleRemoveLogo() {
    setPendingFile(null);
    setRemoveLogo(true);
    setLogoUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Company name is required.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    let nextLogoPath = logoPath;

    try {
      if (removeLogo && logoPath) {
        await supabase.storage.from("organization-logos").remove([logoPath]);
        nextLogoPath = null;
      }

      if (pendingFile) {
        const ext = EXT_BY_TYPE[pendingFile.type as (typeof ACCEPTED_TYPES)[number]];
        const storagePath = `${organizationId}/logo.${ext}`;

        if (logoPath && logoPath !== storagePath) {
          await supabase.storage.from("organization-logos").remove([logoPath]);
        }

        const { error: uploadError } = await supabase.storage
          .from("organization-logos")
          .upload(storagePath, pendingFile, {
            contentType: pendingFile.type,
            upsert: true,
          });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        nextLogoPath = storagePath;
      }

      const { error: updateError } = await supabase
        .from("organizations")
        .update({ name: trimmedName, logo_path: nextLogoPath })
        .eq("id", organizationId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setLogoPath(nextLogoPath);
      setPendingFile(null);
      setRemoveLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";

      if (nextLogoPath) {
        const { data } = await supabase.storage
          .from("organization-logos")
          .createSignedUrl(nextLogoPath, 3600);
        setLogoUrl(data?.signedUrl ?? null);
      } else {
        setLogoUrl(null);
      }

      setSuccess("Company branding saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save branding");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="company_name">Company name</Label>
        <Input
          id="company_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme HVAC"
          disabled={loading}
          required
        />
      </div>

      <div className="space-y-3">
        <Label htmlFor="company_logo">Company logo</Label>
        {logoUrl ? (
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Company logo preview" className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <p className="text-sm text-slate-500">No logo uploaded yet.</p>
        )}
        <Input
          ref={fileInputRef}
          id="company_logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          disabled={loading}
        />
        <p className="text-xs text-slate-500">PNG, JPEG, or WebP. Max 2MB.</p>
        {(logoPath || pendingFile) && !removeLogo && (
          <Button type="button" variant="outline" size="sm" onClick={handleRemoveLogo} disabled={loading}>
            Remove logo
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">{success}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save branding"}
      </Button>
    </form>
  );
}
