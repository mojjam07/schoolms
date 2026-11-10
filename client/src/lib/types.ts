export interface Session { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean }
export interface Term { id: string; sessionId: string; termNumber: number; name: string; startDate: string; endDate: string; isCurrent: boolean }
export interface SchoolClass { id: string; stage: 'JSS' | 'SSS'; year: number; arm: string | null; name: string }
export interface Subject { id: string; name: string; code: string | null }
export interface Paged<T> { items: T[]; page: number; pageSize: number; total: number }
export interface Account {
  id: string; email: string; role: 'admin' | 'teacher' | 'student' | 'parent'; status: 'pending' | 'active' | 'suspended';
  firstName: string; lastName: string; phone: string | null; lastLoginAt: string | null;
}
export interface StudentRow {
  id: string; firstName: string; lastName: string; email: string; accountStatus: string; admissionNumber: string;
  classId: string | null; className: string | null; enrolmentStatus: string | null;
}
export interface Assignment { id: string; classId: string; className: string; subjectId: string; subjectName: string; teacherId: string; teacherName: string; staffNumber: string | null }
export interface GuardianLink { parentId: string; parentName: string; parentEmail: string; studentId: string; studentName: string; relationship: string; isPrimary: boolean }
export interface TeacherAssignment { id: string; classId: string; className: string; subjectId: string; subjectName: string }
export interface FileInfo { id: string; name: string; mimeType: string; sizeBytes: number }
export interface NoteSummary { id: string; title: string; topic: string | null; classId: string; className: string; subjectId: string; subjectName: string; teacherName: string; status: 'draft' | 'published' | 'archived'; publishedAt: string | null; updatedAt: string; fileCount: number }
export interface NoteDetail extends NoteSummary { body: string; files: FileInfo[] }
export interface VideoLesson { id: string; title: string; topic: string | null; description: string; instructions: string; youtubeId: string; embedUrl: string; classId: string; className: string; subjectId: string; subjectName: string; teacherName: string; status: 'draft' | 'published'; publishedAt: string | null; updatedAt: string }
export interface MyClass { className: string | null; sessionName: string | null; subjects: { id: string; name: string }[] }

export interface AssignmentCore {
  id: string; title: string; description: string; instructions: string; maxMarks: number; publishAt: string | null; dueAt: string;
  allowResubmission: boolean; status: 'draft' | 'published' | 'closed'; classId: string; className: string; subjectId: string; subjectName: string; teacherName: string; updatedAt: string;
}
export interface AssignmentFull extends AssignmentCore { files: FileInfo[] }
export interface TeacherAssignmentRow extends AssignmentCore { enrolledCount: number; submittedCount: number; toMarkCount: number; lateCount: number }
export interface StudentAssignmentRow extends AssignmentCore { myStatus: 'not_submitted' | 'submitted' | 'returned'; myIsLate: boolean; mySubmittedAt: string | null; myAttempt: number; myMarks: number | null; overdue: boolean }
export interface Attempt { id: string; attempt: number; textResponse: string; submittedAt: string; isLate: boolean; status: 'submitted' | 'graded' | 'returned'; marks: number | null; feedback: string | null; returnedAt: string | null; files: FileInfo[] }
export interface RosterRow { studentId: string; name: string; admissionNumber: string | null; submissionId: string | null; attempt: number | null; status: 'not_submitted' | 'submitted' | 'graded' | 'returned'; isLate: boolean; submittedAt: string | null; marks: number | null }

export interface NotificationItem { id: string; type: string; title: string; body: string; link: string | null; read: boolean; createdAt: string }
export interface NotificationList { items: NotificationItem[]; page: number; pageSize: number; total: number; unreadCount: number }
export interface Child { id: string; firstName: string; lastName: string; admissionNumber: string | null; relationship: string; isPrimary: boolean; className: string | null }

export interface FeeCategory { id: string; name: string; description: string; active: boolean }
export interface TermOption { id: string; sessionId: string; termNumber: number; name: string; isCurrent: boolean }
export interface InvoiceRow {
  id: string; number: string; studentId: string; studentName: string; admissionNumber: string | null; classId: string; className: string; termId: string; termName: string; sessionName: string;
  dueDate: string | null; status: 'unpaid' | 'part_paid' | 'paid' | 'cancelled'; totalKobo: number; paidKobo: number; balanceKobo: number; overdue: boolean; cancelReason: string | null;
}
export interface InvoiceLine { id: string; kind: 'fee' | 'charge' | 'discount'; description: string; amountKobo: number; reason: string | null; createdAt: string }
export interface PaymentRow { id: string; receiptNumber: string; amountKobo: number; method: string; reference: string | null; note: string | null; paidAt: string; reversed: boolean; reverseReason: string | null }
export interface InvoiceDetail extends InvoiceRow { lines: InvoiceLine[]; payments: PaymentRow[]; guardians?: { id: string; name: string; email: string; relationship: string }[] }
export interface FeeReport { term: string; billedKobo: number; collectedKobo: number; outstandingKobo: number; invoices: number; studentsOwing: number; studentsOverdue: number; byClass: { classId: string; className: string; invoices: number; billedKobo: number; collectedKobo: number; outstandingKobo: number; studentsOwing: number; studentsOverdue: number }[] }
export interface Receipt { id: string; receiptNumber: string; invoiceId: string; invoiceNumber: string; studentName: string; admissionNumber: string | null; className: string; termName: string; sessionName: string; amountKobo: number; method: string; reference: string | null; paidAt: string; reversed: boolean; balanceKobo: number; invoiceTotalKobo: number }
export interface MyInvoiceSummary { id: string; number: string; termName: string; sessionName: string; status: InvoiceRow['status']; totalKobo: number; paidKobo: number; balanceKobo: number; dueDate: string | null; overdue: boolean }

export interface OnlinePayment { id: string; reference: string; invoiceId: string; invoiceNumber: string; studentName: string; payerName: string; amountKobo: number; status: 'pending' | 'success' | 'failed' | 'abandoned'; reviewNote: string | null; gatewayResponse: string | null; receiptNumber: string | null; createdAt: string; paidAt: string | null }
export interface ParentInvoiceDetail extends InvoiceDetail { onlinePaymentAvailable: boolean; pendingPayments: { reference: string; amountKobo: number; startedAt: string }[] }

// ---- public website ----
export interface PubPost { title: string; slug: string; kind: 'news' | 'announcement'; summary: string; publishedAt: string; pinned: boolean; imageUrl: string | null; imageAlt: string; body?: string }
export interface PubEvent { title: string; description: string; location: string; startsAt: string; endsAt: string | null }
export interface SiteData {
  school: { name: string; address: string };
  contact: { phone: string | null; email: string | null; whatsapp: string | null; officeHours: string | null; mapQuery: string };
  content: {
    home: { heroTitle: string; heroSubtitle: string; intro: string; highlights: { title: string; text: string }[] };
    about: { overview: string; mission: string; vision: string; philosophy: string; values: { title: string; text: string }[]; leadership: { name: string; role: string; bio: string }[] };
    academics: { intro: string; curriculum: string; programmes: string };
    admissions: { intro: string; requirements: string[]; process: string; openNote: string };
  };
  latestNews: PubPost[]; announcements: PubPost[]; upcomingEvents: PubEvent[];
}
export interface PubFacility { category: string; name: string; description: string; images: { url: string; caption: string; alt: string }[] }
export interface PubGalleryImage { url: string; caption: string; alt: string; facility: string | null }
export interface PubAcademics { stages: { stage: 'JSS' | 'SSS'; levels: { year: number; name: string; subjects: string[] }[] }[] }
export interface AppStatus { reference: string; applicantFirstName: string; applyingFor: string; status: string; statusLabel: string; note: string | null; submittedAt: string; updatedAt: string }

// ---- results ----
export interface Band { minPercent: number; grade: string; remark: string }
export interface AssessmentColumn { id: string; name: string; kind: 'ca' | 'exam'; maxScore: number; sessionId?: string; sortOrder?: number; hasScores?: boolean }
export interface ReportCardData {
  school: { name: string; address: string }; preview: boolean; publishedAt: string | null; student: { name: string; admissionNumber: string | null }; className: string; termName: string; sessionName: string;
  components: AssessmentColumn[]; maxTotal: number;
  subjects: { name: string; scores: Record<string, number | null>; total: number | null; percent: number | null; grade: string | null; remark: string | null; position: number | null; classAverage: number | null }[];
  summary: { ranked: boolean; totalMarks: number | null; totalPossible: number | null; average: number | null; grade: string | null; remark: string | null; position: number | null; outOf: number; studentsInClass: number; missing: string[] };
  remark: string | null; gradingScale: Band[]; attendance?: AttendanceSummary | null;
}
export interface PublishedTerm { termId: string; termName: string; sessionName: string; publishedAt: string }
export interface ResultsStatus { term: { id: string; name: string; sessionName: string }; classes: { classId: string; className: string; students: number; subjectsWithScores: number; studentsComplete: number; studentsIncomplete: number; publishedAt: string | null }[] }
export interface ClassResults {
  term: { id: string; name: string; sessionName: string }; subjects: { id: string; name: string }[]; rankedCount: number;
  students: { studentId: string; name: string; admissionNumber: string | null; subjects: { subjectId: string; percent: number | null; grade: string | null; complete: boolean }[]; ranked: boolean; average: number | null; grade: string | null; position: number | null; incompleteSubjects: string[] }[];
}
export interface ScoreSheet {
  term: { id: string; name: string; sessionName: string }; classId: string; className: string; subjectId: string; subjectName: string;
  components: AssessmentColumn[]; maxTotal: number; published: boolean; locked: boolean; bands: Band[];
  students: { studentId: string; name: string; admissionNumber: string | null; scores: Record<string, number | null>; total: number | null; percent: number | null; grade: string | null }[];
}

// ---- attendance ----
export interface AttendanceSummary { opened: number; present: number; onTime: number; late: number; absent: number; excused: number; unexplainedAbsent: number; percentPresent: number | null }
export interface ExplanationRow { id: string; studentName: string; className: string; date: string; attendance: 'present' | 'late' | 'absent'; reason: string; submittedBy: string; status: 'pending' | 'accepted' | 'declined'; reviewNote: string | null; submittedAt: string }
export interface DayStatusRow { classId: string; className: string; formTeacher: string | null; taken: boolean; present: number; late: number; absent: number }
export interface ClassSummaryData { classId: string; termId: string; registersTaken: number; students: ({ studentId: string; name: string; admissionNumber: string | null } & AttendanceSummary)[] }
