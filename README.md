# CodeCinematic

CodeCinematic is a SaaS web app for turning code snippets and inline explanation comments into cinematic typing-animation videos.

## Stack

- Next.js App Router
- React
- Tailwind CSS
- Supabase Auth / Postgres / Storage
- Browser-side video rendering with `MediaRecorder`

## Included

- landing page
- demo auth for free/basic/medium/high plans
- cinematic code editor
- browser video export flow
- Supabase SQL bootstrap
- deployment guide

## Setup

1. Copy `.env.example` to `.env`
2. Fill in your keys
3. Run `npm install`
4. Follow [deployment.md](./deployment.md)

## Demo login

- Email: `admin@example.com`
- Password: `adminpassword123`
- Plan: Enterprise / premium demo access

## Video export note

The code video editor exports high-bitrate browser-native `.webm` files by default. This avoids the heavy in-browser FFmpeg conversion step and keeps rendering smoother on normal creator laptops.
