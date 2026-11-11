alter table admission_applications add column converted_student_id uuid references users(id) on delete set null;
