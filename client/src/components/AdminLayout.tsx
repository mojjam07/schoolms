import PortalLayout from "./PortalLayout";

const NAV = [
  { to: "/admin", label: "Overview", end: true },
  { to: "/admin/academic", label: "Sessions and terms" },
  { to: "/admin/classes", label: "Classes and subjects" },
  { to: "/admin/accounts", label: "Accounts" },
  { to: "/admin/import", label: "Import students" },
  { to: "/admin/students", label: "Students and classes" },
  { to: "/admin/teaching", label: "Teaching assignments" },
  { to: "/admin/timetable", label: "Timetable" },
  { to: "/admin/exams", label: "Exam schedules" },
  { to: "/admin/rollover", label: "New session promotion" },
  { to: "/admin/attendance", label: "Attendance" },
  { to: "/admin/form-teachers", label: "Form teachers" },
  { to: "/admin/guardians", label: "Guardians" },
  { to: "/admin/grading", label: "Grading and assessment" },
  { to: "/admin/results", label: "Results" },
  { to: "/admin/fees", label: "Fee setup" },
  { to: "/admin/invoices", label: "Invoices and payments" },
  { to: "/admin/online-payments", label: "Online payments" },
  { to: "/admin/website", label: "Website content" },
  { to: "/admin/news", label: "News and events" },
  { to: "/admin/facilities", label: "Facilities and gallery" },
  { to: "/admin/applications", label: "Applications" },
  { to: "/admin/messages", label: "Office messages" },
  { to: "/admin/messages/all", label: "All conversations" },
  { to: "/admin/audit", label: "Audit log" },
  { to: "/admin/data", label: "Data and privacy" },
  { to: "/admin/family-requests", label: "Guardian requests" },
  { to: "/admin/inbox", label: "Office messages" },
  { to: "/admin/messages/all", label: "All conversations" },
  { to: "/admin/family-requests", label: "Guardian requests" },
  { to: "/admin/data", label: "Data and privacy" },
  { to: "/admin/preferences", label: "Notification settings" },
];

export default function AdminLayout() {
  return <PortalLayout roleLabel="Administrator" nav={NAV} />;
}
