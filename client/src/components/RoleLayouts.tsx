import PortalLayout from "./PortalLayout";

export const TeacherLayout = () => (
  <PortalLayout
    roleLabel="Teacher"
    notificationsPath="/teacher/notifications"
    nav={[
      { to: "/teacher", label: "My classes", end: true },
      { to: "/teacher/notes", label: "Lesson notes" },
      { to: "/teacher/videos", label: "Video lessons" },
      { to: "/teacher/assignments", label: "Assignments" },
      { to: "/teacher/timetable", label: "Timetable" },
      { to: "/teacher/exams", label: "Examinations" },
      { to: "/teacher/attendance", label: "Attendance" },
      { to: "/teacher/scores", label: "Scores" },
      { to: "/teacher/messages", label: "Messages" },
      { to: "/teacher/quizzes", label: "Quizzes" },
      { to: "/teacher/preferences", label: "Notification settings" },
    ]}
  />
);

export const StudentLayout = () => (
  <PortalLayout
    roleLabel="Student"
    notificationsPath="/student/notifications"
    nav={[
      { to: "/student", label: "My class", end: true },
      { to: "/student/learning", label: "My lessons" },
      { to: "/student/assignments", label: "Assignments" },
      { to: "/student/timetable", label: "Timetable" },
      { to: "/student/exams", label: "Examinations" },
      { to: "/student/attendance", label: "Attendance" },
      { to: "/student/results", label: "My results" },
      { to: "/student/preferences", label: "Notification settings" },
      { to: "/student/quizzes", label: "Quizzes" },
    ]}
  />
);

export const ParentLayout = () => (
  <PortalLayout
    roleLabel="Parent or guardian"
    notificationsPath="/parent/notifications"
    nav={[
      { to: "/parent", label: "My children", end: true },
      { to: "/parent/assignments", label: "Assignments" },
      { to: "/parent/timetable", label: "Timetable" },
      { to: "/parent/exams", label: "Examinations" },
      { to: "/parent/attendance", label: "Attendance" },
      { to: "/parent/results", label: "Results" },
      { to: "/parent/fees", label: "School fees" },
      { to: "/parent/messages", label: "Messages" },
      { to: "/parent/account", label: "My account" },
      { to: "/parent/preferences", label: "Notification settings" },
      { to: "/parent/quizzes", label: "Quizzes" },
    ]}
  />
);
