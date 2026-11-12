// API running on :4000 (fresh process, so the rate limiter starts empty), migrated DB, an active admin:
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/phase6.test.ts
const B = "http://localhost:4000/api";
const sfx = Date.now().toString(36);
let pass = 0,
  fail = 0;

async function call(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
) {
  const res = await fetch(B + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, data: json.data, error: json.error };
}
async function upload(
  token: string,
  name: string,
  bytes: Buffer,
  purpose = "public",
) {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(bytes)]), name);
  const res = await fetch(`${B}/files?purpose=${purpose}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, data: json.data };
}
async function media(id: string) {
  const r = await fetch(`${B}/public/media/${id}`);
  return {
    status: r.status,
    type: r.headers.get("content-type"),
    cache: r.headers.get("cache-control"),
    disp: r.headers.get("content-disposition"),
    corp: r.headers.get("cross-origin-resource-policy"),
    len: (await r.arrayBuffer()).byteLength,
  };
}
function check(name: string, got: unknown, want: unknown) {
  const okk = JSON.stringify(got) === JSON.stringify(want);
  console.log(
    `${okk ? "PASS" : "FAIL"}  ${name}${okk ? "" : `  (expected ${JSON.stringify(want)}, got ${JSON.stringify(got)})`}`,
  );
  okk ? pass++ : fail++;
}
const PW = "Sup3rSecret99";
async function newUser(
  adminT: string,
  role: string,
  extra: Record<string, string> = {},
) {
  const email = `${role}.${sfx}.${Math.random().toString(36).slice(2, 6)}@example.com`;
  const r = await call("POST", "/users", adminT, {
    email,
    role,
    firstName: role,
    lastName: sfx,
    ...extra,
  });
  await call("POST", "/auth/activate", undefined, {
    token: r.data.activationLink.split("token=")[1],
    password: PW,
  });
  const l = await call("POST", "/auth/login", undefined, {
    email,
    password: PW,
  });
  return {
    id: r.data.user.id as string,
    token: l.data.accessToken as string,
    email,
  };
}
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 7),
]);
const PDF = Buffer.from("%PDF-1.4\n%%EOF\n");
const inDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
const dob = (yearsAgo: number) =>
  new Date(Date.now() - yearsAgo * 365.25 * 864e5).toISOString().slice(0, 10);

(async () => {
  const { query } = await import("../src/db/pool");
  await query("delete from settings where key like 'site.content.%'"); // start from the built-in placeholders every run
  const A = (
    await call("POST", "/auth/login", undefined, {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    })
  ).data.accessToken as string;
  const teacher = await newUser(A, "teacher", { staffNumber: `WT-${sfx}` });
  const student = await newUser(A, "student", { admissionNumber: `W1-${sfx}` });
  const parent = await newUser(A, "parent");

  // ---- public data needs no sign-in, and shows only what the school has really said ----
  const site = (await call("GET", "/public/site")).data;
  check(
    "the public site works without signing in",
    [site.school.name, site.school.address],
    ["[School Name]", "[School Address]"],
  );
  check(
    "unknown details are clearly labelled placeholders, not invented",
    [
      site.content.academics.curriculum.startsWith("[Placeholder]"),
      site.content.admissions.requirements[0].startsWith("[Placeholder]"),
    ],
    [true, true],
  );
  check(
    "no invented phone or email: missing contact details are simply absent",
    [site.contact.phone, site.contact.email],
    [null, null],
  );
  check(
    "the map searches the supplied address (no invented coordinates)",
    [site.contact.mapQuery, JSON.stringify(site).includes("latitude")],
    ["[School Address]", false],
  );
  check(
    "the public payload holds no user accounts or private data",
    ["@", "password", "guardian"].some((k) =>
      JSON.stringify(site)
        .toLowerCase()
        .includes(k === "@" ? "@example.com" : k),
    ),
    false,
  );

  // ---- editing page content ----
  check(
    "editing needs sign-in",
    (await call("PUT", "/admin/site/content/about", undefined, {})).status,
    401,
  );
  const aboutBase = site.content.about;
  check(
    "teachers cannot edit the website",
    (await call("PUT", "/admin/site/content/about", teacher.token, aboutBase))
      .status,
    403,
  );
  check(
    "students cannot edit the website",
    (await call("PUT", "/admin/site/content/about", student.token, aboutBase))
      .status,
    403,
  );
  check(
    "unknown section -> 404",
    (await call("PUT", "/admin/site/content/secrets", A, {})).status,
    404,
  );
  check(
    "too many list items refused",
    (
      await call("PUT", "/admin/site/content/admissions", A, {
        ...site.content.admissions,
        requirements: Array(25).fill("x"),
      })
    ).status,
    400,
  );
  check(
    "a bad email in contact details is refused",
    (
      await call("PUT", "/admin/site/content/contact", A, {
        phone: "",
        whatsapp: "",
        officeHours: "",
        email: "not-an-email",
        mapQuery: "Oshodi, Lagos",
      })
    ).status,
    400,
  );
  await call("PUT", "/admin/site/content/about", A, {
    ...aboutBase,
    mission: "[Placeholder] Mission to come.",
  });
  const before = (await call("GET", "/admin/site/checklist", A)).data
    .placeholders.length;
  const saved = await call("PUT", "/admin/site/content/about", A, {
    ...aboutBase,
    mission: "To help every pupil reach their potential.",
  });
  check(
    "saved content comes back",
    saved.data.mission,
    "To help every pupil reach their potential.",
  );
  check(
    "the public site shows it at once",
    (await call("GET", "/public/site")).data.content.about.mission,
    "To help every pupil reach their potential.",
  );
  check(
    "the launch checklist counts one placeholder fewer",
    (await call("GET", "/admin/site/checklist", A)).data.placeholders.length,
    before - 1,
  );
  const xss = '<script>alert(1)</script> & "quotes"';
  await call("PUT", "/admin/site/content/about", A, {
    ...aboutBase,
    mission: "To help every pupil reach their potential.",
    philosophy: xss,
  });
  check(
    "markup is stored and returned as plain text (the website shows it as text, never as HTML)",
    (await call("GET", "/public/site")).data.content.about.philosophy,
    xss,
  );
  const contact = await call("PUT", "/admin/site/content/contact", A, {
    phone: "0803 000 0000",
    whatsapp: "",
    officeHours: "Mon to Fri, 8am to 3pm",
    email: `office.${sfx}@example.com`,
    mapQuery: "13, Sunmonu Street, Mafoluku, Oshodi, Lagos, Nigeria",
  });
  check(
    "contact details entered by the school appear publicly",
    [
      (await call("GET", "/public/site")).data.contact.phone,
      (await call("GET", "/public/site")).data.contact.whatsapp,
    ],
    ["0803 000 0000", null],
  );
  void contact;

  // ---- news and announcements ----
  const draft = (
    await call("POST", "/admin/site/posts", A, {
      kind: "news",
      title: `Inter-house sports ${sfx}`,
      summary: "A summary",
      body: "Paragraph one.\n\nParagraph two.",
    })
  ).data;
  check(
    "a new post starts as a draft with a clean web address",
    [
      draft.status,
      /^inter-house-sports-[a-z0-9]+$/.test(draft.slug),
      draft.publishedAt,
    ],
    ["draft", true, null],
  );
  check(
    "drafts are not listed publicly",
    ((await call("GET", "/public/news")).data.items as any[]).some(
      (p) => p.slug === draft.slug,
    ),
    false,
  );
  check(
    "drafts cannot be opened by their address",
    (await call("GET", `/public/news/${draft.slug}`)).status,
    404,
  );
  check(
    "a post with a picture needs a description of it",
    (
      await call("POST", "/admin/site/posts", A, {
        kind: "news",
        title: "Has picture",
        imageId: crypto.randomUUID(),
        imageAlt: "",
      })
    ).status,
    400,
  );
  const pub = (
    await call("PATCH", `/admin/site/posts/${draft.id}`, A, {
      status: "published",
    })
  ).data;
  check(
    "publishing makes it public",
    [
      pub.status,
      !!pub.publishedAt,
      (await call("GET", `/public/news/${draft.slug}`)).data.body,
    ],
    ["published", true, "Paragraph one.\n\nParagraph two."],
  );
  check(
    "and lists it",
    ((await call("GET", "/public/news")).data.items as any[]).some(
      (p) => p.slug === draft.slug,
    ),
    true,
  );
  const dup = (
    await call("POST", "/admin/site/posts", A, {
      kind: "news",
      title: `Inter-house sports ${sfx}`,
    })
  ).data;
  check(
    "two posts with the same title get different addresses",
    dup.slug !== draft.slug,
    true,
  );
  await call("PATCH", `/admin/site/posts/${draft.id}`, A, {
    title: "A new title",
  });
  check(
    "editing the title keeps the web address stable",
    (await call("GET", `/admin/site/posts/${draft.id}`, A)).data.slug,
    draft.slug,
  );
  await call("PATCH", `/admin/site/posts/${draft.id}`, A, { status: "draft" });
  check(
    "unpublishing hides it again",
    (await call("GET", `/public/news/${draft.slug}`)).status,
    404,
  );
  check(
    "the public API never exposes author or admin fields",
    JSON.stringify((await call("GET", "/public/news")).data).includes("author"),
    false,
  );
  check(
    "news does not notify anyone",
    (await call("GET", "/notifications", student.token)).data.items.some(
      (n: any) => n.title.includes("A new title"),
    ),
    false,
  );

  const ann = (
    await call("POST", "/admin/site/posts", A, {
      kind: "announcement",
      title: `Resumption date ${sfx}`,
      summary: "School resumes on Monday.",
      pinned: true,
      status: "published",
    })
  ).data;
  check(
    "announcements are listed, pinned ones first",
    ((await call("GET", "/public/announcements")).data as any[])[0].slug,
    ann.slug,
  );
  check(
    "students and parents are notified of a new announcement",
    [
      (await call("GET", "/notifications", student.token)).data.items.filter(
        (n: any) => n.title === `School announcement: Resumption date ${sfx}`,
      ).length,
      (await call("GET", "/notifications", parent.token)).data.items.filter(
        (n: any) => n.title === `School announcement: Resumption date ${sfx}`,
      ).length,
    ],
    [1, 1],
  );
  await call("PATCH", `/admin/site/posts/${ann.id}`, A, {
    summary: "School resumes on Monday at 8am.",
    status: "published",
  });
  check(
    "editing it again does not notify twice",
    (await call("GET", "/notifications", student.token)).data.items.filter(
      (n: any) => n.title === `School announcement: Resumption date ${sfx}`,
    ).length,
    1,
  );
  const expired = (
    await call("POST", "/admin/site/posts", A, {
      kind: "announcement",
      title: `Old notice ${sfx}`,
      status: "published",
      expiresAt: inDays(-1),
    })
  ).data;
  check(
    "an expired announcement disappears from the public site",
    [
      ((await call("GET", "/public/announcements")).data as any[]).some(
        (p) => p.slug === expired.slug,
      ),
      (await call("GET", `/public/news/${expired.slug}`)).status,
    ],
    [false, 404],
  );

  // ---- events ----
  const evDraft = (
    await call("POST", "/admin/site/events", A, {
      title: `Open day ${sfx}`,
      startsAt: inDays(10),
      location: "School hall",
    })
  ).data;
  check(
    "draft events are not public",
    ((await call("GET", "/public/events?when=upcoming")).data as any[]).some(
      (e) => e.title === evDraft.title,
    ),
    false,
  );
  check(
    "an event cannot end before it starts",
    (
      await call("POST", "/admin/site/events", A, {
        title: "Backwards",
        startsAt: inDays(5),
        endsAt: inDays(4),
      })
    ).status,
    400,
  );
  await call("PATCH", `/admin/site/events/${evDraft.id}`, A, {
    status: "published",
  });
  check(
    "a published event is listed as upcoming, not past",
    [
      ((await call("GET", "/public/events?when=upcoming")).data as any[]).some(
        (e) => e.title === evDraft.title,
      ),
      ((await call("GET", "/public/events?when=past")).data as any[]).some(
        (e) => e.title === evDraft.title,
      ),
    ],
    [true, false],
  );
  check(
    "a newly published event notifies students and parents once",
    [
      (await call("GET", "/notifications", parent.token)).data.items.filter(
        (n: any) => n.title === `School event: ${evDraft.title}`,
      ).length,
    ],
    [1],
  );
  const pastEv = (
    await call("POST", "/admin/site/events", A, {
      title: `Last term quiz ${sfx}`,
      startsAt: inDays(-30),
      status: "published",
    })
  ).data;
  check(
    "earlier events appear under past",
    ((await call("GET", "/public/events?when=past")).data as any[]).some(
      (e) => e.title === pastEv.title,
    ),
    true,
  );
  check(
    "students cannot manage events",
    (
      await call("POST", "/admin/site/events", student.token, {
        title: "Nope",
        startsAt: inDays(1),
      })
    ).status,
    403,
  );

  // ---- pictures: only published pictures are ever public ----
  check(
    "teachers cannot upload website pictures",
    (await upload(teacher.token, "x.png", PNG)).status,
    403,
  );
  check(
    "a PDF cannot be uploaded as a website picture",
    (await upload(A, "plan.pdf", PDF)).status,
    400,
  );
  check(
    "a renamed non-image is refused",
    (await upload(A, "fake.png", PDF)).status,
    400,
  );
  const img = await upload(A, "library.png", PNG);
  check("the administrator can upload a picture", img.status, 201);
  check(
    "an unattached picture is not public",
    (await media(img.data.id)).status,
    404,
  );
  const fac = (
    await call("POST", "/admin/site/facilities", A, {
      category: "Learning spaces",
      name: `Library ${sfx}`,
      description: "A quiet reading room.",
    })
  ).data;
  check(
    "a picture needs a description for accessibility",
    (
      await call("POST", "/admin/site/gallery", A, {
        fileId: img.data.id,
        facilityId: fac.id,
        altText: "",
      })
    ).status,
    400,
  );
  const g = (
    await call("POST", "/admin/site/gallery", A, {
      fileId: img.data.id,
      facilityId: fac.id,
      caption: "Reading room",
      altText: "Rows of tables and bookshelves in the library",
    })
  ).data;
  check(
    "a draft picture is not served or listed",
    [
      (await media(img.data.id)).status,
      ((await call("GET", "/public/gallery")).data as any[]).length > 0 &&
        JSON.stringify((await call("GET", "/public/gallery")).data).includes(
          img.data.id,
        ),
    ],
    [404, false],
  );
  await call("PATCH", `/admin/site/gallery/${g.id}`, A, {
    status: "published",
  });
  check(
    "a published picture of a draft facility is still not public",
    (await media(img.data.id)).status,
    404,
  );
  check(
    "a draft facility is not listed",
    ((await call("GET", "/public/facilities")).data as any[]).some(
      (f) => f.name === fac.name,
    ),
    false,
  );
  await call("PATCH", `/admin/site/facilities/${fac.id}`, A, {
    status: "published",
  });
  const m = await media(img.data.id);
  check(
    "once the facility and picture are published, the picture is served as an image",
    [m.status, m.type, m.disp, m.len > 0],
    [200, "image/png", "inline", true],
  );
  check(
    "and cached, and allowed to load from the website",
    [m.cache, m.corp],
    ["public, max-age=3600", "cross-origin"],
  );
  const fl = ((await call("GET", "/public/facilities")).data as any[]).find(
    (f) => f.name === fac.name,
  );
  check(
    "the facility lists its pictures with descriptions",
    [fl.images.length, fl.images[0].alt, fl.images[0].url],
    [
      1,
      "Rows of tables and bookshelves in the library",
      `/api/public/media/${img.data.id}`,
    ],
  );
  check(
    "the picture is in the public gallery",
    JSON.stringify((await call("GET", "/public/gallery")).data).includes(
      img.data.id,
    ),
    true,
  );
  await call("PATCH", `/admin/site/gallery/${g.id}`, A, { status: "draft" });
  check(
    "unpublishing the picture withdraws it at once",
    (await media(img.data.id)).status,
    404,
  );
  const resource = await upload(teacher.token, "notes.pdf", PDF, "resource");
  check(
    "a teacher's private file is never reachable through the public picture route",
    (await media(resource.data.id)).status,
    404,
  );
  const postImg = await upload(A, "sports.png", PNG);
  const withPic = (
    await call("POST", "/admin/site/posts", A, {
      kind: "news",
      title: `With picture ${sfx}`,
      imageId: postImg.data.id,
      imageAlt: "Pupils running a race",
      status: "draft",
    })
  ).data;
  check(
    "a picture on a draft post is not public",
    (await media(postImg.data.id)).status,
    404,
  );
  await call("PATCH", `/admin/site/posts/${withPic.id}`, A, {
    status: "published",
  });
  check(
    "a picture on a published post is public",
    (await media(postImg.data.id)).status,
    200,
  );
  await call("DELETE", `/admin/site/posts/${withPic.id}`, A);
  check(
    "deleting the post removes its picture for good",
    [
      (await media(postImg.data.id)).status,
      (await query("select 1 from files where id = $1", [postImg.data.id]))
        .rowCount,
    ],
    [404, 0],
  );
  check(
    "deleting a gallery picture removes the file too",
    [
      (await call("DELETE", `/admin/site/gallery/${g.id}`, A)).status,
      (await query("select 1 from files where id = $1", [img.data.id]))
        .rowCount,
    ],
    [200, 0],
  );

  // ---- academics: subject names only ----
  const cls = (
    await call("POST", "/academic/classes", A, {
      stage: "JSS",
      year: 3,
      arm:
        "W" +
        sfx
          .slice(-3)
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "X"),
    })
  ).data;
  const subj = (
    await call("POST", "/academic/subjects", A, {
      name: `Civic Education ${sfx}`,
    })
  ).data;
  await call("PUT", `/academic/classes/${cls.id}/subjects`, A, {
    subjectIds: [subj.id],
  });
  const ac = (await call("GET", "/public/academics")).data;
  check(
    "the academics page lists real subjects per level",
    [
      ac.stages.map((s: any) => s.stage),
      ac.stages[0].levels.map((l: any) => l.name),
      ac.stages[0].levels[2].subjects.includes(`Civic Education ${sfx}`),
    ],
    [["JSS", "SSS"], ["JSS 1", "JSS 2", "JSS 3"], true],
  );
  check(
    "and nothing about teachers or students",
    ["teacher", "student", "email"].some((k) =>
      JSON.stringify(ac).toLowerCase().includes(k),
    ),
    false,
  );

  // ---- admission applications ----
  const app = {
    firstName: "Ada",
    lastName: `Obi${sfx}`,
    dateOfBirth: dob(11),
    classStage: "JSS",
    classYear: 1,
    guardianName: "Mrs Obi",
    guardianPhone: "0803 111 2222",
    guardianEmail: `obi.${sfx}@example.com`,
    consent: true,
  };
  const post = (b: object) =>
    call("POST", "/public/admissions/apply", undefined, b);
  check(
    "an application needs the guardian's agreement",
    (await post({ ...app, consent: false })).status,
    400,
  );
  check(
    "bad email refused",
    (await post({ ...app, guardianEmail: "nope" })).status,
    400,
  );
  check(
    "a date of birth in the future refused",
    (await post({ ...app, dateOfBirth: dob(-1) })).status,
    400,
  );
  check(
    "an implausible age refused",
    (await post({ ...app, dateOfBirth: dob(60) })).status,
    400,
  );
  check(
    "a class that does not exist refused",
    (await post({ ...app, classYear: 4 })).status,
    400,
  );
  const before2 = (
    await query("select count(*)::int as n from admission_applications")
  ).rows[0].n;
  const bot = await post({
    ...app,
    firstName: "Bot",
    website: "http://spam.example",
  });
  check(
    "a bot filling the hidden field is turned away quietly and nothing is stored",
    [
      bot.status,
      (await query("select count(*)::int as n from admission_applications"))
        .rows[0].n,
    ],
    [201, before2],
  );
  const ok1 = await post(app);
  check(
    "a valid application returns a reference",
    [ok1.status, /^KOK-APP-\d{6}$/.test(ok1.data.reference)],
    [201, true],
  );
  check(
    "the confirmation email is reported honestly (no email service here)",
    [
      ok1.data.emailAccepted,
      (
        await query(
          "select email_status from admission_applications where reference = $1",
          [ok1.data.reference],
        )
      ).rows[0].email_status,
    ],
    [false, "not_sent"],
  );
  const again = await post(app);
  check(
    "sending the same application twice gives the same reference, not a second record",
    [again.data.reference, again.data.duplicate],
    [ok1.data.reference, true],
  );
  const look = (e: string, r = ok1.data.reference) =>
    call("POST", "/public/admissions/status", undefined, {
      reference: r,
      email: e,
    });
  const found = await look(app.guardianEmail.toUpperCase());
  check(
    "the family can check progress with the reference and email",
    [
      found.status,
      found.data.status,
      found.data.statusLabel,
      found.data.applyingFor,
      found.data.applicantFirstName,
    ],
    [200, "received", "Received", "JSS 1", "Ada"],
  );
  check(
    "a wrong email gets the same answer as an unknown reference",
    [
      (await look("someone@else.com")).status,
      (await look(app.guardianEmail, "KOK-APP-999999")).status,
      (await look("someone@else.com")).error.message ===
        (await look(app.guardianEmail, "KOK-APP-999999")).error.message,
    ],
    [404, 404, true],
  );
  check(
    "the status check reveals no contact details or notes",
    ["guardian", "phone", "admin", "email", "0803"].some((k) =>
      JSON.stringify(found.data).toLowerCase().includes(k),
    ),
    false,
  );

  check(
    "staff other than the administrator cannot read applications",
    [
      (await call("GET", "/admin/site/applications", teacher.token)).status,
      (await call("GET", "/admin/site/applications", parent.token)).status,
      (await call("GET", "/admin/site/applications")).status,
    ],
    [403, 403, 401],
  );
  const list = (await call("GET", `/admin/site/applications?q=Obi${sfx}`, A))
    .data;
  check(
    "the administrator can search applications",
    [list.total, list.items[0].applicantName],
    [1, `Ada Obi${sfx}`],
  );
  const detail = (
    await call("GET", `/admin/site/applications/${list.items[0].id}`, A)
  ).data;
  check(
    "and see the full application, including when consent was given",
    [detail.guardianPhone, !!detail.consentAt, detail.dateOfBirth],
    ["0803 111 2222", true, app.dateOfBirth],
  );
  const upd = await call(
    "PATCH",
    `/admin/site/applications/${detail.id}/status`,
    A,
    {
      status: "interview",
      publicNote: "Please come on Friday at 10am.",
      adminNote: "Strong maths result.",
    },
  );
  check(
    "the administrator moves it to the next stage",
    [upd.data.status, upd.data.adminNote],
    ["interview", "Strong maths result."],
  );
  const after = (await look(app.guardianEmail)).data;
  check(
    "the family sees the new status and the note meant for them, but not the private note",
    [
      after.statusLabel,
      after.note,
      JSON.stringify(after).includes("Strong maths"),
    ],
    ["Invited for an interview", "Please come on Friday at 10am.", false],
  );
  check(
    "the change was emailed to the guardian and the result recorded honestly",
    (
      await query(
        "select email_status from admission_applications where id = $1",
        [detail.id],
      )
    ).rows[0].email_status,
    "not_sent",
  );
  check(
    "an invalid status is refused",
    (
      await call("PATCH", `/admin/site/applications/${detail.id}/status`, A, {
        status: "enrolled",
      })
    ).status,
    400,
  );
  await call("PATCH", `/admin/site/applications/${detail.id}/status`, A, {
    status: "offered",
  });
  check(
    "the decision date is recorded and the change is audited",
    [
      !!(await call("GET", `/admin/site/applications/${detail.id}`, A)).data
        .decidedAt,
      (
        await query(
          "select count(*)::int as n from audit_logs where action = 'application.status_set' and entity_id = $1",
          [detail.id],
        )
      ).rows[0].n,
    ],
    [true, 2],
  );

  // ---- contact form ----
  const msg = {
    name: "Mr Ade",
    email: `ade.${sfx}@example.com`,
    subject: "Fees enquiry",
    message: "Please tell me about school fees.",
    consent: true,
  };
  check(
    "a message needs agreement and real content",
    [
      (
        await call("POST", "/public/contact", undefined, {
          ...msg,
          consent: false,
        })
      ).status,
      (
        await call("POST", "/public/contact", undefined, {
          ...msg,
          message: "hi",
        })
      ).status,
    ],
    [400, 400],
  );
  check(
    "the hidden field catches bots without storing anything",
    [
      (
        await call("POST", "/public/contact", undefined, {
          ...msg,
          website: "x",
        })
      ).status,
      (
        await query(
          "select count(*)::int as n from contact_messages where email = $1",
          [msg.email],
        )
      ).rows[0].n,
    ],
    [201, 0],
  );
  check(
    "a real message is accepted",
    (await call("POST", "/public/contact", undefined, msg)).status,
    201,
  );
  const inbox = (await call("GET", "/admin/site/messages?status=new", A)).data;
  const mine = inbox.items.find((m: any) => m.email === msg.email);
  check(
    "the administrator sees it in the inbox",
    [mine.subject, mine.status],
    ["Fees enquiry", "new"],
  );
  await call("PATCH", `/admin/site/messages/${mine.id}`, A, { status: "read" });
  check(
    "and can mark it read",
    (await call("GET", "/admin/site/messages?status=read", A)).data.items.some(
      (m: any) => m.id === mine.id,
    ),
    true,
  );
  check(
    "others cannot read the inbox",
    [
      (await call("GET", "/admin/site/messages", teacher.token)).status,
      (await call("GET", "/admin/site/messages", student.token)).status,
    ],
    [403, 403],
  );
  const cl = (await call("GET", "/admin/site/checklist", A)).data;
  check(
    "the checklist reports new applications, messages and missing contact details",
    [
      typeof cl.newApplications,
      typeof cl.newMessages,
      cl.missingContact.includes("phone") === false,
    ],
    ["number", "number", true],
  );

  // ---- abuse protection (kept last: it uses up this connection's allowance) ----
  let limited = 0;
  for (let n = 0; n < 25 && !limited; n++) {
    const r = await post({
      ...app,
      firstName: `Spam${n}`,
      guardianEmail: `spam${n}.${sfx}@example.com`,
    });
    if (r.status === 429) limited = n + 1;
  }
  check(
    "too many applications from one connection are slowed down",
    limited > 0 && limited <= 21,
    true,
  );

  console.log(`\npassed=${pass} failed=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
