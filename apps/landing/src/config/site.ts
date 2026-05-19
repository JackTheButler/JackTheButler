// Central site config so copy + nav live in one place and grow cleanly.
export const site = {
  name: 'Jane the Operator',
  tagline: 'Your AI support agent that never sleeps',
  description:
    'Jane handles your customer conversations across webchat and beyond, resolving questions instantly and escalating to your team only when it matters.',
  ctaLabel: 'Get started',
  ctaHref: '/signup',
};

export const nav: { label: string; href: string }[] = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
];
