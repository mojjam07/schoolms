import { useState } from 'react';
import { Card, DataState, Empty, PageHeader, Select } from '../../components/ui';
import { ExamList, TimetableView } from '../../components/schedule/parts';
import type { Child, ExamPaper, TimetableData } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';

function useChild() {
  const kids = useFetch<Child[]>('/parents/me/children');
  const [picked, setPicked] = useState('');
  const child = kids.data?.find((k) => k.id === picked) ?? kids.data?.[0];
  const picker = kids.data && kids.data.length > 1 ? (
    <div className="mb-4 max-w-xs"><Select label="Child" value={child?.id ?? ''} onChange={(e) => setPicked(e.target.value)}>{kids.data.map((k) => <option key={k.id} value={k.id}>{k.firstName} {k.lastName}</option>)}</Select></div>
  ) : null;
  return { kids, child, picker };
}

function Timetable({ id }: { id: string }) {
  const t = useFetch<TimetableData>(`/parents/me/children/${id}/timetable`);
  return <DataState loading={t.loading && !t.data} error={t.error}>{t.data?.className ? <TimetableView entries={t.data.entries} /> : <Card><Empty>Not placed in a class this session.</Empty></Card>}</DataState>;
}

export function ParentTimetable() {
  const { kids, child, picker } = useChild();
  return (
    <>
      <PageHeader title="Timetable" intro="The weekly lesson timetable for your child's class." />
      <DataState loading={kids.loading} error={kids.error}>{child ? <>{picker}<Timetable id={child.id} /></> : <Card><Empty>No children are linked to your account yet.</Empty></Card>}</DataState>
    </>
  );
}

function Exams({ id, scope }: { id: string; scope: string }) {
  const e = useFetch<ExamPaper[]>(`/parents/me/children/${id}/exams?scope=${scope}`);
  return <Card><DataState loading={e.loading && !e.data} error={e.error}><ExamList papers={e.data ?? []} emptyText="No examinations have been published for this class yet." /></DataState></Card>;
}

export function ParentExams() {
  const { kids, child, picker } = useChild();
  const [scope, setScope] = useState('upcoming');
  return (
    <>
      <PageHeader title="Examinations" intro="Dates, times and venues published by the school." />
      <DataState loading={kids.loading} error={kids.error}>
        {child ? (
          <>
            {picker}
            <div className="mb-4 max-w-xs"><Select label="Show" value={scope} onChange={(e) => setScope(e.target.value)}><option value="upcoming">Upcoming only</option><option value="all">All, including past</option></Select></div>
            <Exams id={child.id} scope={scope} />
          </>
        ) : <Card><Empty>No children are linked to your account yet.</Empty></Card>}
      </DataState>
    </>
  );
}

// Dashboard card: the next few papers for one child.
export function UpcomingExams({ childId }: { childId: string }) {
  const e = useFetch<ExamPaper[]>(`/parents/me/children/${childId}/exams?scope=upcoming`);
  if (!e.data?.length) return null;
  return <div className="mt-3 border-t border-line pt-3"><p className="mb-1 text-sm font-semibold">Upcoming examinations</p><ExamList papers={e.data.slice(0, 3)} emptyText="" /></div>;
}
