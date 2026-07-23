"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Subject = {
  code: string;
  colour: string;
  lesson: string;
  name: string;
  progress: number;
  teacher: string;
};

const subjects: Subject[] = [
  {
    code: "MA",
    colour: "blue",
    lesson: "Algebraic expressions",
    name: "Mathematics",
    progress: 76,
    teacher: "Mr. Mensah",
  },
  {
    code: "EN",
    colour: "orange",
    lesson: "Comprehension skills",
    name: "English Language",
    progress: 64,
    teacher: "Mrs. Owusu",
  },
  {
    code: "IS",
    colour: "green",
    lesson: "The human digestive system",
    name: "Integrated Science",
    progress: 82,
    teacher: "Ms. Asante",
  },
  {
    code: "SS",
    colour: "purple",
    lesson: "Citizenship and identity",
    name: "Social Studies",
    progress: 58,
    teacher: "Mr. Addo",
  },
  {
    code: "CT",
    colour: "cyan",
    lesson: "Working with data",
    name: "Computing",
    progress: 71,
    teacher: "Mrs. Tetteh",
  },
  {
    code: "RM",
    colour: "rose",
    lesson: "Values and community",
    name: "Religious & Moral Education",
    progress: 67,
    teacher: "Mr. Kusi",
  },
];

const schedule = [
  { room: "Block A · Room 4", subject: "Mathematics", time: "8:00" },
  { room: "Science Lab", subject: "Integrated Science", time: "9:20" },
  { room: "Block A · Room 4", subject: "English Language", time: "11:00" },
];

const deadlines = [
  { date: "24 Jul", subject: "Mathematics", title: "Algebra practice set" },
  { date: "26 Jul", subject: "English Language", title: "Comprehension exercise" },
  { date: "29 Jul", subject: "Social Studies", title: "Community interview" },
];

const navigation = [
  { key: "overview", label: "Overview", symbol: "⌂" },
  { key: "class", label: "My class", symbol: "◎" },
  { key: "subjects", label: "Subjects", symbol: "▦" },
  { key: "assessments", label: "Assessments", symbol: "✓" },
  { key: "calendar", label: "Calendar", symbol: "□" },
  { key: "reports", label: "Reports", symbol: "↗" },
  {
    href: "/admin/academic",
    key: "admin",
    label: "School admin",
    symbol: "⚙",
  },
];

export default function Home() {
  const [activeSubject, setActiveSubject] = useState(subjects[2]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  const filteredSubjects = useMemo(() => {
    const normalisedQuery = query.trim().toLowerCase();
    if (!normalisedQuery) {
      return subjects;
    }

    return subjects.filter((subject) =>
      `${subject.name} ${subject.teacher} ${subject.lesson}`
        .toLowerCase()
        .includes(normalisedQuery),
    );
  }, [query]);

  function continueLesson() {
    setNotice(`Opening ${activeSubject.name}: ${activeSubject.lesson}`);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <a className="brand" href="#overview" aria-label="Learners Hub home">
          <span className="brand-mark" aria-hidden="true">
            LH
          </span>
          <span>
            <strong>Learners</strong>
            <small>Hub</small>
          </span>
        </a>

        <nav className="desktop-nav">
          <p className="nav-label">Learning</p>
          {navigation.map((item, index) => (
            <Link
              className={index === 0 ? "nav-link active" : "nav-link"}
              href={item.href ?? `#${item.key}`}
              key={item.key}
            >
              <span aria-hidden="true">{item.symbol}</span>
              {item.label}
              {item.key === "assessments" && <em>3</em>}
            </Link>
          ))}
        </nav>

        <div className="sidebar-card">
          <span className="sidebar-card-icon" aria-hidden="true">
            ?
          </span>
          <strong>Need a hand?</strong>
          <p>Ask your teacher or visit the learner help centre.</p>
          <button type="button">Get help</button>
        </div>

        <button className="sidebar-profile" type="button">
          <span className="avatar">KA</span>
          <span>
            <strong>Kwame Agyeman</strong>
            <small>JHS 2 Gold</small>
          </span>
          <span aria-hidden="true">⋯</span>
        </button>
      </aside>

      <main id="overview">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark" aria-hidden="true">
              LH
            </span>
            <strong>Learners Hub</strong>
          </div>

          <label className="search">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Search subjects and lessons</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search subjects or lessons"
              type="search"
              value={query}
            />
            <kbd>⌘ K</kbd>
          </label>

          <div className="topbar-actions">
            <Link className="admin-entry" href="/admin/academic">
              Admin workspace <span aria-hidden="true">→</span>
            </Link>
            <button className="icon-button" type="button" aria-label="Notifications">
              <span aria-hidden="true">●</span>
              <i />
            </button>
            <span className="avatar">KA</span>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome" aria-labelledby="welcome-heading">
            <div>
              <p className="eyebrow">Thursday, 23 July</p>
              <h1 id="welcome-heading">Good afternoon, Kwame.</h1>
              <p>You are building a strong week. Keep the momentum going.</p>
            </div>
            <a className="class-chip" href="#class">
              <span aria-hidden="true">J2</span>
              <span>
                <small>My class</small>
                <strong>JHS 2 Gold</strong>
              </span>
              <b aria-hidden="true">→</b>
            </a>
          </section>

          <div className="dashboard-grid">
            <div className="dashboard-main">
              <section className="continue-card" aria-labelledby="continue-heading">
                <div className="continue-content">
                  <div className="lesson-kicker">
                    <span>Continue learning</span>
                    <b>{activeSubject.progress}% complete</b>
                  </div>
                  <p>{activeSubject.name}</p>
                  <h2 id="continue-heading">{activeSubject.lesson}</h2>
                  <span className="teacher-line">
                    <span className={`mini-code ${activeSubject.colour}`}>
                      {activeSubject.code}
                    </span>
                    {activeSubject.teacher} · Lesson 6 of 8
                  </span>
                  {activeSubject.name === "Integrated Science" ? (
                    <Link
                      className="primary-button"
                      href="/learn/subjects/integrated-science"
                    >
                      Continue lesson <span aria-hidden="true">→</span>
                    </Link>
                  ) : (
                    <button className="primary-button" onClick={continueLesson} type="button">
                      Continue lesson <span aria-hidden="true">→</span>
                    </button>
                  )}
                  {notice && (
                    <p className="action-notice" role="status">
                      {notice}
                    </p>
                  )}
                </div>
                <div className="lesson-visual" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="science-core">
                    <span />
                    <span />
                    <span />
                  </div>
                  <p>Explore · Practise · Master</p>
                </div>
              </section>

              <section className="stat-row" aria-label="Learning summary">
                <article className="stat-card">
                  <span className="stat-icon green">✓</span>
                  <div>
                    <small>Attendance</small>
                    <strong>96%</strong>
                  </div>
                  <em>+2% this term</em>
                </article>
                <article className="stat-card">
                  <span className="stat-icon gold">!</span>
                  <div>
                    <small>Tasks due</small>
                    <strong>3</strong>
                  </div>
                  <em>Next due tomorrow</em>
                </article>
                <article className="stat-card">
                  <span className="stat-icon blue">↗</span>
                  <div>
                    <small>Overall average</small>
                    <strong>82%</strong>
                  </div>
                  <em>Top 20% of class</em>
                </article>
              </section>

              <section id="subjects" className="subjects-section" aria-labelledby="subjects-heading">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Your learning</p>
                    <h2 id="subjects-heading">My subjects</h2>
                  </div>
                  <a href="#subjects">View all <span aria-hidden="true">→</span></a>
                </div>

                {filteredSubjects.length > 0 ? (
                  <div className="subject-grid">
                    {filteredSubjects.map((subject) => (
                      <button
                        className={
                          subject.name === activeSubject.name
                            ? "subject-card selected"
                            : "subject-card"
                        }
                        key={subject.name}
                        onClick={() => {
                          setActiveSubject(subject);
                          setNotice("");
                        }}
                        type="button"
                      >
                        <span className={`subject-code ${subject.colour}`}>
                          {subject.code}
                        </span>
                        <span className="subject-copy">
                          <strong>{subject.name}</strong>
                          <small>{subject.teacher}</small>
                        </span>
                        <span className="subject-progress">
                          <span>
                            <i style={{ width: `${subject.progress}%` }} />
                          </span>
                          <small>{subject.progress}%</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state" role="status">
                    <strong>No matching subjects</strong>
                    <p>Try searching by subject, teacher, or lesson name.</p>
                    <button onClick={() => setQuery("")} type="button">
                      Clear search
                    </button>
                  </div>
                )}
              </section>

              <section className="focus-card" aria-label="Weekly learning insight">
                <span className="focus-mark" aria-hidden="true">★</span>
                <div>
                  <p className="eyebrow">This week&apos;s focus</p>
                  <h2>You&apos;re one lesson away from your Science goal.</h2>
                  <p>Finish the digestive system lesson to reach your weekly target.</p>
                </div>
                <button
                  onClick={() => {
                    setActiveSubject(subjects[2]);
                    setNotice("Science is ready when you are.");
                  }}
                  type="button"
                >
                  Go to Science
                </button>
              </section>
            </div>

            <aside className="dashboard-rail" aria-label="Schedule and deadlines">
              <section className="panel" id="calendar">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Today</p>
                    <h2>My timetable</h2>
                  </div>
                  <button type="button" aria-label="Open full timetable">•••</button>
                </div>
                <div className="schedule">
                  {schedule.map((item, index) => (
                    <article className={index === 1 ? "schedule-item current" : "schedule-item"} key={item.time}>
                      <time>{item.time}</time>
                      <span className="schedule-line" />
                      <div>
                        <strong>{item.subject}</strong>
                        <small>{item.room}</small>
                      </div>
                      {index === 1 && <em>Next</em>}
                    </article>
                  ))}
                </div>
                <a className="panel-link" href="#calendar">View full timetable</a>
              </section>

              <section className="panel" id="assessments">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Keep on track</p>
                    <h2>Upcoming work</h2>
                  </div>
                  <span className="count-badge">3</span>
                </div>
                <div className="deadline-list">
                  {deadlines.map((item) => (
                    <article className="deadline-item" key={item.title}>
                      <time>
                        <strong>{item.date.split(" ")[0]}</strong>
                        <span>{item.date.split(" ")[1]}</span>
                      </time>
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.subject}</small>
                      </div>
                      <span aria-hidden="true">→</span>
                    </article>
                  ))}
                </div>
                <a className="panel-link" href="#assessments">See all assessments</a>
              </section>

              <section className="teacher-note">
                <div className="note-header">
                  <span className="avatar teacher-avatar">EA</span>
                  <span>
                    <strong>Mrs. E. Aidoo</strong>
                    <small>Class teacher</small>
                  </span>
                </div>
                <p>“Remember to bring your project materials on Friday. You&apos;re doing well, class!”</p>
                <small>Posted 2 hours ago</small>
              </section>
            </aside>
          </div>
        </div>

        <nav className="mobile-nav" aria-label="Mobile navigation">
          {[...navigation.slice(0, 4), navigation[6]].map((item, index) => (
            <Link
              className={index === 0 ? "active" : ""}
              href={item.href ?? `#${item.key}`}
              key={item.key}
            >
              <span aria-hidden="true">{item.symbol}</span>
              <small>{item.label}</small>
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
