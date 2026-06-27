# OJT-Management_System

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-yziqzkdr)
# OJT Management System Frontend (Staging)

This repository contains the **frontend application (staging environment)** for the OJT Management System built using React (Vite).

It provides role-based dashboards and interfaces for Admin, Mentor, and Student workflows.

---

## Tech Stack

- **Framework**: React.js (Vite)
- **Language**: JavaScript / TypeScript
- **Styling**: Vanilla CSS (CSS Modules / custom styles)
- **API Communication**: Axios / React Query
- **Authentication**: JWT (HTTP-only cookies)
- **QR Scanner**: html5-qrcode

---

## Roles

- **Admin**: Manages semesters, batches, students, mentors, credits
- **Mentor**: Assigns/reviews tasks, provides feedback
- **Student**: Submits tasks, tracks progress, attendance via QR

---

## Core Features

- Role-based dashboards
- Task journey tracking system
- Versioned submissions (v1, v2, v3…)
- Mentor feedback & comments
- QR-based attendance system
- Cloud credit visibility (AWS/GCP/etc.)

---

## Backend Integration

The frontend communicates with REST APIs for:

- Authentication
- Task management
- Submissions & reviews
- Attendance tracking
- Credits system


localhost url : http://localhost:5175/


## Getting Started

### Install dependencies

npm install

Run development server

npm run dev

Build

npm run build
npm run preview

## Staging Info

This branch is used for staging deployment and testing before production release.
