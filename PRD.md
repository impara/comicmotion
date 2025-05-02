### Product Requirements Document (PRD)

ComicMotion v 1.0 – “Selfie-to-Animated Short”

| Field        | Detail                                                  |
| ------------ | ------------------------------------------------------- |
| Author       | Product Team @ ComicMotion                              |
| Stakeholders | Founders, Engineering, Design, Growth, Customer Success |
| Last updated | 02 May 2025                                             |
| Status       | Draft – ready for engineering estimation                |

---

#### 1. Purpose

Enable anyone to transform a selfie into a 10-second animated comic short in ≤5 minutes—no design skills required.

#### 2. Background / Opportunity

Short-form video dominates social feeds, but creating eye-catching animated content still requires costly software or agencies. New image- and video-generation models on Replicate (GPT-Image-1, Minimax video-01-live) make high-quality, personalized animation feasible at consumer price points. Commoditizing this workflow in a single web app is the gap ComicMotion will fill.

#### 3. Goals & Success Metrics

| Goal             | Metric                                        | Target (M30) |
| ---------------- | --------------------------------------------- | ------------ |
| Rapid conversion | Median time: upload → download                | < 5 min      |
| Engagement       | % users who share/download within 24 h        | ≥ 40 %       |
| Monetization     | Paid conversion rate from Free → Creator plan | ≥ 8 %        |
| Reliability      | Successful render ratio                       | ≥ 97 %       |
| Cost control     | Avg COGS per 10 s clip                        | ≤ $0.15      |

#### 4. Personas

1. **Influencer Ivy** – TikTok creator, wants daily fresh content; values speed.
2. **Marketer Max** – runs paid social ads; needs brand consistency & 4 K output.
3. **Casual Carl** – posts birthday memes; free tier.

#### 5. Scope (MVP v1)

Core flow only; templates, audio, and API in later releases.

| Step | Requirement                                                       | Priority |
| ---- | ----------------------------------------------------------------- | -------- |
| 1    | Upload selfie (JPG/PNG ≤8 MB)                                     | P0       |
| 2    | Call GPT-Image-1 → full-body comic avatar (1024×1024)             | P0       |
| 3    | Display 3 “theme” thumbnails (city, fantasy, neon)                | P0       |
| 4    | Generate 1920 × 1080 scene with selected theme                    | P0       |
| 5    | Animate scene to 6- or 10-second MP4 via video-01-live            | P0       |
| 6    | Progress tracker & ETA                                            | P0       |
| 7    | Download MP4 or copy share-link                                   | P0       |
| 8    | Sign-up/login, credit counter, Stripe billing                     | P0       |
| 9    | Content safety filter (OpenAI moderation + imghash nudity detect) | P0       |
| 10   | Render history & delete request (“Right to Erasure”)              | P1       |
| 11   | Watermark for Free tier, toggled off for paid                     | P1       |

Out-of-scope for v1:  
• Audio/music overlay, • API endpoints, • Mobile app, • Fine-tuned personal avatar.

#### 6. Functional Requirements

##### 6.1 Upload Service

- Accepts image, validates format/size, stores in R2, returns URL.
- Generates perceptual hash & runs NSFW check; block if score > 0.8.

##### 6.2 Avatar Generation

- POST to Replicate GPT-Image-1 endpoint with system prompt + user selfie.
- Poll job until `succeeded`; store result URL.
- Retry logic: max 2 attempts, exponential backoff.

##### 6.3 Scene Generation

- Provide avatar URL as conditioning image.
- Inject theme-specific prompt + “horizontal HD, 1920×1080”.
- Same polling & storage flow.

##### 6.4 Animation Service

- Send HD scene to video-01-live with default “walk-forward” animation & mild camera pan.
- Allow duration param (6 s default, 10 s for paid).
- On completion, transcode to H.264 MP4, 30 fps.

##### 6.5 Credits & Billing

- Each avatar+scene+video chain = 1 render credit.
- Free users start with 5 credits; background cron adds none.
- Paid plans use Stripe subscriptions; webhook updates `credits_remaining`.

##### 6.6 Frontend

- Next.js pages: `/upload`, `/themes`, `/progress`, `/download`, `/account`.
- Real-time progress via WebSocket channel from queue worker.

##### 6.7 Admin Dashboard

- List last 500 jobs, status, cost, user id.
- Manually re-queue or refund credits.

#### 7. Non-Functional Requirements

| Area          | Spec                                                      |
| ------------- | --------------------------------------------------------- |
| Performance   | API p95 < 300 ms (excluding model latency)                |
| Scalability   | Horizontal queue workers; target 1 000 concurrent renders |
| Security      | SOC 2-ready stack; encrypted at rest; signed URLs         |
| Accessibility | WCAG 2.1 AA for all user flows                            |
| Localization  | i18n ready; EN only in v1                                 |

#### 8. User Stories (abridged)

1. _As a new user,_ I can sign up with Google so I’m ready in <30 s.
2. _As a free user,_ I can see remaining credits after each render.
3. _As a creator,_ I can pick a “cyberpunk” theme so my clip matches my channel aesthetic.
4. _As a marketer,_ I can pay to remove the watermark for brand safety.
5. _As support,_ I can refund credits on failed jobs.

#### 9. UX & Design Notes

- Clean, card-based steps (Progress: 1 ▶ 2 ▶ 3).
- Show a looping skeleton loader GIF while polling Replicate.
- Theme picker uses hover previews (static thumbnails).
- Failure modal with friendly copy & “Try again (no credit charge)”.

#### 10. Dependencies

| Dependency                         | Owner     | Risk             |
| ---------------------------------- | --------- | ---------------- |
| Replicate GPT-Image-1 SLA          | Replicate | Medium           |
| Minimax video-01-live availability | Replicate | High (new model) |
| Stripe compliance review           | Finance   | Low              |

Mitigations: add status polling & auto-refund; maintain fallback queue to re-try after 30 min.

#### 11. Risks & Assumptions

1. **Model output variance** may disappoint users → show 3 avatar variants, pick best.
2. **Copyright/NSFW** misuse → strict moderation + watermark until review.
3. **Render cost spikes** if viral growth → throttle free plan via waitlist.

#### 12. Milestones & Timeline (T-Day = 0 when Dev starts)

| Week | Deliverable                                     |
| ---- | ----------------------------------------------- |
| 0–1  | Design hand-off, infra skeleton, Auth & billing |
| 2–3  | Upload + avatar gen flow working in staging     |
| 4    | Theme picker & scene gen                        |
| 5    | Animation pipeline & progress UI                |
| 6    | End-to-end happy path demo                      |
| 7    | QA, security review, observability              |
| 8    | Soft launch (invite-only)                       |
| 10   | Public beta + Product Hunt                      |

#### 13. KPIs for Launch Review

• 1 000 renders completed in first 72 h  
• ≤3 % failure rate  
• NPS ≥40 from initial beta survey  
• Gross margin ≥40 %

---

##### Open Questions

1. Should we cache commonly used themes to reduce cost?
2. Minimum selfie resolution required for acceptable avatar fidelity?
3. Legal review needed for cross-border data transfer to Replicate’s region?

---

_End of PRD v 1.0_
