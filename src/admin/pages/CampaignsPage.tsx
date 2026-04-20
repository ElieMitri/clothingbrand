import { useMemo, useState } from "react";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { Mail, Send } from "lucide-react";
import { db } from "../../lib/firebase";
import { EmptyState } from "../components/EmptyState";
import { FormSection } from "../components/FormSection";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../hooks/useToast";
import { useAdminLiveData } from "../hooks/useAdminLiveData";

export function CampaignsPage() {
  const { showToast } = useToast();
  const { newsletterSubscribers, customers } = useAdminLiveData();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    audience: "newsletter" as "newsletter" | "customers" | "custom",
    customRecipients: "",
    subject: "",
    message: "",
  });

  const recipients = useMemo(() => {
    if (form.audience === "custom") {
      return Array.from(
        new Set(
          form.customRecipients
            .split(/[,\n]/)
            .map((entry) => entry.trim().toLowerCase())
            .filter(Boolean)
        )
      );
    }
    if (form.audience === "customers") {
      return Array.from(
        new Set(
          customers
            .map((entry) => String(entry.email || "").trim().toLowerCase())
            .filter((entry) => entry && entry !== "-")
        )
      );
    }
    return Array.from(
      new Set(
        newsletterSubscribers
          .map((entry) => String(entry.email || "").trim().toLowerCase())
          .filter(Boolean)
      )
    );
  }, [customers, form.audience, form.customRecipients, newsletterSubscribers]);

  const sendCampaign = async () => {
    const subject = form.subject.trim();
    const message = form.message.trim();
    if (!subject || !message) {
      showToast({ title: "Subject and message are required" });
      return;
    }
    if (recipients.length === 0) {
      showToast({ title: "No recipients found for selected audience" });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/send-newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message, recipients }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || `HTTP ${response.status}`));
      }

      await addDoc(collection(db, "campaign_logs"), {
        audience: form.audience,
        subject,
        message,
        recipients_count: recipients.length,
        sent_count: Number(payload?.sent_count || 0),
        failed_count: Number(payload?.failed_count || 0),
        created_at: Timestamp.now(),
      });

      showToast({
        title: "Campaign sent",
        description: `Delivered to ${Number(payload?.sent_count || 0)} recipients.`,
      });
      setForm((prev) => ({ ...prev, subject: "", message: "", customRecipients: "" }));
    } catch (error) {
      console.error("Failed to send campaign", error);
      showToast({
        title: "Send failed",
        description: error instanceof Error ? error.message : "Could not send campaign.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-page">
      <PageHeader
        title="Campaigns"
        breadcrumbs={[{ label: "Admin", href: "/admin/overview" }, { label: "Campaigns" }]}
        description="Create and send email campaigns from the admin panel."
        primaryAction={
          <button type="button" className="adm-button adm-button--primary" onClick={sendCampaign}>
            <Send size={16} />
            {saving ? "Sending..." : "Send campaign"}
          </button>
        }
      />

      <section className="adm-grid adm-grid--two">
        <FormSection title="Campaign composer" description="Sends through `/api/send-newsletter`.">
          <label>
            Audience
            <select
              className="adm-input"
              value={form.audience}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  audience: event.target.value as "newsletter" | "customers" | "custom",
                }))
              }
            >
              <option value="newsletter">Newsletter subscribers</option>
              <option value="customers">All customers</option>
              <option value="custom">Custom list</option>
            </select>
          </label>
          <label className="adm-form-grid__full">
            Subject
            <input
              className="adm-input"
              value={form.subject}
              onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
            />
          </label>
          <label className="adm-form-grid__full">
            Message
            <textarea
              className="adm-input"
              rows={8}
              value={form.message}
              onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
            />
          </label>
          {form.audience === "custom" ? (
            <label className="adm-form-grid__full">
              Custom recipients (comma or newline separated)
              <textarea
                className="adm-input"
                rows={4}
                value={form.customRecipients}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, customRecipients: event.target.value }))
                }
                placeholder="user1@example.com, user2@example.com"
              />
            </label>
          ) : null}
        </FormSection>

        <article className="adm-card adm-panel">
          <header className="adm-panel__header">
            <h3>Audience preview</h3>
            <span className="adm-muted">{recipients.length} recipients</span>
          </header>
          {recipients.length === 0 ? (
            <EmptyState title="No recipients" description="Choose a different audience or add custom emails." />
          ) : (
            <div className="adm-mini-table">
              {recipients.slice(0, 25).map((email) => (
                <div key={email} className="adm-mini-table__row">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Mail size={14} />
                    {email}
                  </span>
                </div>
              ))}
              {recipients.length > 25 ? (
                <p className="adm-muted">+{recipients.length - 25} more recipients</p>
              ) : null}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
