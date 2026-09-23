import Alpine from "alpinejs";
import { detectLang, setLang, t as translate, type Lang } from "./i18n/index.js";

declare global {
  interface Window {
    Alpine: typeof Alpine;
  }
}

type Court = { id: string; number: number; type: "tennis" | "padel"; name?: string; surface?: string; is_active: boolean };

function app() {
  return {
    view: "home" as string,
    lang: "it" as Lang,
    user: null as null | { id: string; username: string; role: string; preferred_language?: Lang },
    filterType: "" as string,
    selectedDate: new Date().toISOString().slice(0, 10),
    courts: [] as Court[],
    availability: {} as Record<string, Array<{ start: string; end: string; status: string }>>,
    guestToken: null as string | null,
    holdExpiresAt: null as string | null,
    holdCountdown: null as string | null,
    _holdTimer: null as number | null,
    authForm: { username: "", password: "" },
    regForm: { username: "", email: "", first_name: "", last_name: "", password: "" },
    authError: "" as string,
    bookings: [] as Array<{ id: string; courtId: string; court_id?: string; date: string; startTime: string; start_time?: string; endTime: string; end_time?: string; status: string; courtNumber?: number; courtType?: string; courtName?: string }>,
    bookingsTab: "upcoming" as "upcoming" | "past" | "all",
    bookingsLoading: false as boolean,
    bookingsError: "" as string,

    t(key: string): string {
      return translate(this.lang, key);
    },

    async setLang(lang: Lang) {
      this.lang = lang;
      setLang(lang);
      if (this.user) {
        const token = localStorage.getItem("token");
        try {
          await fetch("/api/users/me", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ preferred_language: lang }),
          });
        } catch {}
      }
    },

    async init() {
      this.lang = detectLang();
      setLang(this.lang);
      this.guestToken = localStorage.getItem("guest_token");
      this.holdExpiresAt = localStorage.getItem("hold_expires_at");
      this.startHoldCountdown();
      await this.loadCourts();
      const token = localStorage.getItem("token");
      if (token) {
        try {
          const res = await fetch("/api/users/me", { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const me = await res.json();
            this.user = me;
            if (me.preferred_language && ["it","en","fr","de","es"].includes(me.preferred_language)) {
              this.lang = me.preferred_language;
              setLang(this.lang);
              localStorage.setItem("lang", this.lang);
            }
          }
        } catch {}
      }
      const hash = location.hash.replace("#", "");
      if (hash) this.view = hash;
      window.addEventListener("hashchange", () => {
        this.view = location.hash.replace("#", "") || "home";
        if (this.view === "me" && this.user) this.loadBookings();
      });
      if (this.view === "me" && this.user) this.loadBookings();
      // reload bookings when user becomes authed
      this.$watch?.("view", (v: string) => { if (v === "me" && this.user) this.loadBookings(); });
    },

    filteredCourts() {
      if (!this.filterType) return this.courts;
      return this.courts.filter((c) => c.type === this.filterType);
    },

    async loadCourts() {
      try {
        const res = await fetch("/api/courts");
        if (res.ok) this.courts = await res.json();
        else this.courts = demoCourts;
        if (this.courts.length) this.loadAvailability();
      } catch {
        this.courts = demoCourts;
        this.loadAvailability();
      }
    },

    async loadAvailability() {
      for (const c of this.filteredCourts()) {
        try {
          const res = await fetch(`/api/availability?court_id=${c.id}&date=${this.selectedDate}`);
          const data = res.ok ? await res.json() : null;
          this.availability[c.id] = data?.slots || demoSlots();
        } catch {
          this.availability[c.id] = demoSlots();
        }
      }
    },

    async selectSlot(court: Court, slot: { start: string; end: string; status: string }) {
      if (this.user) {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ court_id: court.id, date: this.selectedDate, start_time: slot.start }),
        });
        if (res.ok) {
          await this.loadBookings();
          this.view = "me";
          location.hash = "me";
        } else alert("Booking failed: " + (await res.text()));
      } else {
        const res = await fetch("/api/bookings/intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ court_id: court.id, date: this.selectedDate, start_time: slot.start }),
        });
        const data = await res.json().catch(() => ({}));
        this.guestToken = data.guest_token || "demo-token";
        this.holdExpiresAt = data.expires_at || new Date(Date.now() + 30 * 60000).toISOString();
        if (this.guestToken) localStorage.setItem("guest_token", this.guestToken);
        if (this.holdExpiresAt) localStorage.setItem("hold_expires_at", this.holdExpiresAt);
        this.startHoldCountdown();
        this.view = "register";
      }
    },

    startHoldCountdown() {
      if (this._holdTimer) window.clearInterval(this._holdTimer);
      if (!this.holdExpiresAt) { this.holdCountdown = null; return; }
      const tick = () => {
        const diff = new Date(this.holdExpiresAt!).getTime() - Date.now();
        if (diff <= 0) { this.holdCountdown = this.t("status.expired"); this.guestToken = null; localStorage.removeItem("guest_token"); localStorage.removeItem("hold_expires_at"); if (this._holdTimer) window.clearInterval(this._holdTimer); return; }
        const m = Math.floor(diff / 60000); const s = Math.floor((diff % 60000) / 1000);
        this.holdCountdown = `${m}:${String(s).padStart(2, "0")}`;
      };
      tick();
      this._holdTimer = window.setInterval(tick, 1000);
    },

    async register() {
      this.authError = "";
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...this.regForm, preferred_language: this.lang, guest_token: this.guestToken || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { this.authError = data.error || JSON.stringify(data); return; }
      if (data.token) localStorage.setItem("token", data.token);
      this.user = data.user || { id: "1", username: this.regForm.username, role: "visitor", preferred_language: this.lang };
      localStorage.removeItem("guest_token"); localStorage.removeItem("hold_expires_at");
      await this.loadBookings();
      this.view = "me";
      location.hash = "me";
    },

    async login() {
      this.authError = "";
      const body: any = { password: this.authForm.password };
      if (this.authForm.username.includes("@")) body.email = this.authForm.username; else body.username = this.authForm.username;
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { this.authError = data.error || "Login failed"; return; }
      if (data.token) localStorage.setItem("token", data.token);
      this.user = data.user || null;
      if (data.user?.preferred_language) {
        this.lang = data.user.preferred_language;
        setLang(this.lang);
        localStorage.setItem("lang", this.lang);
      }
      await this.loadBookings();
      this.view = "me";
      location.hash = "me";
    },

    filteredBookings() {
      const today = new Date().toISOString().slice(0, 10);
      if (this.bookingsTab === "all") return this.bookings;
      if (this.bookingsTab === "upcoming") return this.bookings.filter((b) => b.date >= today && !["cancelled","rejected","expired"].includes(b.status));
      return this.bookings.filter((b) => b.date < today || ["cancelled","rejected","expired"].includes(b.status));
    },

    courtLabel(b: any): string {
      if (b.courtName) return `${b.courtName} (#${b.courtNumber})`;
      const c = this.courts.find((x) => x.id === (b.courtId || b.court_id));
      if (c) return `Court ${c.number} · ${c.type}${c.name ? " · "+c.name : ""}`;
      return (b.courtId || b.court_id || "").slice(0,8);
    },

    statusClass(status: string): string {
      if (status === "approved") return "bg-emerald-100 text-emerald-700";
      if (status === "pending_approval" || status === "pending_registration") return "bg-amber-100 text-amber-700";
      if (status === "rejected" || status === "cancelled" || status === "expired") return "bg-zinc-200 text-zinc-600";
      return "bg-zinc-100";
    },

    async loadBookings() {
      if (!this.user) { this.bookings = []; return; }
      this.bookingsLoading = true; this.bookingsError = "";
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/bookings?mine=true", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(await res.text());
        const rows = await res.json();
        // normalize snake/camel + enrich with court info
        this.bookings = (rows as any[]).map((r) => ({
          id: r.id,
          courtId: r.courtId || r.court_id,
          date: r.date,
          startTime: (r.startTime || r.start_time || "").slice(0,5),
          endTime: (r.endTime || r.end_time || "").slice(0,5),
          status: r.status,
          courtNumber: r.courtNumber,
          courtType: r.courtType,
          courtName: r.courtName,
        })).sort((a,b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));
      } catch (e: any) {
        this.bookingsError = e.message || String(e);
      } finally { this.bookingsLoading = false; }
    },

    async cancelBooking(id: string) {
      if (!confirm("Cancel this booking?")) return;
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/bookings/${id}/cancel`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { alert("Cancel failed: " + await res.text()); return; }
      await this.loadBookings();
      await this.loadAvailability();
    },

    logout() {
      localStorage.removeItem("token");
      this.user = null;
      this.view = "home";
    },
  };
}

const demoCourts: Court[] = [
  { id: "c1", number: 1, type: "tennis", name: "Central Tennis", surface: "clay", is_active: true },
  { id: "c2", number: 2, type: "tennis", surface: "synthetic", is_active: true },
  { id: "c3", number: 3, type: "padel", name: "Padel 1", is_active: true },
  { id: "c4", number: 4, type: "padel", name: "Padel 2", is_active: true },
];
function demoSlots() {
  const slots: Array<{ start: string; end: string; status: string }> = [];
  for (let h = 8; h < 22; h++) slots.push({ start: `${String(h).padStart(2, "0")}:00`, end: `${String(h + 1).padStart(2, "0")}:00`, status: Math.random() > 0.7 ? "booked" : "available" });
  return slots;
}

// @ts-ignore
window.app = app;
Alpine.start();
