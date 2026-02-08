# Jack The Butler - Landing Page Planning

## Primary Goal

Convert visitors into self-hosted deployments (Railway, Docker, etc.)

---

## Target Audience

| Segment | Pain Point | What They Want |
|---------|-----------|----------------|
| **Hotel Owners/GMs** | Overwhelmed staff, missed guest requests | Automated guest communication 24/7 |
| **Boutique Hotels** | Can't afford enterprise solutions | Affordable, self-hosted AI assistant |
| **Tech-Savvy Operators** | Vendor lock-in, data privacy concerns | Open source, own your data |
| **Property Managers** | Managing multiple properties | Unified communication across channels |

**Primary Persona:** Small-to-medium hotel owner who wants AI automation but doesn't want expensive monthly SaaS fees or to give guest data to third parties.

---

## Value Proposition

### Headline Options (A/B test)
1. "Your AI Concierge That Never Sleeps"
2. "Stop Losing Guests to Slow Responses"
3. "AI-Powered Guest Communication. Self-Hosted. Free."

### Sub-headline
"Handle WhatsApp, SMS, and email inquiries automatically. Deploy in 5 minutes. Own your data."

### Key Differentiators
- **Self-hosted** - Your data stays on your server
- **One-click deploy** - Railway/Docker in minutes
- **Multi-channel** - WhatsApp, SMS, Email, Web Chat
- **AI-powered** - Claude, OpenAI, or run locally
- **Open source** - No vendor lock-in

---

## Conversion Actions (Priority Order)

1. **Primary CTA:** "Deploy Free on Railway" (one-click)
2. **Secondary CTA:** "Try Live Demo"
3. **Tertiary:** "View on GitHub" / "Read Docs"

---

## Page Structure

### Above the Fold (Hero)
- Headline + Sub-headline
- Primary CTA button (Deploy on Railway)
- Secondary CTA (Live Demo)
- Simple product visual/screenshot
- Trust signals: "Open Source" | "Self-Hosted" | "Free"

### Section 1: Problem → Solution
**"Your front desk can't be everywhere. Jack can."**
- Guest messages at 2am go unanswered
- Staff overwhelmed during peak times
- Missed bookings = lost revenue

→ Jack handles it automatically, 24/7

### Section 2: How It Works (3 Steps)
1. **Deploy** - One click on Railway or Docker
2. **Connect** - Link WhatsApp, SMS, or Email
3. **Relax** - Jack handles guest inquiries automatically

### Section 3: Features (Visual Grid)
- Multi-channel inbox (WhatsApp, SMS, Email, Web)
- AI responses with your hotel's knowledge
- Smart escalation to staff when needed
- Guest memory across conversations
- Task creation and tracking
- Analytics and insights

### Section 4: Why Self-Hosted?
- Your data never leaves your server
- No monthly per-message fees
- Works offline / local AI option
- Full customization control
- No vendor lock-in

### Section 5: Social Proof
- GitHub stars count
- "Trusted by X hotels" (when available)
- Testimonial quotes (when available)
- Tech stack logos (Node.js, SQLite, etc.)

### Section 6: Deployment Options
Cards for each option:
- Railway (Recommended - one click)
- Docker
- Manual installation

### Section 7: FAQ
- How much does it cost? (Free, open source)
- What AI providers are supported?
- Can I run it without cloud AI?
- How do I connect WhatsApp?
- Is my data secure?

### Footer
- CTA repeat: "Ready to automate your guest communication?"
- Links: GitHub, Docs, Discord/Community
- Domain: JackTheButler.com

---

## Conversion Optimization Elements

### Trust Builders
- [ ] Open source badge
- [ ] GitHub stars (live count)
- [ ] "No credit card required"
- [ ] Security/privacy messaging
- [ ] Tech stack transparency

### Urgency/Motivation
- [ ] "Deploy in under 5 minutes"
- [ ] "Free forever for self-hosted"
- [ ] Problem-focused copy (lost revenue, overwhelmed staff)

### Friction Reducers
- [ ] One-click deploy buttons
- [ ] Live demo (no signup)
- [ ] Clear pricing (free)
- [ ] Simple 3-step process visual

### Social Proof
- [ ] GitHub activity indicators
- [ ] User count/hotel count (when available)
- [ ] Testimonials (when available)

---

## Design Principles

### Visual Style
- Clean, minimal, professional
- Dark mode default (modern tech feel)
- Accent color for CTAs (high contrast)
- Generous whitespace
- Max-width content (readable)

### Typography
- System fonts for speed (or single variable font)
- Large, bold headlines
- Readable body text (16-18px)

### Animations
- Subtle fade-in on scroll (intersection observer)
- Smooth scroll behavior
- Hover states on interactive elements
- No heavy libraries (vanilla JS or minimal)

### Performance Targets
- < 100KB total page weight
- < 1s First Contentful Paint
- 100 Lighthouse performance score
- No JavaScript required for core content

---

## Technical Stack

### Framework
- **Astro** - Static site generator, component-based
- **Tailwind CSS** - Utility-first CSS (purged to ~5KB)
- Zero JS output by default
- TypeScript strict mode

### Project Structure
```
apps/landing/
├── src/
│   ├── components/
│   │   ├── Hero.astro
│   │   ├── Problem.astro
│   │   ├── HowItWorks.astro
│   │   ├── Features.astro
│   │   ├── WhySelfHosted.astro
│   │   ├── DeployOptions.astro
│   │   ├── FAQ.astro
│   │   └── Footer.astro
│   ├── layouts/
│   │   └── Layout.astro
│   └── pages/
│       └── index.astro
├── public/
│   ├── images/
│   ├── CNAME              # jackthebutler.com
│   └── favicon.svg
├── astro.config.mjs
├── tailwind.config.mjs
└── package.json
```

### Hosting
- **GitHub Pages** (free)
- Custom domain: **jackthebutler.com**
- Free SSL via Let's Encrypt
- GitHub Actions for auto-deploy on push

### DNS Configuration
```
A     @     185.199.108.153
A     @     185.199.109.153
A     @     185.199.110.153
A     @     185.199.111.153
CNAME www   <username>.github.io
```

### Assets
- SVG icons (inline)
- Optimized screenshots (WebP)
- System font stack (no external fonts)

---

## Content Needed

### Copy
- [ ] Headline variations (for A/B)
- [ ] Feature descriptions
- [ ] FAQ answers
- [ ] CTA button text

### Visuals
- [ ] Product screenshots (dashboard, chat)
- [ ] Deployment flow diagram
- [ ] Feature icons (SVG)
- [ ] Logo/brand mark

### Social Proof
- [ ] GitHub star count API
- [ ] Testimonials (future)
- [ ] Hotel logos (future)

---

## Success Metrics

1. **Primary:** Railway deploy clicks
2. **Secondary:** GitHub clicks
3. **Tertiary:** Docs/demo visits
4. Bounce rate < 40%
5. Time on page > 30s

---

## Launch Checklist

### Development
- [ ] Mobile responsive
- [ ] SEO meta tags
- [ ] Open Graph images (1200x630)
- [ ] Favicon (SVG + PNG fallback)
- [ ] Deploy button integration
- [ ] Live demo link
- [ ] GitHub link
- [ ] Documentation link

### Deployment
- [ ] GitHub repo for landing page
- [ ] GitHub Actions workflow (deploy on push)
- [ ] CNAME file with jackthebutler.com
- [ ] DNS configured (A records + CNAME)
- [ ] SSL enabled in GitHub Pages settings
- [ ] Analytics (privacy-friendly, e.g., Plausible)

---

## Future Iterations

- A/B test headlines
- Add video demo
- Collect testimonials
- Add pricing comparison vs competitors
- Blog/content marketing integration
