import { Route, Routes } from 'react-router-dom';
import { PublicOnly, RequireRole } from './auth/guards';
import AdminLayout from './components/AdminLayout';
import { ParentLayout, StudentLayout, TeacherLayout } from './components/RoleLayouts';
import Notifications from './pages/Notifications';
import FeeSetup from './pages/admin/FeeSetup';
import Invoices from './pages/admin/Invoices';
import InvoiceDetailPage from './pages/admin/InvoiceDetail';
import OnlinePayments from './pages/admin/OnlinePayments';
import WebContent from './pages/admin/web/Content';
import NewsEvents from './pages/admin/web/NewsEvents';
import FacilitiesGallery from './pages/admin/web/FacilitiesGallery';
import Applications from './pages/admin/web/Applications';
import Messages from './pages/admin/web/Messages';
import Grading from './pages/admin/Grading';
import AdminResults from './pages/admin/Results';
import ReportPreview from './pages/admin/ReportPreview';
import TeacherScores from './pages/teacher/Scores';
import TeacherAttendance from './pages/teacher/Attendance';
import TeacherExplanations from './pages/teacher/AttendanceExplanations';
import TeacherAttendanceSummary from './pages/teacher/AttendanceSummary';
import AttendanceOverview from './pages/admin/AttendanceOverview';
import AttendanceRegister from './pages/admin/AttendanceRegister';
import AdminExplanations from './pages/admin/AttendanceExplanations';
import AdminAttendanceSummary from './pages/admin/AttendanceSummary';
import StudentAttendance from './pages/student/Attendance';
import { StudentResults, StudentReportCard } from './pages/student/Results';
import { ParentResults, ParentReportCard } from './pages/parent/Results';
import ParentAttendance from './pages/parent/Attendance';
import ReceiptPage from './pages/Receipt';
import ParentFees from './pages/parent/Fees';
import ParentFeeDetail from './pages/parent/FeeDetail';
import ParentHome from './pages/parent/Home';
import TeacherHome from './pages/teacher/Home';
import TeacherNotes from './pages/teacher/Notes';
import TeacherVideos from './pages/teacher/Videos';
import StudentHome from './pages/student/Home';
import Learning from './pages/student/Learning';
import TeacherAssignments from './pages/teacher/Assignments';
import TeacherAssignmentDetail from './pages/teacher/AssignmentDetail';
import StudentAssignments from './pages/student/Assignments';
import StudentAssignmentDetail from './pages/student/AssignmentDetail';
import Overview from './pages/admin/Overview';
import Academic from './pages/admin/Academic';
import Classes from './pages/admin/Classes';
import Accounts from './pages/admin/Accounts';
import Students from './pages/admin/Students';
import Teaching from './pages/admin/Teaching';
import FormTeachers from './pages/admin/FormTeachers';
import Guardians from './pages/admin/Guardians';
import ForgotPassword from './pages/ForgotPassword';
import Login from './pages/Login';
import SetPassword from './pages/SetPassword';
import { NotFound } from './pages/Simple';
import PublicLayout from './components/PublicLayout';
import Home from './pages/public/Home';
import About from './pages/public/About';
import Academics from './pages/public/Academics';
import Facilities from './pages/public/Facilities';
import Admissions from './pages/public/Admissions';
import Apply from './pages/public/Apply';
import AdmissionStatus from './pages/public/AdmissionStatus';
import News from './pages/public/News';
import NewsPost from './pages/public/NewsPost';
import Contact from './pages/public/Contact';
import Privacy from './pages/public/Privacy';

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/academics" element={<Academics />} />
        <Route path="/facilities" element={<Facilities />} />
        <Route path="/admissions" element={<Admissions />} />
        <Route path="/admissions/apply" element={<Apply />} />
        <Route path="/admissions/status" element={<AdmissionStatus />} />
        <Route path="/news" element={<News />} />
        <Route path="/news/:slug" element={<NewsPost />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/privacy" element={<Privacy />} />
      </Route>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>
      {/* Activation and reset links must work even if someone is signed in on the same browser */}
      <Route path="/activate" element={<SetPassword mode="activate" />} />
      <Route path="/reset-password" element={<SetPassword mode="reset" />} />
      <Route element={<RequireRole role="admin" />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Overview />} />
          <Route path="academic" element={<Academic />} />
          <Route path="classes" element={<Classes />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="students" element={<Students />} />
          <Route path="teaching" element={<Teaching />} />
          <Route path="attendance" element={<AttendanceOverview />} />
          <Route path="attendance/register" element={<AttendanceRegister />} />
          <Route path="attendance/explanations" element={<AdminExplanations />} />
          <Route path="attendance/summary" element={<AdminAttendanceSummary />} />
          <Route path="form-teachers" element={<FormTeachers />} />
          <Route path="guardians" element={<Guardians />} />
          <Route path="grading" element={<Grading />} />
          <Route path="results" element={<AdminResults />} />
          <Route path="results/:termId/:studentId" element={<ReportPreview />} />
          <Route path="fees" element={<FeeSetup />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="online-payments" element={<OnlinePayments />} />
          <Route path="website" element={<WebContent />} />
          <Route path="news" element={<NewsEvents />} />
          <Route path="facilities" element={<FacilitiesGallery />} />
          <Route path="applications" element={<Applications />} />
          <Route path="messages" element={<Messages />} />
          <Route path="receipts/:id" element={<ReceiptPage backTo="/admin/invoices" />} />
        </Route>
      </Route>
      <Route element={<RequireRole role="teacher" />}>
        <Route path="/teacher" element={<TeacherLayout />}>
          <Route index element={<TeacherHome />} />
          <Route path="notes" element={<TeacherNotes />} />
          <Route path="videos" element={<TeacherVideos />} />
          <Route path="assignments" element={<TeacherAssignments />} />
          <Route path="assignments/:id" element={<TeacherAssignmentDetail />} />
          <Route path="scores" element={<TeacherScores />} />
          <Route path="attendance" element={<TeacherAttendance />} />
          <Route path="attendance/explanations" element={<TeacherExplanations />} />
          <Route path="attendance/summary" element={<TeacherAttendanceSummary />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>
      </Route>
      <Route element={<RequireRole role="student" />}>
        <Route path="/student" element={<StudentLayout />}>
          <Route index element={<StudentHome />} />
          <Route path="learning" element={<Learning />} />
          <Route path="assignments" element={<StudentAssignments />} />
          <Route path="assignments/:id" element={<StudentAssignmentDetail />} />
          <Route path="attendance" element={<StudentAttendance />} />
          <Route path="results" element={<StudentResults />} />
          <Route path="results/:termId" element={<StudentReportCard />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>
      </Route>
      <Route element={<RequireRole role="parent" />}>
        <Route path="/parent" element={<ParentLayout />}>
          <Route index element={<ParentHome />} />
          <Route path="attendance" element={<ParentAttendance />} />
          <Route path="results" element={<ParentResults />} />
          <Route path="results/:studentId/:termId" element={<ParentReportCard />} />
          <Route path="fees" element={<ParentFees />} />
          <Route path="fees/:id" element={<ParentFeeDetail />} />
          <Route path="receipts/:id" element={<ReceiptPage backTo="/parent/fees" />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
