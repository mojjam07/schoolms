import { useState } from 'react';
import { Card, DataState, Empty, Select, Table, Td, Th } from '../ui';
import type { ClassSummaryData } from '../../lib/types';
import { useFetch } from '../../lib/useFetch';
import { useTerms } from '../../lib/useTerms';

// A term's attendance for one class, one row per student. "Present" includes late arrivals, as on the parent's page.
export default function ClassSummary({ classes }: { classes: { classId: string; className: string }[] }) {
  const t = useTerms();
  const [classPick, setClassPick] = useState(''); const [termPick, setTermPick] = useState('');
  const classId = classPick || classes[0]?.classId || ''; const termId = termPick || t.defaultId;
  const data = useFetch<ClassSummaryData>(classId && termId ? `/attendance/class-summary?classId=${classId}&termId=${termId}` : null);
  const d = data.data;
  return (
    <DataState loading={t.loading} error={t.error}>
      {!t.terms.length ? <Card><Empty>The school has not set up its terms yet.</Empty></Card> : (
        <>
          <div className="mb-6 grid gap-4 sm:max-w-xl sm:grid-cols-2">
            <Select label="Class" value={classId} onChange={(e) => setClassPick(e.target.value)}>{classes.map((c) => <option key={c.classId} value={c.classId}>{c.className}</option>)}</Select>
            <Select label="Term" value={termId} onChange={(e) => setTermPick(e.target.value)}>{t.terms.map((x) => <option key={x.id} value={x.id}>{t.label(x)}</option>)}</Select>
          </div>
          <DataState loading={data.loading && !d} error={data.error}>
            {d && (
              <Card title={`${classes.find((c) => c.classId === classId)?.className ?? ''} · ${d.registersTaken} register${d.registersTaken === 1 ? '' : 's'} taken`}>
                {d.students.length ? (
                  <Table>
                    <thead><tr><Th>Student</Th><Th>School days</Th><Th>Present</Th><Th>Late</Th><Th>Absent</Th><Th>Excused</Th><Th>Attendance</Th></tr></thead>
                    <tbody>{d.students.map((s) => (
                      <tr key={s.studentId}>
                        <Td><div className="font-medium">{s.name}</div><div className="text-xs text-muted">{s.admissionNumber}</div></Td>
                        <Td>{s.opened}</Td><Td>{s.present}</Td><Td>{s.late}</Td><Td>{s.absent}</Td><Td>{s.excused}</Td>
                        <Td className="font-semibold">{s.percentPresent === null ? '-' : `${s.percentPresent}%`}</Td>
                      </tr>))}</tbody>
                  </Table>
                ) : <Empty>No students were in this class for that term.</Empty>}
                <p className="mt-4 text-sm text-muted">"School days" counts the registers that listed the student. "Present" includes late arrivals. "Excused" is absences whose explanation was accepted.</p>
              </Card>
            )}
          </DataState>
        </>
      )}
    </DataState>
  );
}
