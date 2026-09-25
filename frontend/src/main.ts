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
    adminBookings: [] as Array<{ id: string; courtId: string; date: string; startTime: string; endTime: string; status: string; userId?: string; username?: string; notes?: string; rentRacquets?: number; players?: number }>,
    adminUsers: [] as any[],
    adminUsersLoading: false as boolean,
    adminUsersError: "" as string,
    adminUsersSearch: "" as string,
    adminUsersRole: "" as string,
    viewedUser: null as any | null,
    viewedUserBack: "admin-users" as string,
    adminLoading: false as boolean,
    adminError: "" as string,
    adminFilter: "pending_approval" as string,
    adminSettings: null as null | { auto_approve_bookings: boolean; booking_hold_minutes: number },
    clubInfo: null as null | { club_name: string; club_phone: string; club_address: string },
    clubInfoLoading: false as boolean,
    clubInfoError: "" as string,
    clubInfoSuccess: "" as string,
    clubForm: { club_name: "" as string, club_phone: "" as string, club_address: "" as string } as { club_name: string; club_phone: string; club_address: string },
    adminCourts: [] as Court[],
    adminCourtsLoading: false as boolean,
    adminCourtError: "" as string,
    adminCourtSuccess: "" as string,
    adminCourtForm: { number: null as number | null, type: "tennis" as "tennis" | "padel", name: "", surface: "" } as { number: number | null; type: "tennis" | "padel"; name: string; surface: string },
    editingCourtId: null as string | null,
    profileForm: { username: "", email: "", first_name: "", last_name: "", mobile: "", gender: "", birthdate: "", preferred_language: "it" as Lang, preferred_sport: "" as "" | "tennis" | "padel" },
    profileLoading: false as boolean,
    profileError: "" as string,
    profileSuccess: "" as string,
    editingBooking: null as string | null,
    editNotes: "" as string,
    editRent: 0 as number,
    editPlayers: "single" as "single" | "double",
    timetableAdminSelected: null as null | { bookingId: string; courtId: string; date: string; startTime: string; status: string },
    headerLangOpen: false as boolean,
    registerLangOpen: false as boolean,
    profileLangOpen: false as boolean,
    adminMobileOpen: false as boolean,

    t(key: string): string {
      return translate(this.lang, key);
    },

    flagUrl(lang: string): string {
      const code = lang === "en" ? "gb" : lang;
      return `https://flagcdn.com/w20/${code}.png`;
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
      await this.loadClubInfo();
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
            // Preset timetable filter from preferred sport (not mandatory)
            if (me.preferred_sport && ["tennis","padel"].includes(me.preferred_sport)) {
              this.filterType = me.preferred_sport;
              // reload availability with preset filter
              this.loadAvailability();
            }
          }
        } catch {}
      }
      const hash = location.hash.replace("#", "");
      if (hash) this.view = hash;
      window.addEventListener("hashchange", () => {
        this.view = location.hash.replace("#", "") || "home";
        if (this.view === "admin") { this.view = "admin-bookings"; location.hash = "admin-bookings"; }
        if (this.view === "me" && this.user) this.loadBookings();
        if (this.view === "profile" && this.user) this.loadProfile();
        if (this.view === "admin-bookings" && this.user?.role === "admin") { this.loadAdminBookings(); this.loadAdminSettings(); }
        if (this.view === "admin-courts" && this.user?.role === "admin") this.loadAdminCourts();
        if (this.view === "admin-users" && this.user?.role === "admin") this.loadAdminUsers();
        if (this.view === "admin-create-user" && this.user?.role === "admin") this.loadAdminUsers();
        if (this.view === "admin-blocks" && this.user?.role === "admin") { this.loadAdminLessons(); this.loadAdminBlocks(); this.loadAdminCourts(); }
        if (this.view === "admin-club" && this.user?.role === "admin") this.loadAdminClubInfo();
      });
      if (this.view === "me" && this.user) this.loadBookings();
      if (this.view === "profile" && this.user) this.loadProfile();
      if (this.view === "admin") { this.view = "admin-bookings"; location.hash = "admin-bookings"; }
      if (this.view === "admin-bookings" && this.user?.role === "admin") { this.loadAdminBookings(); this.loadAdminSettings(); }
      if (this.view === "admin-courts" && this.user?.role === "admin") this.loadAdminCourts();
      if (this.view === "admin-users" && this.user?.role === "admin") this.loadAdminUsers();
      if (this.view === "admin-create-user" && this.user?.role === "admin") this.loadAdminUsers();
      if (this.view === "admin-blocks" && this.user?.role === "admin") { this.loadAdminLessons(); this.loadAdminBlocks(); this.loadAdminCourts(); }
      if (this.view === "admin-club" && this.user?.role === "admin") this.loadAdminClubInfo();
    },

    isPastSlot(slot: { start: string }): boolean {
      const tz = "Europe/Rome";
      const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
      if (this.selectedDate < today) return true;
      if (this.selectedDate > today) return false;
      const now = new Date().toLocaleTimeString("en-GB", { timeZone: tz, hour12: false }).slice(0, 5);
      return slot.start < now;
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
      // Admin clicking any booked/pending slot → show approve/reject inline (can reject any booking)
      const isBookedSlot = (slot as any).status === "pending_approval" || (slot as any).status === "booked";
      if (isBookedSlot && this.user?.role === "admin" && (slot as any).bookingId) {
        this.timetableAdminSelected = { bookingId: (slot as any).bookingId, courtId: court.id, date: this.selectedDate, startTime: slot.start, status: (slot as any).status };
        return;
      }
      const defaultPlayers = court.type === "padel" ? "double" as const : "single" as const;
      this.pendingIntent = { courtId: court.id, date: this.selectedDate, startTime: slot.start, courtLabel: `${court.name || `Court ${court.number}`} · ${court.type}`, courtType: court.type };
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
      if (!res.ok) {
        // Nice localized error list instead of technical JSON
        if (data.fieldErrors || data.formErrors) {
          const lines: string[] = [];
          const fe = (data.fieldErrors || {}) as Record<string, string[]>;
          for (const [field, errs] of Object.entries(fe)) {
            const fieldLabel = this.t(`field.${field}`);
            const label = fieldLabel === `field.${field}` ? field : fieldLabel;
            const vKey = `validation.${field}`;
            const vMsg = this.t(vKey);
            const msg = vMsg === vKey ? (errs as string[]).join(", ") : vMsg;
            lines.push(`• ${label}: ${msg}`);
          }
          for (const e of (data.formErrors as string[] || [])) lines.push(`• ${e}`);
          if (lines.length === 0) lines.push(`• ${this.t("validation.generic")}`);
          this.authError = lines.join("\n");
          return;
        }
        if (data.error) {
          const errStr = String(data.error).toLowerCase();
          if (errStr.includes("already taken") || errStr.includes("unique") || errStr.includes("23505")) {
            this.authError = `• ${this.t("error.taken")}`;
          } else {
            this.authError = `• ${data.error}`;
          }
          return;
        }
        this.authError = `• ${this.t("error.registerFailed")}\n${JSON.stringify(data)}`;
        return;
      }
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
      // Admin lands on bookings, visitor on my bookings
      if (this.user?.role === "admin") {
        this.view = "admin-bookings";
        location.hash = "admin-bookings";
        this.loadAdminBookings(); this.loadAdminSettings();
      } else {
        this.view = "me";
        location.hash = "me";
      }
    },

    async login() {
      this.authError = "";
      const body: any = { password: this.authForm.password };
      if (this.authForm.username.includes("@")) body.email = this.authForm.username; else body.username = this.authForm.username;
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors || data.formErrors) {
          const lines: string[] = [];
          const fe = (data.fieldErrors || {}) as Record<string, string[]>;
          for (const [field, errs] of Object.entries(fe)) {
            const fieldLabel = this.t(`field.${field}`);
            const label = fieldLabel === `field.${field}` ? field : fieldLabel;
            const vKey = `validation.${field}`;
            const vMsg = this.t(vKey);
            const msg = vMsg === vKey ? (errs as string[]).join(", ") : vMsg;
            lines.push(`• ${label}: ${msg}`);
          }
          for (const e of (data.formErrors as string[] || [])) lines.push(`• ${e}`);
          if (lines.length === 0) lines.push(`• ${this.t("validation.generic")}`);
          this.authError = lines.join("\n");
          return;
        }
        if (data.error && String(data.error).toLowerCase().includes("invalid credentials")) {
          this.authError = `• ${this.t("error.loginFailed")}`;
        } else {
          this.authError = `• ${data.error || this.t("error.loginFailed")}`;
        }
        return;
      }
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
      if (this.user?.role === "admin") {
        await this.loadAdminBookings(); await this.loadAdminSettings();
        this.view = "admin-bookings";
        location.hash = "admin-bookings";
      } else {
        this.view = "me";
        location.hash = "me";
      }
    },

    filteredBookings() {
      const today = new Date().toISOString().slice(0, 10);
      if (this.bookingsTab === "all") return this.bookings;
      if (this.bookingsTab === "upcoming") return this.bookings.filter((b) => b.date >= today && !["cancelled","rejected","expired"].includes(b.status));
      return this.bookings.filter((b) => b.date < today || ["cancelled","rejected","expired"].includes(b.status));
    },

    courtLabel(b: any): string {
      if (b.courtName) return `${b.courtName} · ${b.courtType || ""}`.trim();
      const c = this.courts.find((x) => x.id === (b.courtId || b.court_id));
      if (c) return `${c.name || `Court ${c.number}`} · ${c.type}`;
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
          username: r.username,
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

    async loadClubInfo() {
      try {
        const res = await fetch("/api/club-info");
        if (res.ok) {
          this.clubInfo = await res.json();
          this.clubForm = { club_name: this.clubInfo?.club_name || "", club_phone: this.clubInfo?.club_phone || "", club_address: this.clubInfo?.club_address || "" };
        }
      } catch {}
    },
    async loadAdminClubInfo() {
      if (!this.user || this.user.role !== "admin") return;
      this.clubInfoLoading = true; this.clubInfoError = ""; this.clubInfoSuccess = "";
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/settings", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const s = await res.json();
          this.clubForm = { club_name: s.club_name || "", club_phone: s.club_phone || "", club_address: s.club_address || "" };
          this.clubInfo = { club_name: s.club_name, club_phone: s.club_phone, club_address: s.club_address };
        }
      } catch (e: any) { this.clubInfoError = e.message || String(e); }
      finally { this.clubInfoLoading = false; }
    },
    async saveClubInfo() {
      this.clubInfoError = ""; this.clubInfoSuccess = "";
      const token = localStorage.getItem("token");
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ club_name: this.clubForm.club_name || null, club_phone: this.clubForm.club_phone || null, club_address: this.clubForm.club_address || null }) });
      if (!res.ok) { this.clubInfoError = await res.text(); return; }
      this.clubInfoSuccess = this.t("admin.club.saved");
      await this.loadClubInfo();
    },

    async loadAdminCourts() {
      if (!this.user || this.user.role !== "admin") return;
      this.adminCourtsLoading = true; this.adminCourtError = "";
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/courts", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(await res.text());
        this.adminCourts = await res.json();
      } catch (e: any) { this.adminCourtError = e.message || String(e); }
      finally { this.adminCourtsLoading = false; }
    },

    async createCourt() {
      this.adminCourtError = ""; this.adminCourtSuccess = "";
      if (!this.adminCourtForm.number || !this.adminCourtForm.type) { this.adminCourtError = "Number and type required"; return; }
      const token = localStorage.getItem("token");
      const res = await fetch("/api/courts", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ number: this.adminCourtForm.number, type: this.adminCourtForm.type, name: this.adminCourtForm.name || null, surface: this.adminCourtForm.surface || null }) });
      if (!res.ok) { this.adminCourtError = await res.text(); return; }
      this.adminCourtSuccess = this.t("admin.courts.created");
      this.adminCourtForm = { number: null, type: "tennis", name: "", surface: "" };
      await this.loadAdminCourts(); await this.loadCourts();
    },

    startEditCourt(c: Court) {
      this.editingCourtId = c.id;
      this.adminCourtForm = { number: c.number, type: c.type as any, name: c.name || "", surface: c.surface || "" };
    },

    cancelEditCourt() { this.editingCourtId = null; this.adminCourtForm = { number: null, type: "tennis", name: "", surface: "" }; this.adminCourtError = ""; },

    async updateCourt() {
      if (!this.editingCourtId) return;
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/courts/${this.editingCourtId}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ number: this.adminCourtForm.number, type: this.adminCourtForm.type, name: this.adminCourtForm.name || null, surface: this.adminCourtForm.surface || null }) });
      if (!res.ok) { this.adminCourtError = await res.text(); return; }
      this.adminCourtSuccess = this.t("admin.courts.updated");
      this.editingCourtId = null;
      this.adminCourtForm = { number: null, type: "tennis", name: "", surface: "" };
      await this.loadAdminCourts(); await this.loadCourts();
    },

    async deleteCourt(id: string) {
      if (!confirm("Disable this court? It will be hidden from booking but keep history.")) return;
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/courts/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { alert("Delete failed: " + await res.text()); return; }
      await this.loadAdminCourts(); await this.loadCourts();
    },

    // Recurring lessons (blockingRules)
    adminLessons: [] as Array<{ id: string; courtId: string | null; dayOfWeek: number; startTime: string; endTime: string; reason: string; isActive: boolean }>,
    adminLessonsLoading: false as boolean,
    adminLessonError: "" as string,
    adminLessonForm: { courtId: "" as string, dayOfWeek: 1 as number, startTime: "15:00", endTime: "17:00", reason: "" } as { courtId: string; dayOfWeek: number; startTime: string; endTime: string; reason: string },
    editingLessonId: null as string | null,
    // Ad-hoc blocks (spot blocks)
    adminBlocks: [] as Array<{ id: string; courtId: string | null; startAt: string; endAt: string; reason: string }>,
    adminBlocksLoading: false as boolean,
    adminBlockError: "" as string,
    adminBlockForm: { courtId: "" as string, date: "" as string, startTime: "10:00" as string, endTime: "12:00" as string, reason: "" as string } as { courtId: string; date: string; startTime: string; endTime: string; reason: string },
    editingBlockId: null as string | null,
    adminUserForm: { username: "", email: "", password: "", first_name: "", last_name: "", role: "visitor" as string, mobile: "" } as { username: string; email: string; password: string; first_name: string; last_name: string; role: string; mobile: string },
    editingUserId: null as string | null,
    adminUserSuccess: "" as string,

    async loadAdminLessons() {
      if (!this.user || this.user.role !== "admin") return;
      this.adminLessonsLoading = true; this.adminLessonError = "";
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/blocking-rules", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(await res.text());
        this.adminLessons = await res.json();
      } catch (e: any) { this.adminLessonError = e.message || String(e); }
      finally { this.adminLessonsLoading = false; }
    },

    async createLesson() {
      if (!this.adminLessonForm.reason || !this.adminLessonForm.startTime || !this.adminLessonForm.endTime) { this.adminLessonError = "Reason and times required"; return; }
      const token = localStorage.getItem("token");
      const payload: any = { day_of_week: this.adminLessonForm.dayOfWeek, start_time: this.adminLessonForm.startTime, end_time: this.adminLessonForm.endTime, reason: this.adminLessonForm.reason };
      if (this.adminLessonForm.courtId) payload.court_id = this.adminLessonForm.courtId;
      const res = await fetch("/api/blocking-rules", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      if (!res.ok) { this.adminLessonError = await res.text(); return; }
      this.adminLessonForm.reason = "";
      await this.loadAdminLessons(); await this.loadAvailability();
    },

    startEditLesson(l: any) {
      this.editingLessonId = l.id;
      this.adminLessonForm = { courtId: l.courtId || "", dayOfWeek: l.dayOfWeek, startTime: l.startTime.slice(0,5), endTime: l.endTime.slice(0,5), reason: l.reason };
    },

    cloneLesson(l: any) {
      this.editingLessonId = null;
      this.adminLessonForm = { courtId: l.courtId || "", dayOfWeek: l.dayOfWeek, startTime: l.startTime.slice(0,5), endTime: l.endTime.slice(0,5), reason: l.reason };
      this.adminLessonError = "";
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    cancelEditLesson() {
      this.editingLessonId = null;
      this.adminLessonForm = { courtId: "", dayOfWeek: 1, startTime: "15:00", endTime: "17:00", reason: "" };
      this.adminLessonError = "";
    },

    async updateLesson() {
      if (!this.editingLessonId) return;
      if (!this.adminLessonForm.reason || !this.adminLessonForm.startTime || !this.adminLessonForm.endTime) { this.adminLessonError = "Reason and times required"; return; }
      const token = localStorage.getItem("token");
      const payload: any = { court_id: this.adminLessonForm.courtId || null, day_of_week: this.adminLessonForm.dayOfWeek, start_time: this.adminLessonForm.startTime, end_time: this.adminLessonForm.endTime, reason: this.adminLessonForm.reason };
      const res = await fetch(`/api/blocking-rules/${this.editingLessonId}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      if (!res.ok) { this.adminLessonError = await res.text(); return; }
      this.editingLessonId = null;
      this.adminLessonForm = { courtId: "", dayOfWeek: 1, startTime: "15:00", endTime: "17:00", reason: "" };
      await this.loadAdminLessons(); await this.loadAvailability();
    },

    // Ad-hoc blocks CRUD
    async loadAdminBlocks() {
      if (!this.user || this.user.role !== "admin") return;
      this.adminBlocksLoading = true; this.adminBlockError = "";
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/blocks", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(await res.text());
        this.adminBlocks = await res.json();
      } catch (e: any) { this.adminBlockError = e.message || String(e); }
      finally { this.adminBlocksLoading = false; }
    },
    async createBlock() {
      if (!this.adminBlockForm.date || !this.adminBlockForm.startTime || !this.adminBlockForm.endTime || !this.adminBlockForm.reason) { this.adminBlockError = "Date, times and reason required"; return; }
      const token = localStorage.getItem("token");
      const payload: any = { start_at: `${this.adminBlockForm.date}T${this.adminBlockForm.startTime}:00.000Z`, end_at: `${this.adminBlockForm.date}T${this.adminBlockForm.endTime}:00.000Z`, reason: this.adminBlockForm.reason };
      if (this.adminBlockForm.courtId) payload.court_id = this.adminBlockForm.courtId;
      const res = await fetch("/api/blocks", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      if (!res.ok) { this.adminBlockError = await res.text(); return; }
      this.adminBlockForm.reason = "";
      await this.loadAdminBlocks(); await this.loadAvailability();
    },
    startEditBlock(b: any) {
      this.editingBlockId = b.id;
      const s = new Date(b.startAt); const e = new Date(b.endAt);
      this.adminBlockForm = { courtId: b.courtId || "", date: s.toISOString().slice(0,10), startTime: s.toISOString().slice(11,16), endTime: e.toISOString().slice(11,16), reason: b.reason };
    },
    cloneBlock(b: any) {
      this.editingBlockId = null;
      const s = new Date(b.startAt); const e = new Date(b.endAt);
      this.adminBlockForm = { courtId: b.courtId || "", date: s.toISOString().slice(0,10), startTime: s.toISOString().slice(11,16), endTime: e.toISOString().slice(11,16), reason: b.reason };
      this.adminBlockError = "";
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    cancelEditBlock() {
      this.editingBlockId = null;
      this.adminBlockForm = { courtId: "", date: "", startTime: "10:00", endTime: "12:00", reason: "" };
      this.adminBlockError = "";
    },
    async updateBlock() {
      if (!this.editingBlockId) return;
      if (!this.adminBlockForm.date || !this.adminBlockForm.startTime || !this.adminBlockForm.endTime || !this.adminBlockForm.reason) { this.adminBlockError = "Date, times and reason required"; return; }
      const token = localStorage.getItem("token");
      const payload: any = { court_id: this.adminBlockForm.courtId || null, start_at: `${this.adminBlockForm.date}T${this.adminBlockForm.startTime}:00.000Z`, end_at: `${this.adminBlockForm.date}T${this.adminBlockForm.endTime}:00.000Z`, reason: this.adminBlockForm.reason };
      const res = await fetch(`/api/blocks/${this.editingBlockId}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      if (!res.ok) { this.adminBlockError = await res.text(); return; }
      this.editingBlockId = null;
      this.adminBlockForm = { courtId: "", date: "", startTime: "10:00", endTime: "12:00", reason: "" };
      await this.loadAdminBlocks(); await this.loadAvailability();
    },
    async deleteBlock(id: string) {
      if (!confirm("Delete this spot block?")) return;
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/blocks/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { alert("Delete failed: " + await res.text()); return; }
      await this.loadAdminBlocks(); await this.loadAvailability();
    },

    async deleteLesson(id: string) {
      if (!confirm("Delete this recurring block?")) return;
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/blocking-rules/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { alert("Delete failed: " + await res.text()); return; }
      await this.loadAdminLessons(); await this.loadAvailability();
    },

    async toggleLesson(id: string, current: boolean) {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/blocking-rules/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ is_active: !current }) });
      if (!res.ok) { alert("Toggle failed: " + await res.text()); return; }
      await this.loadAdminLessons(); await this.loadAvailability();
    },

    async loadAdminUsers() {
      if (!this.user || this.user.role !== "admin") return;
      this.adminUsersLoading = true; this.adminUsersError = "";
      try {
        const token = localStorage.getItem("token");
        const params = new URLSearchParams();
        if (this.adminUsersSearch) params.set("q", this.adminUsersSearch);
        if (this.adminUsersRole) params.set("role", this.adminUsersRole);
        const res = await fetch(`/api/users?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(await res.text());
        this.adminUsers = await res.json();
      } catch (e: any) { this.adminUsersError = e.message || String(e); }
      finally { this.adminUsersLoading = false; }
    },

    async createAdminUser() {
      this.adminUsersError = ""; this.adminUserSuccess = "";
      if (!this.adminUserForm.username || !this.adminUserForm.email || !this.adminUserForm.password || !this.adminUserForm.first_name || !this.adminUserForm.last_name) { this.adminUsersError = "Username, email, password, first/last name required"; return; }
      const token = localStorage.getItem("token");
      const res = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ username: this.adminUserForm.username, email: this.adminUserForm.email, password: this.adminUserForm.password, first_name: this.adminUserForm.first_name, last_name: this.adminUserForm.last_name, role: this.adminUserForm.role, preferred_language: "it" }) });
      if (!res.ok) { this.adminUsersError = await res.text(); return; }
      this.adminUserSuccess = this.t("admin.users.created");
      this.adminUserForm = { username: "", email: "", password: "", first_name: "", last_name: "", role: "visitor", mobile: "" };
      await this.loadAdminUsers();
    },

    startEditUser(u: any) {
      this.editingUserId = u.id;
      this.adminUserForm = { username: u.username, email: u.email, password: "", first_name: u.first_name, last_name: u.last_name, role: u.role, mobile: u.mobile || "" };
    },

    cancelEditUser() { this.editingUserId = null; this.adminUserForm = { username: "", email: "", password: "", first_name: "", last_name: "", role: "visitor", mobile: "" }; this.adminUsersError = ""; },

    async updateAdminUser() {
      if (!this.editingUserId) return;
      const token = localStorage.getItem("token");
      const payload: any = { username: this.adminUserForm.username, email: this.adminUserForm.email, first_name: this.adminUserForm.first_name, last_name: this.adminUserForm.last_name, role: this.adminUserForm.role, mobile: this.adminUserForm.mobile || null };
      if (this.adminUserForm.password) (payload as any).password = this.adminUserForm.password;
      const res = await fetch(`/api/users/${this.editingUserId}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      if (!res.ok) { this.adminUsersError = await res.text(); return; }
      this.adminUserSuccess = this.t("admin.users.updated");
      this.editingUserId = null;
      this.adminUserForm = { username: "", email: "", password: "", first_name: "", last_name: "", role: "visitor", mobile: "" };
      await this.loadAdminUsers();
    },

    async deleteAdminUser(id: string) {
      if (!confirm("Delete this user? This cannot be undone.")) return;
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/users/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { alert("Delete failed: " + await res.text()); return; }
      await this.loadAdminUsers();
    },

    viewUser(u: any) {
      this.viewedUserBack = this.view;
      this.viewedUser = u;
      this.view = "admin-view-user";
      location.hash = "admin-view-user";
    },

    async viewUserById(userId: string) {
      if (!userId) return;
      this.viewedUserBack = this.view;
      let u = this.adminUsers.find((x: any) => String(x.id) === String(userId));
      if (!u) {
        try {
          const token = localStorage.getItem("token");
          const res = await fetch(`/api/users`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const rows = await res.json();
            u = rows.find((x: any) => String(x.id) === String(userId));
          }
        } catch {}
      }
      if (u) {
        // viewUser will set viewedUserBack, but we already set it — avoid double overwrite
        this.viewedUser = u;
        this.view = "admin-view-user";
        location.hash = "admin-view-user";
      } else {
        const b = this.adminBookings.find((x: any) => String(x.userId) === String(userId));
        this.viewedUser = { id: userId, username: b?.username || String(userId).slice(0,8), email: "", first_name: "", last_name: "", role: "visitor", mobile: "", gender: "", birthdate: "", preferred_language: "it", preferred_sport: "" };
        this.view = "admin-view-user";
        location.hash = "admin-view-user";
      }
    },

    backFromViewUser() {
      const back = this.viewedUserBack && this.viewedUserBack !== "admin-view-user" ? this.viewedUserBack : "admin-users";
      this.view = back;
      location.hash = back;
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
          preferred_sport: me.preferred_sport || me.preferredSport || "",
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
      if (this.profileForm.preferred_sport !== undefined) payload.preferred_sport = this.profileForm.preferred_sport || null;
      const res = await fetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      if (!res.ok) { this.profileError = await res.text(); return; }
      const updated = await res.json();
      this.profileSuccess = this.t("profile.updated");
      if (updated.preferred_language) { this.lang = updated.preferred_language; setLang(this.lang); localStorage.setItem("lang", this.lang); }
      if (updated.preferred_sport !== undefined) {
        this.filterType = updated.preferred_sport || "";
        if (this.view === "courts") this.loadAvailability();
      }
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
