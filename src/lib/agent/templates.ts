// Artifact template definitions and detection

import { Template } from './types';

export interface TemplateDefinition {
  type: Template;
  artifacts: string[];
  description: string;
}

export const TEMPLATES: Record<Template, TemplateDefinition> = {
  [Template.SocialMediaPost]: {
    type: Template.SocialMediaPost,
    artifacts: ['Copy', 'Hashtags', 'Visual suggestion'],
    description: 'Social media content (Twitter, LinkedIn, Instagram, Facebook)',
  },

  [Template.ProductPageUI]: {
    type: Template.ProductPageUI,
    artifacts: ['Context-dependent sections based on issue/wireframe'],
    description: 'Product page copy',
  },

  [Template.EmailCampaign]: {
    type: Template.EmailCampaign,
    artifacts: ['Subject line', 'Body copy'],
    description: 'Email or newsletter campaign',
  },

  [Template.LandingPage]: {
    type: Template.LandingPage,
    artifacts: ['Header/Hero', 'Description', 'Additional sections as needed'],
    description: 'Landing page copy',
  },

  [Template.BlogPost]: {
    type: Template.BlogPost,
    artifacts: [
      'Headline',
      '2 alternative headlines',
      'Introduction',
      'Body outline',
      'Conclusion/CTA',
      'Meta description',
    ],
    description: 'Blog post or article',
  },

  [Template.ProductDocumentation]: {
    type: Template.ProductDocumentation,
    artifacts: [
      'Overview',
      'Key concepts',
      'Step-by-step instructions',
      'Code examples (if applicable)',
      'Troubleshooting/FAQs',
    ],
    description: 'Product documentation or guide',
  },

  [Template.APIDocumentation]: {
    type: Template.APIDocumentation,
    artifacts: [
      'Endpoint description',
      'Request parameters',
      'Response format',
      'Example request/response',
      'Error codes',
    ],
    description: 'API documentation',
  },

  [Template.FeatureAnnouncement]: {
    type: Template.FeatureAnnouncement,
    artifacts: [
      'Headline',
      'Short description (tweet-length)',
      'Long description',
      'Key benefits',
      'Visual suggestion',
    ],
    description: 'Feature announcement or product update',
  },

  [Template.ReleaseNotes]: {
    type: Template.ReleaseNotes,
    artifacts: [
      'Version title',
      'New features',
      'Improvements',
      'Bug fixes',
      'Breaking changes (if any)',
    ],
    description: 'Release notes or changelog',
  },

  [Template.UIMicrocopy]: {
    type: Template.UIMicrocopy,
    artifacts: [
      'Wireframe/screenshot analysis',
      'Copy for all UI elements',
      'Tone rationale',
    ],
    description: 'UI microcopy from wireframes/designs',
  },

  [Template.HelpCenterArticle]: {
    type: Template.HelpCenterArticle,
    artifacts: [
      'Article title',
      'Problem statement',
      'Solution steps',
      'Visual suggestions',
      'Related articles',
    ],
    description: 'Help center or support article',
  },

  [Template.VideoScript]: {
    type: Template.VideoScript,
    artifacts: [
      'Hook (first 5 seconds)',
      'Main content outline',
      'Key talking points',
      'Call-to-action',
      'Suggested duration',
    ],
    description: 'Video script or content outline',
  },

  [Template.Generic]: {
    type: Template.Generic,
    artifacts: ['Content as specified in the issue'],
    description: 'Generic content generation',
  },
};

export function detectTemplate(issueTitle: string, issueDescription: string): Template {
  const combined = `${issueTitle} ${issueDescription}`.toLowerCase();

  // Pattern matching (order matters - most specific first)
  const patterns: [RegExp, Template][] = [
    [/\b(api|endpoint|rest|graphql)\b/, Template.APIDocumentation],
    [/\b(ui|wireframe|microcopy|button|placeholder|form label)\b/, Template.UIMicrocopy],
    [/\b(tweet|twitter|linkedin post|instagram|facebook post|social media|social post)\b/, Template.SocialMediaPost],
    [/\b(email|newsletter|campaign)\b/, Template.EmailCampaign],
    [/\b(landing page|hero|welcome page)\b/, Template.LandingPage],
    [/\b(blog|article)\b/, Template.BlogPost],
    [/\b(release notes|changelog|version)\b/, Template.ReleaseNotes],
    [/\b(feature announcement|launch|new feature|product update)\b/, Template.FeatureAnnouncement],
    [/\b(help|support|faq|how to|tutorial)\b/, Template.HelpCenterArticle],
    [/\b(video|script|youtube)\b/, Template.VideoScript],
    [/\b(documentation|docs|guide)\b/, Template.ProductDocumentation],
    [/\b(product page|product ui)\b/, Template.ProductPageUI],
  ];

  for (const [pattern, template] of patterns) {
    if (combined.match(pattern)) {
      return template;
    }
  }

  // No match - use generic
  return Template.Generic;
}

export function getArtifactList(template: Template): string {
  const definition = TEMPLATES[template];
  return definition.artifacts.map((artifact, index) => `${index + 1}. ${artifact}`).join('\n');
}

export function getArtifactNames(template: Template): string[] {
  return TEMPLATES[template].artifacts;
}
