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
    pendingIntent: null as null | { courtId: string; date: string; startTime: string; courtLabel?: string; courtType?: string; notes?: string; rentRacquets?: number; players?: number },
    confirmNotes: "" as string,
    confirmRent: 0 as number,
    confirmPlayers: "single" as "single" | "double",
    holdCountdown: null as string | null,
    _holdTimer: null as number | null,
    authForm: { username: "", password: "" },
    regForm: { username: "", email: "", first_name: "", last_name: "", password: "" },
    authError: "" as string,
    bookings: [] as Array<{ id: string; courtId: string; court_id?: string; date: string; startTime: string; start_time?: string; endTime: string; end_time?: string; status: string; notes?: string; rentRacquets?: number; players?: number; courtNumber?: number; courtType?: string; courtName?: string }>,
    bookingsTab: "upcoming" as "upcoming" | "past" | "all",
    bookingsLoading: false as boolean,
    bookingsError: "" as string,
    adminBookings: [] as Array<{ id: string; courtId: string; date: string; startTime: string; endTime: string; status: string; userId?: string; notes?: string; rentRacquets?: number; players?: number }>,
    adminLoading: false as boolean,
    adminError: "" as string,
    adminFilter: "pending_approval" as string,
    adminSettings: null as null | { auto_approve_bookings: boolean; booking_hold_minutes: number },
    profileForm: { username: "", email: "", first_name: "", last_name: "", mobile: "", gender: "", birthdate: "", preferred_language: "it" as Lang },
    profileLoading: false as boolean,
    profileError: "" as string,
    profileSuccess: "" as string,
    editingBooking: null as string | null,
    editNotes: "" as string,
    editRent: 0 as number,
    editPlayers: "single" as "single" | "double",
    timetableAdminSelected: null as null | { bookingId: string; courtId: string; date: string; startTime: string },

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
      try { this.pendingIntent = JSON.parse(localStorage.getItem("pending_booking_intent") || "null"); } catch { this.pendingIntent = null; }
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
        if (this.view === "profile" && this.user) this.loadProfile();
        if (this.view === "admin" && this.user?.role === "admin") { this.loadAdminBookings(); this.loadAdminSettings(); }
      });
      if (this.view === "me" && this.user) this.loadBookings();
      if (this.view === "profile" && this.user) this.loadProfile();
      if (this.view === "admin" && this.user?.role === "admin") { this.loadAdminBookings(); this.loadAdminSettings(); }
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

    async selectSlot(court: Court, slot: { start: string; end: string; status: string; bookingId?: string | null }) {
      // Admin clicking a pending slot → show approve/reject inline
      if ((slot as any).status === "pending_approval" && this.user?.role === "admin" && (slot as any).bookingId) {
        this.timetableAdminSelected = { bookingId: (slot as any).bookingId, courtId: court.id, date: this.selectedDate, startTime: slot.start };
        return;
      }
      const defaultPlayers = court.type === "padel" ? "double" as const : "single" as const;
      this.pendingIntent = { courtId: court.id, date: this.selectedDate, startTime: slot.start, courtLabel: `Court ${court.number} · ${court.type}`, courtType: court.type };
      this.confirmNotes = "";
      this.confirmRent = 0;
      this.confirmPlayers = defaultPlayers;
      localStorage.setItem("pending_booking_intent", JSON.stringify({ ...this.pendingIntent, notes: "", rentRacquets: 0, players: defaultPlayers === "single" ? 2 : 4 }));
      this.view = "confirm";
      location.hash = "confirm";
    },

    async timetableApprove() {
      if (!this.timetableAdminSelected) return;
      await this.approveBooking(this.timetableAdminSelected.bookingId);
      this.timetableAdminSelected = null;
    },

    async timetableReject() {
      if (!this.timetableAdminSelected) return;
      await this.rejectBooking(this.timetableAdminSelected.bookingId);
      this.timetableAdminSelected = null;
    },

    async confirmBooking() {
      if (!this.pendingIntent) return;
      const payload: any = {
        court_id: this.pendingIntent.courtId,
        date: this.pendingIntent.date,
        start_time: this.pendingIntent.startTime,
        notes: this.confirmNotes || null,
        rent_racquets: this.confirmRent,
        players: this.confirmPlayers === "single" ? 2 : 4,
      };
      // Store latest choices into pendingIntent for deferred register flow
      this.pendingIntent.notes = this.confirmNotes;
      this.pendingIntent.rentRacquets = this.confirmRent;
      this.pendingIntent.players = payload.players;
      localStorage.setItem("pending_booking_intent", JSON.stringify(this.pendingIntent));

      if (!this.user) {
        this.view = "register";
        location.hash = "register";
        return;
      }
      const token = localStorage.getItem("token");
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { alert("Booking failed: " + (await res.text())); return; }
      localStorage.removeItem("pending_booking_intent");
      this.pendingIntent = null;
      await this.loadBookings();
      if (this.user.role === "admin") await this.loadAdminBookings();
      await this.loadAvailability();
      this.view = "me";
      location.hash = "me";
    },

    cancelConfirm() {
      this.view = "courts";
      location.hash = "courts";
    },

    async register() {
      this.authError = "";
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...this.regForm, preferred_language: this.lang }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { this.authError = data.error || JSON.stringify(data); return; }
      if (data.token) localStorage.setItem("token", data.token);
      this.user = data.user || { id: "1", username: this.regForm.username, role: "visitor", preferred_language: this.lang };
      // After registration, create the deferred booking if intent exists (with notes/rent/players from confirm)
      if (this.pendingIntent) {
        const token = data.token;
        const payload: any = { court_id: this.pendingIntent.courtId, date: this.pendingIntent.date, start_time: this.pendingIntent.startTime };
        if (this.pendingIntent.notes) payload.notes = this.pendingIntent.notes;
        if (this.pendingIntent.rentRacquets !== undefined) payload.rent_racquets = this.pendingIntent.rentRacquets;
        if (this.pendingIntent.players) payload.players = this.pendingIntent.players;
        else {
          // fallback defaults per court type
          const c = this.courts.find((x) => x.id === this.pendingIntent!.courtId);
          payload.players = c?.type === "padel" ? 4 : 2;
        }
        const bookingRes = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (!bookingRes.ok) {
          const err = await bookingRes.text();
          this.authError = `Registered but booking failed: ${err} — you can retry from Courts`;
        }
        localStorage.removeItem("pending_booking_intent");
        this.pendingIntent = null;
      }
      await this.loadBookings();
      // Admin lands on his own bookings too
      this.view = "me";
      location.hash = "me";
      if (this.user?.role === "admin") { this.loadAdminBookings(); this.loadAdminSettings(); }
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
      // If guest had a deferred intent, create booking now (also for existing users) with stored notes/rent/players
      if (this.pendingIntent) {
        const token = data.token;
        const payload: any = { court_id: this.pendingIntent.courtId, date: this.pendingIntent.date, start_time: this.pendingIntent.startTime };
        if (this.pendingIntent.notes) payload.notes = this.pendingIntent.notes;
        if (this.pendingIntent.rentRacquets !== undefined) payload.rent_racquets = this.pendingIntent.rentRacquets;
        if (this.pendingIntent.players) payload.players = this.pendingIntent.players;
        const bookingRes = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (!bookingRes.ok) {
          const err = await bookingRes.text();
          this.authError = `Login ok but booking failed: ${err}`;
        }
        localStorage.removeItem("pending_booking_intent");
        this.pendingIntent = null;
      }
      await this.loadBookings();
      if (this.user?.role === "admin") { await this.loadAdminBookings(); await this.loadAdminSettings(); }
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
          notes: r.notes,
          rentRacquets: r.rentRacquets ?? r.rent_racquets ?? 0,
          players: r.players ?? 2,
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

    async loadAdminBookings() {
      if (!this.user || this.user.role !== "admin") return;
      this.adminLoading = true; this.adminError = "";
      try {
        const token = localStorage.getItem("token");
        const q = this.adminFilter ? `?status=${this.adminFilter}` : "";
        const res = await fetch(`/api/bookings${q}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(await res.text());
        const rows = await res.json();
        this.adminBookings = (rows as any[]).map((r) => ({
          id: r.id,
          courtId: r.courtId || r.court_id,
          date: r.date,
          startTime: (r.startTime || r.start_time || "").slice(0,5),
          endTime: (r.endTime || r.end_time || "").slice(0,5),
          status: r.status,
          userId: r.userId || r.user_id,
          notes: r.notes,
          rentRacquets: r.rentRacquets ?? r.rent_racquets ?? 0,
          players: r.players ?? 2,
        }));
      } catch (e: any) { this.adminError = e.message || String(e); }
      finally { this.adminLoading = false; }
    },

    async approveBooking(id: string) {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/bookings/${id}/approve`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { alert("Approve failed: " + await res.text()); return; }
      await this.loadAdminBookings(); await this.loadBookings(); await this.loadAvailability();
    },

    async rejectBooking(id: string) {
      if (!confirm("Reject this booking?")) return;
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/bookings/${id}/reject`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { alert("Reject failed: " + await res.text()); return; }
      await this.loadAdminBookings(); await this.loadBookings(); await this.loadAvailability();
    },

    async loadAdminSettings() {
      if (!this.user || this.user.role !== "admin") return;
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/settings", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) this.adminSettings = await res.json();
      } catch {}
    },

    async toggleAutoApprove() {
      if (!this.adminSettings) return;
      const next = !this.adminSettings.auto_approve_bookings;
      const token = localStorage.getItem("token");
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ auto_approve_bookings: next }) });
      if (!res.ok) { alert("Settings failed: " + await res.text()); return; }
      this.adminSettings.auto_approve_bookings = next;
    },

    async loadProfile() {
      if (!this.user) return;
      this.profileLoading = true; this.profileError = ""; this.profileSuccess = "";
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/users/me", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(await res.text());
        const me = await res.json();
        this.profileForm = {
          username: me.username || "",
          email: me.email || "",
          first_name: me.first_name || me.firstName || "",
          last_name: me.last_name || me.lastName || "",
          mobile: me.mobile || "",
          gender: me.gender || "",
          birthdate: me.birthdate ? String(me.birthdate).slice(0,10) : "",
          preferred_language: me.preferred_language || me.preferredLanguage || this.lang,
        };
        this.user = me;
      } catch (e: any) { this.profileError = e.message || String(e); }
      finally { this.profileLoading = false; }
    },

    async saveProfile() {
      this.profileError = ""; this.profileSuccess = "";
      const token = localStorage.getItem("token");
      const payload: any = {};
      if (this.profileForm.username) payload.username = this.profileForm.username;
      if (this.profileForm.email) payload.email = this.profileForm.email;
      if (this.profileForm.first_name) payload.first_name = this.profileForm.first_name;
      if (this.profileForm.last_name) payload.last_name = this.profileForm.last_name;
      if (this.profileForm.mobile !== undefined) payload.mobile = this.profileForm.mobile || null;
      if (this.profileForm.gender) payload.gender = this.profileForm.gender || null;
      if (this.profileForm.birthdate) payload.birthdate = this.profileForm.birthdate || null;
      if (this.profileForm.preferred_language) payload.preferred_language = this.profileForm.preferred_language;
      const res = await fetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      if (!res.ok) { this.profileError = await res.text(); return; }
      const updated = await res.json();
      this.profileSuccess = "Profile updated";
      if (updated.preferred_language) { this.lang = updated.preferred_language; setLang(this.lang); localStorage.setItem("lang", this.lang); }
      this.user = { ...this.user, ...updated };
    },

    startEditBooking(b: any) {
      this.editingBooking = b.id;
      this.editNotes = b.notes || "";
      this.editRent = b.rentRacquets ?? 0;
      this.editPlayers = b.players === 4 ? "double" : "single";
    },

    cancelEditBooking() { this.editingBooking = null; },

    async saveEditBooking(id: string) {
      const token = localStorage.getItem("token");
      const payload: any = { notes: this.editNotes || null, rent_racquets: this.editRent, players: this.editPlayers === "single" ? 2 : 4 };
      const res = await fetch(`/api/bookings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      if (!res.ok) { alert("Edit failed: " + await res.text()); return; }
      this.editingBooking = null;
      await this.loadBookings();
      if (this.user?.role === "admin") await this.loadAdminBookings();
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
