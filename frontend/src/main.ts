import Alpine from "alpinejs";

declare global {
  interface Window {
    Alpine: typeof Alpine;
  }
}

type Court = { id: string; number: number; type: "tennis" | "padel"; name?: string; surface?: string; is_active: boolean };

function app() {
  return {
    view: "home" as string,
    user: null as null | { id: string; username: string; role: string },
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

    async init() {
      // Restore guest hold
      this.guestToken = localStorage.getItem("guest_token");
      this.holdExpiresAt = localStorage.getItem("hold_expires_at");
      this.startHoldCountdown();
      await this.loadCourts();
      // Restore session (if token in localStorage)
      const token = localStorage.getItem("token");
      if (token) {
        try {
          const res = await fetch("/api/users/me", { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) this.user = await res.json();
        } catch {}
      }
      // Simple hash routing
      const hash = location.hash.replace("#", "");
      if (hash) this.view = hash;
      window.addEventListener("hashchange", () => {
        this.view = location.hash.replace("#", "") || "home";
      });
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
        // Authenticated: direct booking
        const token = localStorage.getItem("token");
        const res = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ court_id: court.id, date: this.selectedDate, start_time: slot.start }),
        });
        if (res.ok) {
          alert("Booking pending approval");
          this.view = "me";
        } else alert("Booking failed: " + (await res.text()));
      } else {
        // Guest: intent hold
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
        if (diff <= 0) { this.holdCountdown = "expired"; this.guestToken = null; localStorage.removeItem("guest_token"); localStorage.removeItem("hold_expires_at"); if (this._holdTimer) window.clearInterval(this._holdTimer); return; }
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
        body: JSON.stringify({ ...this.regForm, guest_token: this.guestToken || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { this.authError = data.error || JSON.stringify(data); return; }
      if (data.token) localStorage.setItem("token", data.token);
      this.user = data.user || { id: "1", username: this.regForm.username, role: "visitor" };
      localStorage.removeItem("guest_token"); localStorage.removeItem("hold_expires_at");
      this.view = "me";
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
      this.view = "courts";
    },

    logout() {
      localStorage.removeItem("token");
      this.user = null;
      this.view = "home";
    },
  };
}

// Demo fallbacks when API not running
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
