/**
 * Site Metadata Configuration
 * 
 * This file centralizes all site-related metadata configuration.
 * It imports PUBLIC from the central config module.
 */

import { PUBLIC } from './config.js';

// Site metadata
const siteMetadata = {
  domain: PUBLIC.SITE_DOMAIN,
  title: PUBLIC.SITE_TITLE,
  subtitle: PUBLIC.SITE_SUBTITLE,
  description: PUBLIC.SITE_DESCRIPTION,
  logo: PUBLIC.SITE_LOGO,
  logoSquare: PUBLIC.SITE_LOGO_SQUARE,
};

// Organization information
const organizationInfo = {
  name: PUBLIC.ORG_NAME,
  address: PUBLIC.ORG_ADDRESS,
  email: PUBLIC.ORG_EMAIL,
  phone: PUBLIC.ORG_PHONE,
  category: PUBLIC.ORG_CATEGORY,
  subcategory: PUBLIC.ORG_SUBCATEGORY,
};

// Author/Team information
const authorInfo = {
  name: PUBLIC.AUTHOR_NAME,
  image: PUBLIC.AUTHOR_IMAGE,
  bio: PUBLIC.AUTHOR_BIO,
};

// Social media profiles
const socialMedia = {
  youtube: {
    channel: PUBLIC.YOUTUBE_CHANNEL,
    channelName: PUBLIC.YOUTUBE_CHANNEL_NAME,
  },
  twitter: {
    creator: PUBLIC.TWITTER_CREATOR,
    site: PUBLIC.TWITTER_SITE,
  },
  facebook: {
    author: PUBLIC.FACEBOOK_AUTHOR,
    publisher: PUBLIC.FACEBOOK_PUBLISHER,
  },
  linkedin: {
    author: PUBLIC.LINKEDIN_AUTHOR,
    publisher: PUBLIC.LINKEDIN_PUBLISHER,
  },
};

// Deployment information
const deploymentInfo = {
  vultrInstanceId: PUBLIC.VULTR_INSTANCE_ID,
  vultrRegion: PUBLIC.VULTR_INSTANCE_REGION,
  githubProjectUrl: PUBLIC.GITHUB_PROJECT_URL,
  imgBaseUrl: PUBLIC.IMG_BASE_URL,
  imgixDashboardUrl: PUBLIC.IMGIX_DASHBOARD_URL,
};

// Supported languages
const supportedLanguages = (PUBLIC.SUPPORTED_LANGUAGES).split(',').map(lang => lang.trim());

// Combined site configuration
const siteConfig = {
  metadata: siteMetadata,
  organization: organizationInfo,
  author: authorInfo,
  social: socialMedia,
  deployment: deploymentInfo,
  languages: supportedLanguages,
  
  // Helper methods
  getLanguages() {
    return this.languages;
  },
  
  // Get structured data for SEO
  getStructuredData() {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: this.metadata.title,
      description: this.metadata.description,
      url: `https://${this.metadata.domain}`,
      publisher: {
        '@type': 'Organization',
        name: this.organization.name,
        logo: {
          '@type': 'ImageObject',
          url: this.metadata.logo
        }
      }
    };
  },
  
  // Get Open Graph metadata
  getOpenGraphMetadata(path = '', title = '', description = '') {
    return {
      title: title || this.metadata.title,
      description: description || this.metadata.description,
      url: `https://${this.metadata.domain}${path}`,
      siteName: this.metadata.title,
      images: [
        {
          url: this.metadata.logoSquare,
          width: 1200,
          height: 630,
          alt: this.metadata.title
        }
      ],
      locale: 'en_US',
      type: 'website',
    };
  },
  
  // Get Twitter metadata
  getTwitterMetadata(title = '', description = '') {
    return {
      card: 'summary_large_image',
      title: title || this.metadata.title,
      description: description || this.metadata.description,
      creator: this.social.twitter.creator,
      site: this.social.twitter.site,
      images: [this.metadata.logoSquare],
    };
  },
  
  // Get image URL with imgix transformations
  getImageUrl(path, transformations = {}) {
    if (!path) return '';
    
    // If path is already a full URL and not from our imgix domain, return as is
    if (path.startsWith('http') && !path.includes(this.deployment.imgBaseUrl)) {
      return path;
    }
    
    // Remove any leading slash from the path
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    
    // Start with the base URL
    let url = `${this.deployment.imgBaseUrl}/${cleanPath}`;
    
    // Add transformations as query parameters
    if (Object.keys(transformations).length > 0) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(transformations)) {
        params.append(key, value);
      }
      url += `?${params.toString()}`;
    }
    
    return url;
  }
};

export default siteConfig;
