import { useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import Modal from '../../../components/Modal';
import type { Profile } from '../../../lib/types';
import { parseCSV } from '../../../lib/csv';
import { useMentors } from '../../../hooks/useMentors';

interface CohortOption {
  id: string;
  label: string;
}

interface FormCsvImportModalProps {
  open: boolean;
  onClose: () => void;
  cohortOptions: CohortOption[];
  profiles: Profile[];
  importOJTBatch: (cohortId: string, studentRecords: any[]) => void;
}

// Imports the "OJT student choices" Google Form CSV export: one row per
// student response, fuzzy-matched against existing mentors by name to
// pre-fill their preferred mentor.
export default function FormCsvImportModal({ open, onClose, cohortOptions, profiles, importOJTBatch }: FormCsvImportModalProps) {
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [csvText, setCsvText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const mentors = useMentors(profiles);

  const handleClose = () => {
    setSelectedCohortId('');
    setCsvText('');
    onClose();
  };

  const handleUpload = () => {
    if (!selectedCohortId || !csvText) return;
    const parsed = parseCSV(csvText);
    if (parsed.length <= 1) return;

    const headers = parsed[0].map(h => h.toLowerCase());

    const nameIdx = headers.findIndex(h => h.includes('student name') || h.includes('name'));
    const contactIdx = headers.findIndex(h => h.includes('contact') || h.includes('phone') || h.includes('number'));
    const trackIdx = headers.findIndex(h => h.includes('track') || h.includes('domain'));
    const mentorIdx = headers.findIndex(h => h.includes('mentorship') || h.includes('preference 1') || h.includes('mentor'));
    const choiceIdx = headers.findIndex(h => h.includes('own project') || h.includes('select between') || h.includes('choice'));
    const titleIdx = headers.findIndex(h => h.includes('project title') || (h.includes('title') && !h.includes('track')));
    const descIdx = headers.findIndex(h => h.includes('project description') || h.includes('description'));
    const stackIdx = headers.findIndex(h => h.includes('stack') || h.includes('framework') || h.includes('tech'));
    const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('username'));

    const records = parsed.slice(1).map((cols, idx) => {
      if (cols.length < 2) return null;

      const name = nameIdx !== -1 ? cols[nameIdx] : `Student ${idx + 1}`;
      const contact = contactIdx !== -1 ? cols[contactIdx] : '';
      const email = emailIdx !== -1 && cols[emailIdx] ? cols[emailIdx] : `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}${idx + 1}@ojt.edu`;
      const trackRaw = trackIdx !== -1 ? cols[trackIdx] : 'Product Development';

      let track = 'Product Development';
      if (trackRaw.toLowerCase().includes('app')) track = 'Application Development';
      else if (trackRaw.toLowerCase().includes('data')) track = 'Data Scientist';
      else if (trackRaw.toLowerCase().includes('open')) track = 'Open Source';
      else if (trackRaw.toLowerCase().includes('gen')) track = 'Gen AI';

      const mentorPrefRaw = mentorIdx !== -1 ? cols[mentorIdx] : '';
      const matchedMentor = mentors.find(m =>
        m.name.toLowerCase().replace(/\s/g, '').includes(mentorPrefRaw.toLowerCase().replace(/\s/g, '')) ||
        mentorPrefRaw.toLowerCase().replace(/\s/g, '').includes(m.name.toLowerCase().replace(/\s/g, ''))
      );
      const preferred_mentors = matchedMentor ? [matchedMentor.id] : [];

      const choiceRaw = choiceIdx !== -1 ? cols[choiceIdx] : 'Own';
      const is_own_project = choiceRaw.toLowerCase().includes('own');

      const project_title = titleIdx !== -1 ? cols[titleIdx] : '';
      const project_description = descIdx !== -1 ? cols[descIdx] : '';
      const tech_stack = stackIdx !== -1 ? cols[stackIdx] : '';

      return {
        name,
        email,
        contact_no: contact,
        track,
        preferred_mentors,
        is_own_project,
        project_title,
        project_description,
        tech_stack
      };
    }).filter(Boolean);

    if (records.length > 0) {
      importOJTBatch(selectedCohortId, records);
      alert(`Successfully imported ${records.length} students from the OJT form responses!`);
    }

    handleClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import OJT Student Responses (Google Form CSV)">
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          Select a target cohort, and upload/paste your OJT student choices Google Form CSV report.
        </p>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Target OJT Cohort *</label>
          <select
            value={selectedCohortId}
            onChange={e => setSelectedCohortId(e.target.value)}
            className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
          >
            <option value="">Select Cohort...</option>
            {cohortOptions.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="bg-zinc-800/40 p-3 rounded-lg text-[10px] font-mono text-gray-400 space-y-1">
          <span className="text-gold font-bold">Expected Headers:</span>
          <div className="truncate text-white font-semibold">Student Name,Contact No.,Select Your Project Track,Mentorship Guidance Request – Preference 1,Select Between Own Project vs. Picking Up a Project,Project Title,Project Description,tech stack</div>
          <span className="text-gray-500 block pt-1">Example Row:</span>
          <div className="truncate">John Doe,9876543210,Application Development,Rohit Gupta,Own Project,Social Network App,MERN stack feeds,React Node Mongo</div>
        </div>

        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = ev => setCsvText(ev.target?.result as string);
              reader.readAsText(file);
            }}
            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gold/10 file:text-gold hover:file:bg-gold/20"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Or paste CSV text below</label>
          <textarea
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            rows={5}
            placeholder="Paste raw CSV content here..."
            className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold font-mono"
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={!selectedCohortId || !csvText}
          className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <FileText size={18} />
          Import Student Responses
        </button>
      </div>
    </Modal>
  );
}
