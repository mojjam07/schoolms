import { useState } from 'react';
import { Card, DataState, PageHeader, Select } from '../../components/ui';
import { ExamList, TimetableView } from '../../components/schedule/parts';
import type { ExamPaper, TimetableData } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';

export function TeacherTimetable() {
  const t = useFetch<TimetableData>('/teachers/me/timetable');
  return (
    <>
      <PageHeader title="My timetable" intro={t.data?.session ? `Lessons for the classes and subjects you teach · ${t.data.session.name} session` : undefined} />
      <DataState loading={t.loading} error={t.error}><TimetableView entries={t.data?.entries ?? []} showClass showTeachers={false} /></DataState>
    </>
  );
}

export function TeacherExams() {
  const [scope, setScope] = useState<'upcoming' | 'all'>('upcoming');
  const e = useFetch<ExamPaper[]>(`/teachers/me/exams?scope=${scope}`);
  return (
    <>
      <PageHeader title="Examinations" intro="Papers for the classes and subjects you teach." />
      <div className="mb-4 max-w-xs"><Select label="Show" value={scope} onChange={(ev) => setScope(ev.target.value as 'upcoming' | 'all')}><option value="upcoming">Upcoming only</option><option value="all">All, including past</option></Select></div>
      <Card><DataState loading={e.loading && !e.data} error={e.error}><ExamList papers={e.data ?? []} showClass emptyText="No published examinations for your classes yet." /></DataState></Card>
    </>
  );
}
