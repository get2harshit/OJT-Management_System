export interface Announcement {
  id: string;
  title: string;
  content: string;
  author: string;
  createdAt: string;
  cohortId?: string;
  cohortName?: string;
  targetBatch?: string;
  targetTrack?: string;
  priority?: 'normal' | 'important' | 'urgent';
}

const STORAGE_KEY = 'ojt_announcements';

export function getAnnouncements(): Announcement[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list: Announcement[] = JSON.parse(raw);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

export function createAnnouncement(data: {
  title: string;
  content: string;
  cohortId?: string;
  cohortName?: string;
  targetBatch?: string;
  targetTrack?: string;
  priority?: 'normal' | 'important' | 'urgent';
}): Announcement {
  const list = getAnnouncements();
  const ann: Announcement = {
    id: `ann-${Date.now()}`,
    title: data.title,
    content: data.content,
    author: 'OJT Admin',
    createdAt: new Date().toISOString(),
    cohortId: data.cohortId,
    cohortName: data.cohortName,
    targetBatch: data.targetBatch || 'All Batches',
    targetTrack: data.targetTrack || 'All Tracks',
    priority: data.priority || 'normal',
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([ann, ...list]));
  window.dispatchEvent(new Event('ojt_announcement_created'));
  return ann;
}

export function deleteAnnouncement(id: string): void {
  const list = getAnnouncements().filter(a => a.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('ojt_announcement_created'));
}
