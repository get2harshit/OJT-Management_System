// Maps frontend track string formats (e.g. "Product Development")
// to backend PostgreSQL enum strings (e.g. "product_development") and vice versa.

export const mapFrontendTrackToBackend = (track?: string | null): string => {
  if (!track) return 'product_development';
  switch (track) {
    case 'Product Development': return 'product_development';
    case 'Application Development': return 'application_development';
    case 'Data Scientist': return 'data_scientist';
    case 'Open Source': return 'open_source';
    case 'Gen AI': return 'gen_ai';
    default: return track;
  }
};

export const mapBackendTrackToFrontend = (track?: string | null): string => {
  if (!track) return 'Product Development';
  switch (track) {
    case 'product_development': return 'Product Development';
    case 'application_development': return 'Application Development';
    case 'data_scientist': return 'Data Scientist';
    case 'open_source': return 'Open Source';
    case 'gen_ai': return 'Gen AI';
    default: return track;
  }
};
