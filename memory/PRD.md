# ITALIACORSI – Gestionale commerciale (PRD)

## Problem statement
Replace Pipedrive for the ITALIACORSI sales team (commerciale.italiacorsi.it). Three sections: Contatti, Affari, Attività. Pipedrive-like UI with ITALIACORSI colors (#0a3b7c, #C9A227). Users: Angelo (admin), Luca, Cristina, Carla (sales). Everyone sees every contact. Leads from Facebook and the website arrive as "Da assegnare" and a salesperson clicks "Prendo io". Duplicates are checked by email and phone. Deal stages run from Contatto ricevuto to Aggiudicato or Perso. The later stages arrive from contratti.italiacorsi.it through a webhook. Activities have date filters and quick reschedule. Contacts, deals, notes and activities can be imported from Pipedrive. Products are read-only from contratti and sync every hour. The CRM drives contratti through its API (proposals, sending, reminders, extensions, payments, LMS, invoices), acting as the signed-in salesperson. Sample data is used until the API is ready. The deal page is still to come: the user will send it.

## Architecture
- FastAPI (server.py) + MongoDB, React + Tailwind/shadcn. Sign-in is Emergent-managed Clerk with email and password. Roles: admin, commerciale, in_attesa (default, no access). ADMIN_EMAIL=a.ricci@italiacorsi.it
- Collections: users, persons, organizations, deals, activities, notes, history, products, meta, mock_proposte, cron_runs
- Webhooks: /api/webhooks/contratti (X-Webhook-Secret), /api/webhooks/leads (X-Leads-Secret)
- Contratti client: CONTRATTI_API_URL/KEY. While these are empty, SAMPLE data (MOCKED) is used. Cron /api/cron/sync-prodotti runs hourly (.emergent/crons.yml)

## Implemented (2026-06)
- Contacts: people and organisations, labels, duplicate warning, Da assegnare + Prendo io, admin assignment
- Contact page: summary, details, deals (with Crea proposta), overview, notes, activity form with presets and a day mini-calendar, planned activities, timeline
- Deals: kanban with drag and drop, and a list view. Activities: filters, mark done, quick reschedule
- Import of Pipedrive CSV files with column mapping. User and role management. Collegamenti page showing secrets, API contract and product catalogue
- Proposals (MOCKED): create, preview, send, resend, reminders, extension, payment, LMS, invoice, plus simulation of contratti events

## Backlog
- P0: deal page (waiting for the user's design). Connect the real contratti API. Real lead source (Zapier/Make/site form)
- P1: bulk actions on lists, saved filters, merging duplicates
- P2: dashboards/reports, email/phone integration
