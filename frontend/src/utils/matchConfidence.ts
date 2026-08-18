export type ConfidenceBand = 'high' | 'medium' | 'needs_review' | 'not_found';

export function confidenceBand(status: string, confidence: number): ConfidenceBand {
  if (status === 'not_found' || status === 'skipped') {
    return 'not_found';
  }
  if (status === 'needs_review' || status === 'duplicate') {
    return 'needs_review';
  }
  if (confidence >= 90) {
    return 'high';
  }
  if (confidence >= 75) {
    return 'medium';
  }
  return 'needs_review';
}

export function confidenceLabel(band: ConfidenceBand): string {
  if (band === 'high') {
    return 'High';
  }
  if (band === 'medium') {
    return 'Medium';
  }
  if (band === 'not_found') {
    return 'Not Found';
  }
  return 'Needs Review';
}

export function confidenceIcon(band: ConfidenceBand): string {
  if (band === 'high') {
    return '✓';
  }
  if (band === 'medium') {
    return '~';
  }
  if (band === 'not_found') {
    return '✕';
  }
  return '!';
}
