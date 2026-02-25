export type PlatformKey =
  | 'instagram'
  | 'facebook'
  | 'linkedin'
  | 'google_maps'
  | 'google_ads_transparency'
  | 'meta_ads_library'
  | 'x'
  | 'tiktok'
  | 'yellowpages'
  | 'justdial';

export interface UnifiedLeadRequest {
  platform: PlatformKey;
  search?: string;
  niche?: string;
  location?: string;
  maxLeadsPerPlatform?: number;
  zenrowsKey: string;
  [key: string]: unknown;
}

export interface UnifiedLead {
  source: string;
  title?: string;
  name?: string;
  link?: string;
  phone?: string;
  address?: string;
  error?: string;
}

export interface LeadAdapter {
  platform: PlatformKey;
  searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]>;
}
